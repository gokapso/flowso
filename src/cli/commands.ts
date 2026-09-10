import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatIssue, validateFlowJson } from '../validator/index';
import { parseArgs, type ParsedArgs } from './args';
import { createSimulatorServer, type SimulatorServerOptions } from './server';

export type CliResult = {
  exitCode: number;
  server?: ReturnType<typeof createSimulatorServer>;
};

const help = `Usage:
  flowso serve <flow.json> [options]
  flowso validate <flow.json>
  flowso help

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
  if (args.positional.length !== 1) throw new Error(`${args.command} requires one <flow.json> path`);
  const flowPath = resolve(args.positional[0]!);
  const input: unknown = JSON.parse(readFileSync(flowPath, 'utf8'));
  const result = validateFlowJson(input);
  for (const issue of result.issues) log(formatIssue(issue));
  if (args.command === 'validate') {
    return { exitCode: result.issues.some((issue) => issue.severity === 'error') ? 1 : 0 };
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
