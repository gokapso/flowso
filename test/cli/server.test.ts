import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSimulatorServer, type SimulatorServerOptions } from '../../src/cli/server';

const requestBody = { version: '3.0', action: 'data_exchange', screen: 'DETAILS', data: { name: 'Ada' }, flow_token: 'token' };
let directory: string;
let flowPath: string;
let staticDir: string;
const cleanup: Array<() => Promise<void>> = [];

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'flow-cli-'));
  flowPath = join(directory, 'flow.json');
  staticDir = join(directory, 'static');
  await mkdir(staticDir);
  await writeFile(flowPath, JSON.stringify({ version: '7.3', screens: [] }));
});

afterEach(async () => {
  vi.useRealTimers();
  for (const close of cleanup.splice(0).reverse()) await close();
  await rm(directory, { recursive: true, force: true });
});

async function start(endpoint?: SimulatorServerOptions['endpoint']) {
  const log = vi.fn();
  const server = createSimulatorServer({ flowPath, staticDir, port: 0, endpoint, log });
  cleanup.push(server.stop);
  const { url } = await server.start();
  return { url, server, log };
}

async function fakeEndpoint(handler: (request: IncomingMessage, response: ServerResponse) => void): Promise<string> {
  const server = createServer(handler);
  cleanup.push(() => new Promise<void>((done, reject) => {
    if (!server.listening) { done(); return; }
    server.close((error) => error ? reject(error) : done());
    server.closeAllConnections();
  }));
  await new Promise<void>((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); done(); });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing address');
  return `http://127.0.0.1:${address.port}`;
}

async function post(url: string, body = JSON.stringify(requestBody)): Promise<Response> {
  return fetch(`${url}/__sim/exchange`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
}

async function events(url: string) {
  const controller = new AbortController();
  const response = await fetch(`${url}/__sim/events`, { signal: controller.signal });
  expect(response.headers.get('content-type')).toBe('text/event-stream');
  const reader = response.body!.getReader();
  cleanup.push(async () => { controller.abort(); await reader.cancel().catch(() => undefined); });
  let pending = '';
  return async function next(): Promise<string> {
    const deadline = setTimeout(() => controller.abort(), 2000);
    try {
      while (!pending.includes('\n\n')) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error('SSE stream closed');
        pending += new TextDecoder().decode(chunk.value);
      }
      const end = pending.indexOf('\n\n') + 2;
      const frame = pending.slice(0, end);
      pending = pending.slice(end);
      return frame;
    } finally {
      clearTimeout(deadline);
    }
  };
}

