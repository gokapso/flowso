import { describe, it, expect, vi } from 'vitest';
import { createFlowRuntime } from '../src/runtime/runtime';
import type { FlowDataEndpoint, FlowDataExchangeRequest } from '../src/runtime/types';
import type { FlowJson, Action } from '../src/schema/flow-json';
import appointment from '../fixtures/appointment.flow.json';

const flow = appointment as unknown as FlowJson;

function footerAction(runtime: ReturnType<typeof createFlowRuntime>): Action {
  const footer = runtime.render()?.children.find((node) => node.type === 'Footer');
  if (!footer) throw new Error('No footer rendered');

  return footer.props['on-click-action'] as Action;
}

function texts(runtime: ReturnType<typeof createFlowRuntime>): string[] {
  return (runtime.render()?.children ?? [])
    .filter((node) => node.type.startsWith('Text') && !node.name)
    .map((node) => String(node.props.text));
}

describe('createFlowRuntime', () => {
  describe('start in navigate mode', () => {
    it('enters the first screen with example data and init-values', async () => {
      const runtime = createFlowRuntime({ flow });
      const state = await runtime.start();
      expect(state.status).toBe('ready');
      expect(state.screenId).toBe('WELCOME');
      expect(state.history).toEqual(['WELCOME']);
      expect(state.formValues.WELCOME).toEqual({ first_name: 'Ana' });
      expect(texts(runtime)).toEqual(['Welcome to Kapso Dental', '10% off your first visit']);
    });

    it('accepts an explicit screen and data', async () => {
      const runtime = createFlowRuntime({ flow });
      await runtime.start({ mode: 'navigate', screen: 'DETAILS', data: { first_name: 'Bob', service: 'whitening' } });
      expect(runtime.getState().screenId).toBe('DETAILS');
      expect(texts(runtime)).toEqual(['Hi Bob', 'Whitening takes 60 minutes']);
    });

    it('fails on an unknown screen', async () => {
      const runtime = createFlowRuntime({ flow });
      const state = await runtime.start({ mode: 'navigate', screen: 'NOPE' });
      expect(state.status).toBe('error');
      expect(state.error?.kind).toBe('unknown_screen');
    });
  });

  describe('forms and validation', () => {
    it('blocks navigation when required fields are missing and reports errors', async () => {
      const runtime = createFlowRuntime({ flow });
      await runtime.start();
      const state = await runtime.dispatch(footerAction(runtime));
      expect(state.screenId).toBe('WELCOME');
      expect(state.fieldErrors.WELCOME).toEqual({
        email: 'This field is required',
        service: 'This field is required',
      });
      expect(runtime.render()?.children.find((n) => n.name === 'email')?.error).toBe('This field is required');
    });

    it('validates email format and min-chars', async () => {
      const runtime = createFlowRuntime({ flow });
      await runtime.start();
      await runtime.setFormValue('first_name', 'A');
      await runtime.setFormValue('email', 'not-an-email');
      await runtime.setFormValue('service', 'cleaning');
      const state = await runtime.dispatch(footerAction(runtime));
      expect(state.fieldErrors.WELCOME).toEqual({
        first_name: 'Enter at least 2 characters',
        email: 'Enter a valid email',
      });
    });

    it('clears a field error when the field changes', async () => {
      const runtime = createFlowRuntime({ flow });
      await runtime.start();
      await runtime.dispatch(footerAction(runtime));
      await runtime.setFormValue('email', 'ana@example.com');
      expect(runtime.getState().fieldErrors.WELCOME).toEqual({ service: 'This field is required' });
    });

    it('runs on-select-action when a selection is made', async () => {
      const runtime = createFlowRuntime({ flow });
      await runtime.start();
      expect(texts(runtime)[1]).toBe('10% off your first visit');
      await runtime.setFormValue('service', 'cleaning');
      expect(runtime.getState().screenData.WELCOME?.show_promo).toBe(false);
      expect(texts(runtime)[1]).toBe('Book your visit');
    });
  });

  describe('navigate action', () => {
    async function fillWelcome(runtime: ReturnType<typeof createFlowRuntime>) {
      await runtime.start();
      await runtime.setFormValue('email', 'ana@example.com');
      await runtime.setFormValue('service', 'cleaning');
    }

    it('passes the resolved payload as data of the next screen', async () => {
      const runtime = createFlowRuntime({ flow });
      await fillWelcome(runtime);
      const state = await runtime.dispatch(footerAction(runtime));
      expect(state.screenId).toBe('DETAILS');
      expect(state.history).toEqual(['WELCOME', 'DETAILS']);
      expect(state.screenData.DETAILS).toMatchObject({ first_name: 'Ana', service: 'cleaning', email: 'ana@example.com' });
      expect(texts(runtime)).toEqual(['Hi Ana', 'Cleaning takes 30 minutes']);
      const dropdown = runtime.render()?.children.find((n) => n.name === 'slot');
      expect(dropdown?.props['data-source']).toEqual([{ id: 's1', title: 'Mon 10:00' }]);
    });

    it('rejects routes not in routing_model', async () => {
      const runtime = createFlowRuntime({ flow });
      await fillWelcome(runtime);
      const state = await runtime.dispatch({ name: 'navigate', next: { type: 'screen', name: 'CONFIRM' } });
      expect(state.status).toBe('error');
      expect(state.error?.kind).toBe('routing');
    });

    it('goes back and keeps the previous form values', async () => {
      const runtime = createFlowRuntime({ flow });
      await fillWelcome(runtime);
      await runtime.dispatch(footerAction(runtime));
      const state = await runtime.back();
      expect(state.screenId).toBe('WELCOME');
      expect(state.history).toEqual(['WELCOME']);
      expect(state.formValues.WELCOME).toMatchObject({ email: 'ana@example.com', service: 'cleaning' });
    });
  });

  describe('data_exchange', () => {
    function endpoint(handler: (request: FlowDataExchangeRequest) => Record<string, unknown>): FlowDataEndpoint & { calls: FlowDataExchangeRequest[] } {
      const calls: FlowDataExchangeRequest[] = [];

      return {
        calls,
        async exchange(request) {
          calls.push(request);

          return handler(request);
        },
      };
    }

    async function reachDetails(runtime: ReturnType<typeof createFlowRuntime>) {
      await runtime.start();
      await runtime.setFormValue('email', 'ana@example.com');
      await runtime.setFormValue('service', 'cleaning');
      await runtime.dispatch(footerAction(runtime));
      await runtime.setFormValue('slot', 's1');
    }

    it('sends the resolved payload with screen, version and flow_token', async () => {
      const api = endpoint(() => ({ screen: 'CONFIRM', data: { confirmation_code: 'XYZ' } }));
      const runtime = createFlowRuntime({ flow, endpoint: api, flowToken: 'tok' });
      await reachDetails(runtime);
      const state = await runtime.dispatch(footerAction(runtime));
      expect(api.calls).toEqual([
        { version: '3.0', action: 'data_exchange', screen: 'DETAILS', data: { slot: 's1', email: 'ana@example.com' }, flow_token: 'tok' },
      ]);
      expect(state.screenId).toBe('CONFIRM');
      expect(texts(runtime)).toEqual(['You are booked', 'Code: XYZ']);
    });

    it('stays on the screen and shows error_message when the endpoint returns the same screen', async () => {
      const api = endpoint(() => ({ screen: 'DETAILS', data: { error_message: 'Slot taken', slots: [{ id: 's2', title: 'Tue' }] } }));
      const runtime = createFlowRuntime({ flow, endpoint: api });
      await reachDetails(runtime);
      const state = await runtime.dispatch(footerAction(runtime));
      expect(state.screenId).toBe('DETAILS');
      expect(state.errorMessage).toBe('Slot taken');
      expect(runtime.render()?.errorMessage).toBe('Slot taken');
      expect(runtime.render()?.children.find((n) => n.name === 'slot')?.props['data-source']).toEqual([{ id: 's2', title: 'Tue' }]);
      expect(state.formValues.DETAILS?.slot).toBe('s1');
    });

    it('completes the flow when the endpoint returns SUCCESS', async () => {
      const api = endpoint(() => ({ screen: 'SUCCESS', data: { extension_message_response: { params: { flow_token: 'tok', code: 'OK' } } } }));
      const runtime = createFlowRuntime({ flow, endpoint: api, flowToken: 'tok' });
      await reachDetails(runtime);
      const state = await runtime.dispatch(footerAction(runtime));
      expect(state.status).toBe('completed');
      expect(state.completion?.params).toEqual({ flow_token: 'tok', code: 'OK' });
      expect(JSON.parse(state.completion?.responseJson ?? '{}')).toEqual({ flow_token: 'tok', code: 'OK' });
    });

    it('starts with INIT in data_exchange mode', async () => {
      const api = endpoint((request) => (request.action === 'INIT' ? { screen: 'DETAILS', data: { first_name: 'Init', service: 'whitening' } } : {}));
      const runtime = createFlowRuntime({ flow, endpoint: api });
      const state = await runtime.start({ mode: 'data_exchange' });
      expect(api.calls[0]).toMatchObject({ action: 'INIT', version: '3.0' });
      expect(state.screenId).toBe('DETAILS');
      expect(texts(runtime)).toEqual(['Hi Init', 'Whitening takes 60 minutes']);
    });

    it('reports a missing endpoint', async () => {
      const runtime = createFlowRuntime({ flow });
      await reachDetails(runtime);
      const state = await runtime.dispatch(footerAction(runtime));
      expect(state.status).toBe('error');
      expect(state.error?.kind).toBe('endpoint');
    });

    it('reports endpoint failures', async () => {
      const api: FlowDataEndpoint = { exchange: vi.fn().mockRejectedValue(new Error('boom')) };
      const runtime = createFlowRuntime({ flow, endpoint: api });
      await reachDetails(runtime);
      const state = await runtime.dispatch(footerAction(runtime));
      expect(state.error).toEqual({ kind: 'endpoint', message: 'boom' });
    });
  });

  describe('complete and open_url', () => {
    it('completes with the resolved payload', async () => {
      const runtime = createFlowRuntime({ flow, flowToken: 'tok' });
      await runtime.start({ mode: 'navigate', screen: 'CONFIRM', data: { confirmation_code: 'C1' } });
      const state = await runtime.dispatch(footerAction(runtime));
      expect(state.status).toBe('completed');
      expect(state.completion).toEqual({
        screenId: 'CONFIRM',
        params: { confirmation_code: 'C1' },
        responseJson: JSON.stringify({ confirmation_code: 'C1', flow_token: 'tok' }),
      });
    });

    it('emits open_url events', async () => {
      const events: string[] = [];
      const runtime = createFlowRuntime({ flow, onEvent: (event) => events.push(event.type) });
      await runtime.start();
      await runtime.dispatch({ name: 'open_url', url: 'https://kapso.ai' }, { validate: false });
      expect(events).toContain('open_url');
      expect(runtime.getState().events.at(-1)).toEqual({ type: 'open_url', url: 'https://kapso.ai' });
    });
  });

  describe('subscribe', () => {
    it('notifies listeners on every state change', async () => {
      const runtime = createFlowRuntime({ flow });
      const listener = vi.fn();
      runtime.subscribe(listener);
      await runtime.start();
      await runtime.setFormValue('email', 'a@b.co');
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });
});
