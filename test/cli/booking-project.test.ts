import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cli/commands';

let child: ChildProcess;
let url: string;
const root = fileURLToPath(new URL('../../templates/booking/', import.meta.url));

beforeAll(async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('CAL_')));
  child = spawn(process.execPath, ['dev-server.mjs'], { cwd: root, env: { ...env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Booking endpoint did not start')), 5000);
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`Booking endpoint exited ${code}`)); });
    child.on('error', reject);
    child.stdout!.on('data', chunk => {
      const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+\/flow/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
  });
});
afterAll(async () => { if (child && child.exitCode === null) { const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit; } });

it('runs all booking journeys through a real local HTTP endpoint and Cal.com contract fixture twice', async () => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const log = vi.fn();
    const result = await runCli(['test', `${root}/flow.json`, '--scenario', `${root}/scenarios.json`, '--endpoint', url, '--plaintext', '--json', '--trace'], log);
    const report = JSON.parse(log.mock.calls[0]![0]);
    expect(report.tests?.filter((test: { passed: boolean }) => !test.passed)).toEqual([]);
    expect(result.exitCode).toBe(0);
    expect(report.tests).toHaveLength(7);
    const back = report.tests[1].events.find((event: { type: string; request?: { action: string } }) => event.type === 'data_exchange:request' && event.request?.action === 'BACK');
    expect(back).toBeDefined();
    const conflictEvents = report.tests[2].events;
    const conflict = conflictEvents.findIndex((event: { type: string; response?: { screen: string; data: { error_message?: string } } }) =>
      event.type === 'data_exchange:response' && event.response?.screen === 'REVIEW' && event.response.data.error_message?.includes('Go back'));
    expect(conflict).toBeGreaterThan(-1);
    const refresh = conflictEvents.slice(conflict + 1).find((event: { type: string; request?: { action: string; screen: string } }) =>
      event.type === 'data_exchange:request' && event.request?.action === 'BACK');
    expect(refresh?.request.screen).toBe('SLOTS');
  }
});

it('validates the generated booking template', async () => {
  const log = vi.fn();
  expect((await runCli(['validate', `${root}/flow.json`, '--json'], log)).exitCode).toBe(0);
  expect(JSON.parse(log.mock.calls[0]![0]).valid).toBe(true);
});
