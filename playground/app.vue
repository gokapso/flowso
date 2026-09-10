<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { Diagnostic } from '@codemirror/lint';
import type { FlowJson } from '../src/schema/flow-json';
import type { FlowDataEndpoint, FlowDataExchangeRequest, RuntimeEvent, StartOptions } from '../src/runtime/types';
import { validateFlowJson, type ValidationIssue } from '../src/validator/index';
import FlowPhone from '../src/vue/flow-phone.vue';
import JsonEditor from './json-editor.vue';
import GalleryList from './gallery-list.vue';
import GalleryDetail from './gallery-detail.vue';
import { useGallery } from './use-gallery';
import sample from '../fixtures/appointment.flow.json';

const STORAGE_KEY = 'flowso:flow';

const source = ref(localStorage.getItem(STORAGE_KEY) ?? JSON.stringify(sample, null, 2));
const parsed = shallowRef<FlowJson | null>(null);
const parseError = ref<string | null>(null);
const issues = ref<ValidationIssue[]>([]);
const startMode = ref<'navigate' | 'data_exchange'>('navigate');
const platform = ref<'android' | 'ios'>('android');
const dark = ref(false);
const events = ref<RuntimeEvent[]>([]);
const phone = ref<InstanceType<typeof FlowPhone> | null>(null);
const cliConnected = ref(false);
const flowFileName = ref<string | null>(null);
const showGallery = ref(false);
const gallery = useGallery(parsed);

function onGalleryInsert(flow: FlowJson, path: string) {
  source.value = JSON.stringify(flow, null, 2);
  showGallery.value = false;
  events.value = [...events.value.slice(-199), { type: 'warning', message: `Inserted component at ${path}` }];
}

/** The phone renders the gallery preview while the gallery is open; it never moves. */
const phoneFlow = computed(() => (showGallery.value ? gallery.previewFlow.value : parsed.value));
const phoneKey = computed(() => (showGallery.value ? `gallery:${gallery.previewId.value}` : 'flow'));

// Layout: collapsible and resizable side columns ------------------------------
const LAYOUT_KEY = 'flowso:layout';
type Layout = { left: number; right: number; rightOpen: boolean };
const layout = ref<Layout>({ left: 560, right: 340, rightOpen: true, ...JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') });
watch(layout, (value) => localStorage.setItem(LAYOUT_KEY, JSON.stringify(value)), { deep: true });

const gridColumns = computed(() => {
  const right = layout.value.rightOpen ? `${layout.value.right}px` : '44px';

  return `minmax(280px, ${layout.value.left}px) 8px minmax(420px, 1fr) 8px ${right}`;
});

function startResize(side: 'left' | 'right', event: PointerEvent) {
  const startX = event.clientX;
  const start = layout.value[side];
  const move = (e: PointerEvent) => {
    const delta = e.clientX - startX;
    const next = side === 'left' ? start + delta : start - delta;
    layout.value[side] = Math.max(240, Math.min(900, next));
  };
  const stop = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
}

// Endpoint configuration -----------------------------------------------------
type EndpointMode = 'none' | 'mock' | 'proxy' | 'direct';
const endpointMode = ref<EndpointMode>('none');
const directUrl = ref('');
const mockRoutes = ref(
  JSON.stringify(
    {
      'INIT': { screen: 'WELCOME', data: {} },
      'data_exchange:DETAILS': { screen: 'CONFIRM', data: { confirmation_code: 'SIM-001' } },
      '*': { screen: 'SUCCESS', data: { extension_message_response: { params: { status: 'ok' } } } },
    },
    null,
    2,
  ),
);
const mockError = ref<string | null>(null);

const endpoint = computed<FlowDataEndpoint | undefined>(() => {
  if (endpointMode.value === 'mock') {
    let routes: Record<string, unknown> = {};
    try {
      routes = JSON.parse(mockRoutes.value) as Record<string, unknown>;
      mockError.value = null;
    } catch (error) {
      mockError.value = error instanceof Error ? error.message : String(error);

      return undefined;
    }

    return {
      async exchange(request: FlowDataExchangeRequest) {
        const key = request.screen ? `${request.action}:${request.screen}` : request.action;
        const route = routes[key] ?? routes[request.action] ?? routes['*'];
        if (!route) throw new Error(`No mock response for "${key}"`);
        await new Promise((resolve) => setTimeout(resolve, 250));

        return route as { screen?: string; data?: Record<string, unknown> };
      },
    };
  }
  if (endpointMode.value === 'proxy' || endpointMode.value === 'direct') {
    const url = endpointMode.value === 'proxy' ? '/__sim/exchange' : directUrl.value;

    return {
      async exchange(request: FlowDataExchangeRequest) {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        });
        const text = await response.text();
        if (!response.ok) throw new Error(`Endpoint responded ${response.status}: ${text.slice(0, 200)}`);

        return JSON.parse(text) as { screen?: string; data?: Record<string, unknown> };
      },
    };
  }

  return undefined;
});

