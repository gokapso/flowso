import { textFlag, textFlags } from './options';
import type { ParsedArgs } from './args';
import { kapsoApi, jsonObject, resourceId } from './kapso-api';
import { previewUrl } from './preview-url';
import { verifyDeployed } from './deployed-verify';
import { attachEndpoint } from './kapso-attach';
import { updateEndpoint, updateSecrets, bookingWindow } from './kapso-maintenance';

export async function remoteCommand(args: ParsedArgs, log: (line: string) => void) {
  const subcommand = args.positional[0];
  const common = ['to', 'flow-id', 'kapso-key', 'kapso-url', 'json'];
  const specific: Record<string, string[]> = { 'preview-url': ['screen', 'data'], verify: ['data', 'input-screen', 'availability-screen', 'review-screen'],
    endpoint: subcommand === 'attach' ? ['function-id'] : ['data-endpoint', 'secret-env'], secrets: ['secret-env'], bookings: ['for'] };
  for (const flag of Object.keys(args.flags)) if (![...common, ...specific[args.command]!].includes(flag)) throw new Error(`Unknown ${args.command} option: --${flag}`);
  if (textFlag(args, 'to') !== 'kapso') throw new Error('This command requires --to kapso');
  if (['preview-url', 'verify'].includes(args.command) ? args.positional.length : args.positional.length !== 1) throw new Error('Unexpected or missing subcommand');
  if (args.command === 'endpoint' && !['deploy', 'attach'].includes(subcommand ?? '')) throw new Error('Usage: flowso endpoint deploy | attach');
  if (args.command === 'secrets' && subcommand !== 'set') throw new Error('Usage: flowso secrets set');
  const flowId = resourceId(textFlag(args, 'flow-id'));
  const api = kapsoApi({ kapsoKey: textFlag(args, 'kapso-key'), kapsoUrl: textFlag(args, 'kapso-url') });
  let result;
  switch (args.command) {
    case 'preview-url': result = await previewUrl(api, flowId, textFlag(args, 'screen'), textFlag(args, 'data')); break;
    case 'verify': {
      const data = jsonObject(textFlag(args, 'data'));
      if (!data) throw new Error('verify requires --data with test input fields (including a future date)');
      result = await verifyDeployed(api, flowId, data, textFlag(args, 'input-screen'), textFlag(args, 'availability-screen'), textFlag(args, 'review-screen')); break;
    }
    case 'endpoint': {
      if (subcommand === 'attach') {
        const functionId = textFlag(args, 'function-id');
        if (!functionId) throw new Error('endpoint attach requires --function-id');
        result = await attachEndpoint(api, flowId, functionId);
        break;
      }
      const file = textFlag(args, 'data-endpoint');
      if (!file) throw new Error('endpoint deploy requires --data-endpoint');
      result = await updateEndpoint(api, flowId, file, textFlags(args, 'secret-env')); break;
    }
    case 'secrets': result = await updateSecrets(api, flowId, textFlags(args, 'secret-env')); break;
    case 'bookings': result = await bookingWindow(api, flowId, subcommand!, textFlag(args, 'for')); break;
    default: throw new Error('Unsupported remote command');
  }
  log(JSON.stringify({ schemaVersion: 1, ok: true, ...result }, null, args.flags.json ? undefined : 2));
  return { exitCode: 0 };
}
