import type { Action, FlowJson, Screen, ScreenDataDeclaration } from '../schema/flow-json';
import { LATEST_DATA_API_VERSION } from '../schema/versions';
import { resolveDeep, resolveValue, ExpressionError, type EvaluationContext } from './expressions';
import { collectForms, collectInputs, findScreen, renderScreen, flattenComponents } from './render';
import type { DataSourceItem } from '../schema/flow-json';
import { validateRenderedInputs } from './validation';
import type {
  DispatchOptions,
  FlowDataExchangeRequest,
  FlowDataExchangeResponse,
  FlowRuntime,
  FlowRuntimeOptions,
  FlowRuntimeState,
  RenderedScreen,
  RuntimeErrorKind,
  RuntimeEvent,
  StartOptions,
} from './types';

/** Meta's reserved screen name: an endpoint response with this screen completes the flow. */
export const SUCCESS_SCREEN = 'SUCCESS';

export function createFlowRuntime(options: FlowRuntimeOptions): FlowRuntime {
  const { flow } = options;
  const useExamples = options.useExamples ?? true;
  const strictRouting = options.strictRouting ?? true;
  const flowToken = options.flowToken ?? `simulator_${Math.random().toString(36).slice(2, 10)}`;
  const listeners = new Set<(state: FlowRuntimeState) => void>();

  let state = initialState();
  /** Incremented on start, reset, navigation and back; in-flight exchanges from older generations are ignored. */
  let generation = 0;

  function initialState(): FlowRuntimeState {
    return {
      status: 'idle',
      screenId: null,
      history: [],
      screenData: {},
      formValues: {},
      fieldErrors: {},
      errorMessage: null,
      completion: null,
      error: null,
      events: [],
    };
  }

  function commit(next: Partial<FlowRuntimeState>): FlowRuntimeState {
    state = { ...state, ...next };
    for (const listener of listeners) listener(state);

    return state;
  }

  function emit(event: RuntimeEvent): void {
    state = { ...state, events: [...state.events, event] };
    options.onEvent?.(event);
  }

  function fail(kind: RuntimeErrorKind, message: string): FlowRuntimeState {
    emit({ type: 'error', kind, message });

    return commit({ status: 'error', error: { kind, message } });
  }

  function currentScreen(): Screen | undefined {
    return state.screenId ? findScreen(flow, state.screenId) : undefined;
  }

  function contextFor(screenId: string): EvaluationContext {
    const screen: EvaluationContext['screen'] = {};
    for (const id of Object.keys(state.screenData)) {
      screen[id] = { data: state.screenData[id] ?? {}, form: state.formValues[id] ?? {} };
    }
    for (const id of Object.keys(state.formValues)) {
      screen[id] ??= { data: state.screenData[id] ?? {}, form: state.formValues[id] ?? {} };
    }

    return {
      data: state.screenData[screenId] ?? {},
      form: state.formValues[screenId] ?? {},
      screen,
    };
  }

  function exampleData(screen: Screen): Record<string, unknown> {
    if (!useExamples || !screen.data) return {};
    const data: Record<string, unknown> = {};
    for (const [key, declaration] of Object.entries(screen.data)) {
      const example = (declaration as ScreenDataDeclaration).__example__;
      if (example !== undefined) data[key] = example;
    }

    return data;
  }

  /** Make `screenId` the current screen with the given data, initializing form values once. */
  function enterScreen(screenId: string, data: Record<string, unknown>, pushHistory: boolean): FlowRuntimeState {
    const screen = findScreen(flow, screenId);
    if (!screen) return fail('unknown_screen', `Screen "${screenId}" does not exist`);
    generation += 1;

    const mergedData = { ...exampleData(screen), ...(state.screenData[screenId] ?? {}), ...data };
    const screenData = { ...state.screenData, [screenId]: mergedData };
    state = { ...state, screenData };

    const existingValues = state.formValues[screenId] ?? {};
    const context = contextFor(screenId);
    const initialValues: Record<string, unknown> = {};
    for (const form of collectForms(screen.layout.children)) {
      const initValues = resolveDeep(form['init-values'], context);
      if (initValues && typeof initValues === 'object') Object.assign(initialValues, initValues);
    }
    for (const input of collectInputs(screen.layout.children)) {
      const name = input.name as string;
      const initValue = 'init-value' in input ? resolveValue(input['init-value'], context) : undefined;
      if (initValue !== undefined) initialValues[name] = initValue;
    }
    const formValues = { ...state.formValues, [screenId]: { ...initialValues, ...existingValues } };
    const history = pushHistory ? [...state.history, screenId] : state.history;

    return commit({
      status: 'ready',
      screenId,
      history,
      screenData,
      formValues,
      fieldErrors: { ...state.fieldErrors, [screenId]: {} },
      errorMessage: typeof data.error_message === 'string' ? data.error_message : null,
      error: null,
    });
  }

  function isRouteAllowed(from: string | null, to: string): boolean {
    if (!strictRouting || from === null) return true;
    const routingModel = flow.routing_model ?? {};
    const routes = routingModel[from];
    if (routes === undefined) return Object.keys(routingModel).length === 0;

    return routes.includes(to);
  }

  async function exchange(request: FlowDataExchangeRequest): Promise<FlowDataExchangeResponse | null> {
    if (!options.endpoint) {
      fail('endpoint', 'This flow needs a data endpoint; none is configured in the simulator');

      return null;
    }
    emit({ type: 'data_exchange:request', request });
    commit({ status: 'loading' });
    const startedAt = Date.now();
    const startedGeneration = generation;
    try {
      const response = await options.endpoint.exchange(request);
      if (startedGeneration !== generation) {
        emit({ type: 'warning', message: `Ignored a late ${request.action} response: the flow moved on` });

        return null;
      }
      emit({ type: 'data_exchange:response', response, durationMs: Date.now() - startedAt });
      if (response.version !== undefined && String(response.version) !== dataApiVersion()) {
        fail('endpoint', `Endpoint response version "${response.version}" does not match data_api_version "${dataApiVersion()}"`);

        return null;
      }
      if (response.version === undefined && response.screen !== undefined) {
        emit({ type: 'warning', message: 'Endpoint response has no "version"; Meta expects "' + dataApiVersion() + '"' });
      }

      return response;
    } catch (error) {
      if (startedGeneration !== generation) return null;
      fail('endpoint', error instanceof Error ? error.message : String(error));

      return null;
    }
  }

  function applyResponse(response: FlowDataExchangeResponse, from: string | null): FlowRuntimeState {
    const data = response.data ?? {};
    const screenId = response.screen;
    if (!screenId) return fail('endpoint', 'Endpoint response has no "screen"');

    if (screenId === SUCCESS_SCREEN) {
      const extension = data.extension_message_response as { params?: Record<string, unknown> } | undefined;

      return complete(from ?? SUCCESS_SCREEN, extension?.params ?? {});
    }
    if (screenId === from) {
      const errorMessage = typeof data.error_message === 'string' ? data.error_message : null;
      const declared = Object.keys(findScreen(flow, screenId)?.data ?? {});
      const missing = declared.filter((key) => !(key in data));
      if (missing.length > 0) {
        emit({ type: 'warning', message: `Endpoint response for "${screenId}" omits declared data: ${missing.join(', ')}. Meta expects every declared field on every response.` });
      }
      const merged = { ...(state.screenData[screenId] ?? {}), ...data };
      state = { ...state, screenData: { ...state.screenData, [screenId]: merged } };

      return commit({ status: 'ready', errorMessage });
    }
    if (from !== null && !isRouteAllowed(from, screenId)) {
      return fail('routing', `Endpoint returned screen "${screenId}" which is not reachable from "${from}" in routing_model`);
    }
    emit({ type: 'navigate', from, to: screenId, payload: data });

    return enterScreen(screenId, data, true);
  }

  function complete(screenId: string, params: Record<string, unknown>): FlowRuntimeState {
    emit({ type: 'complete', screenId, params });

    return commit({
      status: 'completed',
      completion: { screenId, params, responseJson: JSON.stringify({ ...params, flow_token: flowToken }) },
    });
  }

  function dataApiVersion(): string {
    return flow.data_api_version ?? LATEST_DATA_API_VERSION;
  }

  const runtime: FlowRuntime = {
    flow,

    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },

    reset() {
      generation += 1;
      state = initialState();

      return commit({});
    },

    async start(startOptions) {
      generation += 1;
      state = initialState();
      const mode = startOptions?.mode ?? 'navigate';
      if (mode === 'data_exchange') {
        const response = await exchange({ version: dataApiVersion(), action: 'INIT', data: {}, flow_token: flowToken });
        if (!response) return state;
        if (response.screen) emit({ type: 'start', mode, screenId: response.screen });

        return applyResponse(response, null);
      }
      const first = flow.screens[0];
      const screenId = (startOptions?.mode === 'navigate' && startOptions.screen) || first?.id;
      if (!screenId) return fail('unknown_screen', 'Flow has no screens');
      emit({ type: 'start', mode, screenId });

      return enterScreen(screenId, (startOptions?.mode === 'navigate' && startOptions.data) || {}, true);
    },

    async setFormValue(name, value) {
      const screen = currentScreen();
      if (!screen || !state.screenId) return state;
      const screenId = state.screenId;
      const previous = state.formValues[screenId]?.[name];
      const formValues = { ...state.formValues, [screenId]: { ...(state.formValues[screenId] ?? {}), [name]: value } };
      const fieldErrors = { ...state.fieldErrors, [screenId]: { ...(state.fieldErrors[screenId] ?? {}) } };
      delete fieldErrors[screenId]?.[name];
      commit({ formValues, fieldErrors });

      const input = collectInputs(screen.layout.children).find((component) => component.name === name);
      if (!input) return state;
      const componentSelect = input['on-select-action'] as Action | undefined;
      const componentUnselect = input['on-unselect-action'] as Action | undefined;
      const items = itemsOf(resolveValue(input['data-source'], contextFor(screenId)));
      const itemAction = (id: unknown, kind: 'on-select-action' | 'on-unselect-action'): Action | undefined =>
        items.find((item) => item.id === id)?.[kind] ?? (kind === 'on-select-action' ? componentSelect : componentUnselect);

      const previousIds = selectedIds(previous);
      const nextIds = selectedIds(value);
      const added = nextIds.filter((id) => !previousIds.includes(id));
      const removed = previousIds.filter((id) => !nextIds.includes(id));
      for (const id of removed) {
        const action = itemAction(id, 'on-unselect-action');
        if (action) await runtime.dispatch(action, { validate: false });
      }
      for (const id of added) {
        const action = itemAction(id, 'on-select-action');
        if (action) await runtime.dispatch(action, { validate: false });
      }

      return state;
    },

    async dispatch(action, dispatchOptions?: DispatchOptions) {
      const screen = currentScreen();
      if (!screen || !state.screenId) return fail('invalid_action', 'No current screen');
      const screenId = state.screenId;
      const context = contextFor(screenId);
      const shouldValidate = dispatchOptions?.validate ?? action.name !== 'update_data';

      if (shouldValidate && action.name !== 'open_url') {
        const rendered = runtime.render();
        const errors = rendered ? validateRenderedInputs(rendered.children) : {};
        if (Object.keys(errors).length > 0) {
          emit({ type: 'validation_failed', screenId, errors });

          return commit({ fieldErrors: { ...state.fieldErrors, [screenId]: errors } });
        }
      }

      let payload: Record<string, unknown> = {};
      try {
        payload = resolveDeep(('payload' in action && action.payload) || {}, context);
      } catch (error) {
        return fail('expression', error instanceof ExpressionError ? error.message : String(error));
      }

      switch (action.name) {
        case 'navigate': {
          const target = action.next?.name;
          if (!target) return fail('invalid_action', 'navigate action has no next.name');
          if (!isRouteAllowed(screenId, target)) {
            return fail('routing', `Screen "${target}" is not reachable from "${screenId}" in routing_model`);
          }
          emit({ type: 'navigate', from: screenId, to: target, payload });

          return enterScreen(target, payload, true);
        }
        case 'complete':
          return complete(screenId, payload);
        case 'update_data': {
          emit({ type: 'update_data', screenId, payload });
          const merged = { ...(state.screenData[screenId] ?? {}), ...payload };

          return commit({ screenData: { ...state.screenData, [screenId]: merged } });
        }
        case 'open_url': {
          const url = String(resolveValue(action.url, context) ?? '');
          emit({ type: 'open_url', url });

          return commit({});
        }
        case 'data_exchange': {
          const response = await exchange({
            version: dataApiVersion(),
            action: 'data_exchange',
            screen: screenId,
            data: payload,
            flow_token: flowToken,
          });
          if (!response) return state;

          return applyResponse(response, screenId);
        }
        default:
          return fail('invalid_action', `Unknown action "${(action as { name: string }).name}"`);
      }
    },

    async back() {
      if (state.history.length < 2 || !state.screenId) return state;
      const from = state.screenId;
      const history = state.history.slice(0, -1);
      const to = history[history.length - 1] as string;
      emit({ type: 'back', from, to });
      generation += 1;
      state = { ...state, history };
      const target = findScreen(flow, to);
      if (target?.refresh_on_back && options.endpoint) {
        const response = await exchange({
          version: dataApiVersion(),
          action: 'BACK',
          screen: to,
          data: {},
          flow_token: flowToken,
        });
        if (!response) return state;
        state = { ...state, screenId: to };

        return applyResponse({ ...response, screen: response.screen ?? to }, to);
      }

      return enterScreen(to, {}, false);
    },

    render(): RenderedScreen | null {
      const screen = currentScreen();
      if (!screen || !state.screenId) return null;
      const screenId = state.screenId;
      try {
        return renderScreen(screen, {
          context: contextFor(screenId),
          formValues: state.formValues[screenId] ?? {},
          fieldErrors: state.fieldErrors[screenId] ?? {},
          errorMessage: state.errorMessage,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        return { id: screen.id, title: screen.title ?? '', terminal: screen.terminal === true, success: screen.success === true, children: [], errorMessage: `Expression error: ${message}`, canSubmit: false };
      }
    },
  };

  return runtime;
}

/** Selected ids for a form value: arrays for multi-select, a single id for scalars, `true` for OptIn. */
function selectedIds(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '' || value === false) return [];

  return [value];
}

function itemsOf(value: unknown): DataSourceItem[] {
  return Array.isArray(value) ? (value as DataSourceItem[]).filter((item) => item && typeof item === 'object') : [];
}

export { flattenComponents };
