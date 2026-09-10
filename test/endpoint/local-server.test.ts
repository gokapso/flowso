import { describe, expect, it, vi } from 'vitest';
import { createLocalEndpointHandler, decryptResponse, encryptRequest, EndpointError, generateKeyPair } from '../../src/endpoint';
import type { DataExchangeRequest } from '../../src/endpoint';

const keys = generateKeyPair();
const request: DataExchangeRequest = { version: '3.0', action: 'ping', flow_token: 'local' };

describe('local endpoint handler', () => {
  it('decrypts the request and encrypts the handler result', async () => {
    const handler = vi.fn(async () => ({ data: { status: 'active' as const } }));
    const local = createLocalEndpointHandler({ privateKeyPem: keys.privateKeyPem, handler });
    const encrypted = encryptRequest({ publicKeyPem: keys.publicKeyPem, payload: request });
    const result = await local(encrypted.body);
    expect(result.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(request);
    expect(decryptResponse({ body: result.body, aesKey: encrypted.aesKey, iv: encrypted.iv })).toEqual({ data: { status: 'active' } });
  });

  it('returns 421 for decryption failure without calling the handler', async () => {
    const handler = vi.fn(() => ({ screen: 'FORM' }));
    const local = createLocalEndpointHandler({ privateKeyPem: keys.privateKeyPem, handler });
    const encrypted = encryptRequest({ publicKeyPem: keys.publicKeyPem, payload: request });
    await expect(local({ ...encrypted.body, encrypted_aes_key: Buffer.alloc(256).toString('base64') })).resolves.toEqual({ status: 421, body: '' });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    [new Error('Private implementation details'), 500],
    [new EndpointError('flow_token', 'Expired token'), 427],
    [new EndpointError('signature', 'Invalid signature'), 432],
    [new EndpointError('http', 'Unavailable', 503), 503],
  ] as const)('returns a bounded error response for handler failure %#', async (error, status) => {
    const local = createLocalEndpointHandler({ privateKeyPem: keys.privateKeyPem, handler: () => { throw error; } });
    const encrypted = encryptRequest({ publicKeyPem: keys.publicKeyPem, payload: request });
    await expect(local(encrypted.body)).resolves.toEqual({ status, body: '' });
  });
});
