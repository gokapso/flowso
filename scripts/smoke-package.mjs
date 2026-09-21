import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { chmod, mkdtemp, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const directory = await mkdtemp(join(tmpdir(), 'flowso-package-'));
const children = [];
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !['CAL_', 'KAPSO_', 'WHATSAPP_'].some(prefix => key.startsWith(prefix))));

function run(command, args, cwd, expectedStatus = 0) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 60_000, maxBuffer: 5 * 1024 * 1024 });
  assert.equal(result.status, expectedStatus, `${command} ${args.join(' ')}\n${result.error ?? ''}\n${result.stdout?.slice(-5000)}\n${result.stderr?.slice(-2000)}`);
  return result.stdout;
}

async function start(command, args, cwd, match) {
  const child = spawn(command, args, { cwd, env: { ...env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Server did not start: ${output.slice(-2000)}`)), 10_000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output.slice(-2000)}`)); });
    child.stderr.on('data', chunk => { output += chunk; });
    child.stdout.on('data', chunk => {
      output += chunk;
      const found = output.match(match);
      if (found) { clearTimeout(timer); resolve(found[0]); }
    });
  });
}

try {
  const archive = join(directory, 'flowso.tgz');
  run('bun', ['run', 'build'], root);
  const packed = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--pack-destination', directory, '--json'], root));
  await rename(join(directory, packed[0].filename), archive);
  const consumer = join(directory, 'consumer');
  await mkdir(consumer);
  await writeFile(join(consumer, 'package.json'), '{"name":"flowso-package-check","private":true,"type":"module"}');
  run('bun', ['add', archive], consumer);
  const cli = join(consumer, 'node_modules/flowso/dist/cli/main.js');
  const installedManifest = JSON.parse(await readFile(join(consumer, 'node_modules/flowso/package.json'), 'utf8'));
  assert.equal(installedManifest.bin.flowso, 'dist/cli/main.js');
  assert.match(run(join(consumer, 'node_modules/.bin/flowso'), ['help'], consumer), /flowso publish/);
  const command = (args, expectedStatus = 0) => run(process.execPath, [cli, ...args], consumer, expectedStatus);
  // Exercise the packaged npm lifecycle script: it may print, but must not configure agents.
  const beforeInstallHint = await readdir(consumer);
  const hint = run('npm', ['run', 'postinstall', '--prefix', join(consumer, 'node_modules/flowso')], consumer);
  assert.match(hint, /Next: flowso skill install/);
  assert.deepEqual(await readdir(consumer), beforeInstallHint);
  // Probe the installed wrapper without network access or a real skills installation.
  const probeBin = join(directory, 'bin');
  await mkdir(probeBin);
  const probe = join(probeBin, 'npx');
  await writeFile(probe, '#!' + process.execPath + '\nconsole.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()})); process.exit(Number(process.env.FLOWSO_PROBE_EXIT || 0));\n');
  await chmod(probe, 0o755);
  const originalPath = env.PATH;
  env.PATH = probeBin + ':' + originalPath;
  try {
    assert.deepEqual(JSON.parse(command(['skill', 'install'])), { args: ['skills', 'add', join(await realpath(consumer), 'node_modules/flowso/skills/flowso'), '--skill', 'flowso'], cwd: await realpath(consumer) });
    assert.deepEqual(JSON.parse(command(['skill', 'install', '--global'])).args, ['skills', 'add', join(await realpath(consumer), 'node_modules/flowso/skills/flowso'), '--skill', 'flowso', '--global']);
    env.FLOWSO_PROBE_EXIT = '7';
    command(['skill', 'install'], 7);
  } finally { env.PATH = originalPath; delete env.FLOWSO_PROBE_EXIT; }

  command(['init', 'booking']);
  assert.match(await readFile(join(consumer, 'booking/.agents/skills/flowso/SKILL.md'), 'utf8'), /name: flowso/);
  const scenarioReference = 'references/scenarios.md';
  const sourceReference = await readFile(join(root, 'skills/flowso', scenarioReference), 'utf8');
  assert.equal(await readFile(join(consumer, 'booking/.agents/skills/flowso', scenarioReference), 'utf8'), sourceReference);
  command(['skill', '--install', 'offline-skill']);
  assert.equal(await readFile(join(consumer, 'offline-skill', scenarioReference), 'utf8'), sourceReference);
  assert.ok(command(['skill']).includes(sourceReference));
  const schedulingReference = await readFile(join(root, 'skills/flowso/references/cal-com.md'), 'utf8');
  assert.equal(await readFile(join(consumer, 'offline-skill/references/cal-com.md'), 'utf8'), schedulingReference);
  assert.equal(await readFile(join(consumer, 'booking/.agents/skills/flowso/references/cal-com.md'), 'utf8'), schedulingReference);
  const deployReference = await readFile(join(root, 'skills/flowso/references/kapso-deploy.md'), 'utf8');
  assert.equal(await readFile(join(consumer, 'offline-skill/references/kapso-deploy.md'), 'utf8'), deployReference);
  assert.ok(command(['skill']).includes(deployReference));
  const operationsReference = await readFile(join(root, 'skills/flowso/references/kapso-operations.md'), 'utf8');
  assert.ok(command(['skill']).includes(operationsReference));
  assert.equal(await readFile(join(consumer, 'booking/.agents/skills/flowso/references/kapso-operations.md'), 'utf8'), operationsReference);
  // Exercise the installed Node CLI against a local Platform API contract fixture.
  await writeFile(join(consumer, 'kapso-fixture.mjs'), `
    import { createServer } from 'node:http';
    const calls = [];
    let functionId = 'function-123';
    const server = createServer(async (req, res) => {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : undefined;
      if (req.url === '/calls') { res.end(JSON.stringify(calls)); return; }
      calls.push({ path: req.url, method: req.method, body });
      let data;
      if (req.method === 'PATCH' && req.url.endsWith('/data_endpoint')) functionId = body.function_id;
      if (req.url.startsWith('/meta/')) {
        data = req.url.endsWith('/messages') ? { messages: [{ id: 'wamid.fixture' }] } : {
          endpoint_uri: 'https://example.com/endpoint', validation_errors: [], status: 'draft',
          preview: { preview_url: 'https://business.facebook.com/preview/?token=fixture' }
        };
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); return;
      }
      if (req.url.endsWith('/invoke')) {
        const exchange = body.data_exchange;
        const screen = exchange.action === 'INIT' ? 'DETAILS' : exchange.screen === 'DETAILS' || exchange.action === 'BACK' ? 'SLOTS' : 'REVIEW';
        data = { version: '3.0', screen, data: { status: 'active', slots: [{ id: 'fixture-slot' }], flowso_verify: { protocol: 1, read_only: true, booking_gate: 'expiry-v1' } } };
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); return;
      }
      if (req.url.endsWith('/versions')) data = { id: 'version-final', status: 'draft', validation_errors: null };
      else if (req.url.endsWith('/secrets')) data = req.method === 'GET' ? { secrets: [{name:'CAL_API_KEY'}, {name:'CAL_ALLOW_BOOKINGS'}] } : { message: 'Secret created successfully' };
      else if (req.url.endsWith('/setup_encryption')) data = { flows_encryption_configured: true };
      else if (req.url.includes('/data_endpoint')) data = { function_id: functionId, status: 'deployed', flow_has_encryption: true };
      else data = { id: 'flow-123', meta_flow_id: '12345', phone_number_id: 'package-phone', data_endpoint_function_id: functionId, data_endpoint_url: 'https://example.com/endpoint', status: 'draft', has_data_endpoint: true, flows_encryption_configured: true, preview_url: 'https://example.com/fresh-preview' };
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data }));
    });
    server.listen(0, '127.0.0.1', () => console.log('http://127.0.0.1:' + server.address().port));
  `);
  const kapso = await start(process.execPath, ['kapso-fixture.mjs'], consumer, /http:\/\/127\.0\.0\.1:\d+/);
  env.KAPSO_API_URL = kapso + '/platform/v1';
  env.KAPSO_API_KEY = 'package-test-key';
  env.WHATSAPP_PHONE_NUMBER_ID = 'package-phone';
  env.CAL_API_KEY = 'package-provider-secret';
  env.CAL_ALLOW_BOOKINGS = '0';
  await writeFile(join(consumer, 'kapso-endpoint.js'), 'async function handler(request, env) { return { screen: "START", data: {} }; }');
  const deployed = command(['deploy', 'booking/flow.json', '--to', 'kapso', '--data-endpoint', 'kapso-endpoint.js',
    '--secret-env', 'CAL_API_KEY', '--secret-env=CAL_ALLOW_BOOKINGS', '--setup-encryption', '--register-endpoint']);
  assert.match(deployed, /Draft deployed/);
  assert.ok(!deployed.includes(env.CAL_API_KEY));
  const requests = await fetch(kapso + '/calls').then(response => response.json());
  assert.equal(requests.length, 9);
  assert.equal(requests[0].body.publish, false);
  assert.deepEqual(requests[4].body, { secret: { name: 'CAL_API_KEY', value: env.CAL_API_KEY } });
  assert.deepEqual(requests[5].body, { secret: { name: 'CAL_ALLOW_BOOKINGS', value: '0' } });
  assert.equal(requests[6].path, '/platform/v1/whatsapp/flows/flow-123/data_endpoint/register');
  assert.equal(requests[7].path, '/platform/v1/whatsapp/flows/flow-123/versions');
  assert.deepEqual(requests[7].body.flow_json, requests[0].body.flow_json);
  assert.ok(!requests.some(request => request.path.includes('/publish')));
  const remote = ['--to', 'kapso', '--flow-id', 'flow-123'];
  const previewResult = JSON.parse(command(['preview-url', ...remote, '--json']));
  assert.equal(new URL(previewResult.url).searchParams.get('flow_action'), 'data_exchange');
  const verified = JSON.parse(command(['verify', ...remote, '--data', '{"date":"2030-06-10"}', '--json']));
  assert.equal(verified.bookingWrites, false);
  assert.match(command(['send', ...remote, '--to-number', '+15551234567']), /wamid.fixture/);
  assert.equal(JSON.parse(command(['secrets', 'set', ...remote, '--secret-env', 'CAL_API_KEY', '--json'])).compiledFlow, false);
  assert.equal(JSON.parse(command(['endpoint', 'deploy', ...remote, '--data-endpoint', 'booking/kapso-data-endpoint.js', '--secret-env', 'CAL_API_KEY', '--secret-env', 'CAL_ALLOW_BOOKINGS', '--json'])).compiledFlow, false);
  assert.equal(JSON.parse(command(['bookings', 'enable', ...remote, '--for', '1m', '--json'])).enabled, true);
  assert.equal(JSON.parse(command(['bookings', 'disable', ...remote, '--json'])).enabled, false);
  const attachment = JSON.parse(command(['endpoint', 'attach', ...remote, '--function-id', 'shared-function-456', '--json']));
  assert.equal(attachment.registered, true);
  assert.equal(attachment.functionId, 'shared-function-456');
  assert.equal(attachment.compiledFlow, false);
  const after = await fetch(kapso + '/calls').then(response => response.json());
  const operations = after.slice(requests.length);
  assert.deepEqual(operations.filter(request => request.method === 'PATCH').map(request => request.body), [{ function_id: 'shared-function-456' }]);
  assert.ok(!operations.some(request => request.path.endsWith('/versions') || request.path.endsWith('/publish')));
  assert.ok(!operations.some(request => request.body?.data_exchange?.screen === 'REVIEW'));
  for (const key of Object.keys(env)) if (['CAL_', 'KAPSO_', 'WHATSAPP_'].some(prefix => key.startsWith(prefix))) delete env[key];
  assert.equal(JSON.parse(command(['catalog', 'text-input', '--json'])).entry.component.type, 'TextInput');
  assert.equal(JSON.parse(command(['validate', 'booking/flow.json', '--json'])).ok, true);
  assert.equal(JSON.parse(command(['inspect', 'booking/flow.json', '--examples', '--json'])).snapshot.screen, 'DETAILS');
  const endpoint = await start(process.execPath, ['dev-server.mjs'], join(consumer, 'booking'), /http:\/\/127\.0\.0\.1:\d+\/flow/);
  const endpointArgs = ['--endpoint', endpoint, '--plaintext'];
  assert.equal(JSON.parse(command(['inspect', 'booking/flow.json', ...endpointArgs, '--json'])).snapshot.screen, 'DETAILS');
  const report = JSON.parse(command(['test', 'booking/flow.json', '--scenario', 'booking/scenarios.json', ...endpointArgs, '--json']));
  assert.equal(report.ok, true);
  assert.equal(report.tests.length, 7);
  const availability = JSON.parse(command(['test', 'booking/flow.json', '--scenario', 'booking/scenarios.availability.json', ...endpointArgs, '--json', '--trace']));
  assert.equal(availability.ok, true);
  assert.equal(availability.tests[0].snapshot.screen, 'SLOTS');
  assert.ok(!availability.tests[0].events.some(event => event.type === 'data_exchange:request' && event.request?.screen === 'REVIEW'));
  assert.equal(JSON.parse(command(['test', 'booking/flow.json', '--scenario', 'booking/scenarios.json', '--test', 'missing', ...endpointArgs, '--json'], 1)).ok, false);
  const preview = await start(process.execPath, [cli, 'preview', 'booking/flow.json', ...endpointArgs, '--port', '0', '--log-file', 'preview.jsonl'], consumer, /http:\/\/127\.0\.0\.1:\d+/);
  const html = await fetch(preview).then(response => { assert.equal(response.status, 200); return response.text(); });
  const asset = html.match(/src="([^"]+\.js)"/)[1];
  assert.equal((await fetch(new URL(asset, preview))).status, 200);
  assert.equal((await fetch(`${preview}/__sim/flow`).then(response => response.json())).tracing, true);
  const exchange = await fetch(`${preview}/__sim/exchange`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-flowso-session': 'package-check' }, body: JSON.stringify({ version: '3.0', action: 'INIT', flow_token: 'package-test' }) });
  assert.equal(exchange.status, 200);
  const journal = (await readFile(join(consumer, 'preview.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.ok(journal.some(record => record.kind === 'exchange.response' && record.response.screen === 'DETAILS'));
  console.log(JSON.stringify({ ok: true, installedPackage: true, skillInstaller: true, postinstallHint: true, scenarios: report.tests.length, skill: true, catalog: true, previewAssets: true, kapsoDraftDeploy: true, kapsoOperations: true, kapsoAttach: true }));
} finally {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 3000);
      await exited; clearTimeout(force);
    }
  }
  await rm(directory, { recursive: true, force: true });
}
