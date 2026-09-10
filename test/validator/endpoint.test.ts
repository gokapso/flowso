import { describe, it, expect } from 'vitest';
import { validateFlowJson } from '../../src/validator/index';
import appointment from '../../fixtures/appointment.flow.json';
import feedback from '../../fixtures/feedback.flow.json';

describe('endpoint usage', () => {
  it('accepts a dynamic flow that declares data_api_version', () => {
    expect(validateFlowJson(appointment).issues.some((item) => item.error === 'MISSING_DATA_API_VERSION')).toBe(false);
  });

  it('requires data_api_version when data_exchange is used', () => {
    const flow = JSON.parse(JSON.stringify(appointment)) as Record<string, unknown>;
    delete flow.data_api_version;
    const issue = validateFlowJson(flow).issues.find((item) => item.error === 'MISSING_DATA_API_VERSION');
    expect(issue?.severity).toBe('error');
    expect(issue?.pointers[0]?.path).toBe('data_api_version');
  });

  it('says nothing for a static flow', () => {
    const result = validateFlowJson(feedback);
    expect(result.issues.filter((item) => item.error === 'MISSING_DATA_API_VERSION')).toEqual([]);
    expect(result.valid).toBe(true);
  });
});
