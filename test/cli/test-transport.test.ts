import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createLocalEndpointHandler, generateKeyPair, type DataExchangeRequest } from '../../src/endpoint';
import { runCli } from '../../src/cli/commands';

const requests: DataExchangeRequest[] = [];
let directory: string;
let server: Server;
let url: string;
const keys = generateKeyPair();
const flow = { version: '7.3', data_api_version: '3.0', routing_model: { START: [] }, screens: [{
  id: 'START', terminal: true, title: 'Dynamic', data: { title: { type: 'string', __example__: 'example' } },
  layout: { type: 'SingleColumnLayout', children: [
    { type: 'TextBody', text: '${data.title}' },
    { type: 'TextInput', name: 'name', label: 'Name', required: true },
    { type: 'Footer', label: 'Done', 'on-click-action': { name: 'data_exchange', payload: { name: '${form.name}' } } },
  ] },
}] };

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'flowso-transport-'));
  await writeFile(join(directory, 'flow.json'), JSON.stringify(flow));
  await writeFile(join(directory, 'tests.json'), JSON.stringify({ tests: [{ name: 'encrypted journey', steps: [
    { expect: { screen: 'START', data: { title: 'From endpoint' } } },
    { fill: 'name', value: 'Ada' }, { submit: true, expect: { status: 'completed', completion: { booked_for: 'Ada' } } },
  ] }] }));
  await writeFile(join(directory, 'public.pem'), keys.publicKeyPem);
  const encrypted = createLocalEndpointHandler({ privateKeyPem: keys.privateKeyPem, handler: request => {
    requests.push(request);
    return request.action === 'INIT' ? { version: '3.0', screen: 'START', data: { title: 'From endpoint' } }
      : { version: '3.0', screen: 'SUCCESS', data: { extension_message_response: { params: { flow_token: request.flow_token, booked_for: request.data?.name } } } };
  } });
  server = createServer(async (req, res) => {
    if (req.url === '/timeout') return;
    if (req.url === '/error') { res.writeHead(503).end(); return; }
    if (req.url === '/unknown') { res.end(JSON.stringify({ version: '3.0', screen: 'MISSING', data: {} })); return; }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const result = await encrypted(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    res.writeHead(result.status).end(result.body);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No TCP address');
  url = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  if (server) { const closed = once(server, 'close'); server.close(); server.closeAllConnections(); await closed; }
  await rm(directory, { recursive: true, force: true });
});

it('executes INIT, resolved payloads and SUCCESS completion over encrypted HTTP', async () => {
  const log = vi.fn();
  const result = await runCli(['test', join(directory, 'flow.json'), '--scenario', join(directory, 'tests.json'), '--endpoint', url,
    '--public-key', join(directory, 'public.pem'), '--json', '--trace'], log);
  const report = JSON.parse(log.mock.calls[0]![0]);
  expect(report.tests[0].error).toBeUndefined();
  expect(result.exitCode).toBe(0);
  expect(requests.map(request => request.action)).toEqual(['INIT', 'data_exchange']);
  expect(requests[1]?.data).toEqual({ name: 'Ada' });
  expect(log.mock.calls[0]![0]).not.toContain('BEGIN PUBLIC KEY');
});

it.each([['/timeout', 'exceeded'], ['/error', '503'], ['/unknown', 'does not exist']])('reports %s as a failing test with an actionable error', async (path, message) => {
  const log = vi.fn();
  const result = await runCli(['test', join(directory, 'flow.json'), '--scenario', join(directory, 'tests.json'), '--endpoint', `${url}${path}`,
    '--plaintext', '--timeout', '100', '--json'], log);
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(log.mock.calls[0]![0]).tests[0].error).toContain(message);
});
