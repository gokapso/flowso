import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatIssue, validateFlowJson } from '../validator/index';
import { parseArgs, type ParsedArgs } from './args';
import { deployFlow } from './deploy';
import { remoteCommand } from './remote-commands';
import { sendFlow } from './send';
import { createSimulatorServer } from './server';
import { textFlag, textFlags, numberFlag, endpointOptions } from './options';
import { agentCommand } from './agent-commands';
import { resourceCommand } from './resources';

export type CliResult = {
  exitCode: number;
  server?: ReturnType<typeof createSimulatorServer>;
};

const help = `Usage:
  flowso serve [flow.json] [options]     omit the file to start with a new flow in the browser
  flowso preview <flow.json> [options]  phone-only preview with an agent-readable log
  flowso validate <flow.json> [--json]
  flowso inspect <flow.json> [--screen ID --data '{...}'] [--examples] [--json]
  flowso test <flow.json> --scenario <tests.json> [--trace] [--json]
  flowso init <directory>              scaffold a local booking project and agent skill
  flowso skill [--install <directory>] print the skill or copy it to a skill directory
  flowso catalog [component-id] [--json] list components or inspect a canonical snippet
  flowso deploy <flow.json> [options]
  flowso send --to-number <E.164> --flow-id <meta flow id> --phone-number-id <id> [options]
  flowso preview-url --to kapso --flow-id <Kapso UUID> [--screen ID --data '{...}'] [--json]
  flowso verify --to kapso --flow-id <Kapso UUID> --data '{...}' [--json]
  flowso endpoint deploy --to kapso --flow-id <Kapso UUID> --data-endpoint <file> [--secret-env NAME ...]
  flowso secrets set --to kapso --flow-id <Kapso UUID> --secret-env NAME [...]
  flowso bookings enable --to kapso --flow-id <Kapso UUID> --for 10m
  flowso bookings disable --to kapso --flow-id <Kapso UUID>
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
  --data-endpoint <file>  Upload and deploy a Kapso function (draft only)
  --secret-env <NAME>   Repeat to upsert function secrets from environment variables
  --setup-encryption   Configure phone encryption without rotating an existing key
  --register-endpoint  Register the deployed function on the Flow
                       These options require --to kapso and --data-endpoint;
                       publish in a separate invocation after testing the draft.
  --endpoint-uri <url>  Data exchange endpoint URI
  --categories <a,b>    Comma-separated categories
  --preview            Fetch an interactive preview URL (default)
  --no-preview         Disable preview
  --skip-local-validation  Upload despite local validation errors

Send options:
  --to <meta|kapso>    Kapso uses KAPSO_API_KEY and resolves its Flow UUID automatically
  --kapso-url <url>    Platform base URL; proxy requests use the same host
  --to-number <E.164>   Recipient phone number (required)
  --flow-id <id>        Meta ID, or Kapso UUID with --to kapso (required)
  --phone-number-id <id>  Sender phone number ID (resolved from Flow for Kapso)
  --token <token>       Required for Meta (or WHATSAPP_ACCESS_TOKEN)
  --draft              Force draft mode (Kapso otherwise uses the Flow status)
  --body <text>        Message body (default: Test flow from flowso)
  --cta <label>        Button label (default: Open)
  --header <text>      Text header
  --footer <text>      Footer text
  --screen <SCREEN_ID>  Navigate to a screen (default: data_exchange)
  --data <json>        Initial data object (requires --screen)
                       A random flowso_ flow token is generated for each send

Deployed operations:
  verify requires the endpoint's read-only contract; never submits confirmation.
  --input-screen, --availability-screen, --review-screen override DETAILS, SLOTS, REVIEW.
  --data supplies availability input. No slots means the full smoke test cannot pass.
  bookings enable requires an expiry-aware endpoint and --for 1m through 60m.
  endpoint/secrets update existing draft functions without uploading Flow JSON.
  Remote commands accept --json, --kapso-key and --kapso-url. Writes may be partial.

Local testing:
  test and inspect accept --endpoint, --plaintext, --public-key and --timeout.
  Dynamic flows start with INIT by default; scenarios can override start mode.
  Tests use real data, never __example__ fallback. Inspect can opt into --examples.
  --json produces one JSON result on stdout, including failures.
  --trace includes rendered snapshots and endpoint events (may contain test data).
  --test <name> reruns one named scenario without replaying the whole suite.

Preview options:
  --log-file <path>     JSONL log (default: artifacts/flowso-preview-<id>.jsonl)
  Endpoint and port options are shared with serve. Tail the printed log path.

Serve options:
  --endpoint <url>       Data exchange endpoint
  --public-key <path>    PEM public key for encrypted exchange
  --plaintext           Use plaintext exchange
  --port, -p <port>      Listen port (default: 4310)
  --host <host>          Listen host (default: 127.0.0.1)
  --timeout <ms>         Endpoint timeout (default: 10000)
  --open                Print the playground URL
  --help, -h            Show help`;

