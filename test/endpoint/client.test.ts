import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEndpointClient, createLocalEndpointHandler, EndpointError, generateKeyPair } from '../../src/endpoint';
import type { DataExchangeRequest, DataExchangeResponse, EncryptedRequestBody } from '../../src/endpoint';

const keys = generateKeyPair();
const request: DataExchangeRequest = { version: '3.0', action: 'INIT', flow_token: 'test-token' };
const response: DataExchangeResponse = { screen: 'FORM', data: { greeting: 'Hola' } };

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('endpoint client', () => {
  it('exchanges encrypted data with the framework-free local handler and logs plaintext with timing', async () => {
    const handler = vi.fn(() => response);
    const local = createLocalEndpointHandler({ privateKeyPem: keys.privateKeyPem, handler });
    const onRequest = vi.fn();
    const onResponse = vi.fn();
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      expect(url).toBe('http://localhost/flow');
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
      expect(new Headers(init?.headers).get('x-test')).toBe('local');
      const body = JSON.parse(String(init?.body)) as EncryptedRequestBody;
      expect(body).not.toHaveProperty('flow_token');
      const result = await local(body);
      return new Response(result.body, { status: result.status });
    });
    const client = createEndpointClient({
      url: 'http://localhost/flow', mode: 'encrypted', publicKeyPem: keys.publicKeyPem,
      fetch: fetchMock, headers: { 'x-test': 'local' }, onRequest, onResponse,
    });
    await expect(client.exchange(request)).resolves.toEqual(response);
    expect(handler).toHaveBeenCalledWith(request);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onRequest).toHaveBeenCalledWith(request, { startedAt: expect.any(Number), durationMs: 0 });
    expect(onResponse).toHaveBeenCalledWith(response, { startedAt: expect.any(Number), durationMs: expect.any(Number) });
    expect(onResponse.mock.calls[0]?.[1].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('posts plaintext unchanged using global fetch by default', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_, init) => {
      expect(JSON.parse(String(init?.body))).toEqual(request);
      return Response.json(response);
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = createEndpointClient({ url: 'http://localhost/flow', mode: 'plaintext' });
    await expect(client.exchange(request)).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    { data: { status: 'active' } },
    { screen: 'FORM', data: { error_message: 'Please enter a name' } },
    { screen: 'SUCCESS', data: { extension_message_response: { params: { receipt: '123' } } } },
    { screen: 'CUSTOM_TERMINAL', data: { extension_message_response: { params: { receipt: '123' } } } },
  ])('preserves valid response $screen', async (result) => {
    const client = createEndpointClient({
      url: 'http://localhost', mode: 'plaintext', fetch: async () => Response.json(result),
    });
    await expect(client.exchange({ ...request, action: 'ping' })).resolves.toEqual(result);
  });

  it('passes client-side error data through unchanged', async () => {
    const errorRequest: DataExchangeRequest = {
      ...request, action: 'data_exchange', screen: 'FORM',
      data: { error_key: 'invalid_input', error: 'Invalid input', detail: { retry: true } },
    };
    const handler = vi.fn(() => response);
    const local = createLocalEndpointHandler({ privateKeyPem: keys.privateKeyPem, handler });
    const client = createEndpointClient({
      url: 'http://localhost', mode: 'encrypted', publicKeyPem: keys.publicKeyPem,
      fetch: async (_, init) => {
        const result = await local(JSON.parse(String(init?.body)) as EncryptedRequestBody);
        return new Response(result.body, { status: result.status });
      },
    });
    await client.exchange(errorRequest);
    expect(handler).toHaveBeenCalledWith(errorRequest);
  });

  it.each([[421, 'decrypt'], [427, 'flow_token'], [432, 'signature'], [400, 'http'], [500, 'http']] as const)(
    'maps HTTP %i to %s without requiring an encrypted error body', async (status, kind) => {
      const client = createEndpointClient({
        url: 'http://localhost', mode: 'encrypted', publicKeyPem: keys.publicKeyPem,
        fetch: async () => new Response('', { status }),
      });
      const error = await client.exchange(request).catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(EndpointError);
      expect(error).toMatchObject({ kind, status });
    },
  );

  it('maps rejected fetches to network errors and preserves the cause', async () => {
    const cause = new TypeError('Connection refused');
    const client = createEndpointClient({
      url: 'http://localhost', mode: 'plaintext', fetch: async () => { throw cause; },
    });
    await expect(client.exchange(request)).rejects.toMatchObject({ kind: 'network', cause });
  });

  it('maps failed response streams to network errors', async () => {
    const client = createEndpointClient({
      url: 'http://localhost', mode: 'plaintext',
      fetch: async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error('Disconnected')); } })),
    });
    await expect(client.exchange(request)).rejects.toMatchObject({ kind: 'network', status: 200 });
  });

  it.each([null, [], {}, { screen: 42 }, { data: { status: 'inactive' } }, { screen: 'FORM', data: [] }, { screen: 'FORM', version: 3 }])(
    'rejects invalid response shape %j', async (result) => {
      const client = createEndpointClient({ url: 'http://localhost', mode: 'plaintext', fetch: async () => Response.json(result) });
      await expect(client.exchange(request)).rejects.toMatchObject({ kind: 'invalid_response', status: 200 });
    },
  );

  it.each(['plaintext', 'encrypted'] as const)('rejects unreadable %s responses', async (mode) => {
    const client = createEndpointClient({
      url: 'http://localhost', mode, publicKeyPem: keys.publicKeyPem,
      fetch: async () => new Response('invalid response'),
    });
    await expect(client.exchange(request)).rejects.toMatchObject({ kind: 'invalid_response' });
  });

  it.each([undefined, 25])('times out even when fetch ignores abort (timeoutMs=%s)', async (timeoutMs) => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    const onResponse = vi.fn();
    const client = createEndpointClient({
      url: 'http://localhost', mode: 'plaintext', timeoutMs, onResponse,
      fetch: async (_, init) => { signal = init?.signal; return new Promise<Response>(() => {}); },
    });
    const settled = expect(client.exchange(request)).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(timeoutMs ?? 10_000);
    await settled;
    expect(signal?.aborted).toBe(true);
    expect(onResponse).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('applies the deadline to response body reads', async () => {
    vi.useFakeTimers();
    const client = createEndpointClient({
      url: 'http://localhost', mode: 'plaintext', timeoutMs: 20,
      fetch: async () => new Response(new ReadableStream()),
    });
    const settled = expect(client.exchange(request)).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(20);
    await settled;
  });

  it('clears the deadline after a successful exchange', async () => {
    vi.useFakeTimers();
    const client = createEndpointClient({ url: 'http://localhost', mode: 'plaintext', fetch: async () => Response.json(response) });
    await client.exchange(request);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps concurrent encrypted exchanges isolated', async () => {
    const local = createLocalEndpointHandler({
      privateKeyPem: keys.privateKeyPem,
      handler: (req) => ({ screen: req.flow_token }),
    });
    const client = createEndpointClient({
      url: 'http://localhost', mode: 'encrypted', publicKeyPem: keys.publicKeyPem,
      fetch: async (_, init) => {
        const result = await local(JSON.parse(String(init?.body)) as EncryptedRequestBody);
        return new Response(result.body, { status: result.status });
      },
    });
    await expect(Promise.all(['one', 'two'].map((flow_token) => client.exchange({ ...request, flow_token })))).resolves.toEqual([
      { screen: 'one' }, { screen: 'two' },
    ]);
  });
});
