import { spawn } from 'node:child_process';

/** Delegate selection and writes to the standard installer, only on explicit invocation. */
export async function installSkill(global: boolean): Promise<{ exitCode: number }> {
  const args = ['skills', 'add', 'gokapso/flowso', '--skill', 'flowso', ...(global ? ['--global'] : [])];
  return new Promise((resolve, reject) => {
    // Inherit the caller's terminal and working directory so the picker and project scope work.
    // Windows requires a shell to launch npx.cmd; all arguments are fixed, not user-provided text.
    const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
      stdio: 'inherit', shell: process.platform === 'win32',
    });
    child.once('error', () => reject(new Error('Could not start npx. Install Node.js/npm, or use flowso skill --install <directory> for an offline copy.')));
    child.once('close', (code, signal) => resolve({ exitCode: code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1) }));
  });
}
