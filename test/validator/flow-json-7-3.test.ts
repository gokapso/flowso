import { describe, expect, it } from 'vitest';
import { validateFlowJson } from '../../src/validator';
import survey from '../../fixtures/survey-branches.flow.json';

describe('Flow JSON 7.3 survey with per-branch Footers', () => {
  it('validates the production survey shape with no issues', () => {
    const result = validateFlowJson(survey);
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });
});
