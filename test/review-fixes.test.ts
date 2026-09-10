import { describe, it, expect } from 'vitest';
import { evaluateNestedExpression, parseReference, resolveValue, resolveDeep, isActionKey, type EvaluationContext } from '../src/runtime/expressions';
import { createFlowRuntime } from '../src/runtime/runtime';
import { validateRenderedInputs } from '../src/runtime/validation';
import type { FlowJson } from '../src/schema/flow-json';
import type { FlowDataEndpoint, FlowDataExchangeRequest, RenderedNode } from '../src/runtime/types';

const context: EvaluationContext = {
  data: {
    total: 12,
    countries: { cl: { states: ['RM', 'V'] }, ar: { states: ['BA'] } },
    seed: 'SECRET',
  },
  form: { group_size: 3, selected_country: 'ar', note: '${data.seed}' },
  screen: {},
};

describe('expression precedence', () => {
  it('binds arithmetic tighter than concatenation', () => {
    expect(evaluateNestedExpression("`'Amount: ' ${data.total} / ${form.group_size}`", context)).toBe('Amount: 4');
    expect(evaluateNestedExpression("`${data.total} - 1`", context)).toBe(11);
    expect(evaluateNestedExpression("`${data.total} -1`", context)).toBe(11);
    expect(evaluateNestedExpression("`${data.total} % 5 == 2`", context)).toBe(true);
  });
});

describe('dynamic bracket lookups', () => {
  it('resolves `${data.countries[form.selected_country].states}`', () => {
    const reference = parseReference('${data.countries[form.selected_country].states}');
    expect(reference?.path).toEqual(['countries', 'form.selected_country', 'states']);
    expect(reference?.dynamicIndexes).toEqual([1]);
    expect(resolveValue('${data.countries[form.selected_country].states}', context)).toEqual(['BA']);
    expect(resolveValue("${data.countries['cl'].states[1]}", context)).toBe('V');
  });
});

describe('resolveDeep with action keys', () => {
  it('keeps action payloads raw so they resolve once at dispatch', () => {
    const component = { type: 'Footer', label: '${form.note}', 'on-click-action': { name: 'navigate', payload: { note: '${form.note}' } } };
    const resolved = resolveDeep(component, context, { skipKey: isActionKey }) as typeof component;
    expect(resolved.label).toBe('${data.seed}');
    expect(resolved['on-click-action'].payload.note).toBe('${form.note}');
  });
});

function staticFlow(extra: Partial<FlowJson> = {}): FlowJson {
  return {
    version: '7.3',
    screens: [
      {
        id: 'ONE',
        title: 'One',
        layout: {
          type: 'SingleColumnLayout',
          children: [
            { type: 'TextInput', name: 'note', label: 'Note' },
            {
              type: 'CheckboxGroup',
              name: 'extras',
              label: 'Extras',
              'data-source': [
                { id: 'a', title: 'A', 'on-select-action': { name: 'update_data', payload: { last: 'a-selected' } } },
                { id: 'b', title: 'B', 'on-unselect-action': { name: 'update_data', payload: { last: 'b-unselected' } } },
              ],
              'on-select-action': { name: 'update_data', payload: { last: 'component-selected' } },
            },
            { type: 'Footer', label: 'Go', 'on-click-action': { name: 'navigate', next: { type: 'screen', name: 'TWO' }, payload: { note: '${form.note}' } } },
          ],
        },
      },
      {
        id: 'TWO',
        title: 'Two',
        terminal: true,
        data: { note: { type: 'string', __example__: 'x' }, last: { type: 'string', __example__: '' } },
        layout: {
          type: 'SingleColumnLayout',
          children: [
            { type: 'TextBody', text: '${data.note}' },
            { type: 'Footer', label: 'Done', 'on-click-action': { name: 'complete', payload: {} } },
          ],
        },
      },
    ],
    ...extra,
  };
}

