import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, watch, type FSWatcher } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { createEndpointClient } from '../endpoint/client';
import { EndpointError, type DataExchangeRequest } from '../endpoint/types';

export type SimulatorServerOptions = {
  /** Flow file to watch. Omit to serve the playground alone (the browser starts with a new flow). */
  flowPath?: string;
  staticDir: string;
  port: number;
  host?: string;
  endpoint?: {
    url: string;
    mode: 'encrypted' | 'plaintext';
    publicKeyPem?: string;
    timeoutMs?: number;
  };
  log?: (line: string) => void;
};

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function readFlow(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isExchange(value: unknown): value is DataExchangeRequest {
  return isObject(value)
    && typeof value.version === 'string'
    && typeof value.flow_token === 'string'
    && ['INIT', 'data_exchange', 'BACK', 'ping'].includes(String(value.action))
    && (value.screen === undefined || typeof value.screen === 'string')
    && (value.data === undefined || isObject(value.data));
}

async function readRequest(request: IncomingMessage): Promise<DataExchangeRequest> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buffer.length;
    if (size > 1024 * 1024) throw new Error('Request body exceeds 1 MiB');
    chunks.push(buffer);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!isExchange(value)) throw new Error('Expected a valid data exchange request');
  return value;
}

function outside(root: string, path: string): boolean {
  const local = relative(root, path);
  return local === '..' || local.startsWith('../') || isAbsolute(local);
}

async function serveStatic(response: ServerResponse, staticDir: string, pathname: string): Promise<void> {
  try {
    const root = await realpath(staticDir);
    const candidate = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (outside(root, candidate)) throw new Error('Outside static directory');
    const path = await realpath(candidate);
    if (outside(root, path)) throw new Error('Outside static directory');
    const body = await readFile(path);
    response.writeHead(200, { 'content-type': contentTypes[extname(path)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    json(response, 404, { error: { kind: 'not_found', message: 'Not found' } });
  }
}

export function createSimulatorServer(options: SimulatorServerOptions) {
  const flowPath = options.flowPath ? resolve(options.flowPath) : null;
  const clients = new Set<ServerResponse>();
  let watcher: FSWatcher | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let transport = new AbortController();
  const endpoint = options.endpoint;
  const hooks = {
    fetch: (input: string | URL | Request, init?: RequestInit) => globalThis.fetch(input, {
      ...init,
      signal: init?.signal ? AbortSignal.any([init.signal, transport.signal]) : transport.signal,
    }),
    onRequest: (payload: DataExchangeRequest) => {
      options.log?.(`→ ${payload.action}${payload.screen ? ` ${payload.screen}` : ''}`);
    },
    onResponse: (payload: { screen?: string }, timing: { durationMs: number }) => {
      options.log?.(`← ${payload.screen ?? 'active'} (${Math.round(timing.durationMs)} ms)`);
    },
  };
  if (endpoint?.mode === 'encrypted' && !endpoint.publicKeyPem) {
    throw new Error('publicKeyPem is required in encrypted mode');
  }
  const client = endpoint ? createEndpointClient(endpoint.mode === 'encrypted'
    ? { ...endpoint, mode: 'encrypted', publicKeyPem: endpoint.publicKeyPem!, ...hooks }
    : { ...endpoint, mode: 'plaintext', ...hooks }) : undefined;

  function broadcastFlow(): void {
    if (!flowPath) return;
    let event: string;
    try {
      event = `event: flow\ndata: ${JSON.stringify({ flow: readFlow(flowPath) })}\n\n`;
    } catch (error) {
      event = `event: parse_error\ndata: ${JSON.stringify({ message: message(error) })}\n\n`;
    }
    for (const response of clients) response.write(event);
  }

  async function exchange(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!client) {
      json(response, 400, { error: { kind: 'not_configured', message: 'No endpoint is configured' } });
      return;
    }
    let payload: DataExchangeRequest;
    try {
      payload = await readRequest(request);
    } catch (error) {
      json(response, 400, { error: { kind: 'invalid_request', message: message(error) } });
      return;
    }
    try {
      json(response, 200, await client.exchange(payload));
    } catch (error) {
      if (!(error instanceof EndpointError)) throw error;
      json(response, 502, { error: { kind: error.kind, message: error.message, status: error.status ?? null } });
    }
  }

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    } catch {
      json(response, 400, { error: { kind: 'invalid_request', message: 'Invalid URL' } });
      return;
    }
    if (request.method === 'GET' && pathname === '/__sim/flow') {
      const endpointInfo = endpoint ? { configured: true, mode: endpoint.mode, url: endpoint.url } : { configured: false };
      if (!flowPath) {
        json(response, 200, { fileName: null, flow: null, endpoint: endpointInfo });
        return;
      }
      json(response, 200, { fileName: basename(flowPath), flow: readFlow(flowPath), endpoint: endpointInfo });
    } else if (request.method === 'GET' && pathname === '/__sim/events') {
      response.writeHead(200, {
        'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive',
      });
      response.flushHeaders();
      clients.add(response);
      response.on('close', () => clients.delete(response));
    } else if (request.method === 'POST' && pathname === '/__sim/exchange') {
      await exchange(request, response);
    } else if (request.method === 'GET' && !pathname.startsWith('/__sim/')) {
      await serveStatic(response, options.staticDir, pathname);
    } else {
      json(response, 404, { error: { kind: 'not_found', message: 'Not found' } });
    }
  }

  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      if (!response.destroyed && !response.headersSent) {
        json(response, 500, { error: { kind: 'internal', message: message(error) } });
      }
    });
  });

  async function stop(): Promise<void> {
    transport.abort();
    watcher?.close();
    watcher = undefined;
    clearTimeout(debounce);
    clearInterval(heartbeat);
    for (const response of clients) response.end();
    clients.clear();
    if (!server.listening) return;
    await new Promise<void>((done, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else done();
      });
      server.closeAllConnections();
    });
  }

  async function start(): Promise<{ url: string }> {
    if (server.listening) throw new Error('Simulator server is already started');
    transport = new AbortController();
    try {
      if (flowPath) {
        watcher = watch(dirname(flowPath), (_event, fileName) => {
          if (fileName !== null && fileName !== basename(flowPath)) return;
          clearTimeout(debounce);
          debounce = setTimeout(broadcastFlow, 100);
        });
        watcher.on('error', (error) => options.log?.(`Flow watcher error: ${error.message}`));
      }
      await new Promise<void>((done, reject) => {
        server.once('error', reject);
        server.listen(options.port, options.host ?? '127.0.0.1', () => {
          server.off('error', reject);
          done();
        });
      });
      heartbeat = setInterval(() => {
        for (const response of clients) response.write(': ping\n\n');
      }, 15_000);
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No TCP address was bound');
      const host = options.host ?? '127.0.0.1';
      return { url: `http://${host.includes(':') ? `[${host}]` : host}:${address.port}` };
    } catch (error) {
      await stop();
      throw error;
    }
  }

  return { start, stop, broadcastFlow };
}
