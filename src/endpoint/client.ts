import { decryptResponse, encryptRequest } from './crypto';
import { EndpointError } from './types';
import type { DataEndpoint, DataExchangeRequest, DataExchangeResponse } from './types';

export type EndpointTiming = { startedAt: number; durationMs: number };

export type EndpointClientOptions = {
  url: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
  headers?: HeadersInit;
  /** Called before transport; durationMs is zero and startedAt is Unix time in milliseconds. */
  onRequest?: (payload: DataExchangeRequest, timing: EndpointTiming) => void;
  /** Called after a successful, validated response. Hook errors propagate to the caller. */
  onResponse?: (payload: DataExchangeResponse, timing: EndpointTiming) => void;
} & (
  | { mode: 'encrypted'; publicKeyPem: string }
  | { mode: 'plaintext'; publicKeyPem?: string }
);

export function createEndpointClient(options: EndpointClientOptions): DataEndpoint {
  const fetchRequest = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    throw new RangeError('timeoutMs must be a positive, finite timer duration');
  }
  if (options.mode === 'encrypted' && !options.publicKeyPem) {
    throw new TypeError('publicKeyPem is required in encrypted mode');
  }

  return {
    async exchange(request) {
      const startedAt = Date.now();
      const start = performance.now();
      const encrypted = options.mode === 'encrypted'
        ? encryptRequest({ publicKeyPem: options.publicKeyPem, payload: request })
        : undefined;
      const body = JSON.stringify(encrypted?.body ?? request);
      const headers = new Headers(options.headers);
      if (!headers.has('content-type')) headers.set('content-type', 'application/json');
      options.onRequest?.(request, { startedAt, durationMs: 0 });

      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new EndpointError('timeout', `Endpoint exceeded ${timeoutMs}ms`));
          controller.abort();
        }, timeoutMs);
      });

      async function send(): Promise<DataExchangeResponse> {
        let response: Response;
        try {
          response = await fetchRequest(options.url, {
            method: 'POST', headers, body, signal: controller.signal,
          });
        } catch (cause) {
          throw new EndpointError('network', 'Could not reach endpoint', undefined, { cause });
        }
        if (!response.ok) throw httpError(response.status);

        let responseBody: string;
        try {
          responseBody = await response.text();
        } catch (cause) {
          throw new EndpointError('network', 'Could not read endpoint response', response.status, { cause });
        }
        let payload: unknown;
        try {
          payload = encrypted
            ? decryptResponse({ body: responseBody, aesKey: encrypted.aesKey, iv: encrypted.iv })
            : JSON.parse(responseBody) as unknown;
        } catch (cause) {
          throw new EndpointError('invalid_response', 'Endpoint returned unreadable data', response.status, { cause });
        }
        if (!isResponse(payload)) {
          throw new EndpointError('invalid_response', 'Expected a screen or active ping response', response.status);
        }
        return payload;
      }

      let payload: DataExchangeResponse;
      try {
        // Race independently of AbortSignal so injected transports cannot bypass the deadline.
        payload = await Promise.race([send(), timeout]);
      } finally {
        clearTimeout(timer);
      }
      options.onResponse?.(payload, { startedAt, durationMs: performance.now() - start });
      return payload;
    },
  };
}

function httpError(status: number): EndpointError {
  switch (status) {
    case 421: return new EndpointError('decrypt', 'Endpoint could not decrypt the request', status);
    case 427: return new EndpointError('flow_token', 'Endpoint rejected the flow token', status);
    case 432: return new EndpointError('signature', 'Endpoint rejected the signature', status);
    default: return new EndpointError('http', `Endpoint returned HTTP ${status}`, status);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isResponse(value: unknown): value is DataExchangeResponse {
  if (!isObject(value)) return false;
  if (value.version !== undefined && typeof value.version !== 'string') return false;
  if (value.data !== undefined && !isObject(value.data)) return false;
  return typeof value.screen === 'string'
    || (value.screen === undefined && isObject(value.data) && value.data.status === 'active');
}
