import { describe, expect, it } from 'vitest';
import { validateFlowJson } from '../../src/validator';
import { expectIssue, flow, footer, screen } from './helpers';

describe('top-level structure', () => {
  it.each([null, undefined, [], '7.3', 7, true])('rejects non-object input %j', (input) => {
    expectIssue(validateFlowJson(input), 'INVALID_PROPERTY_VALUE', '$');
  });

  it('reports each missing required top-level field', () => {
    const result = validateFlowJson({});
    for (const key of ['version', 'screens', 'routing_model']) expectIssue(result, 'MISSING_REQUIRED_PROPERTY', key);
  });

  it.each([
    ['version', 7.3], ['version', '7'], ['version', '7.3.0'], ['version', 'v7.3'],
    ['screens', []], ['screens', null], ['screens', {}], ['routing_model', []],
    ['routing_model', null], ['data_api_version', 3],
  ])('rejects invalid %s = %j', (key, value) => {
    expectIssue(validateFlowJson(flow({ [String(key)]: value })), 'INVALID_PROPERTY_VALUE', String(key));
  });

  it('does not throw when a screen is malformed', () => {
    const result = validateFlowJson(flow({ screens: [null, [], 1, screen()] }));
    for (const index of [0, 1, 2]) expectIssue(result, 'INVALID_PROPERTY_VALUE', `screens[${index}]`);
  });

  it('warns on unknown top-level properties without invalidating a flow', () => {
    const result = validateFlowJson(flow({ screens: [screen([footer()])], extra: true, data_api_version: '3.0' }));
    expectIssue(result, 'UNKNOWN_PROPERTY', 'extra', 'warning');
    expect(result.valid).toBe(true);
  });
});
