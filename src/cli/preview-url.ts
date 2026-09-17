import { randomUUID } from 'node:crypto';
import { object, jsonObject, kapsoFlow, metaFlow, type KapsoApi } from './kapso-api';

export async function previewUrl(api: KapsoApi, flowId: string, screen?: string, rawData?: string) {
  const data = jsonObject(rawData);
  if (data && !screen) throw new Error('--data requires --screen');
  const flow = await kapsoFlow(api, flowId);
  const metadata = await metaFlow(api, flow, 'preview.invalidate(false),endpoint_uri');
  const preview = object(metadata.preview);
  if (typeof preview.preview_url !== 'string' || !URL.canParse(preview.preview_url)) throw new Error('Meta did not return a preview URL');
  const url = new URL(preview.preview_url);
  if (url.protocol !== 'https:') throw new Error('Meta returned an invalid preview URL');
  const action = screen ? 'navigate' : 'data_exchange';
  if (!screen && (flow.has_data_endpoint !== true || flow.flows_encryption_configured !== true || !metadata.endpoint_uri)) {
    throw new Error('Dynamic preview requires endpoint registration and encryption; static flows require --screen');
  }
  const visualUrl = url.toString();
  url.searchParams.set('interactive', 'true');
  url.searchParams.set('debug', 'false');
  url.searchParams.set('flow_token', `flowso_${randomUUID()}`);
  url.searchParams.set('flow_action', action);
  url.searchParams.delete('flow_action_payload');
  if (screen) url.searchParams.set('flow_action_payload', JSON.stringify({ screen, data: data ?? {} }));
  return { url: url.toString(), visualUrl, visualUrlLabel: 'Visual-only; does not establish endpoint behavior', expiresAt: preview.expires_at ?? null };
}
