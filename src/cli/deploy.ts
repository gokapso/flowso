import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { WhatsAppClient, type CreateFlowResponse, type FlowValidationError } from '@kapso/whatsapp-cloud-api';
import { formatIssue, validateFlowJson } from '../validator/index';

type Deploy = WhatsAppClient['flows']['deploy'];
type DeployClient = { flows: { deploy: Deploy } };

export type DeployOptions = {
  flowPath: string;
  token?: string;
  wabaId?: string;
  name?: string;
  flowId?: string;
  publish?: boolean;
  endpointUri?: string;
  categories?: string[];
  preview?: boolean;
  skipLocalValidation?: boolean;
  log?: (line: string) => void;
};

function createWireClient(token: string): DeployClient {
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
  deps: { createClient?: (token: string) => DeployClient } = {},
): Promise<{ exitCode: number }> {
  const token = options.token ?? process.env.WHATSAPP_ACCESS_TOKEN;
  const log = (line: string): void => {
    // SDK/network errors and validation messages may echo request values.
    (options.log ?? console.log)(token ? line.split(token).join('[REDACTED]') : line);
  };
  try {
    if (!token?.trim()) throw new Error('Access token required: use --token or WHATSAPP_ACCESS_TOKEN');
    const wabaId = options.wabaId ?? process.env.WHATSAPP_WABA_ID;
    if (!wabaId?.trim()) throw new Error('WABA ID required: use --waba or WHATSAPP_WABA_ID');
    const flowJson: unknown = JSON.parse(readFileSync(options.flowPath, 'utf8'));
    const validation = validateFlowJson(flowJson);
    for (const issue of validation.issues) log(formatIssue(issue));
    if (validation.issues.some((issue) => issue.severity === 'error') && !options.skipLocalValidation) {
      log('Error: Local validation failed. Fix the errors or use --skip-local-validation to upload anyway.');
      return { exitCode: 1 };
    }
    const client = (deps.createClient ?? createWireClient)(token);
    const result = await client.flows.deploy(flowJson as Record<string, unknown>, {
      wabaId,
      name: options.name ?? basename(options.flowPath, extname(options.flowPath)),
      flowId: options.flowId,
      publish: options.publish ?? false,
      endpointUri: options.endpointUri,
      categories: options.categories,
      preview: options.preview ?? true,
    });
    log(`Flow ID: ${result.flowId}`);
    if (result.previewUrl) log(`Preview: ${result.previewUrl}`);
    for (const error of result.validationErrors ?? []) log(formatMetaError(error));
    const hasErrors = Boolean(result.validationErrors?.length);
    if (!options.publish || hasErrors) log('The flow is still a draft.');
    log('To send a draft to a phone, use client.messages.sendInteractiveFlow({ phoneNumberId, to, bodyText, parameters: { flowId, flowCta: "Open", mode: "draft", flowAction: "navigate", flowActionPayload: { screen: "<START_SCREEN_ID>" } } }).');
    return { exitCode: hasErrors ? 1 : 0 };
  } catch (error) {
    log(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return { exitCode: 1 };
  }
}
