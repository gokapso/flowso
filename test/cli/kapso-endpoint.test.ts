import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cli/commands';
import { deployFlow, type DeployOptions } from '../../src/cli/deploy';

const directory = mkdtempSync(join(tmpdir(), 'flowso-deploy-test-'));
const dataEndpoint = join(directory, 'endpoint.js');
const source = 'async function handler(request, env) { return { screen: "START", data: {} }; }';
writeFileSync(dataEndpoint, source);
const flowPath = resolve('fixtures/appointment.flow.json');
const options: DeployOptions = {
  flowPath, dataEndpoint, to: 'kapso', kapsoKey: 'test-kapso-key', phoneNumberId: 'phone-123',
  setupEncryption: true, registerEndpoint: true, secretEnv: ['CAL_API_KEY', 'CAL_ALLOW_BOOKINGS'],
};
const draft = { id: 'flow-123', meta_flow_id: 'meta-123', status: 'draft', has_data_endpoint: true, flows_encryption_configured: true, preview_url: 'https://example.com/preview' };
const functionData = { function_id: 'function-123', status: 'deployed' };
const compiled = { id: 'version-final', status: 'draft', validation_errors: null };
const responses = [draft, { flows_encryption_configured: true, status: 'already_configured' }, functionData, functionData,
  { message: 'Secret created successfully' }, { message: 'Secret created successfully' },
  { ...functionData, flow_has_encryption: true }, compiled, draft];
const paths = ['/whatsapp/flows', '/whatsapp/flows/flow-123/setup_encryption', '/whatsapp/flows/flow-123/data_endpoint',
  '/whatsapp/flows/flow-123/data_endpoint/deploy', '/functions/function-123/secrets', '/functions/function-123/secrets',
  '/whatsapp/flows/flow-123/data_endpoint/register', '/whatsapp/flows/flow-123/versions', '/whatsapp/flows/flow-123'];
function fakeFetch() {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const data of responses) fetch.mockResolvedValueOnce(Response.json({ data }));
  return fetch;
}

