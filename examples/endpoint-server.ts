/**
 * Example data endpoint for fixtures/appointment.flow.json.
 *
 *   bun examples/endpoint-server.ts                  # plaintext on http://127.0.0.1:4312/flow
 *   bun examples/endpoint-server.ts --encrypted      # prints a public key; pass it to the CLI with --public-key
 *
 * Then: whatsapp-flows-sim serve fixtures/appointment.flow.json --endpoint http://127.0.0.1:4312/flow --plaintext
 */
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { createLocalEndpointHandler, generateKeyPair } from '../src/endpoint/index';
import type { DataExchangeRequest, DataExchangeResponse } from '../src/endpoint/types';

const encrypted = process.argv.includes('--encrypted');
const port = Number(process.env.PORT ?? 4312);

function handle(request: DataExchangeRequest): DataExchangeResponse {
  if (request.action === 'ping') return { data: { status: 'active' } };
  if (request.action === 'INIT') {
    return { version: '3.0', screen: 'WELCOME', data: { business_name: 'Kapso Dental (from endpoint)', show_promo: true } };
  }
  if (request.action === 'BACK') return { version: '3.0', screen: request.screen ?? 'WELCOME', data: {} };
  if (request.screen === 'DETAILS') {
    const slot = request.data?.slot;
    if (slot === 's2') {
      return { version: '3.0', screen: 'DETAILS', data: { error_message: 'That slot was just taken', slots: [{ id: 's1', title: 'Mon 10:00' }] } };
    }

    return { version: '3.0', screen: 'CONFIRM', data: { confirmation_code: `APT-${String(slot).toUpperCase()}` } };
  }

  return { version: '3.0', screen: 'SUCCESS', data: { extension_message_response: { params: { flow_token: request.flow_token, done: true } } } };
}

let keys: { publicKeyPem: string; privateKeyPem: string } | null = null;
if (encrypted) {
  keys = generateKeyPair();
  writeFileSync('examples/public.pem', keys.publicKeyPem);
  console.log('Public key written to examples/public.pem');
}
const encryptedHandler = keys ? createLocalEndpointHandler({ privateKeyPem: keys.privateKeyPem, handler: handle }) : null;

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS).end();

    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(404, CORS).end();

    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  if (encryptedHandler) {
    const result = await encryptedHandler(body as Parameters<typeof encryptedHandler>[0]);
    res.writeHead(result.status, { ...CORS, 'Content-Type': 'text/plain' }).end(result.body);
    console.log(`[encrypted] ${result.status}`);

    return;
  }
  const request = body as unknown as DataExchangeRequest;
  const response = handle(request);
  console.log(`${request.action} ${request.screen ?? ''} → ${response.screen ?? 'ping'}`);
  res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' }).end(JSON.stringify(response));
}).listen(port, '127.0.0.1', () => {
  console.log(`Example endpoint (${encrypted ? 'encrypted' : 'plaintext'}) on http://127.0.0.1:${port}/flow`);
});
