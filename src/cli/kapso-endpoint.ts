import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import type { DeployOptions } from './deploy';

export type KapsoEndpoint = {
  code: string;
  secrets: { name: string; value: string }[];
  setupEncryption: boolean;
  registerEndpoint: boolean;
};

/** Resolve everything before the first remote write. Never execute endpoint source locally. */
export function prepareKapsoEndpoint(options: DeployOptions): KapsoEndpoint | undefined {
  if (!options.dataEndpoint && !options.secretEnv?.length && !options.setupEncryption && !options.registerEndpoint) return undefined;
  if (options.to !== 'kapso') throw new Error('Endpoint deployment options require --to kapso');
  if (!options.dataEndpoint) throw new Error('--secret-env, --setup-encryption and --register-endpoint require --data-endpoint');
  if (options.publish) throw new Error('Deploy and test the dynamic draft first; use --publish in a separate invocation');
  if (options.endpointUri) throw new Error('Use --register-endpoint with --data-endpoint, not --endpoint-uri');
  const secrets = [...new Set(options.secretEnv ?? [])].map(name => {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) throw new Error('--secret-env accepts an uppercase environment variable name only, never NAME=value');
    const value = process.env[name];
    if (value === undefined || value === '') throw new Error(`Missing environment variable: ${name}`);
    return { name, value };
  });
  const code = readFileSync(options.dataEndpoint, 'utf8');
  if (!code.trim()) throw new Error('The data endpoint file is empty');
  try {
    new Script(code);
  } catch {
    // Syntax errors may contain source snippets, including accidentally hardcoded credentials.
    throw new Error('Invalid data endpoint JavaScript; use async function handler(request, env) without module imports or exports');
  }
  return { code, secrets, setupEncryption: options.setupEncryption ?? false, registerEndpoint: options.registerEndpoint ?? false };
}
