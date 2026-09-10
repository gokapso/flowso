import { decryptRequest, encryptResponse } from './crypto';
import { EndpointError } from './types';
import type { DataExchangeRequest, EncryptedRequestBody } from './types';
import type { EndpointHandler } from './mock';

export function createLocalEndpointHandler({ privateKeyPem, handler }: {
  privateKeyPem: string;
  handler: EndpointHandler;
}): (body: EncryptedRequestBody) => Promise<{ status: number; body: string }> {
  return async (body) => {
    let decrypted: ReturnType<typeof decryptRequest>;
    try {
      decrypted = decryptRequest({ privateKeyPem, body });
    } catch {
      return { status: 421, body: '' };
    }
    try {
      // This transport helper handles the specified exchange protocol, not application validation.
      const payload = await handler(decrypted.payload as DataExchangeRequest);
      return {
        status: 200,
        body: encryptResponse({ payload, aesKey: decrypted.aesKey, iv: decrypted.iv }),
      };
    } catch (error) {
      const status = error instanceof EndpointError
        ? error.status ?? statusForKind(error.kind) : 500;
      return { status, body: '' };
    }
  };
}

function statusForKind(kind: EndpointError['kind']): number {
  switch (kind) {
    case 'decrypt': return 421;
    case 'flow_token': return 427;
    case 'signature': return 432;
    default: return 500;
  }
}
