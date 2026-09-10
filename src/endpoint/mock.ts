import { EndpointError } from './types';
import type { DataEndpoint, DataExchangeRequest, DataExchangeResponse } from './types';

export type EndpointHandler = (
  request: DataExchangeRequest,
) => DataExchangeResponse | Promise<DataExchangeResponse>;

export function createMockEndpoint(handler: EndpointHandler): DataEndpoint {
  return { async exchange(request) { return handler(request); } };
}

/** Keys are `${action}:${screen ?? ''}`; `*` is the optional fallback route. */
export function createStaticMockEndpoint(routes: Record<string, DataExchangeResponse>): DataEndpoint {
  return createMockEndpoint((request) => {
    const key = `${request.action}:${request.screen ?? ''}`;
    const response = Object.hasOwn(routes, key) ? routes[key]
      : Object.hasOwn(routes, '*') ? routes['*'] : undefined;
    if (!response) {
      throw new EndpointError('invalid_response', `No mock route or fallback for ${key}`);
    }
    return structuredClone(response);
  });
}
