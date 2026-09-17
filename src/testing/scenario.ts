import type { StartOptions } from '../runtime/types';

export type ScenarioStep = {
  fill?: string;
  value?: unknown;
  valueFrom?: string;
  submit?: true;
  click?: string;
  item?: string;
  back?: true;
  expect?: Record<string, unknown>;
};
export type Scenario = { name: string; start?: StartOptions; steps: ScenarioStep[] };
export type ScenarioSuite = { tests: Scenario[] };

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, allowed: string[], path: string): void {
  const unknown = Object.keys(value).filter(key => !allowed.includes(key));
  if (unknown.length) throw new Error(`${path}: unknown properties: ${unknown.join(', ')}`);
}

export function parseStart(value: unknown, path = 'start'): StartOptions {
  if (!isObject(value)) throw new Error(`${path}: expected an object`);
  if (value.mode === 'data_exchange') {
    keys(value, ['mode'], path);
    return { mode: 'data_exchange' };
  }
  keys(value, ['mode', 'screen', 'data'], path);
  if (value.mode !== 'navigate' || (value.screen !== undefined && typeof value.screen !== 'string')
    || (value.data !== undefined && !isObject(value.data))) {
    throw new Error(`${path}: expected mode navigate with optional screen and data, or mode data_exchange`);
  }
  return value as StartOptions;
}

export function parseSuite(value: unknown): ScenarioSuite {
  if (!isObject(value)) throw new Error('Scenario must be an object with a tests array');
  keys(value, ['tests'], 'scenario');
  if (!Array.isArray(value.tests) || !value.tests.length || value.tests.length > 100) {
    throw new Error('scenario.tests must contain between 1 and 100 tests');
  }
  const names = new Set<string>();
  for (const [index, test] of value.tests.entries()) {
    const path = `tests[${index}]`;
    if (!isObject(test)) throw new Error(`${path}: expected an object`);
    keys(test, ['name', 'start', 'steps'], path);
    if (typeof test.name !== 'string' || !test.name.trim() || names.has(test.name)) {
      throw new Error(`${path}.name must be a unique non-empty string`);
    }
    names.add(test.name);
    if (test.start !== undefined) parseStart(test.start, `${path}.start`);
    if (!Array.isArray(test.steps) || !test.steps.length || test.steps.length > 200) {
      throw new Error(`${path}.steps must contain between 1 and 200 steps`);
    }
    let assertions = 0;
    for (const [stepIndex, step] of test.steps.entries()) {
      const stepPath = `${path}.steps[${stepIndex}]`;
      if (!isObject(step)) throw new Error(`${stepPath}: expected an object`);
      keys(step, ['fill', 'value', 'valueFrom', 'submit', 'click', 'item', 'back', 'expect'], stepPath);
      const operations = ['fill', 'submit', 'click', 'back'].filter(key => Object.hasOwn(step, key));
      if (operations.length > 1 || (!operations.length && !step.expect)) {
        throw new Error(`${stepPath}: use exactly one operation, or an expect assertion`);
      }
      for (const key of ['fill', 'click', 'item', 'valueFrom']) {
        if (step[key] !== undefined && (typeof step[key] !== 'string' || !step[key])) {
          throw new Error(`${stepPath}.${key} must be a non-empty string`);
        }
      }
      for (const key of ['submit', 'back']) {
        if (step[key] !== undefined && step[key] !== true) throw new Error(`${stepPath}.${key} must be true`);
      }
      if (step.fill !== undefined) {
        if (Object.hasOwn(step, 'value') === Object.hasOwn(step, 'valueFrom')) {
          throw new Error(`${stepPath}: fill requires exactly one of value or valueFrom`);
        }
      } else if (Object.hasOwn(step, 'value') || Object.hasOwn(step, 'valueFrom')) {
        throw new Error(`${stepPath}: value and valueFrom require fill`);
      }
      if (step.item !== undefined && step.click === undefined) throw new Error(`${stepPath}: item requires click`);
      if (step.expect !== undefined) {
        if (!isObject(step.expect) || !Object.keys(step.expect).length) throw new Error(`${stepPath}.expect must be a non-empty object`);
        keys(step.expect, ['status', 'screen', 'title', 'history', 'data', 'fields', 'components', 'actions', 'fieldErrors', 'errorMessage', 'error', 'completion', 'canSubmit'], `${stepPath}.expect`);
        assertions += 1;
      }
    }
    if (!assertions) throw new Error(`${path}: include at least one expect assertion`);
  }
  return value as ScenarioSuite;
}
