import { kapsoFlow, metaFlow, resourceId, type KapsoApi } from './kapso-api';

/** Associate only: never deploy code, write secrets, compile JSON or publish. */
export async function attachEndpoint(api: KapsoApi, flowId: string, functionId: string) {
  resourceId(functionId);
  const flow = await kapsoFlow(api, flowId);
  if (flow.status !== 'draft') throw new Error('endpoint attach requires a draft; Kapso automatically republishes published Flows');
  if (!flow.phone_number_id || flow.flows_encryption_configured !== true) {
    throw new Error('Configure the Flow phone number and encryption before attaching a function');
  }
  const path = `/whatsapp/flows/${resourceId(flowId)}/data_endpoint`;
  try {
    // PATCH attaches an existing deployed function in this project AND registers with Meta.
    // POST .../register only registers the function already associated with the Flow.
    const attached = await api.request(path, { function_id: functionId }, false, 'PATCH');
    if (attached.warning) throw new Error('Kapso returned a registration/republish warning; inspect Kapso before retrying');
    if (attached.function_id !== functionId || attached.status !== 'deployed' || attached.flow_has_encryption !== true) {
      throw new Error('Kapso did not confirm the requested deployed function and encryption');
    }
    const current = await kapsoFlow(api, flowId);
    if (current.status !== 'draft' || current.data_endpoint_function_id !== functionId || current.flows_encryption_configured !== true || current.has_data_endpoint !== true) {
      throw new Error('Flow readback did not confirm the draft association and encryption');
    }
    const endpoint = await api.request(path);
    if (endpoint.function_id !== functionId || endpoint.status !== 'deployed') throw new Error('Endpoint readback did not confirm the deployed function');
    const meta = await metaFlow(api, current, 'endpoint_uri,status');
    if (meta.status !== 'DRAFT' && meta.status !== 'draft') throw new Error('Meta did not confirm draft status');
    if (typeof current.data_endpoint_url !== 'string' || !current.data_endpoint_url || meta.endpoint_uri !== current.data_endpoint_url) {
      throw new Error('Meta endpoint registration does not match Kapso');
    }
    return {
      flowId, functionId, previousFunctionId: flow.data_endpoint_function_id ?? null,
      mutationScope: 'flow-association', registered: true, compiledFlow: false, published: false,
      note: 'Existing function attached. Code and secrets unchanged. Run verify and an interactive preview before publishing.',
    };
  } catch (error) {
    // A failed response/readback can follow a successful association. Never silently retry.
    throw new Error(`${error instanceof Error ? error.message : 'Attachment failed'}. Association may already have changed for Flow ${flowId}; inspect it before retrying. No rollback was attempted.`);
  }
}
