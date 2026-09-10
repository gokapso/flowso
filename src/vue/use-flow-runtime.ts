import { computed, onBeforeUnmount, shallowRef, watch, type Ref } from 'vue';
import type { FlowJson, Action } from '../schema/flow-json';
import { createFlowRuntime } from '../runtime/runtime';
import type {
  DispatchOptions,
  FlowDataEndpoint,
  FlowRuntime,
  FlowRuntimeState,
  RenderedScreen,
  RuntimeEvent,
  StartOptions,
} from '../runtime/types';

export type UseFlowRuntimeOptions = {
  endpoint?: Ref<FlowDataEndpoint | undefined> | FlowDataEndpoint;
  flowToken?: Ref<string | undefined> | string;
  useExamples?: Ref<boolean | undefined> | boolean;
  strictRouting?: Ref<boolean | undefined> | boolean;
  /** How to start the flow whenever the flow JSON changes. Default: navigate to the first screen. */
  startOptions?: Ref<StartOptions> | StartOptions;
  autoStart?: boolean;
  onEvent?: (event: RuntimeEvent) => void;
};

function unref<T>(value: Ref<T> | T): T {
  return value && typeof value === 'object' && 'value' in (value as Ref<T>) ? (value as Ref<T>).value : (value as T);
}

/**
 * Reactive wrapper around `createFlowRuntime`. The runtime is recreated whenever the flow ref
 * changes identity, so an editor can hand in a freshly parsed JSON on every valid edit.
 */
export function useFlowRuntime(flow: Ref<FlowJson | null>, options: UseFlowRuntimeOptions = {}) {
  const runtime = shallowRef<FlowRuntime | null>(null);
  const state = shallowRef<FlowRuntimeState | null>(null);
  const rendered = shallowRef<RenderedScreen | null>(null);
  let unsubscribe: (() => void) | null = null;

  function sync(next: FlowRuntimeState): void {
    state.value = next;
    rendered.value = runtime.value?.render() ?? null;
  }

  async function restart(): Promise<void> {
    unsubscribe?.();
    unsubscribe = null;
    const current = flow.value;
    if (!current) {
      runtime.value = null;
      state.value = null;
      rendered.value = null;

      return;
    }
    const instance: FlowRuntime = createFlowRuntime({
      flow: current,
      endpoint: unref(options.endpoint),
      flowToken: unref(options.flowToken),
      useExamples: unref(options.useExamples),
      strictRouting: unref(options.strictRouting),
      onEvent: (event) => {
        // Ignore events from an instance that was replaced by a newer flow.
        if (runtime.value === instance) options.onEvent?.(event);
      },
    });
    runtime.value = instance;
    unsubscribe = instance.subscribe(sync);
    sync(instance.getState());
    if (options.autoStart !== false) {
      await instance.start(unref(options.startOptions) ?? { mode: 'navigate' });
    }
  }

  watch(flow, () => void restart(), { immediate: true });
  if (options.endpoint && typeof options.endpoint === 'object' && 'value' in options.endpoint) {
    watch(options.endpoint as Ref<FlowDataEndpoint | undefined>, () => void restart());
  }

  onBeforeUnmount(() => unsubscribe?.());

  return {
    runtime,
    state,
    rendered,
    status: computed(() => state.value?.status ?? 'idle'),
    canGoBack: computed(() => (state.value?.history.length ?? 0) > 1),
    restart,
    start: (startOptions?: StartOptions) => runtime.value?.start(startOptions),
    setFormValue: (name: string, value: unknown) => runtime.value?.setFormValue(name, value),
    dispatch: (action: Action, dispatchOptions?: DispatchOptions) => runtime.value?.dispatch(action, dispatchOptions),
    back: () => runtime.value?.back(),
  };
}
