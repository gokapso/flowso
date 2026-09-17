import { prepareKapsoEndpoint, readSecrets } from './kapso-endpoint';
import { object, resourceId, kapsoFlow, type KapsoApi } from './kapso-api';
import { guardedEndpoint } from './deployed-verify';

const sharedFunctionNotice = 'Code, secrets and booking gates apply to every Flow using this function; a draft does not imply isolation.';

async function endpointFunction(api: KapsoApi, flowId: string, options: { draftOnly?: boolean; deployedOnly?: boolean } = { draftOnly: true, deployedOnly: true }) {
  const flow = await kapsoFlow(api, flowId);
  if (options.draftOnly && flow.status !== 'draft') throw new Error('Function updates require a draft Flow');
  const fn = await api.request(`/whatsapp/flows/${flowId}/data_endpoint`);
  if (options.deployedOnly && fn.status !== 'deployed') throw new Error('Deploy the function with flowso deploy first');
  return { flow, functionId: resourceId(fn.function_id), status: fn.status };
}
async function setSecrets(api: KapsoApi, functionId: string, secrets: { name: string; value: string }[]) {
  for (const secret of secrets) await api.request(`/functions/${functionId}/secrets`, { secret });
}
export async function updateSecrets(api: KapsoApi, flowId: string, names: string[]) {
  const secrets = readSecrets(names);
  if (!secrets.length) throw new Error('Provide at least one --secret-env NAME');
  const { functionId } = await endpointFunction(api, flowId);
  await setSecrets(api, functionId, secrets);
  return { functionId, mutationScope: 'function', sharedFunctionNotice, secrets: secrets.map(secret => secret.name), compiledFlow: false };
}
export async function updateEndpoint(api: KapsoApi, flowId: string, file: string, names: string[]) {
  const endpoint = prepareKapsoEndpoint({ flowPath: '', to: 'kapso', dataEndpoint: file, secretEnv: names })!;
  const { functionId, status } = await endpointFunction(api, flowId, { draftOnly: true });
  const current = await api.request(`/functions/${functionId}/secrets`);
  if (!Array.isArray(current.secrets)) throw new Error('Kapso did not return secret names');
  const supplied = new Set(names);
  if (current.secrets.some(secret => !supplied.has(String(object(secret).name)))) throw new Error('Code deployment requires --secret-env for all existing function secrets so they can be restored');
  await api.request(`/whatsapp/flows/${flowId}/data_endpoint`, { code: endpoint.code });
  const deployed = await api.request(`/whatsapp/flows/${flowId}/data_endpoint/deploy`, {});
  if (deployed.status !== 'deployed') throw new Error('Kapso did not confirm function deployment');
  await setSecrets(api, functionId, endpoint.secrets);
  return { functionId, mutationScope: 'function', sharedFunctionNotice, compiledFlow: false, secretNamesVerified: status === 'deployed',
    note: status === 'deployed' ? 'Function updated; Flow JSON and Meta registration unchanged'
      : 'Recovered function; prior secret names were unavailable. Verify every required secret was supplied.' };
}
export async function bookingWindow(api: KapsoApi, flowId: string, action: string, duration?: string) {
  if (!['enable', 'disable'].includes(action)) throw new Error('Usage: flowso bookings enable --for 10m | disable');
  const minutes = duration && /^\d+m$/.test(duration) ? Number(duration.slice(0, -1)) : NaN;
  if (action === 'enable' && (!Number.isInteger(minutes) || minutes < 1 || minutes > 60)) throw new Error('--for must be between 1m and 60m');
  if (action === 'disable' && duration) throw new Error('--for is only used with bookings enable');
  const { flow, functionId } = await endpointFunction(api, flowId, { draftOnly: action === 'enable', deployedOnly: true });
  if (action === 'enable') {
    const { capabilities } = await guardedEndpoint(api, flow);
    if (capabilities.booking_gate !== 'expiry-v1') throw new Error('Endpoint does not enforce expiry-v1 booking gates; update its code first');
  }
  const expiresAt = action === 'enable' ? new Date(Date.now() + minutes * 60_000).toISOString() : new Date(0).toISOString();
  // Expiry is written first so even a partial enablement cannot create an indefinite gate.
  await setSecrets(api, functionId, [
    { name: 'CAL_BOOKING_ENABLED_UNTIL', value: expiresAt },
    { name: 'CAL_ALLOW_BOOKINGS', value: action === 'enable' ? '1' : '0' },
  ]);
  return { functionId, mutationScope: 'function', sharedFunctionNotice, enabled: action === 'enable', expiresAt, note: 'Applies to this function; verification sessions remain read-only' };
}
