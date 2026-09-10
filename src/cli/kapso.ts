type KapsoDeployOptions = {
  apiKey: string;
  baseUrl?: string;
  phoneNumberId: string;
  name: string;
  flowId?: string;
  publish?: boolean;
  flowJson: unknown;
  log: (line: string) => void;
};

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

export async function deployToKapso(
  options: KapsoDeployOptions,
  deps: { fetch?: typeof globalThis.fetch } = {},
): Promise<{ exitCode: number }> {
  const baseUrl = (options.baseUrl ?? 'https://api.kapso.ai/platform/v1').replace(/\/+$/, '');
  const log = (line: string): void => options.log(line.split(options.apiKey).join('[REDACTED]'));
  async function post(path: string, body?: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
    const response = await (deps.fetch ?? globalThis.fetch)(`${baseUrl}/whatsapp/flows${path}`, {
      method: 'POST',
      headers: { 'X-API-Key': options.apiKey, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = object(await response.json().catch(() => undefined));
    const data = object(payload.data ?? payload);
    if (!response.ok) {
      const message = payload.error ?? payload.message;
      const detail = typeof message === 'string' ? message : object(message).message;
      log(`Error: ${response.status}${typeof detail === 'string' && detail ? ` ${detail}` : ''}`);
    }
    const errors = data.validation_errors ?? payload.validation_errors;
    const validationErrors = Array.isArray(errors) ? errors.filter((error): error is string => typeof error === 'string') : [];
    for (const error of validationErrors) log(`META ${error}`);
    return response.ok && validationErrors.length === 0 ? data : undefined;
  }

  try {
    const path = options.flowId ? `/${encodeURIComponent(options.flowId)}` : '';
    const result = await post(options.flowId ? `${path}/versions` : '', options.flowId ? {
      flow_json: options.flowJson, phone_number_id: options.phoneNumberId,
    } : {
      phone_number_id: options.phoneNumberId, name: options.name,
      flow_json: options.flowJson, publish: options.publish ?? false,
    });
    if (!result) return { exitCode: 1 };
    const flowId = options.flowId ?? result.id;
    if (flowId) log(`Kapso flow ID: ${flowId}`);
    if (result.meta_flow_id) log(`Meta flow ID: ${result.meta_flow_id}`);
    if (result.preview_url) log(`Preview: ${result.preview_url}`);
    if (options.flowId && options.publish && !await post(`${path}/publish`)) return { exitCode: 1 };
    return { exitCode: 0 };
  } catch (error) {
    log(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return { exitCode: 1 };
  }
}
