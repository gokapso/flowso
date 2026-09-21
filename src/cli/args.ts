export type ParsedArgs = {
  command: 'serve' | 'preview' | 'validate' | 'deploy' | 'send' | 'test' | 'inspect' | 'init' | 'skill' | 'catalog' | 'preview-url' | 'verify' | 'endpoint' | 'secrets' | 'bookings' | 'help';
  positional: string[];
  flags: Record<string, string | string[] | boolean>;
};

const booleanFlags = new Set(['global', 'plaintext', 'open', 'help', 'publish', 'preview', 'no-preview', 'skip-local-validation', 'draft', 'json', 'trace', 'examples', 'setup-encryption', 'register-endpoint']);

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = { command: 'help', positional: [], flags: {} };
  function setFlag(name: string, value: string | boolean): void {
    if (name !== 'secret-env') {
      result.flags[name] = value;
      return;
    }
    if (typeof value !== 'string' || !value) throw new Error('--secret-env requires an environment variable name');
    const previous = result.flags[name];
    result.flags[name] = [...(Array.isArray(previous) ? previous : []), value];
  }
  let index = 0;
  const command = argv[0];
  if (command && !command.startsWith('-')) {
    if (!['serve', 'preview', 'validate', 'deploy', 'send', 'help', 'test', 'inspect', 'init', 'skill', 'catalog', 'preview-url', 'verify', 'endpoint', 'secrets', 'bookings'].includes(command)) {
      throw new Error(`Unknown command: ${command}`);
    }
    result.command = command as ParsedArgs['command'];
    index = 1;
  }
  for (; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--') {
      result.positional.push(...argv.slice(index + 1));
      break;
    }
    if (arg === '-h') {
      result.flags.help = true;
    } else if (arg === '-p' || arg.startsWith('--')) {
      const flag = arg === '-p' ? 'port' : arg.slice(2);
      const separator = flag.indexOf('=');
      if (separator !== -1) {
        setFlag(flag.slice(0, separator), flag.slice(separator + 1));
      } else {
        const next = argv[index + 1];
        if (!booleanFlags.has(flag) && next !== undefined && !next.startsWith('-')) {
          setFlag(flag, next);
          index += 1;
        } else {
          setFlag(flag, true);
        }
      }
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      result.positional.push(arg);
    }
  }
  if (result.flags.help) result.command = 'help';
  return result;
}
