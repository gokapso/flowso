import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { WhatsAppClient, type CreateFlowResponse, type FlowValidationError } from '@kapso/whatsapp-cloud-api';
import { formatIssue, validateFlowJson } from '../validator/index';
import { deployToKapso } from './kapso';
import { prepareKapsoEndpoint } from './kapso-endpoint';

type Deploy = WhatsAppClient['flows']['deploy'];
type DeployClient = { flows: { deploy: Deploy } };

export type DeployOptions = {
  flowPath: string;
  to?: 'meta' | 'kapso';
  kapsoKey?: string;
  kapsoUrl?: string;
  phoneNumberId?: string;
  token?: string;
  wabaId?: string;
  name?: string;
  flowId?: string;
  publish?: boolean;
  endpointUri?: string;
  dataEndpoint?: string;
  secretEnv?: string[];
  setupEncryption?: boolean;
  registerEndpoint?: boolean;
  categories?: string[];
  preview?: boolean;
  skipLocalValidation?: boolean;
  log?: (line: string) => void;
};

function createWireClient(token: string, uploaded: (flowId: string) => void): DeployClient {
  const client = new WhatsAppClient({ accessToken: token });
  return { flows: { async deploy(flowJson, options) {
    // SDK 0.3.0 deploy/create/updateAsset({ json }) enforce camelCase, rejecting
    // canonical wire keys (even user-defined keys containing underscores).
    // There is no deploy opt-out. A serialized flow_json string on create and
    // updateAsset({ file: Blob }) bypass that mapper and preserve JSON contents.
    let flowId = options.flowId;
    let validationErrors: FlowValidationError[] | undefined;
    if (flowId) {
      const result = await client.flows.updateAsset({
        flowId, file: new Blob([JSON.stringify(flowJson)], { type: 'application/json' }),
      });
      validationErrors = result.validationErrors;
    } else {
      const result = await client.request<CreateFlowResponse>('POST', `/${options.wabaId}/flows`, {
        body: {
          name: options.name,
          categories: options.categories?.length ? options.categories : ['OTHER'],
          endpoint_uri: options.endpointUri,
          publish: false,
          flow_json: JSON.stringify(flowJson),
        },
        responseType: 'json',
      });
      flowId = result.id;
      validationErrors = result.validationErrors;
    }
    if (!flowId) throw new Error('Unable to resolve Flow ID after deployment');
    uploaded(flowId);
    // Keep Meta's validation details visible; publish/preview can otherwise
    // throw and hide the upload response when the asset is invalid.
    if (validationErrors?.length) return { flowId, validationErrors };
    if (options.publish) await client.flows.publish({ flowId });
    let previewUrl: string | undefined;
    if (options.preview) {
      const preview = typeof options.preview === 'boolean' ? { interactive: true } : options.preview;
      previewUrl = (await client.flows.preview({ flowId, ...preview })).preview.previewUrl || undefined;
    }
    return { flowId, previewUrl, validationErrors };
  } } };
}

function formatMetaError(error: FlowValidationError): string {
  const pointers = error.pointers?.length ? error.pointers : [{ path: '$' }];
  const locations = pointers.map((pointer) => {
    const line = pointer.lineStart ?? error.lineStart;
    const column = pointer.columnStart ?? error.columnStart;
    const coordinates = [line === undefined ? '' : `line ${line}`, column === undefined ? '' : `column ${column}`].filter(Boolean);
    return `${pointer.path ?? '$'}${coordinates.length ? ` (${coordinates.join(', ')})` : ''}`;
  });
  return `META ${error.error} at ${locations.join(', ')}: ${error.message ?? error.errorType ?? 'Validation failed'}`;
}

