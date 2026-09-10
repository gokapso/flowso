#!/usr/bin/env node
import { runCli } from './commands';

const result = await runCli(process.argv.slice(2));
process.exitCode = result.exitCode;

if (result.server) {
  const server = result.server;
  let stopping = false;
  async function shutdown(): Promise<void> {
    if (stopping) return;
    stopping = true;
    try {
      await server.stop();
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    } finally {
      process.off('SIGINT', shutdown);
      process.off('SIGTERM', shutdown);
    }
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