const startOptions = computed<StartOptions>(() => ({ mode: startMode.value }));

// Parse + validate -----------------------------------------------------------
let parseTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  source,
  (value) => {
    localStorage.setItem(STORAGE_KEY, value);
    if (parseTimer) clearTimeout(parseTimer);
    parseTimer = setTimeout(() => parseSource(value), 300);
  },
  { immediate: true },
);

function parseSource(value: string) {
  try {
    const next = JSON.parse(value) as FlowJson;
    parseError.value = null;
    const result = validateFlowJson(next);
    issues.value = result.issues;
    parsed.value = next;
  } catch (error) {
    parseError.value = error instanceof Error ? error.message : String(error);
  }
}

const errorCount = computed(() => issues.value.filter((issue) => issue.severity === 'error').length);
const warningCount = computed(() => issues.value.length - errorCount.value);

const diagnostics = computed<Diagnostic[]>(() => {
  const doc = source.value;
  const found: Diagnostic[] = [];
  for (const issue of issues.value) {
    const range = locate(doc, issue.pointers[0]?.path);
    found.push({ from: range.from, to: range.to, severity: issue.severity, message: `${issue.error}: ${issue.message}` });
  }

  return found;
});

/** Best-effort: find the last path segment's key in the source text. */
function locate(doc: string, path: string | undefined): { from: number; to: number } {
  if (!path) return { from: 0, to: 0 };
  const segments = path.split(/[.[\]]+/).filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last || /^\d+$/.test(last)) return { from: 0, to: 0 };
  const index = doc.indexOf(`"${last}"`);
  if (index === -1) return { from: 0, to: 0 };

  return { from: index, to: index + last.length + 2 };
}

// Events ---------------------------------------------------------------------
function onEvent(event: RuntimeEvent) {
  events.value = [...events.value.slice(-199), event];
}

function describe(event: RuntimeEvent): string {
  switch (event.type) {
    case 'data_exchange:request':
      return `→ ${event.request.action} ${event.request.screen ?? ''} ${JSON.stringify(event.request.data ?? {})}`;
    case 'data_exchange:response':
      return `← ${event.response.screen ?? '(no screen)'} ${JSON.stringify(event.response.data ?? {})} (${event.durationMs} ms)`;
    case 'navigate':
      return `navigate ${event.from ?? '∅'} → ${event.to} ${JSON.stringify(event.payload)}`;
    case 'complete':
      return `complete ${JSON.stringify(event.params)}`;
    case 'validation_failed':
      return `validation failed ${JSON.stringify(event.errors)}`;
    case 'error':
      return `error (${event.kind}) ${event.message}`;
    case 'warning':
      return `warning: ${event.message}`;
    default:
      return JSON.stringify(event);
  }
}

function restart() {
  events.value = [];
  void phone.value?.restart();
}

function loadSample() {
  source.value = JSON.stringify(sample, null, 2);
}

function loadFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  void file.text().then((text) => {
    source.value = text;
  });
}

