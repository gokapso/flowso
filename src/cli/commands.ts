import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatIssue, validateFlowJson } from '../validator/index';
import { parseArgs, type ParsedArgs } from './args';
import { deployFlow } from './deploy';
import { sendFlow } from './send';
import { createSimulatorServer, type SimulatorServerOptions } from './server';

export type CliResult = {
  exitCode: number;
  server?: ReturnType<typeof createSimulatorServer>;
};

const help = `Usage:
  flowso serve [flow.json] [options]     omit the file to start with a new flow in the browser
  flowso validate <flow.json>
  flowso deploy <flow.json> [options]
  flowso send --to-number <E.164> --flow-id <meta flow id> --phone-number-id <id> [options]
  flowso help

Deploy options:
  --to <meta|kapso>     Deployment target (default: meta)
  --waba <id>           Required for meta (or WHATSAPP_WABA_ID)
  --token <token>       Required for meta (or WHATSAPP_ACCESS_TOKEN)
  --kapso-key <key>     Required for kapso (or KAPSO_API_KEY)
  --kapso-url <url>     Kapso base URL (or KAPSO_API_URL; default: https://api.kapso.ai/platform/v1)
  --phone-number-id <id>  Required for kapso (or WHATSAPP_PHONE_NUMBER_ID)
  --name <name>         Flow name (default: file name without extension)
  --flow-id <id>        Update an existing draft (Meta ID for meta; Kapso UUID for kapso)
  --publish            Publish after uploading
  --endpoint-uri <url>  Data exchange endpoint URI
  --categories <a,b>    Comma-separated categories
  --preview            Fetch an interactive preview URL (default)
  --no-preview         Disable preview
  --skip-local-validation  Upload despite local validation errors

Send options:
  --to-number <E.164>   Recipient phone number (required)
  --flow-id <id>        Meta flow ID (required)
  --phone-number-id <id>  Sender phone number ID (required)
  --token <token>       Required (or WHATSAPP_ACCESS_TOKEN)
  --draft              Send a draft flow (default: published)
  --body <text>        Message body (default: Test flow from flowso)
  --cta <label>        Button label (default: Open)
  --header <text>      Text header
  --footer <text>      Footer text
  --screen <SCREEN_ID>  Navigate to a screen (default: data_exchange)
  --data <json>        Initial data object (requires --screen)
                       A random flowso_ flow token is generated for each send

Serve options:
  --endpoint <url>       Data exchange endpoint
  --public-key <path>    PEM public key for encrypted exchange
  --plaintext           Use plaintext exchange
  --port, -p <port>      Listen port (default: 4310)
  --host <host>          Listen host (default: 127.0.0.1)
  --timeout <ms>         Endpoint timeout (default: 10000)
  --open                Print the playground URL
  --help, -h            Show help`;

function textFlag(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) throw new Error(`--${name} requires a value`);
  return value;
}

function numberFlag(args: ParsedArgs, name: string, fallback: number, min: number, max: number): number {
  const raw = textFlag(args, name);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`--${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function endpointOptions(args: ParsedArgs): SimulatorServerOptions['endpoint'] {
  const url = textFlag(args, 'endpoint');
  const publicKey = textFlag(args, 'public-key');
  const plaintext = args.flags.plaintext === true;
  const timeoutMs = numberFlag(args, 'timeout', 10_000, 1, 2_147_483_647);
  if (publicKey && plaintext) throw new Error('Choose either --public-key or --plaintext');
  if (!url) {
    if (publicKey || plaintext) throw new Error('--public-key and --plaintext require --endpoint');
    return undefined;
  }
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('--endpoint must be an HTTP URL');
  if (!plaintext && !publicKey) throw new Error('--endpoint requires --public-key or --plaintext');
  return {
    url, mode: plaintext ? 'plaintext' : 'encrypted', timeoutMs,
    publicKeyPem: publicKey ? readFileSync(resolve(publicKey), 'utf8') : undefined,
  };
}

async function execute(args: ParsedArgs, log: (line: string) => void): Promise<CliResult> {
  if (args.command === 'help') {
    log(help);
    return { exitCode: 0 };
  }
  if (args.command === 'send') {
    if (args.positional.length) throw new Error('send does not accept a <flow.json> path');
    return sendFlow({
      toNumber: textFlag(args, 'to-number'), flowId: textFlag(args, 'flow-id'),
      phoneNumberId: textFlag(args, 'phone-number-id'), token: textFlag(args, 'token'),
      draft: args.flags.draft === true, body: textFlag(args, 'body'), cta: textFlag(args, 'cta'),
      header: textFlag(args, 'header'), footer: textFlag(args, 'footer'),
      screen: textFlag(args, 'screen'), data: textFlag(args, 'data'), log,
    });
  }
  if (args.positional.length > 1) throw new Error(`${args.command} accepts at most one <flow.json> path`);
  if (args.command === 'validate' && args.positional.length !== 1) throw new Error('validate requires one <flow.json> path');
  const flowPath = args.positional[0] ? resolve(args.positional[0]) : undefined;
  if (args.command === 'deploy') {
    if (!flowPath) throw new Error('deploy requires one <flow.json> path');
    const to = textFlag(args, 'to') ?? 'meta';
    if (to !== 'meta' && to !== 'kapso') throw new Error('--to must be meta or kapso');
    return deployFlow({
      flowPath, log,
      to, kapsoKey: textFlag(args, 'kapso-key'), kapsoUrl: textFlag(args, 'kapso-url'),
      phoneNumberId: textFlag(args, 'phone-number-id'),
      wabaId: textFlag(args, 'waba'),
      token: textFlag(args, 'token'),
      name: textFlag(args, 'name'),
      flowId: textFlag(args, 'flow-id'),
      publish: args.flags.publish === true,
      endpointUri: textFlag(args, 'endpoint-uri'),
      categories: textFlag(args, 'categories')?.split(',').map((value) => value.trim()).filter(Boolean),
      preview: args.flags['no-preview'] !== true,
      skipLocalValidation: args.flags['skip-local-validation'] === true,
    });
  }
  if (flowPath) {
    const input: unknown = JSON.parse(readFileSync(flowPath, 'utf8'));
    const result = validateFlowJson(input);
    for (const issue of result.issues) log(formatIssue(issue));
    if (args.command === 'validate') {
      return { exitCode: result.issues.some((issue) => issue.severity === 'error') ? 1 : 0 };
    }
  }
  const staticDir = fileURLToPath(new URL('../../dist/playground/', import.meta.url));
  const server = createSimulatorServer({
    flowPath, staticDir,
    port: numberFlag(args, 'port', 4310, 0, 65535),
    host: textFlag(args, 'host') ?? '127.0.0.1',
    endpoint: endpointOptions(args), log,
  });
  if (!existsSync(staticDir)) {
    log('Warning: playground assets are missing. Run `bun run build:playground`. The simulator API is available.');
  }
  const { url } = await server.start();
  log(`Simulator running at ${url}`);
  return { exitCode: 0, server };
}

export async function runCli(argv: string[], log: (line: string) => void = console.log): Promise<CliResult> {
  try {
    return await execute(parseArgs(argv), log);
  } catch (error) {
    log(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return { exitCode: 1 };
  }
}
