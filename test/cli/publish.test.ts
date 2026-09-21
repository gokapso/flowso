import { afterEach, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cli/commands';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const args = ['publish', '--flow-id', '12345', '--token', 'test-secret'];
function responses(...bodies: unknown[]) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const body of bodies) fetch.mockResolvedValueOnce(Response.json(body));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
it('publishes the remote draft without a file or WABA and verifies the resulting status', async () => {
  const fetch = responses({ id: '12345', status: 'DRAFT', validation_errors: [] }, { success: true }, { id: '12345', status: 'PUBLISHED' });
  const log = vi.fn();
  expect(await runCli(args, log)).toEqual({ exitCode: 0 });
  expect(fetch.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual(['/v23.0/12345', '/v23.0/12345/publish', '/v23.0/12345']);
  expect(fetch.mock.calls[1]?.[1]?.method).toBe('POST');
  expect(log).toHaveBeenCalledWith(expect.stringContaining('Status: PUBLISHED'));
});
it('does not republish a published flow', async () => {
  const fetch = responses({ id: '12345', status: 'PUBLISHED' });
  expect(await runCli(args, vi.fn())).toEqual({ exitCode: 0 });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([
  { status: 'DEPRECATED' },
  { status: 'DRAFT', validation_errors: [{ error: 'INVALID', message: 'Fix JSON' }] },
])('does not publish an invalid remote state: %j', async body => {
  const fetch = responses({ id: '12345', ...body });
  expect(await runCli(args, vi.fn())).toEqual({ exitCode: 1 });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('does not claim publication when verification still reports draft', async () => {
  responses({ status: 'DRAFT' }, { success: true }, { status: 'DRAFT' });
  expect(await runCli(args, vi.fn())).toEqual({ exitCode: 1 });
});
it('preserves the ID and redacts the token on an uncertain publish failure', async () => {
  const fetch = responses({ status: 'DRAFT' });
  fetch.mockRejectedValueOnce(new Error('test-secret network failure'));
  const log = vi.fn();
  expect(await runCli(args, log)).toEqual({ exitCode: 1 });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(log).toHaveBeenCalledWith(expect.stringContaining('Flow 12345'));
  expect(JSON.stringify(log.mock.calls)).not.toContain('test-secret');
});
it.each([{ argv: ['publish'] }, { argv: [...args, 'file.json'] }, { argv: [...args, '--to', 'kapso'] }])('rejects incomplete or unsupported invocations $argv', async ({ argv }) => {
  const fetch = responses();
  vi.stubEnv('WHATSAPP_ACCESS_TOKEN', '');
  expect(await runCli(argv, vi.fn())).toEqual({ exitCode: 1 });
  expect(fetch).not.toHaveBeenCalled();
});
