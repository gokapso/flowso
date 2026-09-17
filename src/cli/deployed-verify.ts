import { randomUUID } from 'node:crypto';
import { object, resourceId, kapsoFlow, metaFlow, type KapsoApi } from './kapso-api';

export async function guardedEndpoint(api: KapsoApi, flow: Record<string, unknown>) {
  const functionId = resourceId(flow.data_endpoint_function_id);
  const flowToken = `flowso_verify_${randomUUID()}`;
  async function exchange(action: string, screen?: string, data: Record<string, unknown> = {}) {
    const result = await api.request(`/functions/${functionId}/invoke`, {
      source: 'flowso_verify', flow: { id: flow.id, meta_flow_id: flow.meta_flow_id },
      data_exchange: { version: '3.0', action, flow_token: flowToken, ...(screen ? { screen } : {}), data },
    });
    const guard = object(object(result.data).flowso_verify);
    if (guard.protocol !== 1 || guard.read_only !== true) throw new Error('Endpoint lacks the Flowso read-only verification contract; stopped before further calls');
    if (result.version !== '3.0') throw new Error('Endpoint returned an unsupported data API version');
    const error = object(result.data).error_code;
    if (error) {
      const known = ['BOOKING_DISABLED', 'SLOT_CONFLICT', 'PROVIDER_AUTHENTICATION', 'PROVIDER_VALIDATION', 'PROVIDER_TIMEOUT', 'PROVIDER_UNAVAILABLE', 'SESSION_EXPIRED'];
      throw new Error(`Endpoint error: ${known.includes(String(error)) ? error : 'ENDPOINT_ERROR'}`);
    }
    return result;
  }
  const ping = await exchange('ping');
  if (object(ping.data).status !== 'active') throw new Error('Endpoint health check failed');
  return { exchange, capabilities: object(object(ping.data).flowso_verify) };
}

export async function verifyDeployed(api: KapsoApi, flowId: string, data: Record<string, unknown>, inputScreen = 'DETAILS', availabilityScreen = 'SLOTS', reviewScreen = 'REVIEW') {
  const flow = await kapsoFlow(api, flowId);
  if (flow.has_data_endpoint !== true || flow.flows_encryption_configured !== true) throw new Error('Flow requires a registered endpoint and encryption');
  const meta = await metaFlow(api, flow, 'endpoint_uri,validation_errors,status');
  if (typeof meta.endpoint_uri !== 'string' || !meta.endpoint_uri || meta.endpoint_uri !== flow.data_endpoint_url) throw new Error('Meta endpoint registration does not match Kapso');
  if (!Array.isArray(meta.validation_errors) || meta.validation_errors.length) throw new Error('Meta validation is missing or contains errors');
  const fn = await api.request(`/whatsapp/flows/${flowId}/data_endpoint`);
  if (fn.status !== 'deployed') throw new Error('Data endpoint is not deployed');
  const { exchange } = await guardedEndpoint(api, flow);
  const init = await exchange('INIT');
  if (init.screen !== inputScreen) throw new Error('INIT did not reach the input screen');
  const available = await exchange('data_exchange', inputScreen, data);
  if (available.screen !== availabilityScreen) throw new Error('Availability did not reach the expected screen');
  const slots = object(available.data).slots;
  if (!Array.isArray(slots) || !slots.length || typeof object(slots[0]).id !== 'string') throw new Error('No available slots to exercise REVIEW and BACK; no booking attempted');
  const review = await exchange('data_exchange', availabilityScreen, { slot: object(slots[0]).id });
  if (review.screen !== reviewScreen) throw new Error('Selection did not reach a review screen');
  // Never submit the review screen. Back targets the screen being restored.
  const back = await exchange('BACK', availabilityScreen);
  if (back.screen !== availabilityScreen || !Array.isArray(object(back.data).slots)) throw new Error('BACK did not refresh availability');
  return { checks: ['meta-registration', 'meta-validation', 'encryption', 'read-only-guard', 'INIT', 'availability', 'review', 'BACK'],
    bookingWrites: false, slots: slots.length, transport: 'Kapso function invocation; not the Meta encrypted transport' };
}
