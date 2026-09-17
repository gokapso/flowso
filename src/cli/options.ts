import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ParsedArgs } from './args';
import type { SimulatorServerOptions } from './server';

export function textFlag(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) throw new Error(`--${name} requires a value`);
  return value;
}

export function textFlags(args: ParsedArgs, name: string): string[] {
  const value = args.flags[name];
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  return [textFlag(args, name)!];
}

export function numberFlag(args: ParsedArgs, name: string, fallback: number, min: number, max: number): number {
  const raw = textFlag(args, name);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`--${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function endpointOptions(args: ParsedArgs): SimulatorServerOptions['endpoint'] {
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