describe('runtime fixes', () => {
  it('navigates when routing_model is omitted', async () => {
    const runtime = createFlowRuntime({ flow: staticFlow() });
    await runtime.start();
    await runtime.setFormValue('note', '${data.seed}');
    const footer = runtime.render()?.children.find((n) => n.type === 'Footer');
    const state = await runtime.dispatch(footer!.props['on-click-action'] as never);
    expect(state.screenId).toBe('TWO');
    expect(state.screenData.TWO?.note).toBe('${data.seed}');
    expect(runtime.render()?.children[0]?.props.text).toBe('${data.seed}');
  });

  it('dispatches item-level select and unselect actions for multi-select changes', async () => {
    const runtime = createFlowRuntime({ flow: staticFlow() });
    await runtime.start();
    await runtime.setFormValue('extras', ['a']);
    expect(runtime.getState().screenData.ONE?.last).toBe('a-selected');
    await runtime.setFormValue('extras', ['a', 'b']);
    expect(runtime.getState().screenData.ONE?.last).toBe('component-selected');
    await runtime.setFormValue('extras', ['a']);
    expect(runtime.getState().screenData.ONE?.last).toBe('b-unselected');
  });

  it('renders an expression error instead of recursing', async () => {
    const flow = staticFlow();
    (flow.screens[0]!.layout.children[0] as { label: string }).label = '`${data.x} ==`';
    const runtime = createFlowRuntime({ flow });
    await runtime.start();
    const rendered = runtime.render();
    expect(rendered?.children).toEqual([]);
    expect(rendered?.errorMessage).toMatch(/Expression error/);
    expect(runtime.getState().status).toBe('ready');
  });

  it('shows Form error-messages and input error-message from data', async () => {
    const flow: FlowJson = {
      version: '7.3',
      screens: [
        {
          id: 'S',
          terminal: true,
          data: { errors: { type: 'object', __example__: { email: 'Bad email' } }, name_error: { type: 'string', __example__: 'Bad name' } },
          layout: {
            type: 'SingleColumnLayout',
            children: [
              {
                type: 'Form',
                name: 'f',
                'error-messages': '${data.errors}',
                children: [
                  { type: 'TextInput', name: 'email', label: 'Email' },
                  { type: 'TextInput', name: 'name', label: 'Name', 'error-message': '${data.name_error}' },
                  { type: 'Footer', label: 'Go', 'on-click-action': { name: 'complete', payload: {} } },
                ],
              },
            ],
          },
        },
      ],
    };
    const runtime = createFlowRuntime({ flow });
    await runtime.start();
    const inputs = runtime.render()?.children.filter((n) => n.name) ?? [];
    expect(inputs.map((n) => n.error)).toEqual(['Bad email', 'Bad name']);
  });

  it('ignores a late endpoint response after the user went back', async () => {
    let resolveLate: (value: { screen: string; data: Record<string, unknown> }) => void = () => {};
    const endpoint: FlowDataEndpoint = {
      exchange: (request: FlowDataExchangeRequest) =>
        request.action === 'data_exchange'
          ? new Promise((resolve) => {
              resolveLate = resolve;
            })
          : Promise.resolve({ screen: 'ONE', data: {} }),
    };
    const flow = staticFlow({ data_api_version: '3.0' });
    (flow.screens[0]!.layout.children[2] as { 'on-click-action': unknown })['on-click-action'] = { name: 'data_exchange', payload: {} };
    const runtime = createFlowRuntime({ flow, endpoint });
    await runtime.start();
    const footer = runtime.render()?.children.find((n) => n.type === 'Footer');
    const pending = runtime.dispatch(footer!.props['on-click-action'] as never);
    expect(runtime.getState().status).toBe('loading');
    await runtime.start();
    resolveLate({ screen: 'TWO', data: {} });
    await pending;
    expect(runtime.getState().screenId).toBe('ONE');
    expect(runtime.getState().events.some((e) => e.type === 'warning' && /late/.test(e.message))).toBe(true);
  });

  it('fails on a response version mismatch', async () => {
    const endpoint: FlowDataEndpoint = { exchange: async () => ({ version: '2.0', screen: 'TWO', data: {} }) };
    const flow = staticFlow({ data_api_version: '3.0' });
    (flow.screens[0]!.layout.children[2] as { 'on-click-action': unknown })['on-click-action'] = { name: 'data_exchange', payload: {} };
    const runtime = createFlowRuntime({ flow, endpoint });
    await runtime.start();
    const footer = runtime.render()?.children.find((n) => n.type === 'Footer');
    const state = await runtime.dispatch(footer!.props['on-click-action'] as never);
    expect(state.status).toBe('error');
    expect(state.error?.message).toMatch(/version/);
  });
});

describe('date and upload validation', () => {
  function node(type: RenderedNode['type'], value: unknown, props: Record<string, unknown> = {}): RenderedNode {
    return { key: '0', path: 'children[0]', type, props: { required: true, ...props }, name: 'f', value, error: null };
  }

  it('rejects unavailable, out-of-range and incomplete dates', () => {
    expect(validateRenderedInputs([node('DatePicker', '2026-01-05', { 'unavailable-dates': ['2026-01-05'] })])).toEqual({ f: 'That date is not available' });
    expect(validateRenderedInputs([node('DatePicker', '2026-01-05', { 'min-date': '2026-02-01' })])).toEqual({ f: 'Date must be on or after 2026-02-01' });
    expect(validateRenderedInputs([node('CalendarPicker', { 'start-date': '2026-01-05' }, { mode: 'range' })])).toEqual({ f: 'Select a start and an end date' });
    expect(validateRenderedInputs([node('CalendarPicker', { 'start-date': '2026-01-05', 'end-date': '2026-01-07' }, { mode: 'range' })])).toEqual({});
    expect(validateRenderedInputs([node('DatePicker', 1767571200000, {})])).toEqual({});
  });

  it('enforces minimum uploads even when not required', () => {
    expect(validateRenderedInputs([node('PhotoPicker', [], { required: false, 'min-uploaded-photos': 1 })])).toEqual({ f: 'Upload at least 1' });
    expect(validateRenderedInputs([node('DocumentPicker', [{}, {}], { required: false, 'max-uploaded-documents': 1 })])).toEqual({ f: 'Upload at most 1' });
  });
});
