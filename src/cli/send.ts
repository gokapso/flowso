import { randomUUID } from 'node:crypto';
import { kapsoApi, kapsoFlow, object, resourceId } from './kapso-api';
import { WhatsAppClient } from '@kapso/whatsapp-cloud-api';

type SendClient = { messages: Pick<WhatsAppClient['messages'], 'sendInteractiveFlow'> };

export type SendOptions = {
  to?: 'meta' | 'kapso';
  kapsoKey?: string;
  kapsoUrl?: string;
  toNumber?: string;
  flowId?: string;
  phoneNumberId?: string;
  draft?: boolean;
  body?: string;
  cta?: string;
  header?: string;
  footer?: string;
  screen?: string;
  data?: string;
  token?: string;
  log?: (line: string) => void;
};

export async function sendFlow(
  options: SendOptions,
  deps: { createClient?: (token: string) => SendClient; fetch?: typeof globalThis.fetch } = {},
): Promise<{ exitCode: number }> {
  const token = options.token ?? process.env.WHATSAPP_ACCESS_TOKEN;
  const log = (line: string): void => {
    (options.log ?? console.log)(token ? line.split(token).join('[REDACTED]') : line);
  };
  try {
    if (options.to === 'kapso') return await sendViaKapso(options, deps.fetch);
    if (options.to && options.to !== 'meta') throw new Error('--to must be meta or kapso');
    if (!token?.trim()) throw new Error('Access token required: use --token or WHATSAPP_ACCESS_TOKEN');
    if (!options.toNumber || !/^\+[1-9]\d{1,14}$/.test(options.toNumber)) throw new Error('--to-number requires an E.164 number (for example +15551234567)');
    if (!options.flowId?.trim()) throw new Error('--flow-id is required (Meta flow ID)');
    if (!options.phoneNumberId?.trim()) throw new Error('--phone-number-id is required');
    let data: Record<string, unknown> | undefined;
    if (options.data !== undefined) {
      if (!options.screen) throw new Error('--data requires --screen');
      const parsed: unknown = JSON.parse(options.data);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('--data must be a JSON object');
      data = parsed as Record<string, unknown>;
    }
    const client = (deps.createClient ?? ((accessToken) => new WhatsAppClient({ accessToken: accessToken })))(token);
    const result = await client.messages.sendInteractiveFlow({
      phoneNumberId: options.phoneNumberId, to: options.toNumber,
      bodyText: options.body ?? 'Test flow from flowso',
      header: options.header === undefined ? undefined : { type: 'text', text: options.header },
      footerText: options.footer,
      parameters: {
        flowId: options.flowId, flowCta: options.cta ?? 'Open',
        mode: options.draft ? 'draft' : 'published', flowToken: `flowso_${randomUUID()}`,
        flowAction: options.screen ? 'navigate' : 'data_exchange',
        flowActionPayload: options.screen ? { screen: options.screen, ...(data === undefined ? {} : { data }) } : undefined,
      },
    });
    const messageId = result.messages[0]?.id;
    if (!messageId) throw new Error('No message ID returned');
    log(`Message ID: ${messageId}`);
    return { exitCode: 0 };
  } catch (error) {
    log(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return { exitCode: 1 };
  }
}

async function sendViaKapso(options: SendOptions, fetcher?: typeof globalThis.fetch): Promise<{ exitCode: number }> {
  if (!options.toNumber || !/^\+[1-9]\d{1,14}$/.test(options.toNumber)) throw new Error('--to-number requires an E.164 number');
  const flowId = resourceId(options.flowId);
  if (options.data !== undefined && !options.screen) throw new Error('--data requires --screen');
  let data: unknown;
  if (options.data !== undefined) {
    data = JSON.parse(options.data);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('--data must be a JSON object');
  }
  const api = kapsoApi(options, fetcher);
  const flow = await kapsoFlow(api, flowId);
  const phone = options.phoneNumberId ?? (process.env.WHATSAPP_PHONE_NUMBER_ID || flow.phone_number_id);
  if (flow.phone_number_id && phone !== flow.phone_number_id) throw new Error('Phone number does not match the Kapso Flow');
  const result = await api.request(`/${resourceId(phone)}/messages`, {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: options.toNumber, type: 'interactive',
    interactive: { type: 'flow', body: { text: options.body ?? 'Test flow from flowso' },
      ...(options.header ? { header: { type: 'text', text: options.header } } : {}),
      ...(options.footer ? { footer: { text: options.footer } } : {}),
      action: { name: 'flow', parameters: {
        flow_message_version: '3', flow_id: resourceId(flow.meta_flow_id), flow_cta: options.cta ?? 'Open',
        mode: options.draft || flow.status === 'draft' ? 'draft' : 'published', flow_token: `flowso_${randomUUID()}`,
        flow_action: options.screen ? 'navigate' : 'data_exchange',
        ...(options.screen ? { flow_action_payload: { screen: options.screen, ...(data ? { data } : {}) } } : {}),
      } },
    },
  }, true);
  const messageId = Array.isArray(result.messages) ? object(result.messages[0]).id : undefined;
  if (typeof messageId !== 'string' || !messageId) throw new Error('No message ID returned');
  (options.log ?? console.log)(`Message ID: ${messageId}`);
  return { exitCode: 0 };
}
