import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cli/commands';
import { deployFlow } from '../../src/cli/deploy';

const flowPath = resolve('fixtures/appointment.flow.json');
const kapsoKey = 'secret-kapso-key';
const phoneNumberId = 'phone-123';
const baseUrl = 'https://api.kapso.ai/platform/v1';
const options = { flowPath, to: 'kapso' as const, kapsoKey, phoneNumberId };
const flow = { id: 'kapso-uuid', meta_flow_id: 'meta-123', preview_url: 'https://example.com/preview' };

function fakeFetch(...responses: Response[]) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const response of responses) fetch.mockResolvedValueOnce(response);
  return fetch;
}

beforeEach(() => {
  for (const name of ['KAPSO_API_KEY', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_WABA_ID']) vi.stubEnv(name, '');
  vi.stubEnv('KAPSO_API_URL', undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Kapso deployment', () => {
  it.each([false, true])('creates with canonical JSON and publish=%s', async (publish) => {
    const fetch = fakeFetch(Response.json(publish ? flow : { data: flow }));
    const log = vi.fn();
    expect(await deployFlow({ ...options, publish, log }, { fetch })).toEqual({ exitCode: 0 });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`${baseUrl}/whatsapp/flows`, {
      method: 'POST', headers: { 'X-API-Key': kapsoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number_id: phoneNumberId, name: 'appointment.flow',
        flow_json: JSON.parse(await readFile(flowPath, 'utf8')), publish }),
    });
    expect(log).toHaveBeenCalledWith('Kapso flow ID: kapso-uuid');
    expect(log).toHaveBeenCalledWith('Meta flow ID: meta-123');
    expect(log).toHaveBeenCalledWith(`Preview: ${flow.preview_url}`);
    expect(JSON.stringify(log.mock.calls)).not.toContain(kapsoKey);
  });

  it.each([false, true])('uploads a version before optionally publishing: %s', async (publish) => {
    const fetch = fakeFetch(Response.json({ data: { id: 'version-uuid', validation_errors: [] } }), new Response(null, { status: 204 }));
    const log = vi.fn();
    expect(await deployFlow({ ...options, flowId: 'kapso-uuid', publish, log }, { fetch })).toEqual({ exitCode: 0 });
    expect(fetch).toHaveBeenCalledTimes(publish ? 2 : 1);
    expect(fetch.mock.calls[0]).toEqual([`${baseUrl}/whatsapp/flows/kapso-uuid/versions`, {
      method: 'POST', headers: { 'X-API-Key': kapsoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ flow_json: JSON.parse(await readFile(flowPath, 'utf8')), phone_number_id: phoneNumberId }),
    }]);
    expect(log).toHaveBeenCalledWith('Kapso flow ID: kapso-uuid');
    expect(log).not.toHaveBeenCalledWith('Kapso flow ID: version-uuid');
    if (publish) expect(fetch.mock.calls[1]).toEqual([`${baseUrl}/whatsapp/flows/kapso-uuid/publish`, {
      method: 'POST', headers: { 'X-API-Key': kapsoKey, 'Content-Type': 'application/json' }, body: undefined,
    }]);
  });

  it.each([200, 422])('prints validation errors and never publishes: HTTP %s', async (status) => {
    const errors = ['Invalid screen', `Invalid property ${kapsoKey}`];
    const fetch = fakeFetch(Response.json(status === 422 ? { error: 'Validation failed', validation_errors: errors }
      : { data: { validation_errors: errors } }, { status }));
    const log = vi.fn();
    expect(await deployFlow({ ...options, flowId: 'kapso-uuid', publish: true, log }, { fetch })).toEqual({ exitCode: 1 });
    expect(fetch).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith('META Invalid screen');
    expect(log).toHaveBeenCalledWith('META Invalid property [REDACTED]');
    if (status === 422) expect(log).toHaveBeenCalledWith('Error: 422 Validation failed');
    expect(JSON.stringify(log.mock.calls)).not.toContain(kapsoKey);
  });

  it.each([
    { kapsoKey: '', phoneNumberId, message: 'Kapso API key required' },
    { kapsoKey, phoneNumberId: '', message: 'Phone number ID required' },
  ])('rejects missing credentials: $message', async ({ message, ...credentials }) => {
    const fetch = fakeFetch();
    const log = vi.fn();
    expect(await deployFlow({ ...options, ...credentials, log }, { fetch })).toEqual({ exitCode: 1 });
    expect(log).toHaveBeenCalledWith(expect.stringContaining(`Error: ${message}`));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses environment credentials and URL through the CLI without Meta credentials', async () => {
    vi.stubEnv('KAPSO_API_KEY', kapsoKey);
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', phoneNumberId);
    vi.stubEnv('KAPSO_API_URL', 'https://example.com/platform/v1/');
    const fetch = fakeFetch(Response.json({ data: flow }));
    vi.stubGlobal('fetch', fetch);
    expect(await runCli(['deploy', flowPath, '--to', 'kapso'], vi.fn())).toEqual({ exitCode: 0 });
    expect(fetch.mock.calls[0]?.[0]).toBe('https://example.com/platform/v1/whatsapp/flows');
    expect(fetch.mock.calls[0]?.[1]?.headers).toEqual({ 'X-API-Key': kapsoKey, 'Content-Type': 'application/json' });
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).phone_number_id).toBe(phoneNumberId);
  });

  it('maps CLI flags and lets explicit values override the environment', async () => {
    vi.stubEnv('KAPSO_API_KEY', 'unused-key');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'unused-phone');
    vi.stubEnv('KAPSO_API_URL', 'https://unused.example.com');
    const fetch = fakeFetch(Response.json(flow));
    vi.stubGlobal('fetch', fetch);
    expect(await runCli(['deploy', flowPath, '--to=kapso', '--kapso-key', kapsoKey,
      '--phone-number-id', phoneNumberId, '--kapso-url', baseUrl, '--name', 'My flow', '--publish'], vi.fn())).toEqual({ exitCode: 0 });
    expect(fetch.mock.calls[0]?.[0]).toBe(`${baseUrl}/whatsapp/flows`);
    expect(fetch.mock.calls[0]?.[1]?.headers).toEqual({ 'X-API-Key': kapsoKey, 'Content-Type': 'application/json' });
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({ phone_number_id: phoneNumberId, name: 'My flow', publish: true });
  });

  it.each([
    { response: () => Response.json({ error: `Forbidden ${kapsoKey}` }, { status: 403 }), message: 'Error: 403 Forbidden [REDACTED]' },
    { response: () => new Response('Unavailable', { status: 503 }), message: 'Error: 503' },
  ])('reports HTTP errors: $message', async ({ response, message }) => {
    const log = vi.fn();
    expect(await deployFlow({ ...options, log }, { fetch: fakeFetch(response()) })).toEqual({ exitCode: 1 });
    expect(log).toHaveBeenCalledWith(message);
  });

  it('reports publish failure', async () => {
    const log = vi.fn();
    const fetch = fakeFetch(Response.json({ data: {} }), Response.json({ error: 'Cannot publish' }, { status: 409 }));
    expect(await deployFlow({ ...options, flowId: 'kapso-uuid', publish: true, log }, { fetch })).toEqual({ exitCode: 1 });
    expect(log).toHaveBeenCalledWith('Error: 409 Cannot publish');
  });

  it('redacts credentials from network failures', async () => {
    const fetch = fakeFetch().mockRejectedValue(new Error(`Network ${kapsoKey}`));
    const log = vi.fn();
    expect(await deployFlow({ ...options, log }, { fetch })).toEqual({ exitCode: 1 });
    expect(log).toHaveBeenCalledWith('Error: Network [REDACTED]');
  });
});
