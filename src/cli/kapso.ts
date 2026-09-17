import type { KapsoEndpoint } from './kapso-endpoint';

type KapsoDeployOptions = {
  apiKey: string;
  baseUrl?: string;
  phoneNumberId: string;
  name: string;
  flowId?: string;
  publish?: boolean;
  flowJson: unknown;
  endpoint?: KapsoEndpoint;
  log: (line: string) => void;
};

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('Kapso returned an invalid resource ID');
  return value;
}

export async function deployToKapso(
  options: KapsoDeployOptions,
  deps: { fetch?: typeof globalThis.fetch } = {},
): Promise<{ exitCode: number }> {
  const baseUrl = (options.baseUrl ?? 'https://api.kapso.ai/platform/v1').replace(/\/+$/, '');
  const log = (line: string): void => options.log(line.split(options.apiKey).join('[REDACTED]'));
  const endpoint = options.endpoint;
  let flowId = options.flowId;
  let stage = 'upload Flow JSON';
  let hasStartedWrites = false;
  async function request(path: string, body?: Record<string, unknown>, method = 'POST'): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await (deps.fetch ?? globalThis.fetch)(`${baseUrl}${path}`, {
        method,
        headers: { 'X-API-Key': options.apiKey, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      if (endpoint) throw new Error('Network request failed');
      throw error;
    }
    const payload = object(await response.json().catch(() => undefined));
    const data = object(payload.data ?? payload);
    const errors = data.validation_errors ?? payload.validation_errors;
    const validationErrors = Array.isArray(errors) ? errors : [];
    // Dynamic requests contain function source and secret values. Do not echo server errors.
    for (const error of validationErrors) {
      if (!endpoint) log(`META ${typeof error === 'string' ? error : JSON.stringify(error)}`);
    }
    if (!response.ok) {
      const message = payload.error ?? payload.message;
      const detail = typeof message === 'string' ? message : object(message).message;
      throw new Error(`${response.status}${!endpoint && typeof detail === 'string' && detail ? ` ${detail}` : ''}`);
    }
    if (validationErrors.length) throw new Error(`Meta returned ${validationErrors.length} validation error(s)`);
    if (endpoint && Object.keys(data).length === 0) throw new Error('Kapso returned an empty or invalid response');
    return data;
  }

  try {
    let path = `/whatsapp/flows${flowId ? `/${encodeURIComponent(flowId)}` : ''}`;
    if (endpoint && flowId) {
      stage = 'check draft';
      const existing = await request(path, undefined, 'GET');
      if (existing.status !== 'draft') throw new Error('Endpoint deployment requires an existing draft; published flows are not changed');
      if (existing.data_endpoint_function_id) {
        log(`Function ID: ${id(existing.data_endpoint_function_id)}. Updating code or secrets affects every Flow using this function; a draft does not imply isolation.`);
        stage = 'check existing function secrets';
        const existingSecrets = await request(`/functions/${encodeURIComponent(id(existing.data_endpoint_function_id))}/secrets`, undefined, 'GET');
        if (!Array.isArray(existingSecrets.secrets)) throw new Error('Kapso did not return the function secret names');
        const names = new Set(endpoint.secrets.map(secret => secret.name));
        // The current Kapso worker upload does not preserve secret bindings. Restore all of them.
        const missing = existingSecrets.secrets.map(secret => id(object(secret).name)).filter(name => !names.has(name));
        if (missing.length) throw new Error(`Redeployment requires --secret-env for every existing secret: ${missing.join(', ')}`);
      }
    }
    stage = 'upload Flow JSON';
    hasStartedWrites = true;
    const result = await request(flowId ? `${path}/versions` : path, flowId ? {
      flow_json: options.flowJson, phone_number_id: options.phoneNumberId,
    } : {
      phone_number_id: options.phoneNumberId, name: options.name,
      flow_json: options.flowJson, publish: options.publish ?? false,
    });
    flowId ??= typeof result.id === 'string' ? result.id : undefined;
    if (flowId) log(`Kapso flow ID: ${flowId}`);
    if (result.meta_flow_id) log(`Meta flow ID: ${result.meta_flow_id}`);
    if (result.preview_url && !endpoint) log(`Preview: ${result.preview_url}`);
    if (endpoint) {
      path = `/whatsapp/flows/${encodeURIComponent(id(flowId))}`;
      if (endpoint.setupEncryption) {
        stage = 'set up encryption';
        const encryption = await request(`${path}/setup_encryption`, { phone_number_id: options.phoneNumberId });
        if (encryption.flows_encryption_configured !== true) throw new Error('Kapso did not confirm encryption setup');
        log('Encryption configured.');
      }
      stage = 'upload data endpoint';
      const fn = await request(`${path}/data_endpoint`, { code: endpoint.code });
      const functionId = id(fn.function_id);
      log(`Function ID: ${functionId}`);
      stage = 'deploy data endpoint';
      const deployed = await request(`${path}/data_endpoint/deploy`);
      if (deployed.status !== 'deployed') throw new Error('Kapso did not confirm function deployment');
      log('Data endpoint deployed.');
      for (const secret of endpoint.secrets) {
        stage = `store secret ${secret.name}`;
        await request(`/functions/${encodeURIComponent(functionId)}/secrets`, { secret });
        log(`Secret configured: ${secret.name}`);
      }
      if (endpoint.registerEndpoint) {
        stage = 'register data endpoint';
        const registered = await request(`${path}/data_endpoint/register`);
        if (registered.flow_has_encryption !== true) throw new Error('Kapso did not confirm endpoint encryption');
        log('Data endpoint registered.');
      }
      stage = 'compile final Flow JSON';
      const compiled = await request(`${path}/versions`, {
        flow_json: options.flowJson, phone_number_id: options.phoneNumberId,
      });
      // Kapso persists null for an empty Meta error list; absence is not confirmation.
      if (!Object.hasOwn(compiled, 'validation_errors') ||
        (compiled.validation_errors !== null && !Array.isArray(compiled.validation_errors))) {
        throw new Error('Kapso did not confirm final Meta validation');
      }
      if (compiled.status !== 'draft') throw new Error('Kapso did not confirm the compiled version is a draft');
      stage = 'verify draft';
      const current = await request(path, undefined, 'GET');
      if (current.status !== 'draft') throw new Error('Kapso did not return draft status');
      if (current.has_data_endpoint !== true) throw new Error('Kapso did not confirm the registered endpoint');
      if (current.flows_encryption_configured !== true) throw new Error('Kapso did not confirm encryption is configured');
      // Creating the final version fetches a fresh preview from Meta before returning.
      if (typeof current.preview_url !== 'string' || !URL.canParse(current.preview_url) || new URL(current.preview_url).protocol !== 'https:') {
        throw new Error('Kapso did not return a fresh preview URL after compilation');
      }
      log(`Preview: ${current.preview_url}`);
      log('Draft deployed. Nothing published or sent. Test the official Meta preview before publishing.');
    } else if (options.flowId && options.publish) {
      await request(`${path}/publish`);
    }
    return { exitCode: 0 };
  } catch (error) {
    log(`Error: ${endpoint ? `${stage}: ` : ''}${error instanceof Error ? error.message : String(error)}`);
    if (endpoint && flowId && hasStartedWrites) log(`Deployment may be partial. Retry with --flow-id ${flowId} and the same endpoint options. Completed steps were not rolled back.`);
    return { exitCode: 1 };
  }
}
