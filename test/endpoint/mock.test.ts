import { describe, expect, it } from 'vitest';
import { createMockEndpoint, createStaticMockEndpoint } from '../../src/endpoint';
import type { DataExchangeRequest } from '../../src/endpoint';

const request: DataExchangeRequest = { version: '3.0', action: 'INIT', flow_token: 'test-token' };

describe('mock endpoints', () => {
  it('supports synchronous handlers receiving the full request', async () => {
    const endpoint = createMockEndpoint((req) => ({ screen: 'FORM', data: { token: req.flow_token } }));
    await expect(endpoint.exchange(request)).resolves.toEqual({ screen: 'FORM', data: { token: 'test-token' } });
  });

  it('supports asynchronous handlers and propagates failures as rejected promises', async () => {
    const endpoint = createMockEndpoint(async () => ({ data: { status: 'active' } }));
    await expect(endpoint.exchange({ ...request, action: 'ping' })).resolves.toEqual({ data: { status: 'active' } });
    const failure = new Error('Handler failed');
    await expect(createMockEndpoint(() => { throw failure; }).exchange(request)).rejects.toBe(failure);
    await expect(createMockEndpoint(async () => { throw failure; }).exchange(request)).rejects.toBe(failure);
  });

  it('routes by action and screen, with a wildcard fallback', async () => {
    const endpoint = createStaticMockEndpoint({
      'INIT:': { screen: 'FORM' },
      'data_exchange:FORM': { screen: 'SUCCESS' },
      'BACK:FORM': { screen: 'WELCOME' },
      '*': { screen: 'FALLBACK' },
    });
    await expect(endpoint.exchange(request)).resolves.toEqual({ screen: 'FORM' });
    await expect(endpoint.exchange({ ...request, action: 'data_exchange', screen: 'FORM' })).resolves.toEqual({ screen: 'SUCCESS' });
    await expect(endpoint.exchange({ ...request, action: 'BACK', screen: 'FORM' })).resolves.toEqual({ screen: 'WELCOME' });
    await expect(endpoint.exchange({ ...request, action: 'BACK', screen: 'OTHER' })).resolves.toEqual({ screen: 'FALLBACK' });
  });

  it('reports missing routes when no fallback is configured', async () => {
    await expect(createStaticMockEndpoint({}).exchange(request)).rejects.toMatchObject({ kind: 'invalid_response' });
  });

  it('isolates static responses from mutations by earlier callers', async () => {
    const endpoint = createStaticMockEndpoint({ '*': { screen: 'FORM', data: { name: 'original' } } });
    const result = await endpoint.exchange(request);
    result.data!.name = 'changed';
    await expect(endpoint.exchange(request)).resolves.toEqual({ screen: 'FORM', data: { name: 'original' } });
  });
});
