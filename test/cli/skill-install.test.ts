import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cli/commands';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
afterEach(() => vi.resetAllMocks());
function processResult(code: number | null, signal: string | null = null) {
  vi.mocked(spawn).mockImplementation(() => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('close', code, signal));
    return child as ReturnType<typeof spawn>;
  });
}
it.each([false, true])('opens the standard installer with inherited terminal, global=%s', async global => {
  processResult(0);
  const log = vi.fn();
  expect(await runCli(['skill', 'install', ...(global ? ['--global'] : [])], log)).toEqual({ exitCode: 0 });
  expect(spawn).toHaveBeenCalledExactlyOnceWith(process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['skills', 'add', 'gokapso/flowso', '--skill', 'flowso', ...(global ? ['--global'] : [])],
    { stdio: 'inherit', shell: process.platform === 'win32' });
  expect(log).not.toHaveBeenCalled();
});
it.each([[7, null, 7], [null, 'SIGINT', 130], [null, 'SIGTERM', 143], [null, 'SIGKILL', 1]] as const)('propagates installer completion %s/%s', async (code, signal, expected) => {
  processResult(code, signal);
  expect(await runCli(['skill', 'install'])).toEqual({ exitCode: expected });
});
it('reports a missing npx without claiming installation or attempting an offline copy', async () => {
  vi.mocked(spawn).mockImplementation(() => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('error', Object.assign(new Error('missing'), { code: 'ENOENT' })));
    return child as ReturnType<typeof spawn>;
  });
  const log = vi.fn();
  expect(await runCli(['skill', 'install'], log)).toEqual({ exitCode: 1 });
  expect(log).toHaveBeenCalledWith(expect.stringContaining('Could not start npx'));
});
it.each([
  ['install', 'other'], ['install', '--install', 'dir'], ['install', '--global=false'],
  ['install', '--yes'], ['install', '--agent', 'codex'], ['install', '--json'], ['unknown'],
])('rejects unsupported skill invocation: %s', async (...args) => {
  expect((await runCli(['skill', ...args], vi.fn())).exitCode).toBe(1);
  expect(spawn).not.toHaveBeenCalled();
});
