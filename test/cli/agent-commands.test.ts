import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cli/commands';
import feedback from '../../fixtures/feedback.flow.json';

let directory: string;
let path: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'flowso-agent-'));
  path = join(directory, 'flow.json');
  await writeFile(path, JSON.stringify(feedback));
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

async function command(argv: string[]) {
  const log = vi.fn();
  const result = await runCli(argv, log);
  expect(log).toHaveBeenCalledTimes(1);
  return { ...result, output: JSON.parse(log.mock.calls[0]![0]) };
}

describe('agent CLI', () => {
  it('discovers components and returns an actionable canonical snippet', async () => {
    const catalog = await command(['catalog', '--json']);
    expect(catalog.output.entries.length).toBeGreaterThan(20);
    const entry = await command(['catalog', 'text-input', '--json']);
    expect(entry.output.entry.component.type).toBe('TextInput');
    expect((await command(['catalog', 'unknown', '--json'])).exitCode).toBe(1);
  });
  it('validates and inspects a flow as machine-readable JSON', async () => {
    expect(await command(['validate', path, '--json'])).toMatchObject({ exitCode: 0, output: { schemaVersion: 1, valid: true } });
    const result = await command(['inspect', path, '--json']);
    expect(result).toMatchObject({ exitCode: 0, output: { ok: true, snapshot: { screen: 'FEEDBACK', fields: { rating: { required: true } } } } });
    expect(result.output.snapshot.actions).toContainEqual(expect.objectContaining({ action: 'navigate', label: 'Submit' }));
  });

  it.each([['inspect', '--made-up'], ['test'], ['test', '--scenario'], ['inspect', '--examples=false']])('reports malformed arguments as JSON: %s %s', async (...args) => {
    const result = await command([args[0]!, path, ...args.slice(1), '--json']);
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatchObject({ ok: false, error: { code: 'CLI_ERROR' } });
  });

  it('reports malformed Flow JSON and invalid flow structure as JSON', async () => {
    await writeFile(path, '{');
    expect((await command(['validate', path, '--json'])).output.error.code).toBe('CLI_ERROR');
    await writeFile(path, '{}');
    expect(await command(['inspect', path, '--json'])).toMatchObject({ exitCode: 1, output: { ok: false, validation: { valid: false } } });
  });

  it('runs a passing journey and reports a failing assertion with its step and snapshot', async () => {
    const scenario = join(directory, 'tests.json');
    const test = { name: 'feedback', steps: [
      { fill: 'rating', value: '5' }, { fill: 'comment', value: 'Great' }, { submit: true, expect: { screen: 'THANKS' } },
      { submit: true, expect: { status: 'completed' } },
    ] };
    await writeFile(scenario, JSON.stringify({ tests: [test] }));
    const args = ['test', path, '--scenario', scenario, '--json'];
    expect(await command(args)).toMatchObject({ exitCode: 0, output: { ok: true, tests: [{ passed: true }] } });
    test.steps[2]!.expect = { screen: 'WRONG' };
    await writeFile(scenario, JSON.stringify({ tests: [test] }));
    const failed = await command(args);
    expect(failed).toMatchObject({ exitCode: 1, output: { ok: false, tests: [{ passed: false, snapshot: { screen: 'THANKS' } }] } });
    expect(failed.output.tests[0].steps.at(-1)).toMatchObject({ index: 2, passed: false });
    expect((await command([...args, '--test', 'missing'])).output.error.message).toContain('No scenario test named');
    expect((await command([...args, '--test', 'feedback'])).output.tests).toHaveLength(1);
  });

  it('scaffolds a complete project and skill, refuses to overwrite it', async () => {
    const target = join(directory, 'booking');
    const log = vi.fn();
    expect((await runCli(['init', target], log)).exitCode).toBe(0);
    expect(JSON.parse(await readFile(join(target, 'flow.json'), 'utf8')).screens).toHaveLength(4);
    expect(await readFile(join(target, '.agents/skills/flowso/SKILL.md'), 'utf8')).toContain('flowso test');
    await writeFile(join(target, 'flow.json'), 'user draft');
    expect((await runCli(['init', target], log)).exitCode).toBe(1);
    expect(await readFile(join(target, 'flow.json'), 'utf8')).toBe('user draft');
  });

  it('prints and installs the packaged skill without overwriting an existing skill', async () => {
    const log = vi.fn();
    expect((await runCli(['skill'], log)).exitCode).toBe(0);
    expect(log.mock.calls[0]![0]).toContain('name: flowso');
    const target = join(directory, 'skill');
    expect((await runCli(['skill', '--install', target], log)).exitCode).toBe(0);
    expect((await runCli(['skill', '--install', target], log)).exitCode).toBe(1);
  });
});
