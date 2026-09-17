import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEndpointClient } from '../endpoint/client';
import { validateFlowJson } from '../validator';
import type { FlowJson } from '../schema/flow-json';
import { inspectFlow, runScenarios, type RunnerOptions } from '../testing/runner';
import { parseStart, parseSuite } from '../testing/scenario';
import { endpointOptions, textFlag } from './options';
import type { ParsedArgs } from './args';

export async function agentCommand(args: ParsedArgs, log: (line: string) => void) {
  const allowed = ['endpoint', 'plaintext', 'public-key', 'timeout', 'json', ...(args.command === 'test' ? ['scenario', 'test', 'trace'] : ['screen', 'data', 'examples'])];
  for (const flag of Object.keys(args.flags)) if (!allowed.includes(flag)) throw new Error(`Unknown ${args.command} option: --${flag}`);
  for (const flag of ['json', 'trace', 'plaintext', 'examples']) {
    if (args.flags[flag] !== undefined && args.flags[flag] !== true) throw new Error(`--${flag} does not take a value`);
  }
  if (args.positional.length !== 1) throw new Error(`${args.command} requires one <flow.json> path`);
  const flow: unknown = JSON.parse(readFileSync(resolve(args.positional[0]!), 'utf8'));
  const validation = validateFlowJson(flow);
  if (!validation.valid) {
    log(JSON.stringify({ schemaVersion: 1, ok: false, validation }));
    return { exitCode: 1 };
  }
  const transport = endpointOptions(args);
  const endpoint = transport ? createEndpointClient(transport.mode === 'encrypted'
    ? { ...transport, mode: 'encrypted', publicKeyPem: transport.publicKeyPem! }
    : { ...transport, mode: 'plaintext' }) : undefined;
  const options: RunnerOptions = { flow: flow as FlowJson, endpoint, trace: args.flags.trace === true, useExamples: args.flags.examples === true };
  if (args.command === 'inspect') {
    const screen = textFlag(args, 'screen');
    const data = textFlag(args, 'data');
    const start = screen || data || options.useExamples ? parseStart({ mode: 'navigate', screen, data: data ? JSON.parse(data) : undefined }) : undefined;
    const snapshot = await inspectFlow(options, start);
    const result = { schemaVersion: 1, ok: snapshot.error === null, validation, snapshot };
    log(JSON.stringify(result, null, args.flags.json ? undefined : 2));
    return { exitCode: result.ok ? 0 : 1 };
  }
  const scenario = textFlag(args, 'scenario');
  if (!scenario) throw new Error('test requires --scenario <tests.json>; run flowso skill for the format');
  const suite = parseSuite(JSON.parse(readFileSync(resolve(scenario), 'utf8')));
  const name = textFlag(args, 'test');
  if (name) {
    suite.tests = suite.tests.filter(test => test.name === name);
    if (!suite.tests.length) throw new Error(`No scenario test named "${name}"`);
  }
  const result = await runScenarios(options, suite);
  if (args.flags.json) log(JSON.stringify({ ...result, validation }));
  else {
    for (const test of result.tests) {
      log(`${test.passed ? 'PASS' : 'FAIL'} ${test.name} (${test.steps.length} steps)`);
      if (test.error) log(`  ${test.error}\n  Snapshot: ${JSON.stringify(test.snapshot)}`);
      if (options.trace) log(JSON.stringify(test));
    }
    log(`${result.tests.filter(test => test.passed).length}/${result.tests.length} tests passed`);
  }
  return { exitCode: result.ok ? 0 : 1 };
}
