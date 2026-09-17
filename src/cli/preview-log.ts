import { appendFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key, /token|password|secret|authorization|api[_-]?key|private[_-]?key/i.test(key) ? '[redacted]' : redact(item),
  ]));
  return value;
}

export function createPreviewLog(path: string, log: (line: string) => void) {
  mkdirSync(dirname(path), { recursive: true });
  // Append to an explicitly chosen file; a server ID separates successive runs.
  closeSync(openSync(path, 'a', 0o600));
  const serverId = randomUUID();
  let sequence = 0;
  return (record: Record<string, unknown>) => {
    try {
      appendFileSync(path, JSON.stringify({ schemaVersion: 1, timestamp: new Date().toISOString(), serverId, sequence: ++sequence, ...redact(record) as object }) + '\n');
    } catch {
      log(`Preview log write failed: ${path}`);
      return false;
    }
    return true;
  };
}
