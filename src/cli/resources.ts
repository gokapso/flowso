import { cp, mkdir, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { ParsedArgs } from './args';
import { textFlag } from './options';
import { COMPONENT_CATALOG, findCatalogEntry } from '../catalog/component-catalog';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function copyNew(source: string, destination: string): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  // Reserve an absent destination; never overwrite an existing project or skill.
  await mkdir(destination);
  for (const entry of await readdir(source)) {
    await cp(resolve(source, entry), resolve(destination, entry), { recursive: true, force: false, errorOnExist: true });
  }
}

export async function resourceCommand(args: ParsedArgs, log: (line: string) => void) {
  if (args.command === 'catalog') {
    if (args.positional.length > 1 || Object.keys(args.flags).some(flag => flag !== 'json')) throw new Error('Usage: flowso catalog [component-id] [--json]');
    const id = args.positional[0];
    const entry = id ? findCatalogEntry(id) : undefined;
    if (id && !entry) throw new Error(`Unknown catalog id: ${id}; run flowso catalog for available IDs`);
    log(JSON.stringify({ schemaVersion: 1, ok: true, ...(entry ? { entry } : {
      entries: COMPONENT_CATALOG.map(({ id, name, category, minVersion, description }) => ({ id, name, category, minVersion, description })),
    }) }, null, args.flags.json ? undefined : 2));
    return { exitCode: 0 };
  }
  if (args.command === 'skill') {
    if (args.positional.length || Object.keys(args.flags).some(flag => flag !== 'install')) throw new Error('Usage: flowso skill [--install <directory>]');
    const target = textFlag(args, 'install');
    if (target) {
      await copyNew(resolve(root, 'skills/flowso'), resolve(target));
      log(`Installed skill at ${resolve(target)}`);
    } else {
      const instructions = await readFile(resolve(root, 'skills/flowso/SKILL.md'), 'utf8');
      const scenarios = await readFile(resolve(root, 'skills/flowso/references/scenarios.md'), 'utf8');
      // Printed instructions remain self-contained for agents without an installed skill folder.
      const scheduling = await readFile(resolve(root, 'skills/flowso/references/cal-com.md'), 'utf8');
      const deployment = await readFile(resolve(root, 'skills/flowso/references/kapso-deploy.md'), 'utf8');
      const operations = await readFile(resolve(root, 'skills/flowso/references/kapso-operations.md'), 'utf8');
      log(`${instructions}\n${scenarios}\n${scheduling}\n${deployment}\n${operations}`);
    }
  } else {
    if (args.positional.length !== 1 || Object.keys(args.flags).length) throw new Error('Usage: flowso init <directory>');
    const target = resolve(args.positional[0]!);
    await copyNew(resolve(root, 'templates/booking'), target);
    await copyNew(resolve(root, 'skills/flowso'), resolve(target, '.agents/skills/flowso'));
    log(`Created ${target}\nNext: cd ${JSON.stringify(target)}\n  node dev-server.mjs\nIn another terminal:\n  flowso test flow.json --scenario scenarios.json --endpoint http://127.0.0.1:4312/flow --plaintext --json\n  flowso preview flow.json --endpoint http://127.0.0.1:4312/flow --plaintext`);
  }
  return { exitCode: 0 };
}
