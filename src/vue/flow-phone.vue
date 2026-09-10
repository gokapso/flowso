<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import type { FlowJson, Action } from '../schema/flow-json';
import type { FlowDataEndpoint, RuntimeEvent, StartOptions } from '../runtime/types';
import { useFlowRuntime } from './use-flow-runtime';
import FlowScreen from './flow-screen.vue';

const props = withDefaults(
  defineProps<{
    flow: FlowJson | null;
    endpoint?: FlowDataEndpoint;
    flowToken?: string;
    startOptions?: StartOptions;
    useExamples?: boolean;
    strictRouting?: boolean;
    dark?: boolean;
    platform?: 'android' | 'ios';
  }>(),
  { endpoint: undefined, flowToken: undefined, startOptions: undefined, useExamples: true, strictRouting: true, dark: false, platform: 'android' },
);

const emit = defineEmits<{
  event: [event: RuntimeEvent];
  openUrl: [url: string];
}>();

const endpointRef = toRef(props, 'endpoint');
const startOptionsRef = computed<StartOptions>(() => props.startOptions ?? { mode: 'navigate' });

const { state, rendered, status, canGoBack, restart, setFormValue, dispatch, back } = useFlowRuntime(
  toRef(props, 'flow'),
  {
    endpoint: endpointRef,
    flowToken: toRef(props, 'flowToken'),
    useExamples: toRef(props, 'useExamples'),
    strictRouting: toRef(props, 'strictRouting'),
    startOptions: startOptionsRef,
    onEvent: (event) => {
      emit('event', event);
      if (event.type === 'open_url') emit('openUrl', event.url);
    },
  },
);

const showDebug = ref(false);

function onAction(action: Action, options?: { validate?: boolean }) {
  void dispatch(action, options);
}

function onInput(name: string, value: unknown) {
  void setFormValue(name, value);
}

defineExpose({ restart, state, rendered });
</script>

<template>
  <div class="wa-flow wa-phone" :class="{ 'wa-dark': dark, 'wa-ios': platform === 'ios' }">
    <div class="wa-phone__header">
      <button class="wa-phone__icon" type="button" :disabled="!canGoBack" aria-label="Back" @click="back()">
        <span v-if="canGoBack">‹</span>
        <span v-else>×</span>
      </button>
      <div class="wa-phone__title">{{ rendered?.title || ' ' }}</div>
      <button class="wa-phone__icon" type="button" aria-label="Menu" @click="showDebug = !showDebug">⋮</button>
    </div>

    <div class="wa-phone__body">
      <div v-if="!flow" class="wa-phone__empty">No flow loaded</div>

      <div v-else-if="status === 'completed' && state?.completion" class="wa-phone__completed">
        <div class="wa-phone__completed-title">Flow completed</div>
        <div class="wa-phone__completed-caption">WhatsApp sends this back to your business as <code>nfm_reply.response_json</code>:</div>
        <pre class="wa-phone__json">{{ JSON.stringify(JSON.parse(state.completion.responseJson), null, 2) }}</pre>
        <button class="wa-footer__button" type="button" @click="restart()">Restart</button>
      </div>

      <template v-else-if="rendered">
        <div v-if="state?.error" class="wa-phone__error">
          <strong>{{ state.error.kind }}</strong>: {{ state.error.message }}
          <button class="wa-phone__link" type="button" @click="restart()">Restart</button>
        </div>
        <FlowScreen :screen="rendered" :loading="status === 'loading'" @action="onAction" @input="onInput" />
      </template>
    </div>

    <div v-if="showDebug && state" class="wa-phone__debug">
      <div class="wa-phone__debug-title">Debug</div>
      <div>screen: <code>{{ state.screenId }}</code> · status: <code>{{ status }}</code></div>
      <div>history: <code>{{ state.history.join(' → ') }}</code></div>
      <details open>
        <summary>form</summary>
        <pre class="wa-phone__json">{{ JSON.stringify(state.formValues[state.screenId ?? ''] ?? {}, null, 2) }}</pre>
      </details>
      <details>
        <summary>data</summary>
        <pre class="wa-phone__json">{{ JSON.stringify(state.screenData[state.screenId ?? ''] ?? {}, null, 2) }}</pre>
      </details>
      <details>
        <summary>events ({{ state.events.length }})</summary>
        <pre class="wa-phone__json">{{ JSON.stringify(state.events.slice(-10), null, 2) }}</pre>
      </details>
    </div>
  </div>
</template>

<style scoped>
.wa-phone {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 390px;
  height: 100%;
  min-height: 480px;
  border: 1px solid var(--wa-border);
  border-radius: 24px;
  overflow: hidden;
  background: var(--wa-bg);
}
.wa-phone__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 8px;
  background: var(--wa-header);
  color: var(--wa-header-text);
}
.wa-ios .wa-phone__header {
  background: var(--wa-bg);
  color: var(--wa-text);
  border-bottom: 1px solid var(--wa-border);
}
.wa-phone__icon {
  width: 36px;
  height: 36px;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  border-radius: 50%;
}
.wa-phone__icon:disabled {
  cursor: default;
}
.wa-phone__title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wa-phone__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.wa-phone__empty,
.wa-phone__completed {
  padding: 24px 16px;
  color: var(--wa-text-muted);
  text-align: center;
}
.wa-phone__completed-title {
  color: var(--wa-text);
  font-weight: 600;
  font-size: 18px;
  margin-bottom: 8px;
}
.wa-phone__completed-caption {
  font-size: 13px;
  margin-bottom: 12px;
}
.wa-phone__json {
  text-align: left;
  font-size: 12px;
  background: var(--wa-bg-muted);
  padding: 8px;
  border-radius: var(--wa-radius);
  overflow-x: auto;
  margin: 0 0 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
.wa-phone__error {
  margin: 12px 16px 0;
  padding: 10px 12px;
  border-radius: var(--wa-radius);
  background: #fdecea;
  color: var(--wa-error);
  font-size: 13px;
}
.wa-phone__link {
  border: 0;
  background: transparent;
  color: var(--wa-green-dark);
  cursor: pointer;
  margin-left: 8px;
  font-size: 13px;
}
.wa-phone__debug {
  border-top: 1px solid var(--wa-border);
  background: var(--wa-bg-muted);
  padding: 8px 12px;
  font-size: 12px;
  max-height: 40%;
  overflow: auto;
}
.wa-phone__debug-title {
  font-weight: 600;
  margin-bottom: 4px;
}
</style>
