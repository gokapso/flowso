import { WhatsAppClient } from '@kapso/whatsapp-cloud-api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../../src/cli/args';
import { runCli } from '../../src/cli/commands';
import { sendFlow } from '../../src/cli/send';

const token = 'secret-access-token';
const options = { token, toNumber: '+15551234567', flowId: 'meta-123', phoneNumberId: 'phone-123' };
function fakeClient() {
  const sendInteractiveFlow = vi.fn<WhatsAppClient['messages']['sendInteractiveFlow']>().mockResolvedValue({
    messagingProduct: 'whatsapp', contacts: [], messages: [{ id: 'wamid.123' }],
  });
  const createClient = vi.fn((_token: string) => ({ messages: { sendInteractiveFlow } }));
  return { createClient, sendInteractiveFlow };
}

beforeEach(() => vi.stubEnv('WHATSAPP_ACCESS_TOKEN', ''));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('sendFlow', () => {
  it.each([false, true])('maps defaults with draft=%s and prints the message ID', async (draft) => {
    const fake = fakeClient();
    const log = vi.fn();
    expect(await sendFlow({ ...options, draft, log }, fake)).toEqual({ exitCode: 0 });
    expect(fake.createClient).toHaveBeenCalledExactlyOnceWith(token);
    expect(fake.sendInteractiveFlow).toHaveBeenCalledExactlyOnceWith({
      phoneNumberId: options.phoneNumberId, to: options.toNumber, bodyText: 'Test flow from flowso',
      header: undefined, footerText: undefined,
      parameters: { flowId: options.flowId, flowCta: 'Open', mode: draft ? 'draft' : 'published',
        flowToken: expect.stringMatching(/^flowso_.+/), flowAction: 'data_exchange', flowActionPayload: undefined },
    });
    expect(log).toHaveBeenCalledWith('Message ID: wamid.123');
    expect(JSON.stringify(log.mock.calls)).not.toContain(token);
  });

  it.each([undefined, '{"appointment_id":"123"}'])('maps screen navigation and optional data: %s', async (data) => {
    const fake = fakeClient();
    expect(await sendFlow({ ...options, body: 'Book now', cta: 'Book', header: 'Appointments', footer: 'Thanks', screen: 'START', data, log: vi.fn() }, fake)).toEqual({ exitCode: 0 });
    expect(fake.sendInteractiveFlow).toHaveBeenCalledWith({
      phoneNumberId: options.phoneNumberId, to: options.toNumber, bodyText: 'Book now',
      header: { type: 'text', text: 'Appointments' }, footerText: 'Thanks',
      parameters: { flowId: options.flowId, flowCta: 'Book', mode: 'published', flowToken: expect.stringMatching(/^flowso_.+/),
        flowAction: 'navigate', flowActionPayload: { screen: 'START', ...(data ? { data: { appointment_id: '123' } } : {}) } },
    });
  });

  it('uses the environment token and generates a fresh flow token each time', async () => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', token);
    const fake = fakeClient();
    for (let i = 0; i < 2; i++) expect(await sendFlow({ ...options, token: undefined, log: vi.fn() }, fake)).toEqual({ exitCode: 0 });
    expect(fake.createClient).toHaveBeenCalledWith(token);
    expect(fake.sendInteractiveFlow.mock.calls[0]?.[0].parameters.flowToken).not.toBe(fake.sendInteractiveFlow.mock.calls[1]?.[0].parameters.flowToken);
  });

  it.each([
    { token: '', message: 'Access token required' },
    { toNumber: undefined, message: '--to-number requires' },
    { toNumber: '123', message: '--to-number requires' },
    { flowId: undefined, message: '--flow-id is required' },
    { phoneNumberId: undefined, message: '--phone-number-id is required' },
    { data: '{}', message: '--data requires --screen' },
    { screen: 'START', data: 'null', message: '--data must be a JSON object' },
    { screen: 'START', data: '[]', message: '--data must be a JSON object' },
    { screen: 'START', data: '{', message: '' },
  ])('rejects invalid inputs before creating a client: $message', async ({ message, ...invalid }) => {
    const fake = fakeClient();
    const log = vi.fn();
    expect(await sendFlow({ ...options, ...invalid, log }, fake)).toEqual({ exitCode: 1 });
    expect(fake.createClient).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining(`Error: ${message}`));
  });

  it('redacts a token echoed by an SDK error', async () => {
    const fake = fakeClient();
    fake.sendInteractiveFlow.mockRejectedValue(new Error(`Failed ${token}`));
    const log = vi.fn();
    expect(await sendFlow({ ...options, log }, fake)).toEqual({ exitCode: 1 });
    expect(log).toHaveBeenCalledWith('Error: Failed [REDACTED]');
  });

  it('reports a missing message ID', async () => {
    const fake = fakeClient();
    fake.sendInteractiveFlow.mockResolvedValue({ messagingProduct: 'whatsapp', contacts: [], messages: [] });
    const log = vi.fn();
    expect(await sendFlow({ ...options, log }, fake)).toEqual({ exitCode: 1 });
    expect(log).toHaveBeenCalledWith('Error: No message ID returned');
  });
});

describe('send CLI', () => {
  it('recognizes draft as a boolean', () => {
    expect(parseArgs(['send', '--draft', '--to-number', options.toNumber])).toEqual({
      command: 'send', positional: [], flags: { draft: true, 'to-number': options.toNumber },
    });
  });

  it('maps CLI flags through the actual SDK wire request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({
      messaging_product: 'whatsapp', contacts: [], messages: [{ id: 'wamid.cli' }],
    }));
    vi.stubGlobal('fetch', fetch);
    const log = vi.fn();
    expect(await runCli(['send', '--to-number', options.toNumber, '--flow-id', options.flowId,
      '--phone-number-id', options.phoneNumberId, '--token', token, '--draft', '--body', 'Body',
      '--cta', 'Go', '--header', 'Header', '--footer', 'Footer', '--screen', 'START', '--data', '{"user_id":123}'], log)).toEqual({ exitCode: 0 });
    expect(fetch).toHaveBeenCalledOnce();
    expect(String(fetch.mock.calls[0]?.[0])).toContain('/phone-123/messages');
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
      to: options.toNumber, type: 'interactive', interactive: {
        type: 'flow', body: { text: 'Body' }, header: { type: 'text', text: 'Header' }, footer: { text: 'Footer' },
        action: { name: 'flow', parameters: { flow_id: options.flowId, flow_cta: 'Go', mode: 'draft',
          flow_action: 'navigate', flow_token: expect.stringMatching(/^flowso_.+/), flow_action_payload: { screen: 'START', data: { user_id: 123 } } } },
      },
    });
    expect(log).toHaveBeenCalledWith('Message ID: wamid.cli');
    expect(JSON.stringify(log.mock.calls)).not.toContain(token);
  });

  it.each([['send', 'flow.json'], ['send', '--to-number'], ['send', '--data'], ['send', '--token']])('rejects invalid CLI arguments: %j', async (...argv) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetch);
    expect(await runCli(argv, vi.fn())).toEqual({ exitCode: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('documents both commands', async () => {
    const log = vi.fn();
    expect(await runCli(['help'], log)).toEqual({ exitCode: 0 });
    for (const text of ['flowso send --to-number', '--to <meta|kapso>', '--kapso-key', '--kapso-url', '--draft', '--data <json>']) {
      expect(log).toHaveBeenCalledWith(expect.stringContaining(text));
    }
  });
});
