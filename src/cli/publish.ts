import { WhatsAppClient } from '@kapso/whatsapp-cloud-api';

type FlowStatus = { id: string; status: string; validationErrors?: unknown[] };

/** Publish the uploaded Meta asset without replacing it with a local file. */
export async function publishFlow(options: {
  flowId?: string; token?: string; log?: (line: string) => void;
}): Promise<{ exitCode: number }> {
  const token = options.token ?? process.env.WHATSAPP_ACCESS_TOKEN;
  const log = (line: string): void => (options.log ?? console.log)(token ? line.split(token).join('[REDACTED]') : line);
  try {
    if (!token?.trim()) throw new Error('Access token required: use --token or WHATSAPP_ACCESS_TOKEN');
    if (!options.flowId || !/^[a-zA-Z0-9_-]+$/.test(options.flowId)) throw new Error('--flow-id is required and must be a Meta Flow ID');
    const flowId = options.flowId;
    const client = new WhatsAppClient({ accessToken: token });
    const read = () => client.request<FlowStatus>('GET', `/${flowId}`, {
      query: { fields: 'id,status,validation_errors' }, responseType: 'json',
    });
    const before = await read();
    if (before.status === 'PUBLISHED') {
      log(`Flow ID: ${flowId}\nStatus: PUBLISHED (already published)`);
      return { exitCode: 0 };
    }
    if (before.status !== 'DRAFT') throw new Error(`Cannot publish Flow with status ${before.status}`);
    if (before.validationErrors?.length) throw new Error(`Meta reports validation errors: ${JSON.stringify(before.validationErrors)}`);
    // Do not retry a write on uncertain outcomes; the caller can safely run this
    // command again, which checks the current status before attempting publication.
    try {
      await client.flows.publish({ flowId });
    } catch (error) {
      log(`Publication was not confirmed for Flow ${flowId}. Check its status before retrying; this command checks status on every run.`);
      throw error;
    }
    const after = await read();
    if (after.status !== 'PUBLISHED') throw new Error(`Publication returned, but status is ${after.status}; check Meta before retrying`);
    log(`Flow ID: ${flowId}\nStatus: PUBLISHED`);
    return { exitCode: 0 };
  } catch (error) {
    log(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return { exitCode: 1 };
  }
}
