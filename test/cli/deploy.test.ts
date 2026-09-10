import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WhatsAppClient, type DeployResult } from '@kapso/whatsapp-cloud-api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../../src/cli/args';
import { runCli } from '../../src/cli/commands';
import { deployFlow } from '../../src/cli/deploy';
import { formatIssue, validateFlowJson } from '../../src/validator';

const fixturePath = resolve('fixtures/appointment.flow.json');
const token = 'test-access-token';
const wabaId = 'waba-123';
const previewUrl = 'https://example.com/preview';
let directory: string;

function fakeClient(result: DeployResult = { flowId: 'flow-123', previewUrl }) {
  const deploy = vi.fn<WhatsAppClient['flows']['deploy']>().mockResolvedValue(result);
  const createClient = vi.fn((_token: string) => ({ flows: { deploy } }));
  return { deploy, createClient };
}

function mockHttp(...responses: unknown[]) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const response of responses) fetch.mockResolvedValueOnce(Response.json(response));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'flow-deploy-'));
  vi.stubEnv('WHATSAPP_ACCESS_TOKEN', '');
  vi.stubEnv('WHATSAPP_WABA_ID', '');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
});

describe('deployFlow', () => {
  it.each([
    { token: undefined, wabaId, message: 'Access token required' },
    { token, wabaId: undefined, message: 'WABA ID required' },
  ])('rejects missing credentials: $message', async ({ message, ...credentials }) => {
    const fake = fakeClient();
    const log = vi.fn();
    expect(await deployFlow({ flowPath: fixturePath, ...credentials, log }, fake)).toEqual({ exitCode: 1 });
    expect(log).toHaveBeenCalledWith(expect.stringContaining(`Error: ${message}`));
    expect(fake.createClient).not.toHaveBeenCalled();
  });

  it('uses environment credentials, the file name, and interactive preview by default', async () => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', token);
    vi.stubEnv('WHATSAPP_WABA_ID', wabaId);
    const fake = fakeClient();
    const log = vi.fn();
    expect(await deployFlow({ flowPath: fixturePath, log }, fake)).toEqual({ exitCode: 0 });
    expect(fake.createClient).toHaveBeenCalledWith(token);
    expect(fake.deploy).toHaveBeenCalledWith(JSON.parse(await readFile(fixturePath, 'utf8')), {
      wabaId, name: 'appointment.flow', publish: false, preview: true,
      flowId: undefined, endpointUri: undefined, categories: undefined,
    });
    expect(log).toHaveBeenCalledWith('The flow is still a draft.');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('mode: "draft"'));
  });

  it('passes wire-format JSON unchanged and all deployment options', async () => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'unused-env-token');
    vi.stubEnv('WHATSAPP_WABA_ID', 'unused-env-waba');
    const fake = fakeClient();
    const log = vi.fn();
    const options = {
      wabaId, name: 'Appointments', publish: true, flowId: 'existing-draft',
      endpointUri: 'https://example.com/flow', categories: ['APPOINTMENT_BOOKING', 'OTHER'], preview: true,
    };
    expect(await deployFlow({ flowPath: fixturePath, token, log, ...options }, fake)).toEqual({ exitCode: 0 });
    expect(fake.createClient).toHaveBeenCalledWith(token);
    expect(fake.deploy).toHaveBeenCalledExactlyOnceWith(JSON.parse(await readFile(fixturePath, 'utf8')), options);
    expect(log).toHaveBeenCalledWith('Flow ID: flow-123');
    expect(log).toHaveBeenCalledWith(`Preview: ${previewUrl}`);
    expect(log).not.toHaveBeenCalledWith('The flow is still a draft.');
  });

  it.each([false, true])('prints local issues; skipLocalValidation=%s', async (skipLocalValidation) => {
    const flowPath = join(directory, 'invalid.json');
    await writeFile(flowPath, '{}');
    const fake = fakeClient();
    const log = vi.fn();
    expect(await deployFlow({ flowPath, token, wabaId, skipLocalValidation, log }, fake))
      .toEqual({ exitCode: skipLocalValidation ? 0 : 1 });
    for (const issue of validateFlowJson({}).issues) expect(log).toHaveBeenCalledWith(formatIssue(issue));
    if (skipLocalValidation) {
      expect(fake.deploy).toHaveBeenCalledWith({}, expect.any(Object));
    } else {
      expect(fake.createClient).not.toHaveBeenCalled();
      expect(fake.deploy).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(expect.stringContaining('--skip-local-validation'));
    }
  });

  it('allows warning-only flows without skipping validation', async () => {
    const flow = {
      version: '3.1', routing_model: {},
      screens: [{ id: 'START', terminal: true, layout: { type: 'SingleColumnLayout', children: [
        { type: 'Footer', label: 'Done', 'on-click-action': { name: 'complete' } },
      ] } }],
    };
    const flowPath = join(directory, 'warning.json');
    await writeFile(flowPath, JSON.stringify(flow));
    const issues = validateFlowJson(flow).issues;
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((issue) => issue.severity === 'warning')).toBe(true);
    const fake = fakeClient();
    const log = vi.fn();
    expect(await deployFlow({ flowPath, token, wabaId, log }, fake)).toEqual({ exitCode: 0 });
    expect(fake.deploy).toHaveBeenCalledOnce();
    for (const issue of issues) expect(log).toHaveBeenCalledWith(formatIssue(issue));
  });

  it('prints Meta errors with all paths and available coordinates', async () => {
    const fake = fakeClient({ flowId: 'flow-123', validationErrors: [
      { error: 'INVALID_PROPERTY', message: 'Invalid action', pointers: [
        { path: '$.screens[0]', lineStart: 12, columnStart: 4 },
        { path: '$.screens[1]', columnStart: 0 },
      ] },
      { error: 'INVALID_FLOW', message: 'Invalid flow', lineStart: 1 },
    ] });
    const log = vi.fn();
    expect(await deployFlow({ flowPath: fixturePath, token, wabaId, log }, fake)).toEqual({ exitCode: 1 });
    expect(log).toHaveBeenCalledWith('META INVALID_PROPERTY at $.screens[0] (line 12, column 4), $.screens[1] (column 0): Invalid action');
    expect(log).toHaveBeenCalledWith('META INVALID_FLOW at $ (line 1): Invalid flow');
    expect(log).not.toHaveBeenCalledWith(expect.stringMatching(/^Preview:/));
  });

  it.each(['missing', 'malformed'])('reports a %s file without creating a client', async (kind) => {
    const flowPath = join(directory, 'flow.json');
    if (kind === 'malformed') await writeFile(flowPath, '{');
    const fake = fakeClient();
    const log = vi.fn();
    expect(await deployFlow({ flowPath, token, wabaId, log, skipLocalValidation: true }, fake)).toEqual({ exitCode: 1 });
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^Error: /));
    expect(fake.createClient).not.toHaveBeenCalled();
  });

  it.each([new Error(`Network failed: ${token}`), `SDK failed: ${token}`])('redacts tokens from thrown SDK errors', async (error) => {
    const fake = fakeClient();
    fake.deploy.mockRejectedValue(error);
    const log = vi.fn();
    expect(await deployFlow({ flowPath: fixturePath, token, wabaId, log }, fake)).toEqual({ exitCode: 1 });
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^Error: .*\[REDACTED\]/));
    expect(JSON.stringify(log.mock.calls)).not.toContain(token);
  });

  it('redacts tokens echoed in Meta validation messages', async () => {
    const fake = fakeClient({ flowId: 'flow-123', validationErrors: [{ error: 'BAD', message: token }] });
    const log = vi.fn();
    expect((await deployFlow({ flowPath: fixturePath, token, wabaId, log }, fake)).exitCode).toBe(1);
    expect(log).toHaveBeenCalledWith('META BAD at $: [REDACTED]');
    expect(JSON.stringify(log.mock.calls)).not.toContain(token);
  });
});

