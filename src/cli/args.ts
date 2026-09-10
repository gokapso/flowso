export type ParsedArgs = {
  command: 'serve' | 'validate' | 'deploy' | 'help';
  positional: string[];
  flags: Record<string, string | boolean>;
};

const booleanFlags = new Set(['plaintext', 'open', 'help', 'publish', 'preview', 'no-preview', 'skip-local-validation']);

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = { command: 'help', positional: [], flags: {} };
  let index = 0;
  const command = argv[0];
  if (command && !command.startsWith('-')) {
    if (command !== 'serve' && command !== 'validate' && command !== 'deploy' && command !== 'help') {
      throw new Error(`Unknown command: ${command}`);
    }
    result.command = command;
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
        result.flags[flag.slice(0, separator)] = flag.slice(separator + 1);
      } else {
        const next = argv[index + 1];
        if (!booleanFlags.has(flag) && next !== undefined && !next.startsWith('-')) {
          result.flags[flag] = next;
          index += 1;
        } else {
          result.flags[flag] = true;
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