async function execute(args: ParsedArgs, log: (line: string) => void): Promise<CliResult> {
  if (args.command === 'help') {
    log(help);
    return { exitCode: 0 };
  }
  if (args.command === 'init' || args.command === 'skill' || args.command === 'catalog') return resourceCommand(args, log);
  if (args.command === 'test' || args.command === 'inspect') return agentCommand(args, log);
  if (['preview-url', 'verify', 'endpoint', 'secrets', 'bookings'].includes(args.command)) return remoteCommand(args, log);
  if (args.command === 'send') {
    if (args.positional.length) throw new Error('send does not accept a <flow.json> path');
    const to = textFlag(args, 'to') ?? 'meta';
    if (to !== 'meta' && to !== 'kapso') throw new Error('--to must be meta or kapso');
    return sendFlow({
      to, kapsoKey: textFlag(args, 'kapso-key'), kapsoUrl: textFlag(args, 'kapso-url'),
      toNumber: textFlag(args, 'to-number'), flowId: textFlag(args, 'flow-id'),
      phoneNumberId: textFlag(args, 'phone-number-id'), token: textFlag(args, 'token'),
      draft: args.flags.draft === true, body: textFlag(args, 'body'), cta: textFlag(args, 'cta'),
      header: textFlag(args, 'header'), footer: textFlag(args, 'footer'),
      screen: textFlag(args, 'screen'), data: textFlag(args, 'data'), log,
    });
  }
  if (args.positional.length > 1) throw new Error(`${args.command} accepts at most one <flow.json> path`);
  if (args.command === 'preview' && args.positional.length !== 1) throw new Error('preview requires one <flow.json> path');
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
      dataEndpoint: textFlag(args, 'data-endpoint'),
      secretEnv: textFlags(args, 'secret-env'),
      setupEncryption: args.flags['setup-encryption'] === true,
      registerEndpoint: args.flags['register-endpoint'] === true,
      categories: textFlag(args, 'categories')?.split(',').map((value) => value.trim()).filter(Boolean),
      preview: args.flags['no-preview'] !== true,
      skipLocalValidation: args.flags['skip-local-validation'] === true,
    });
  }
  if (flowPath) {
    const input: unknown = JSON.parse(readFileSync(flowPath, 'utf8'));
    const result = validateFlowJson(input);
    if (args.command === 'validate' && args.flags.json === true) log(JSON.stringify({ schemaVersion: 1, ok: result.valid, ...result }));
    else for (const issue of result.issues) log(formatIssue(issue));
    if (args.command === 'validate') {
      return { exitCode: result.issues.some((issue) => issue.severity === 'error') ? 1 : 0 };
    }
  }
  const staticDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/playground');
  const logFile = args.command === 'preview' ? resolve(textFlag(args, 'log-file') ?? `artifacts/flowso-preview-${randomUUID()}.jsonl`) : undefined;
  const server = createSimulatorServer({
    flowPath, staticDir, logFile,
    port: numberFlag(args, 'port', 4310, 0, 65535),
    host: textFlag(args, 'host') ?? '127.0.0.1',
    endpoint: endpointOptions(args), log,
  });
  if (!existsSync(staticDir)) {
    log('Warning: playground assets are missing. Run `bun run build:playground`. The simulator API is available.');
  }
  const { url } = await server.start();
  log(args.command === 'preview' ? `Preview running at ${url}/?view=preview` : `Simulator running at ${url}`);
  if (logFile) log(`Preview log: ${logFile}`);
  return { exitCode: 0, server };
}

export async function runCli(argv: string[], log: (line: string) => void = console.log): Promise<CliResult> {
  try {
    return await execute(parseArgs(argv), log);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (argv.includes('--json')) log(JSON.stringify({ schemaVersion: 1, ok: false, error: { code: 'CLI_ERROR', message } }));
    else log(`Error: ${message}`);
    return { exitCode: 1 };
  }
}
