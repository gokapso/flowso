import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cli/index';
import { formatIssue, validateFlowJson } from '../../src/validator';
import type { CliResult } from '../../src/cli/commands';

let directory: string;
let path: string;
const servers: NonNullable<CliResult['server']>[] = [];
const validFlow = {
  version: '7.3', routing_model: {},
  screens: [{ id: 'START', terminal: true, layout: { type: 'SingleColumnLayout', children: [
    { type: 'Footer', label: 'Done', 'on-click-action': { name: 'complete' } },
  ] } }],
};

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'flow-commands-'));
  path = join(directory, 'flow.json');
  await writeFile(path, JSON.stringify(validFlow));
});

afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop();
  await rm(directory, { recursive: true, force: true });
});

describe('CLI commands', () => {
  it('prints help with all commands and options', async () => {
    const log = vi.fn();
    expect(await runCli(['help'], log)).toEqual({ exitCode: 0 });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('validate <flow.json>'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('--public-key'));
  });

  it('returns zero for a valid flow', async () => {
    const log = vi.fn();
    expect(await runCli(['validate', path], log)).toEqual({ exitCode: 0 });
    expect(log).not.toHaveBeenCalled();
  });

  it('prints formatted warnings and returns zero when no errors exist', async () => {
    const warningFlow = { ...validFlow, version: '3.1' };
    await writeFile(path, JSON.stringify(warningFlow));
    const log = vi.fn();
    const issues = validateFlowJson(warningFlow).issues;
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((issue) => issue.severity === 'warning')).toBe(true);
    expect(await runCli(['validate', path], log)).toEqual({ exitCode: 0 });
    expect(log.mock.calls).toEqual(issues.map((issue) => [formatIssue(issue)]));
  });

  it('prints formatted errors and returns one for invalid flows', async () => {
    await writeFile(path, '{}');
    const log = vi.fn();
    expect(await runCli(['validate', path], log)).toEqual({ exitCode: 1 });
    expect(log.mock.calls).toEqual(validateFlowJson({}).issues.map((issue) => [formatIssue(issue)]));
  });

  it('starts a usable API, prints validation issues once and the actual URL', async () => {
    await writeFile(path, '{}');
    const log = vi.fn();
    const result = await runCli(['serve', path, '--port', '0', '--open'], log);
    if (result.server) servers.push(result.server);
    expect(result.exitCode).toBe(0);
    expect(result.server).toBeDefined();
    const line = log.mock.calls.find(([value]) => String(value).startsWith('Simulator running at '))?.[0] as string;
    expect(line).toMatch(/^Simulator running at http:\/\/127\.0\.0\.1:\d+$/);
    const response = await fetch(`${line.replace('Simulator running at ', '')}/__sim/flow`);
    expect(response.status).toBe(200);
    expect((await response.json()).flow).toEqual({});
    for (const issue of validateFlowJson({}).issues) {
      expect(log.mock.calls.filter(([value]) => value === formatIssue(issue))).toHaveLength(1);
    }
  });

  it('accepts endpoint options and never exposes the PEM in API metadata', async () => {
    const keyPath = join(directory, 'key.pem');
    await writeFile(keyPath, 'test-public-key');
    const log = vi.fn();
    const result = await runCli(['serve', path, '-p', '0', '--endpoint', 'http://127.0.0.1:9999', '--public-key', keyPath, '--timeout', '500'], log);
    if (result.server) servers.push(result.server);
    expect(result.exitCode).toBe(0);
    const line = log.mock.calls.find(([value]) => String(value).startsWith('Simulator running at '))?.[0] as string;
    const response = await fetch(`${line.replace('Simulator running at ', '')}/__sim/flow`);
    expect((await response.json()).endpoint).toEqual({ configured: true, url: 'http://127.0.0.1:9999', mode: 'encrypted' });
  });

  it.each([
    ['--port', 'bad'], ['--port', '65536'], ['--port'], ['--timeout', '0'],
    ['--endpoint', 'http://localhost'], ['--endpoint', 'ftp://localhost', '--plaintext'],
    ['--endpoint', 'http://localhost', '--plaintext', '--public-key', 'key.pem'],
  ])('reports invalid options without starting a server: %s', async (...flags) => {
    const log = vi.fn();
    expect(await runCli(['serve', path, ...flags], log)).toEqual({ exitCode: 1 });
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^Error: /));
  });

  it('reports missing arguments, files, malformed JSON, and unknown commands', async () => {
    const log = vi.fn();
    expect((await runCli(['validate'], log)).exitCode).toBe(1);
    expect((await runCli(['validate', join(directory, 'missing')], log)).exitCode).toBe(1);
    expect((await runCli(['unknown'], log)).exitCode).toBe(1);
    await writeFile(path, '{');
    expect((await runCli(['validate', path], log)).exitCode).toBe(1);
  });
});
