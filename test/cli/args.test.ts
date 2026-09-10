import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../src/cli/args';

describe('parseArgs', () => {
  it('defaults to help and recognizes each command', () => {
    expect(parseArgs([])).toEqual({ command: 'help', positional: [], flags: {} });
    for (const command of ['serve', 'validate', 'help']) {
      expect(parseArgs([command]).command).toBe(command);
    }
  });

  it('parses values, equals syntax, boolean flags, and the port alias', () => {
    expect(parseArgs(['serve', 'flow.json', '--endpoint', 'http://localhost', '--host=0.0.0.0', '-p', '4311', '--plaintext', '--open'])).toEqual({
      command: 'serve', positional: ['flow.json'],
      flags: { endpoint: 'http://localhost', host: '0.0.0.0', port: '4311', plaintext: true, open: true },
    });
  });

  it('does not consume a positional path after known booleans', () => {
    expect(parseArgs(['serve', '--open', 'flow.json', '--verbose']).positional).toEqual(['flow.json']);
    expect(parseArgs(['serve', '--verbose']).flags.verbose).toBe(true);
  });

  it('preserves equals signs in values and honors the argument terminator', () => {
    expect(parseArgs(['serve', '--endpoint=https://example.com?a=b', '--', '--file.json'])).toEqual({
      command: 'serve', positional: ['--file.json'], flags: { endpoint: 'https://example.com?a=b' },
    });
  });

  it('allows help overrides and rejects unsupported commands and short flags', () => {
    expect(parseArgs(['serve', '--help']).command).toBe('help');
    expect(parseArgs(['-h']).command).toBe('help');
    expect(() => parseArgs(['unknown'])).toThrow('Unknown command');
    expect(() => parseArgs(['serve', '-x'])).toThrow('Unknown option');
  });
});
