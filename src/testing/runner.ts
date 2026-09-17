import { randomUUID } from 'node:crypto';
import type { Action, FlowJson } from '../schema/flow-json';
import { createFlowRuntime } from '../runtime/runtime';
import type { FlowDataEndpoint, FlowRuntime, StartOptions } from '../runtime/types';
import { checkScreenData } from './data-contract';
import { input, mismatch, pointer, snapshot } from './snapshot';
import { isObject, type ScenarioStep, type ScenarioSuite } from './scenario';

export type RunnerOptions = { flow: FlowJson; endpoint?: FlowDataEndpoint; useExamples?: boolean; trace?: boolean };

export function testRuntime(options: RunnerOptions): FlowRuntime {
  const endpoint = options.endpoint;
  return createFlowRuntime({ ...options, flowToken: `flowso_test_${randomUUID()}`, useExamples: options.useExamples ?? false,
    endpoint: endpoint ? { async exchange(request) {
      const response = await endpoint.exchange(request);
      if (response.version !== request.version) throw new Error(`Endpoint must return version "${request.version}"`);
      if (response.screen === 'SUCCESS') {
        const extension = response.data?.extension_message_response;
        if (!isObject(extension) || !isObject(extension.params)) throw new Error('SUCCESS response must include data.extension_message_response.params');
        if (extension.params.flow_token !== request.flow_token) throw new Error('SUCCESS params must echo the request flow_token');
      } else if (response.screen) checkScreenData(options.flow, response.screen, response.data ?? {});
      return response;
    } } : undefined });
}

export function defaultStart(options: RunnerOptions): StartOptions {
  return options.flow.data_api_version ? { mode: 'data_exchange' } : { mode: 'navigate' };
}

export async function inspectFlow(options: RunnerOptions, start = defaultStart(options)) {
  const runtime = testRuntime(options);
  await runtime.start(start);
  checkSnapshot(runtime, options);
  return snapshot(runtime);
}

function checkSnapshot(runtime: FlowRuntime, options: RunnerOptions): void {
  const current = snapshot(runtime);
  if (current.status === 'ready' && current.screen && !options.useExamples) checkScreenData(options.flow, current.screen, current.data);
  if (current.errorMessage?.startsWith('Expression error:')) throw new Error(current.errorMessage);
}

async function act(runtime: FlowRuntime, step: ScenarioStep): Promise<void> {
  if (step.fill !== undefined) {
    const node = input(runtime, step.fill);
    const value = step.valueFrom ? pointer(snapshot(runtime), step.valueFrom) : step.value;
    if (value !== null) {
      const type = node.type;
      const valid = ['CheckboxGroup', 'ChipsSelector', 'PhotoPicker', 'DocumentPicker'].includes(type) ? Array.isArray(value)
        : type === 'OptIn' ? typeof value === 'boolean'
        : type === 'CalendarPicker' && node.props.mode === 'range' ? isObject(value)
        : typeof value === 'string';
      if (!valid) throw new Error(`Field "${step.fill}": invalid value type for ${type}`);
    }
    const items = node.props['data-source'];
    if (Array.isArray(items)) {
      const values = Array.isArray(value) ? value : value === null || value === '' ? [] : [value];
      for (const id of values) {
        if (!items.some(item => isObject(item) && item.id === id && item.enabled !== false)) throw new Error(`Field "${step.fill}": option ${JSON.stringify(id)} is unavailable`);
      }
    }
    await runtime.setFormValue(step.fill, value);
  } else if (step.back) {
    if (runtime.getState().history.length < 2) throw new Error('Cannot go back from the first screen');
    await runtime.back();
  } else if (step.submit || step.click) {
    const nodes = runtime.render()?.children.filter(node => step.submit ? node.type === 'Footer' : node.path === step.click) ?? [];
    if (nodes.length !== 1) throw new Error(`Expected one ${step.submit ? 'Footer' : `component at ${step.click}`}, found ${nodes.length}; inspect actions before clicking`);
    const node = nodes[0]!;
    if (node.props.enabled === false) throw new Error(`Component ${node.path} is disabled`);
    let action = node.props['on-click-action'];
    if (step.item !== undefined) {
      const items = node.props['list-items'];
      const item = Array.isArray(items) ? items.find(item => isObject(item) && item.id === step.item) : undefined;
      if (!isObject(item) || item.enabled === false) throw new Error(`Navigation item "${step.item}" is unavailable`);
      action = item['on-click-action'] ?? action;
    }
    if (!isObject(action) || typeof action.name !== 'string') throw new Error(`Component ${node.path} has no click action`);
    await runtime.dispatch(action as Action, { validate: node.type === 'Footer' });
  }
}

export async function runScenarios(options: RunnerOptions, suite: ScenarioSuite) {
  const tests = [];
  for (const test of suite.tests) {
    const runtime = testRuntime(options);
    const steps: { index: number; action: string; passed: boolean; screen: string | null; error?: string; snapshot?: ReturnType<typeof snapshot> }[] = [];
    let error: string | undefined;
    try {
      await runtime.start(test.start ?? defaultStart(options));
      checkSnapshot(runtime, options);
      // An INIT failure can only be an expected outcome when the first step explicitly asserts it.
      if (runtime.getState().error && !test.steps[0]?.expect?.error) throw new Error(runtime.getState().error!.message);
      for (const [index, step] of test.steps.entries()) {
        const action = step.fill ? `fill ${step.fill}` : step.click ? `click ${step.click}` : step.submit ? 'submit' : step.back ? 'back' : 'expect';
        try {
          if (runtime.getState().status === 'completed' && (step.fill || step.submit || step.click || step.back)) throw new Error('Flow is already completed');
          await act(runtime, step);
          checkSnapshot(runtime, options);
          const current = snapshot(runtime);
          if (current.error && !step.expect?.error) throw new Error(current.error.message);
          if (Object.keys(current.fieldErrors).length && !step.expect?.fieldErrors) throw new Error(`Unexpected field errors: ${JSON.stringify(current.fieldErrors)}`);
          if (current.errorMessage && !Object.hasOwn(step.expect ?? {}, 'errorMessage')) throw new Error(`Unexpected screen error: ${current.errorMessage}`);
          const failed = step.expect ? mismatch(current, step.expect) : undefined;
          if (failed) throw new Error(failed);
          steps.push({ index, action, passed: true, screen: current.screen,
            ...(options.trace ? { snapshot: current } : {}) });
        } catch (cause) {
          error = cause instanceof Error ? cause.message : String(cause);
          steps.push({ index, action, passed: false, screen: runtime.getState().screenId, error });
          break;
        }
      }
    } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    tests.push({ name: test.name, passed: error === undefined, ...(error ? { error } : {}), steps, snapshot: snapshot(runtime),
      ...(options.trace ? { events: runtime.getState().events } : {}) });
  }
  return { schemaVersion: 1, ok: tests.every(test => test.passed), tests };
}
