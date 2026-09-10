import { describe, it, expect } from 'vitest';
import { validateFlowJson } from '../../src/validator/index';
import appointment from '../../fixtures/appointment.flow.json';

function flow(payload: Record<string, unknown> | undefined) {
  return {
    version: '7.3',
    routing_model: { A: ['B'], B: [] },
    screens: [
      { id: 'A', layout: { type: 'SingleColumnLayout', children: [
        { type: 'Footer', label: 'Go', 'on-click-action': { name: 'navigate', next: { type: 'screen', name: 'B' }, ...(payload ? { payload } : {}) } },
      ] } },
      { id: 'B', terminal: true, data: { name: { type: 'string', __example__: 'x' }, slots: { type: 'array', items: { type: 'string' }, __example__: [] } },
        layout: { type: 'SingleColumnLayout', children: [
          { type: 'TextBody', text: '${data.name}' },
          { type: 'Footer', label: 'Done', 'on-click-action': { name: 'complete', payload: {} } },
        ] } },
    ],
  };
}

describe('navigate payload vs target data model', () => {
  it('flags declared fields missing from the payload with Meta\'s wording', () => {
    const result = validateFlowJson(flow({ name: 'Ana' }));
    const issue = result.issues.find((item) => item.error === 'MISSING_PAYLOAD_DATA');
    expect(issue?.message).toBe("Following fields are expected in the next screen's data model but missing in payload: [slots]");
    expect(issue?.pointers[0]?.path).toBe('screens[0].layout.children[0].on-click-action.payload');
    expect(result.valid).toBe(false);
  });

  it('flags every field when the payload is absent', () => {
    const issue = validateFlowJson(flow(undefined)).issues.find((item) => item.error === 'MISSING_PAYLOAD_DATA');
    expect(issue?.message).toContain('[name, slots]');
  });

  it('passes when the payload covers the data model', () => {
    expect(validateFlowJson(flow({ name: 'Ana', slots: [] })).issues.some((item) => item.error === 'MISSING_PAYLOAD_DATA')).toBe(false);
  });

  it('the bundled fixture passes the rule', () => {
    expect(validateFlowJson(appointment).issues.some((item) => item.error === 'MISSING_PAYLOAD_DATA')).toBe(false);
  });
});
