import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Delegate selection and writes to the standard installer, only on explicit invocation. */
export async function installSkill(global: boolean): Promise<{ exitCode: number }> {
  const bundledSkill = fileURLToPath(new URL('../../skills/flowso', import.meta.url));
  const args = ['skills', 'add', bundledSkill, '--skill', 'flowso', ...(global ? ['--global'] : [])];
  if (process.platform === 'win32' && /["%\r\n]/.test(bundledSkill)) {
    throw new Error('Unsupported Windows installation path. Use flowso skill --install <directory> for an offline copy.');
  }
  if (process.platform === 'win32') args[2] = `"${bundledSkill}"`;
  return new Promise((resolve, reject) => {
    // Inherit the caller's terminal and working directory so the picker and project scope work.
    // Windows requires a shell to launch npx.cmd; quote the bundled path for installations under paths containing spaces.
    const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
      stdio: 'inherit', shell: process.platform === 'win32',
    });
    child.once('error', () => reject(new Error('Could not start npx. Install Node.js/npm, or use flowso skill --install <directory> for an offline copy.')));
    child.once('close', (code, signal) => resolve({ exitCode: code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1) }));
  });
}
