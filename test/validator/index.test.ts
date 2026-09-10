import { describe, expect, it } from 'vitest';
import appointment from '../../fixtures/appointment.flow.json';
import { formatIssue, validateFlowJson } from '../../src/validator';

describe('validator public API', () => {
  it('validates the appointment fixture without errors or mutating it', () => {
    const before = structuredClone(appointment);
    const result = validateFlowJson(appointment);
    expect(result.valid).toBe(true);
    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(appointment).toEqual(before);
    expect(validateFlowJson(appointment)).toEqual(result);
  });

  it('formats a Meta-shaped issue', () => {
    expect(formatIssue({ error: 'INVALID_PROPERTY_VALUE', error_type: 'FLOW_JSON_ERROR',
      severity: 'error', message: 'version must be a string', pointers: [{ path: 'version' }] }))
      .toBe('INVALID_PROPERTY_VALUE at version: version must be a string');
  });

  it('includes every pointer when formatting an issue', () => {
    expect(formatIssue({ error: 'DUPLICATE_SCREEN_ID', error_type: 'FLOW_JSON_ERROR', severity: 'error',
      message: 'Duplicate id', pointers: [{ path: 'screens[0].id' }, { path: 'screens[1].id' }] }))
      .toBe('DUPLICATE_SCREEN_ID at screens[0].id, screens[1].id: Duplicate id');
  });
});
