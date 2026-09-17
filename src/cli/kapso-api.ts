export type KapsoConnection = { kapsoKey?: string; kapsoUrl?: string };
export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function resourceId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('Missing or invalid resource ID');
  return value;
}
export function jsonObject(value: string | undefined): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error('--data must be valid JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('--data must be a JSON object');
  return parsed as Record<string, unknown>;
}
export function kapsoApi(options: KapsoConnection, fetcher = globalThis.fetch) {
  const key = options.kapsoKey ?? process.env.KAPSO_API_KEY;
  if (!key?.trim()) throw new Error('KAPSO_API_KEY is required');
  const base = (options.kapsoUrl ?? process.env.KAPSO_API_URL ?? 'https://api.kapso.ai/platform/v1').replace(/\/+$/, '');
  const origin = new URL(base);
  if (!['http:', 'https:'].includes(origin.protocol) || !base.endsWith('/platform/v1')) throw new Error('Kapso URL must be an HTTP URL ending in /platform/v1');
  async function request(path: string, body?: unknown, meta = false): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetcher(`${meta ? base.replace(/\/platform\/v1$/, '/meta/whatsapp/v24.0') : base}${path}`, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
        headers: { 'X-API-Key': key!, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch { throw new Error('Kapso request failed or timed out; no automatic retry was attempted'); }
    if (!response.ok) throw new Error(`Kapso request failed (HTTP ${response.status}); inspect Kapso logs for details`);
    let raw: unknown;
    try { raw = await response.json(); } catch { throw new Error('Kapso returned invalid JSON'); }
    const payload = object(raw);
    // Function invocations can return a Flow response with its own data field.
    return 'version' in payload || meta ? payload : object(payload.data ?? payload);
  }
  return { request };
}
export type KapsoApi = ReturnType<typeof kapsoApi>;
export async function kapsoFlow(api: KapsoApi, flowId: string) {
  const flow = await api.request(`/whatsapp/flows/${resourceId(flowId)}`);
  resourceId(flow.meta_flow_id);
  if (!['draft', 'published'].includes(String(flow.status))) throw new Error('Flow must be draft or published');
  return flow;
}
export async function metaFlow(api: KapsoApi, flow: Record<string, unknown>, fields: string) {
  const scope: Record<string, string> = flow.phone_number_id ? { phone_number_id: String(flow.phone_number_id) } : { business_account_id: resourceId(flow.business_account_id) };
  return api.request(`/${resourceId(flow.meta_flow_id)}?${new URLSearchParams({ ...scope, fields })}`, undefined, true);
}