export async function deployFlow(
  options: DeployOptions,
  deps: { createClient?: (token: string) => DeployClient; fetch?: typeof globalThis.fetch } = {},
): Promise<{ exitCode: number }> {
  const token = options.token ?? process.env.WHATSAPP_ACCESS_TOKEN;
  const kapsoKey = options.kapsoKey ?? process.env.KAPSO_API_KEY;
  const log = (line: string): void => {
    // SDK/network errors and validation messages may echo request values.
    for (const secret of [token, kapsoKey]) if (secret) line = line.split(secret).join('[REDACTED]');
    (options.log ?? console.log)(line);
  };
  try {
    const target = options.to ?? 'meta';
    if (target !== 'meta' && target !== 'kapso') throw new Error('--to must be meta or kapso');
    const endpoint = prepareKapsoEndpoint(options);
    const wabaId = options.wabaId ?? process.env.WHATSAPP_WABA_ID;
    const phoneNumberId = options.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (target === 'kapso') {
      if (!kapsoKey?.trim()) throw new Error('Kapso API key required: use --kapso-key or KAPSO_API_KEY');
      if (!phoneNumberId?.trim()) throw new Error('Phone number ID required: use --phone-number-id or WHATSAPP_PHONE_NUMBER_ID');
    } else {
      if (!token?.trim()) throw new Error('Access token required: use --token or WHATSAPP_ACCESS_TOKEN');
      if (!wabaId?.trim()) throw new Error('WABA ID required: use --waba or WHATSAPP_WABA_ID');
    }
    const flowJson: unknown = JSON.parse(readFileSync(options.flowPath, 'utf8'));
    const validation = validateFlowJson(flowJson);
    for (const issue of validation.issues) log(formatIssue(issue));
    if (validation.issues.some((issue) => issue.severity === 'error') && !options.skipLocalValidation) {
      log('Error: Local validation failed. Fix the errors or use --skip-local-validation to upload anyway.');
      return { exitCode: 1 };
    }
    if (target === 'kapso') {
      return await deployToKapso({
        apiKey: kapsoKey!, baseUrl: options.kapsoUrl ?? process.env.KAPSO_API_URL,
        phoneNumberId: phoneNumberId!, name: options.name ?? basename(options.flowPath, extname(options.flowPath)),
        flowId: options.flowId, publish: options.publish, flowJson, log, endpoint,
      }, deps);
    }
    let reportedId = false;
    const client = deps.createClient ? deps.createClient(token!) : createWireClient(token!, (flowId) => {
      reportedId = true;
      log(`Flow ID: ${flowId}`);
      log(`Upload complete. Reuse --flow-id ${flowId} when updating this draft. To publish without uploading again: flowso publish --flow-id ${flowId}`);
    });
    const result = await client.flows.deploy(flowJson as Record<string, unknown>, {
      wabaId: wabaId!,
      name: options.name ?? basename(options.flowPath, extname(options.flowPath)),
      flowId: options.flowId,
      publish: options.publish ?? false,
      endpointUri: options.endpointUri,
      categories: options.categories,
      preview: options.preview ?? true,
    });
    if (!reportedId) log(`Flow ID: ${result.flowId}`);
    if (result.previewUrl) log(`Preview: ${result.previewUrl}`);
    for (const error of result.validationErrors ?? []) log(formatMetaError(error));
    const hasErrors = Boolean(result.validationErrors?.length);
    if (!options.publish || hasErrors) log('The flow is still a draft.');
    if (!hasErrors) {
      if (options.publish) log('The flow is published.');
      const flow = flowJson as { data_api_version?: string; screens?: Array<{ id?: string }> };
      const screen = !flow.data_api_version && flow.screens?.[0]?.id;
      log(`Send: flowso send --flow-id ${result.flowId} --phone-number-id <PHONE_ID> --to-number <E.164>${options.publish ? '' : ' --draft'}${screen ? ` --screen ${screen}` : ''}`);
    }
    return { exitCode: hasErrors ? 1 : 0 };
  } catch (error) {
    log(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return { exitCode: 1 };
  }
}
