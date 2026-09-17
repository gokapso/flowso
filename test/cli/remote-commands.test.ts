import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cli/commands';

const flow = { id: 'kapso-id', meta_flow_id: '12345', status: 'draft', phone_number_id: 'phone-id', has_data_endpoint: true,
  flows_encryption_configured: true, data_endpoint_function_id: 'fn-id', data_endpoint_url: 'https://example.test/endpoint' };
const guard = { protocol: 1, read_only: true, booking_gate: 'expiry-v1' };
const reply = (screen?: string, data = {}) => ({ version: '3.0', ...(screen ? { screen } : {}), data: { ...data, flowso_verify: guard } });
let calls: { url: URL; method: string; body: any; headers: any }[];
function mock(responses: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url: new URL(url), method: init.method!, body: init.body ? JSON.parse(String(init.body)) : undefined, headers: init.headers });
    if (!responses.length) throw new Error('Unexpected request');
    return Response.json(responses.shift());
  }));
}
async function cli(...args: string[]) {
  const lines: string[] = [];
  const result = await runCli([...args, '--to', 'kapso', '--flow-id', 'kapso-id'], line => lines.push(line));
  return { ...result, output: lines.join('\n') };
}
beforeEach(() => { calls = []; vi.stubEnv('KAPSO_API_KEY', 'kapso-secret'); vi.stubEnv('WHATSAPP_ACCESS_TOKEN', ''); vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', ''); vi.stubEnv('KAPSO_API_URL', 'https://api.kapso.ai/platform/v1'); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('sends via Kapso using its resolved Meta ID and unchanged payload keys', async () => {
  mock([{ data: flow }, { messages: [{ id: 'wamid.test' }] }]);
  const result = await cli('send', '--to-number', '+15551234567', '--screen', 'DETAILS', '--data', '{"appointment_id":"one"}');
  expect(result.exitCode).toBe(0);
  expect(calls[1]!.url.pathname).toBe('/meta/whatsapp/v24.0/phone-id/messages');
  expect(calls[1]!.headers['X-API-Key']).toBe('kapso-secret');
  expect(calls[1]!.body.interactive.action.parameters).toMatchObject({ flow_id: '12345', mode: 'draft', flow_action_payload: { screen: 'DETAILS', data: { appointment_id: 'one' } } });
  expect(result.output).toContain('wamid.test');
});
it('generates independent interactive tokens and labels the original preview', async () => {
  const meta = { preview: { preview_url: 'https://business.facebook.com/preview/?token=meta-token', expires_at: 'tomorrow' }, endpoint_uri: flow.data_endpoint_url };
  mock([{ data: flow }, meta, { data: flow }, meta]);
  const first = JSON.parse((await cli('preview-url', '--json')).output);
  const second = JSON.parse((await cli('preview-url', '--screen', 'DETAILS', '--data', '{"first_name":"Test"}', '--json')).output);
  const url = new URL(first.url);
  expect(url.searchParams.get('token')).toBe('meta-token');
  expect(url.searchParams.get('flow_action')).toBe('data_exchange');
  expect(url.searchParams.get('interactive')).toBe('true');
  expect(url.searchParams.get('flow_token')).not.toBe(new URL(second.url).searchParams.get('flow_token'));
  expect(JSON.parse(new URL(second.url).searchParams.get('flow_action_payload')!)).toEqual({ screen: 'DETAILS', data: { first_name: 'Test' } });
  expect(first.visualUrlLabel).toContain('Visual-only');
});
const setup = () => [{ data: flow }, { endpoint_uri: flow.data_endpoint_url, validation_errors: [], status: 'draft' }, { data: { status: 'deployed', function_id: 'fn-id' } }];
it('verifies registration, INIT, availability, REVIEW and BACK without confirmation or secret changes', async () => {
  mock([...setup(), reply(undefined, { status: 'active' }), reply('DETAILS'), reply('SLOTS', { slots: [{ id: 'slot-1' }] }), reply('REVIEW'), reply('SLOTS', { slots: [] })]);
  const result = await cli('verify', '--data', '{"date":"2030-06-10"}', '--json');
  expect(result.exitCode).toBe(0);
  const exchanges = calls.filter(call => call.method === 'POST').map(call => call.body.data_exchange);
  expect(exchanges.map(value => [value.action, value.screen])).toEqual([['ping', undefined], ['INIT', undefined], ['data_exchange', 'DETAILS'], ['data_exchange', 'SLOTS'], ['BACK', 'SLOTS']]);
  expect(new Set(exchanges.map(value => value.flow_token)).size).toBe(1);
  expect(exchanges[0].flow_token).toMatch(/^flowso_verify_/);
  expect(JSON.parse(result.output).bookingWrites).toBe(false);
  expect(result.output).toContain('not the Meta encrypted transport');
});
it('refuses an endpoint without read-only support before INIT', async () => {
  mock([...setup(), { version: '3.0', data: { status: 'active' } }]);
  const result = await cli('verify', '--data', '{}', '--json');
  expect(result.exitCode).toBe(1); expect(result.output).toContain('read-only'); expect(calls).toHaveLength(4);
});
it.each(['registration', 'validation'])('stops before invoking the endpoint on invalid %s', async kind => {
  mock([{ data: flow }, { endpoint_uri: kind === 'registration' ? 'wrong' : flow.data_endpoint_url, validation_errors: kind === 'validation' ? [{}] : [] }]);
  expect((await cli('verify', '--data', '{}')).exitCode).toBe(1);
  expect(calls.every(call => call.method === 'GET')).toBe(true);
});
it('requires actual availability instead of reporting an incomplete smoke test as passed', async () => {
  mock([...setup(), reply(undefined, { status: 'active' }), reply('DETAILS'), reply('SLOTS', { slots: [] })]);
  const result = await cli('verify', '--data', '{}');
  expect(result.exitCode).toBe(1); expect(result.output).toContain('No available slots');
});
it('updates only named secrets and never compiles the Flow', async () => {
  vi.stubEnv('CAL_API_KEY', 'provider-secret');
  mock([{ data: flow }, { data: { status: 'deployed', function_id: 'fn-id' } }, {}]);
  const result = await cli('secrets', 'set', '--secret-env', 'CAL_API_KEY');
  expect(result.exitCode).toBe(0);
  expect(calls.filter(call => call.method === 'POST').map(call => call.url.pathname)).toEqual(['/platform/v1/functions/fn-id/secrets']);
  expect(calls[2]!.body).toEqual({ secret: { name: 'CAL_API_KEY', value: 'provider-secret' } });
  expect(result.output).not.toContain('provider-secret');
});
it('deploys standalone function code and restores secrets without Flow compilation', async () => {
  vi.stubEnv('CAL_API_KEY', 'provider-secret');
  mock([{ data: flow }, { data: { status: 'deployed', function_id: 'fn-id' } }, { secrets: [{ name: 'CAL_API_KEY' }] }, {}, { status: 'deployed' }, {}]);
  const result = await cli('endpoint', 'deploy', '--data-endpoint', 'templates/booking/kapso-data-endpoint.js', '--secret-env', 'CAL_API_KEY');
  expect(result.exitCode).toBe(0);
  expect(calls.filter(call => call.method === 'POST').map(call => call.url.pathname)).toEqual(['/platform/v1/whatsapp/flows/kapso-id/data_endpoint', '/platform/v1/whatsapp/flows/kapso-id/data_endpoint/deploy', '/platform/v1/functions/fn-id/secrets']);
});
it('refuses code updates that would lose existing secrets before writing', async () => {
  mock([{ data: flow }, { status: 'deployed', function_id: 'fn-id' }, { secrets: [{ name: 'CAL_API_KEY' }] }]);
  expect((await cli('endpoint', 'deploy', '--data-endpoint', 'templates/booking/kapso-data-endpoint.js')).exitCode).toBe(1);
  expect(calls.every(call => call.method === 'GET')).toBe(true);
});
it('enables a bounded booking window only after an expiry contract handshake', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2030-06-10T00:00:00Z'));
  mock([{ data: flow }, { status: 'deployed', function_id: 'fn-id' }, reply(undefined, { status: 'active' }), {}, {}]);
  expect((await cli('bookings', 'enable', '--for', '10m')).exitCode).toBe(0);
  expect(calls.slice(-2).map(call => call.body.secret)).toEqual([{ name: 'CAL_BOOKING_ENABLED_UNTIL', value: '2030-06-10T00:10:00.000Z' }, { name: 'CAL_ALLOW_BOOKINGS', value: '1' }]);
});
it.each(['0m', '61m', 'forever'])('rejects booking duration %s before calls', async duration => {
  mock([]); expect((await cli('bookings', 'enable', '--for', duration)).exitCode).toBe(1); expect(calls).toHaveLength(0);
});
it('does not enable bookings on an old endpoint', async () => {
  mock([{ data: flow }, { status: 'deployed', function_id: 'fn-id' }, { version: '3.0', data: { status: 'active' } }]);
  expect((await cli('bookings', 'enable', '--for', '10m')).exitCode).toBe(1);
  expect(calls.some(call => call.url.pathname.endsWith('/secrets'))).toBe(false);
});
it('disables bookings without requiring a new endpoint contract', async () => {
  mock([{ data: flow }, { status: 'deployed', function_id: 'fn-id' }, {}, {}]);
  expect((await cli('bookings', 'disable')).exitCode).toBe(0);
  expect(calls.slice(-2).map(call => call.body.secret.value)).toEqual(['1970-01-01T00:00:00.000Z', '0']);
});
it('does not echo server bodies with secrets on failure', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('kapso-secret provider-secret', { status: 401 })));
  const result = await cli('preview-url', '--json');
  expect(result.exitCode).toBe(1); expect(result.output).toContain('HTTP 401'); expect(result.output).not.toContain('kapso-secret');
});
it('allows code-only recovery after a failed function deployment', async () => {
  mock([{ data: flow }, { status: 'failed', function_id: 'fn-id' }, { secrets: [] }, {}, { status: 'deployed' }]);
  expect((await cli('endpoint', 'deploy', '--data-endpoint', 'templates/booking/kapso-data-endpoint.js')).exitCode).toBe(0);
});
it('can revoke the booking window after a draft was published', async () => {
  mock([{ data: { ...flow, status: 'published' } }, { status: 'deployed', function_id: 'fn-id' }, {}, {}]);
  expect((await cli('bookings', 'disable')).exitCode).toBe(0);
  expect(calls.at(-1)!.body.secret).toEqual({ name: 'CAL_ALLOW_BOOKINGS', value: '0' });
});