beforeEach(() => {
  vi.stubEnv('KAPSO_API_KEY', options.kapsoKey!);
  vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', options.phoneNumberId!);
  vi.stubEnv('KAPSO_API_URL', undefined);
  vi.stubEnv('CAL_API_KEY', 'cal-private-test-value');
  vi.stubEnv('CAL_ALLOW_BOOKINGS', '0');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe('Kapso dynamic draft deployment', () => {
  it('wires repeated CLI secret names, deploys in order, and never publishes or sends', async () => {
    const fetch = fakeFetch();
    vi.stubGlobal('fetch', fetch);
    const log = vi.fn();
    expect(await runCli(['deploy', flowPath, '--to', 'kapso', '--data-endpoint', dataEndpoint,
      '--secret-env', 'CAL_API_KEY', '--secret-env=CAL_ALLOW_BOOKINGS', '--secret-env', 'CAL_API_KEY',
      '--setup-encryption', '--register-endpoint'], log)).toEqual({ exitCode: 0 });
    expect(fetch.mock.calls.map(([url]) => new URL(String(url)).pathname.replace('/platform/v1', ''))).toEqual(paths);
    const bodies = fetch.mock.calls.map(([, init]) => init?.body ? JSON.parse(String(init.body)) : undefined);
    expect(bodies[0]).toMatchObject({ publish: false, phone_number_id: 'phone-123' });
    expect(bodies[1]).toEqual({ phone_number_id: 'phone-123' });
    expect(bodies[2]).toEqual({ code: source });
    expect(bodies[7]).toEqual({ flow_json: bodies[0].flow_json, phone_number_id: 'phone-123' });
    expect(bodies[4]).toEqual({ secret: { name: 'CAL_API_KEY', value: 'cal-private-test-value' } });
    expect(bodies[5]).toEqual({ secret: { name: 'CAL_ALLOW_BOOKINGS', value: '0' } });
    expect(fetch.mock.calls.at(-1)?.[1]?.method).toBe('GET');
    expect(JSON.stringify(log.mock.calls)).not.toContain('cal-private-test-value');
    expect(log).toHaveBeenCalledWith('Preview: https://example.com/preview');
  });

  it('reuses an existing draft and its function on retry', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json({ data: draft }));
    for (const data of [{ id: 'version-uuid' }, ...responses.slice(1)]) fetch.mockResolvedValueOnce(Response.json({ data }));
    const log = vi.fn();
    expect(await deployFlow({ ...options, flowId: 'flow-123', log }, { fetch })).toEqual({ exitCode: 0 });
    expect(fetch.mock.calls[0]?.[1]?.method).toBe('GET');
    expect(String(fetch.mock.calls[1]?.[0])).toContain('/flow-123/versions');
    expect(fetch.mock.calls.slice(2).map(([url]) => new URL(String(url)).pathname.replace('/platform/v1', ''))).toEqual(paths.slice(1));
    expect(log).not.toHaveBeenCalledWith('Kapso flow ID: version-uuid');
    expect(fetch.mock.calls.every(([, init]) => init?.method !== 'DELETE')).toBe(true);
  });

  it('restores all existing secret bindings and checks missing ones before writing', async () => {
    for (const missing of [false, true]) {
      const fetch = vi.fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(Response.json({ data: { ...draft, data_endpoint_function_id: 'function-123' } }))
        .mockResolvedValueOnce(Response.json({ data: { secrets: [{ name: missing ? 'ANOTHER_SECRET' : 'CAL_API_KEY', type: 'secret_text' }] } }));
      for (const data of [{ id: 'version-123' }, ...responses.slice(1)]) fetch.mockResolvedValueOnce(Response.json({ data }));
      const log = vi.fn();
      expect(await deployFlow({ ...options, flowId: 'flow-123', log }, { fetch })).toEqual({ exitCode: missing ? 1 : 0 });
      expect(fetch.mock.calls[1]?.[1]?.method).toBe('GET');
      expect(String(fetch.mock.calls[1]?.[0])).toContain('/functions/function-123/secrets');
      if (missing) {
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(log).toHaveBeenCalledWith(expect.stringContaining('ANOTHER_SECRET'));
        expect(JSON.stringify(log.mock.calls)).not.toContain('partial');
      } else {
        expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST' && String(init.body).includes('cal-private-test-value'))).toHaveLength(1);
      }
    }
  });

  it('supports deploying code without encryption setup, secrets, or registration', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    for (const data of [draft, functionData, functionData, compiled, draft]) fetch.mockResolvedValueOnce(Response.json(data));
    expect(await deployFlow({ ...options, setupEncryption: false, registerEndpoint: false, secretEnv: [], log: vi.fn() }, { fetch })).toEqual({ exitCode: 0 });
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it.each(['published', 'deprecated', undefined])('refuses an existing non-draft (%s) before mutations', async status => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ data: { ...draft, status } }));
    expect(await deployFlow({ ...options, flowId: 'flow-123', log: vi.fn() }, { fetch })).toEqual({ exitCode: 1 });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[1]?.method).toBe('GET');
  });

  it.each([
    { to: 'meta' as const }, { dataEndpoint: undefined }, { publish: true }, { endpointUri: 'https://example.com' },
    { secretEnv: ['MISSING_FLOWSO_DEPLOY_SECRET'] }, { secretEnv: ['CAL_API_KEY=do-not-print-this'] },
    { dataEndpoint: join(directory, 'absent.js') },
  ])('rejects invalid local configuration before any HTTP call: %j', async overrides => {
    vi.stubEnv('MISSING_FLOWSO_DEPLOY_SECRET', undefined);
    const fetch = fakeFetch();
    const log = vi.fn();
    expect(await deployFlow({ ...options, ...overrides, log }, { fetch })).toEqual({ exitCode: 1 });
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain('do-not-print-this');
  });

  it('rejects missing repeated values and invalid endpoint syntax without executing code', async () => {
    const fetch = fakeFetch(); vi.stubGlobal('fetch', fetch);
    const log = vi.fn();
    expect(await runCli(['deploy', flowPath, '--secret-env', '--to', 'kapso'], log)).toEqual({ exitCode: 1 });
    const invalidPath = join(directory, 'invalid.js');
    writeFileSync(invalidPath, 'const secret = "do-not-print-source"; export default () => {};');
    expect(await deployFlow({ ...options, dataEndpoint: invalidPath, log }, { fetch })).toEqual({ exitCode: 1 });
    expect(JSON.stringify(log.mock.calls)).not.toContain('do-not-print-source');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8])('stops immediately on HTTP failure at step %s without leaking response contents', async step => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    for (const data of responses.slice(0, step)) fetch.mockResolvedValueOnce(Response.json({ data }));
    fetch.mockResolvedValueOnce(Response.json({ error: 'cal-private-test-value secret endpoint source' }, { status: 422 }));
    const log = vi.fn();
    expect(await deployFlow({ ...options, log }, { fetch })).toEqual({ exitCode: 1 });
    expect(fetch).toHaveBeenCalledTimes(step + 1);
    expect(JSON.stringify(log.mock.calls)).not.toContain('cal-private-test-value');
    if (step > 0) expect(log).toHaveBeenCalledWith(expect.stringContaining('Retry with --flow-id flow-123'));
  });

  it('does not echo network errors from secret requests', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    for (const data of responses.slice(0, 4)) fetch.mockResolvedValueOnce(Response.json({ data }));
    fetch.mockRejectedValueOnce(new Error('Failed to send cal-private-test-value'));
    const log = vi.fn();
    expect(await deployFlow({ ...options, log }, { fetch })).toEqual({ exitCode: 1 });
    expect(log).toHaveBeenCalledWith('Error: store secret CAL_API_KEY: Network request failed');
    expect(JSON.stringify(log.mock.calls)).not.toContain('cal-private-test-value');
  });

  it.each([
    [0, { ...draft, validation_errors: [{ error: 'INVALID_PROPERTY', message: 'private detail' }] }],
    [1, { flows_encryption_configured: false }], [2, { status: 'draft' }], [3, { status: 'failed' }],
    [6, { flow_has_encryption: false }], [8, { ...draft, has_data_endpoint: false }],
    [7, { ...compiled, validation_errors: ['Meta rejected the final upload'] }],
    [7, { ...compiled, validation_errors: [{ error: 'INVALID_ROUTING_MODEL', message: 'Invalid route' }] }],
    [7, { id: 'version-final', status: 'draft' }],
    [8, { ...draft, flows_encryption_configured: false }],
    [8, { ...draft, preview_url: null }],
    [8, { ...draft, preview_url: '' }],
    [8, { ...draft, status: 'published' }],
  ])('does not treat an unconfirmed operation as success: step %s', async (step, response) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    for (const data of responses.slice(0, Number(step))) fetch.mockResolvedValueOnce(Response.json({ data }));
    fetch.mockResolvedValueOnce(Response.json({ data: response }));
    expect(await deployFlow({ ...options, log: vi.fn() }, { fetch })).toEqual({ exitCode: 1 });
    expect(fetch).toHaveBeenCalledTimes(Number(step) + 1);
  });
});
