import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const entrypoint = fileURLToPath(new URL('../../src/cli/main.ts', import.meta.url));

describe('CLI entrypoint', () => {
  it('prints help and exits successfully', async () => {
    const { stdout, stderr } = await execute('bun', [entrypoint, 'help']);
    expect(stdout).toContain('flowso serve [flow.json]');
    expect(stderr).toBe('');
  });

  it('sets exit code one for command errors', async () => {
    await expect(execute('bun', [entrypoint, 'validate'])).rejects.toMatchObject({
      code: 1,
      stdout: 'Error: validate requires one <flow.json> path\n',
    });
  });
});
