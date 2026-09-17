import { describe, expect, it } from 'vitest';
import type { FlowJson } from '../src/schema/flow-json';
import { runScenarios, inspectFlow } from '../src/testing/runner';
import { parseSuite } from '../src/testing/scenario';
import feedback from '../fixtures/feedback.flow.json';
import booking from '../templates/booking/flow.json';

function run(steps: unknown[], options: Record<string, unknown> = {}) {
  return runScenarios({ flow: feedback as FlowJson, ...options }, parseSuite({ tests: [{ name: 'test', steps }] }));
}

describe('scenario execution', () => {
  it('follows on-select actions and conditional required inputs instead of filling hidden fields', async () => {
    const flow: FlowJson = { version: '7.3', screens: [{ id: 'START', terminal: true, data: { show: { type: 'boolean', __example__: false } },
      layout: { type: 'SingleColumnLayout', children: [
        { type: 'Dropdown', name: 'kind', label: 'Kind', required: true, 'data-source': [{ id: 'simple', title: 'Simple' }, { id: 'other', title: 'Other' }],
          'on-select-action': { name: 'update_data', payload: { show: "`${form.kind} == 'other'`" } } },
        { type: 'If', condition: '${data.show}', then: [{ type: 'TextInput', name: 'detail', label: 'Detail', required: true }] },
        { type: 'Footer', label: 'Done', 'on-click-action': { name: 'complete', payload: { kind: '${form.kind}', detail: '${form.detail}' } } },
      ] } }] };
    const suite = parseSuite({ tests: [{ name: 'conditional input', start: { mode: 'navigate', data: { show: false } }, steps: [
      { expect: { fields: { kind: { required: true } } } },
      { fill: 'kind', value: 'other', expect: { data: { show: true }, fields: { detail: { required: true } } } },
      { fill: 'detail', value: 'Follow up' },
      { submit: true, expect: { completion: { kind: 'other', detail: 'Follow up' } } },
    ] }] });
    expect((await runScenarios({ flow }, suite)).ok).toBe(true);
    suite.tests[0]!.steps = [{ fill: 'detail', value: 'hidden' }, { expect: { screen: 'START' } }];
    expect((await runScenarios({ flow }, suite)).tests[0]?.error).toContain('visible field');
  });
  it('uses the same runtime for dynamic selections, branches, navigation and completion', async () => {
    const result = await run([{ fill: 'rating', valueFrom: '/fields/rating/options/0/id' }, { fill: 'comment', value: 'Good' },
      { submit: true, expect: { screen: 'THANKS', data: { rating: '5', comment: 'Good' } } },
      { back: true, expect: { screen: 'FEEDBACK', fields: { rating: { value: '5' } } } },
      { submit: true }, { submit: true, expect: { status: 'completed' } }], { trace: true });
    expect(result.ok).toBe(true);
    expect(result.tests[0]?.events?.map(event => event.type)).toContain('back');
  });

  it.each([
    [{ fill: 'missing', value: 'x' }, 'visible field'],
    [{ fill: 'rating', value: 'bogus' }, 'unavailable'],
    [{ fill: 'rating', value: ['5'] }, 'invalid value type'],
    [{ fill: 'rating', valueFrom: '/missing' }, 'No value'],
    [{ click: 'children[99]' }, 'component'],
    [{ back: true }, 'first screen'],
    [{ submit: true }, 'Unexpected field errors'],
  ])('fails on impossible or unexpected interactions: %j', async (step, message) => {
    const result = await run([step, { expect: { screen: 'FEEDBACK' } }]);
    expect(result.ok).toBe(false);
    expect(result.tests[0]?.error).toContain(message);
  });

  it('allows an explicitly expected validation failure and recovery', async () => {
    const result = await run([{ submit: true, expect: { fieldErrors: { rating: 'This field is required' } } },
      { fill: 'rating', value: '5', expect: { fieldErrors: {} } }]);
    expect(result.ok).toBe(true);
  });

  it('does not substitute examples for missing endpoint data', async () => {
    const result = await run([{ expect: { screen: 'DETAILS' } }], {
      flow: booking as unknown as FlowJson, endpoint: { exchange: async () => ({ version: '3.0', screen: 'DETAILS', data: {} }) },
    });
    expect(result.ok).toBe(false);
    expect(result.tests[0]?.error).toContain('DETAILS.data.notice: missing declared data');
  });

  it('rejects wrong data types and wrong endpoint versions', async () => {
    for (const response of [{ version: '3.0', screen: 'DETAILS', data: { notice: 7 } }, { version: '2.0', screen: 'DETAILS', data: { notice: 'Hello' } }]) {
      const result = await run([{ expect: { screen: 'DETAILS' } }], { flow: booking as unknown as FlowJson, endpoint: { exchange: async () => response } });
      expect(result.ok).toBe(false);
    }
  });

  it('only uses examples when inspection explicitly requests them', async () => {
    await expect(inspectFlow({ flow: booking as unknown as FlowJson }, { mode: 'navigate' })).rejects.toThrow('missing declared data');
    const result = await inspectFlow({ flow: booking as unknown as FlowJson, useExamples: true }, { mode: 'navigate' });
    expect(result.data.notice).toBe('Choose a date to check availability.');
  });

  it('does not allow a typo in assertions or assertion-free tests to pass', () => {
    expect(() => parseSuite({ tests: [{ name: 'bad', steps: [{ expect: { screeen: 'X' } }] }] })).toThrow('unknown properties');
    expect(() => parseSuite({ tests: [{ name: 'bad', steps: [{ submit: true }] }] })).toThrow('at least one expect');
  });
});