describe('simulator HTTP server', () => {
  it('reads the flow and endpoint metadata on the bound ephemeral port', async () => {
    const { url } = await start();
    const response = await fetch(`${url}/__sim/flow`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ fileName: 'flow.json', flow: { version: '7.3', screens: [] }, endpoint: { configured: false } });
  });

  it('watches writes and editor replacements, reports parse failures, and recovers', async () => {
    const { url } = await start();
    const next = await events(url);
    await writeFile(flowPath, '{"screens":[{"id":"NEW"}]}');
    expect(await next()).toBe('event: flow\ndata: {"flow":{"screens":[{"id":"NEW"}]}}\n\n');
    await writeFile(flowPath, '{broken');
    const error = await next();
    expect(error).toMatch(/^event: parse_error\ndata: /);
    expect(JSON.parse(error.split('data: ')[1]!).message).toEqual(expect.any(String));
    const replacement = join(directory, 'replacement.json');
    await writeFile(replacement, '{"screens":[]}');
    await rename(replacement, flowPath);
    expect(await next()).toBe('event: flow\ndata: {"flow":{"screens":[]}}\n\n');
  });

  it('broadcasts on demand and sends a heartbeat every 15 seconds', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { url, server } = await start();
    const next = await events(url);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await next()).toBe(': ping\n\n');
    server.broadcastFlow();
    expect(await next()).toBe('event: flow\ndata: {"flow":{"version":"7.3","screens":[]}}\n\n');
    await server.stop();
  });

  it('forwards plaintext exchanges and logs the request and timed response', async () => {
    let received: unknown;
    const endpointUrl = await fakeEndpoint((request, response) => {
      let body = '';
      request.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      request.on('end', () => {
        received = JSON.parse(body);
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ version: '3.0', screen: 'CONFIRM', data: { ok: true } }));
      });
    });
    const { url, log } = await start({ url: endpointUrl, mode: 'plaintext' });
    const response = await post(url);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ version: '3.0', screen: 'CONFIRM', data: { ok: true } });
    expect(received).toEqual(requestBody);
    expect(log.mock.calls).toEqual([['→ data_exchange DETAILS'], [expect.stringMatching(/^← CONFIRM \(\d+ ms\)$/)]]);
    const flow = await fetch(`${url}/__sim/flow`).then((result) => result.json());
    expect(flow.endpoint).toEqual({ configured: true, mode: 'plaintext', url: endpointUrl });
  });

  it('returns 400 if no endpoint is configured', async () => {
    const { url } = await start();
    const response = await post(url);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { kind: 'not_configured', message: 'No endpoint is configured' } });
  });

  it.each([
    [421, 'decrypt', 'Endpoint could not decrypt the request'],
    [427, 'flow_token', 'Endpoint rejected the flow token'],
    [432, 'signature', 'Endpoint rejected the signature'],
    [503, 'http', 'Endpoint returned HTTP 503'],
  ])('maps endpoint HTTP %s errors to 502', async (status, kind, message) => {
    const endpointUrl = await fakeEndpoint((_request, response) => { response.writeHead(status); response.end(); });
    const { url } = await start({ url: endpointUrl, mode: 'plaintext' });
    const response = await post(url);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: { kind, message, status } });
  });

  it('maps invalid endpoint responses and timeouts to 502', async () => {
    const endpointUrl = await fakeEndpoint((_request, response) => response.end('not json'));
    const first = await start({ url: endpointUrl, mode: 'plaintext' });
    const response = await post(first.url);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: { kind: 'invalid_response', message: 'Endpoint returned unreadable data', status: 200 } });
    const hangingUrl = await fakeEndpoint(() => undefined);
    const second = await start({ url: hangingUrl, mode: 'plaintext', timeoutMs: 20 });
    const timedOut = await post(second.url);
    expect(timedOut.status).toBe(502);
    expect(await timedOut.json()).toEqual({ error: { kind: 'timeout', message: 'Endpoint exceeded 20ms', status: null } });
  });

  it('rejects invalid requests before contacting the endpoint', async () => {
    const handler = vi.fn((_request: IncomingMessage, response: ServerResponse) => response.end('{}'));
    const endpointUrl = await fakeEndpoint(handler);
    const { url } = await start({ url: endpointUrl, mode: 'plaintext' });
    for (const body of ['{', '{}', 'null']) {
      const response = await post(url, body);
      expect(response.status).toBe(400);
      expect((await response.json()).error.kind).toBe('invalid_request');
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it('serves index and assets with content types and rejects missing paths and traversal', async () => {
    const assets = { 'index.html': 'text/html', 'app.js': 'text/javascript', 'app.css': 'text/css', 'flow.json': 'application/json', 'icon.png': 'image/png', 'icon.svg': 'image/svg+xml', 'font.woff2': 'font/woff2' };
    for (const file of Object.keys(assets)) await writeFile(join(staticDir, file), `content:${file}`);
    await symlink(flowPath, join(staticDir, 'outside.json'));
    const { url } = await start();
    for (const [file, type] of Object.entries(assets)) {
      const response = await fetch(`${url}/${file === 'index.html' ? '' : file}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain(type);
      expect(await response.text()).toBe(`content:${file}`);
    }
    for (const path of ['/missing', '/outside.json', '/__sim/unknown', '/..%2fflow.json']) {
      expect((await fetch(`${url}${path}`)).status).toBe(404);
    }
  });

  it('keeps API routes available without a playground build and closes active SSE clients', async () => {
    await rm(staticDir, { recursive: true });
    const { url, server } = await start();
    expect((await fetch(`${url}/__sim/flow`)).status).toBe(200);
    expect((await fetch(`${url}/`)).status).toBe(404);
    await events(url);
    await server.stop();
    await expect(fetch(`${url}/__sim/flow`)).rejects.toThrow();
  });
});


describe('preview journal', () => {
  async function preview(endpointUrl: string, timeoutMs = 1000) {
    const logFile = join(directory, 'artifacts/preview.jsonl');
    const server = createSimulatorServer({ flowPath, staticDir, port: 0, logFile, endpoint: { url: endpointUrl, mode: 'plaintext', timeoutMs } });
    cleanup.push(server.stop);
    const { url } = await server.start();
    return { url, logFile, records: async () => (await readFile(logFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line)) };
  }

  it('correlates concurrent exchanges, records payloads and runtime validation, and redacts secrets', async () => {
    const endpointUrl = await fakeEndpoint((request, response) => {
      let body = '';
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        const input = JSON.parse(body);
        setTimeout(() => response.end(JSON.stringify({ screen: 'DONE', data: { name: input.data.name, api_key: 'response-secret' } })), input.data.name === 'Ada' ? 30 : 0);
      });
    });
    const { url, records } = await preview(endpointUrl + '?token=url-secret');
    await Promise.all(['Ada', 'Grace'].map(name => fetch(`${url}/__sim/exchange`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-flowso-session': name }, body: JSON.stringify({ ...requestBody, data: { name, password: 'request-secret' } }) })));
    const runtime = await fetch(`${url}/__sim/trace`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 'Ada', event: { type: 'validation_failed', screenId: 'DETAILS', errors: { email: 'Invalid email' } } }) });
    expect(runtime.status).toBe(200);
    const events = await records();
    for (const request of events.filter(event => event.kind === 'exchange.request')) {
      const response = events.find(event => event.kind === 'exchange.response' && event.requestId === request.requestId);
      expect(response).toMatchObject({ sessionId: request.sessionId, httpStatus: 200, response: { data: { name: request.request.data.name, api_key: '[redacted]' } } });
      expect(response.durationMs).toBeGreaterThanOrEqual(0);
      expect(request.request.flow_token).toBe('[redacted]');
    }
    expect(JSON.stringify(events)).not.toMatch(/response-secret|request-secret|url-secret/);
    expect(events.at(-1)).toMatchObject({ kind: 'runtime', event: { type: 'validation_failed', errors: { email: 'Invalid email' } } });
    expect((await fetch(`${url}/__sim/flow`).then(response => response.json())).tracing).toBe(true);
  });

  it.each([503, 200])('records upstream HTTP %s failures including unreadable responses', async status => {
    const endpointUrl = await fakeEndpoint((_request, response) => { response.writeHead(status); response.end('invalid'); });
    const { url, records } = await preview(endpointUrl);
    expect((await post(url)).status).toBe(502);
    expect((await records()).at(-1)).toMatchObject({ kind: 'exchange.error', httpStatus: status, error: { kind: status === 503 ? 'http' : 'invalid_response' } });
  });

  it('records timeouts and rejects cross-origin runtime events', async () => {
    const endpointUrl = await fakeEndpoint(() => undefined);
    const { url, records } = await preview(endpointUrl, 20);
    expect((await post(url)).status).toBe(502);
    expect((await records()).at(-1)).toMatchObject({ kind: 'exchange.error', error: { kind: 'timeout' } });
    expect((await fetch(`${url}/__sim/trace`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://other.example' }, body: '{}' })).status).toBe(403);
  });
});
