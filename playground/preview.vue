<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import type { FlowJson } from '../src/schema/flow-json';
import type { FlowDataEndpoint, RuntimeEvent, StartOptions } from '../src/runtime/types';
import { formatIssue, validateFlowJson } from '../src/validator';
import FlowPhone from '../src/vue/flow-phone.vue';

const flow = shallowRef<FlowJson | null>(null);
const endpoint = shallowRef<FlowDataEndpoint>();
const startOptions = shallowRef<StartOptions>({ mode: 'navigate' });
const phone = ref<InstanceType<typeof FlowPhone> | null>(null);
const fileName = ref('Flow preview');
const error = ref('');
const logError = ref('');
const connected = ref(false);
const platform = ref<'android' | 'ios'>('android');
const sessionId = crypto.randomUUID();
let tracing = false;
let stream: EventSource | undefined;
let revision = 0;
let stopped = false;
let queue = Promise.resolve();

function record(event: RuntimeEvent | { type: 'reload' }) {
  if (!tracing || event.type.startsWith('data_exchange:')) return;
  // The proxy records exchanges authoritatively; this channel adds local runtime events.
  queue = queue.then(async () => {
    try {
      const result = await fetch('/__sim/trace', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, event }), keepalive: true });
      if (!result.ok) throw new Error('Log unavailable');
      logError.value = '';
    } catch { logError.value = 'Could not save an event. Check the CLI log.'; }
  });
}

function openUrl(url: string) { window.open(url, '_blank', 'noopener,noreferrer'); }

function apply(value: unknown) {
  const result = validateFlowJson(value);
  if (!result.valid) {
    error.value = result.issues.filter(issue => issue.severity === 'error').map(formatIssue).join('\n');
    flow.value = null;
    return;
  }
  const next = value as FlowJson;
  if (next.data_api_version && !endpoint.value) {
    error.value = 'This flow needs an endpoint. Restart flowso preview with --endpoint and --plaintext or --public-key.';
    flow.value = null;
    return;
  }
  error.value = '';
  const mode = next.data_api_version ? 'data_exchange' : 'navigate';
  if (startOptions.value.mode !== mode) startOptions.value = { mode };
  record({ type: 'reload' });
  flow.value = next;
}

async function load() {
  const current = ++revision;
  try {
    const response = await fetch('/__sim/flow');
    if (!response.ok) throw new Error('Unable to load the flow file. Check the CLI and save valid JSON.');
    const payload = await response.json();
    if (stopped || current !== revision) return;
    fileName.value = payload.fileName ?? 'Flow preview';
    tracing = payload.tracing === true;
    if (payload.endpoint?.configured && !endpoint.value) endpoint.value = {
      async exchange(request) {
        const result = await fetch('/__sim/exchange', { method: 'POST', headers: { 'content-type': 'application/json', 'x-flowso-session': sessionId }, body: JSON.stringify(request) });
        const body = await result.json();
        if (!result.ok) throw new Error(body.error?.message ?? `Endpoint returned HTTP ${result.status}`);
        return body;
      },
    };
    apply(payload.flow);
  } catch (cause) {
    if (stopped || current !== revision) return;
    error.value = cause instanceof Error ? cause.message : 'Could not load the flow';
    flow.value = null;
  }
}

onMounted(() => {
  // Load on every SSE connection, including reconnects, so edits during downtime are recovered.
  stream = new EventSource('/__sim/events');
  stream.onopen = () => { connected.value = true; void load(); };
  stream.onerror = () => { connected.value = false; };
  stream.addEventListener('flow', () => { void load(); });
  stream.addEventListener('parse_error', message => {
    revision += 1;
    error.value = JSON.parse((message as MessageEvent).data).message;
    flow.value = null;
  });
});
onBeforeUnmount(() => { stopped = true; stream?.close(); });
</script>

<template>
  <main class="preview">
    <header class="preview__toolbar">
      <div class="preview__name"><strong>{{ fileName }}</strong><span>Local preview</span></div>
      <label><span class="preview__sr">Device</span><select v-model="platform" aria-label="Device"><option value="android">Android</option><option value="ios">iOS</option></select></label>
      <button type="button" :disabled="!flow || !connected" @click="phone?.restart()">Restart</button>
    </header>
    <p v-if="!connected" class="preview__notice" role="status">Connecting to the local server…</p>
    <p v-if="logError" class="preview__notice" role="alert">{{ logError }}</p>
    <section v-if="error" class="preview__error" role="alert"><strong>Preview unavailable</strong><pre>{{ error }}</pre><span>Save the file to try again.</span></section>
    <div v-else-if="flow" class="preview__phone">
      <FlowPhone ref="phone" :flow="flow" :endpoint="endpoint" :start-options="startOptions" :use-examples="false" :platform="platform" :debuggable="false" @event="record" @open-url="openUrl" />
    </div>
  </main>
</template>

<style scoped>
.preview { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 24px; background: #f5f6f5; }
.preview__toolbar { display: flex; align-items: center; gap: 10px; width: 100%; max-width: 390px; }
.preview__name { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
.preview__name strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.preview__name span { color: var(--muted); font-size: 12px; }
.preview select, .preview button { height: 36px; border: 1px solid #ddd; background: white; border-radius: 8px; padding: 0 10px; }
.preview button { cursor: pointer; }
.preview button:disabled { opacity: .5; cursor: default; }
.preview button:focus-visible, .preview select:focus-visible { outline: 2px solid var(--green); outline-offset: 3px; }
.preview__phone { width: 100%; max-width: 390px; height: min(780px, calc(100dvh - 110px)); min-height: 560px; }
.preview__phone :deep(.wa-phone) { box-shadow: 0 2px 8px #0000000a, 0 16px 48px #0000000d; }
.preview__notice, .preview__error { max-width: 390px; width: 100%; margin: 0; }
.preview__notice { color: var(--muted); font-size: 13px; }
.preview__error { padding: 20px; background: white; border: 1px solid var(--line); border-radius: 12px; }
.preview__error pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }
.preview__sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
@media (max-width: 480px) { .preview { padding: 16px 12px; gap: 16px; } .preview__phone { height: calc(100dvh - 100px); } }
</style>