describe('CLI deploy and SDK wire upload', () => {
  it.each(['publish', 'preview', 'no-preview', 'skip-local-validation'])('parses --%s without consuming the path', (flag) => {
    expect(parseArgs(['deploy', `--${flag}`, fixturePath])).toEqual({
      command: 'deploy', positional: [fixturePath], flags: { [flag]: true },
    });
  });

  it('includes deploy and its options in help', async () => {
    const log = vi.fn();
    expect(await runCli(['help'], log)).toEqual({ exitCode: 0 });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('flowso deploy <flow.json> [options]'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('--no-preview'));
  });

  it.each([['deploy'], ['deploy', fixturePath, fixturePath], ['deploy', fixturePath, '--waba']])('rejects invalid arguments %j', async (...argv) => {
    const fetch = mockHttp();
    const log = vi.fn();
    expect(await runCli(argv, log)).toEqual({ exitCode: 1 });
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^Error: /));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('confirms SDK deploy rejects canonical JSON before sending HTTP', async () => {
    const fetch = mockHttp();
    const client = new WhatsAppClient({ accessToken: token });
    await expect(client.flows.deploy(JSON.parse(await readFile(fixturePath, 'utf8')), { wabaId, name: 'Appointment' }))
      .rejects.toThrow('Flow JSON authoring should use camelCase');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('creates with unchanged wire JSON, publishes, and fetches an interactive preview', async () => {
    const fetch = mockHttp({ id: 'flow-123', success: true }, { success: true }, { preview: { preview_url: previewUrl } });
    const log = vi.fn();
    expect(await runCli([
      'deploy', fixturePath, '--token', token, '--waba', wabaId, '--name', 'Appointments',
      '--publish', '--preview', '--endpoint-uri', 'https://example.com/flow', '--categories', 'APPOINTMENT_BOOKING, OTHER',
    ], log)).toEqual({ exitCode: 0 });
    expect(fetch).toHaveBeenCalledTimes(3);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toContain(`/${wabaId}/flows`);
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'Appointments', categories: ['APPOINTMENT_BOOKING', 'OTHER'], endpoint_uri: 'https://example.com/flow',
      publish: false, flow_json: JSON.stringify(JSON.parse(await readFile(fixturePath, 'utf8'))),
    });
    expect(String(fetch.mock.calls[1]?.[0])).toContain('/flow-123/publish');
    expect(new URL(String(fetch.mock.calls[2]?.[0])).searchParams.get('fields')).toBe('preview.invalidate(false)');
    expect(log).toHaveBeenCalledWith('Flow ID: flow-123');
    expect(log).toHaveBeenCalledWith(`Preview: ${previewUrl}`);
    expect(JSON.stringify(log.mock.calls)).not.toContain(token);
  });

  it('updates an existing draft with an unchanged JSON file and disables preview', async () => {
    const fetch = mockHttp({ success: true, validation_errors: [] });
    const log = vi.fn();
    expect(await runCli([
      'deploy', '--no-preview', fixturePath, '--token', token, '--waba', wabaId, '--flow-id', 'existing-draft',
    ], log)).toEqual({ exitCode: 0 });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toContain('/existing-draft/assets');
    expect(init?.body).toBeInstanceOf(FormData);
    const form = init?.body as FormData;
    expect(form.get('asset_type')).toBe('FLOW_JSON');
    expect(form.get('name')).toBe('flow.json');
    expect(JSON.parse(await (form.get('file') as Blob).text())).toEqual(JSON.parse(await readFile(fixturePath, 'utf8')));
    expect(log).not.toHaveBeenCalledWith(expect.stringMatching(/^Preview:/));
  });

  it.each([false, true])('preserves Meta errors and stops before publish/preview; update=%s', async (update) => {
    const fetch = mockHttp({ id: 'flow-123', success: true, validation_errors: [
      { error: 'INVALID_PROPERTY', message: 'Invalid action', pointers: [{ path: '$.screens[0]', line_start: 5, column_start: 3 }] },
    ] });
    const log = vi.fn();
    expect(await runCli([
      'deploy', fixturePath, '--token', token, '--waba', wabaId, '--publish',
      ...(update ? ['--flow-id', 'flow-123'] : []),
    ], log)).toEqual({ exitCode: 1 });
    expect(fetch).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith('META INVALID_PROPERTY at $.screens[0] (line 5, column 3): Invalid action');
  });
});
