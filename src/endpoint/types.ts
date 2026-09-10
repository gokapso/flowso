export type DataExchangeRequest = {
  version: string;
  action: 'INIT' | 'data_exchange' | 'BACK' | 'ping';
  screen?: string;
  data?: Record<string, unknown>;
  flow_token: string;
};

export type DataExchangeResponse = {
  version?: string;
  screen: string;
  data?: Record<string, unknown>;
} | {
  version?: string;
  screen?: never;
  data: Record<string, unknown> & { status: 'active' };
};

export type EncryptedRequestBody = {
  encrypted_flow_data: string;
  encrypted_aes_key: string;
  initial_vector: string;
};

export interface DataEndpoint {
  exchange(request: DataExchangeRequest): Promise<DataExchangeResponse>;
}

export type EndpointErrorKind =
  | 'decrypt'
  | 'flow_token'
  | 'signature'
  | 'http'
  | 'timeout'
  | 'network'
  | 'invalid_response';

export class EndpointError extends Error {
  constructor(
    public readonly kind: EndpointErrorKind,
    message: string,
    public readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'EndpointError';
  }
}