function download() {
  const blob = new Blob([source.value], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = flowFileName.value ?? 'flow.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

// CLI integration: /__sim/flow + SSE reload ----------------------------------
let eventSource: EventSource | null = null;
onMounted(async () => {
  try {
    const response = await fetch('/__sim/flow');
    if (!response.ok) return;
    const payload = (await response.json()) as { fileName: string; flow: unknown; endpoint?: { configured: boolean } };
    cliConnected.value = true;
    flowFileName.value = payload.fileName;
    if (payload.endpoint?.configured) endpointMode.value = 'proxy';
    // Subscribe before applying the snapshot so a save between the two is not missed; SSE events win.
    eventSource = new EventSource('/__sim/events');
    let receivedEvent = false;
    eventSource.addEventListener('flow', (message) => {
      receivedEvent = true;
      const data = JSON.parse((message as MessageEvent).data) as { flow: unknown };
      source.value = JSON.stringify(data.flow, null, 2);
    });
    eventSource.addEventListener('parse_error', (message) => {
      const data = JSON.parse((message as MessageEvent).data) as { message: string };
      parseError.value = `File on disk: ${data.message}`;
    });
    eventSource.onopen = () => {
      if (!receivedEvent) source.value = JSON.stringify(payload.flow, null, 2);
    };
    if (eventSource.readyState === EventSource.OPEN && !receivedEvent) source.value = JSON.stringify(payload.flow, null, 2);
  } catch {
    cliConnected.value = false;
  }
});
onBeforeUnmount(() => eventSource?.close());
</script>

<template>
  <div class="pg">
    <div class="pg__bar">
      <span class="pg__brand">Flowso</span>
      <span v-if="cliConnected" class="pg__muted">watching {{ flowFileName }}</span>
      <label>Start <select v-model="startMode"><option value="navigate">navigate (first screen)</option><option value="data_exchange">data_exchange (INIT)</option></select></label>
      <label>Platform <select v-model="platform"><option value="android">Android</option><option value="ios">iOS</option></select></label>
      <label><input v-model="dark" type="checkbox" /> Dark</label>
      <button class="pg__btn" type="button" :class="{ 'pg__btn--active': showGallery }" @click="showGallery = !showGallery">{{ showGallery ? 'Back to editor' : 'Components' }}</button>
      <button class="pg__btn" type="button" @click="loadSample">Sample</button>
      <label class="pg__btn">Open… <input type="file" accept="application/json" hidden @change="loadFile" /></label>
      <button class="pg__btn" type="button" @click="download">Download</button>
      <button class="pg__btn pg__btn--primary" type="button" @click="restart">Restart</button>
    </div>

    <div class="pg__main" :style="{ gridTemplateColumns: gridColumns }">
      <div class="pg__editor">
        <GalleryList v-if="showGallery" :gallery="gallery" />
        <template v-else>
        <div class="pg__editor-status">
          <span v-if="parseError" class="bad">JSON error: {{ parseError }}</span>
          <template v-else>
            <span :class="errorCount ? 'bad' : 'ok'">{{ errorCount }} errors</span>
            <span>{{ warningCount }} warnings</span>
            <span>version {{ parsed?.version }}</span>
          </template>
        </div>
        <JsonEditor v-model="source" :diagnostics="diagnostics" />
        </template>
      </div>
      <div class="pg__handle pg__handle--left" @pointerdown="startResize('left', $event)" />

      <div class="pg__phone">
        <FlowPhone
          ref="phone"
          :key="phoneKey"
          :flow="phoneFlow"
          :endpoint="endpoint"
          :start-options="startOptions"
          :platform="platform"
          :dark="dark"
          @event="onEvent"
          @open-url="(url) => window.open(url, '_blank')"
        />
      </div>

      <div class="pg__handle pg__handle--right" :class="{ 'pg__handle--off': !layout.rightOpen }" @pointerdown="layout.rightOpen && startResize('right', $event)" />
      <div class="pg__side" :class="{ 'pg__side--collapsed': !layout.rightOpen }">
        <div class="pg__side-head">
          <span v-if="layout.rightOpen" class="pg__side-title">{{ showGallery ? 'Component' : 'Inspector' }}</span>
          <button class="pg__icon-btn" type="button" :title="layout.rightOpen ? 'Collapse sidebar' : 'Expand sidebar'" :aria-expanded="layout.rightOpen" @click="layout.rightOpen = !layout.rightOpen">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M15 3v18" />
            </svg>
          </button>
        </div>
        <template v-if="!layout.rightOpen" />
        <GalleryDetail v-else-if="showGallery" :gallery="gallery" :has-flow="!!parsed" @insert="onGalleryInsert" />
        <template v-else>
        <div class="pg__section">
          <h3>Endpoint</h3>
          <div class="pg__field">
            <span>Mode</span>
            <select v-model="endpointMode">
              <option value="none">None (static flow)</option>
              <option value="mock">Mock responses (below)</option>
              <option value="proxy" :disabled="!cliConnected">Real endpoint through CLI (encrypted)</option>
              <option value="direct">Direct URL (plaintext, needs CORS)</option>
            </select>
          </div>
          <div v-if="endpointMode === 'direct'" class="pg__field">
            <span>URL</span>
            <input v-model="directUrl" type="text" placeholder="http://localhost:3000/flow" />
          </div>
          <div v-if="endpointMode === 'mock'" class="pg__field">
            <span>Responses by <code>action</code> or <code>action:SCREEN</code>, <code>*</code> as fallback</span>
            <textarea v-model="mockRoutes" rows="10" />
            <span v-if="mockError" class="bad">{{ mockError }}</span>
          </div>
          <div v-if="endpointMode === 'proxy'" class="pg__muted">
            Requests are encrypted by the CLI with the public key you passed and sent to your endpoint, the same way Meta does.
          </div>
        </div>

        <div class="pg__section">
          <h3>Validation ({{ issues.length }})</h3>
          <ul class="pg__issues">
            <li v-for="(issue, i) in issues" :key="i" class="pg__issue" :class="{ 'pg__issue--warning': issue.severity === 'warning' }">
              <strong>{{ issue.error }}</strong> {{ issue.message }}
              <code v-if="issue.pointers[0]">{{ issue.pointers[0].path }}</code>
            </li>
            <li v-if="!issues.length && !parseError" class="pg__muted">No issues.</li>
          </ul>
        </div>

        <div class="pg__section">
          <h3>Events ({{ events.length }})</h3>
          <ul class="pg__events">
            <li
              v-for="(event, i) in [...events].reverse()"
              :key="events.length - i"
              class="pg__event"
              :class="{ 'pg__event--error': event.type === 'error' || event.type === 'validation_failed', 'pg__event--exchange': event.type.startsWith('data_exchange') }"
            >
              {{ describe(event) }}
            </li>
          </ul>
        </div>
        </template>
      </div>
    </div>
  </div>
</template>
