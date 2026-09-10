<script setup lang="ts">
import { computed } from 'vue';
import type { Action } from '../schema/flow-json';
import type { RenderedNode, RenderedScreen } from '../runtime/types';
import { componentFor } from './component-map';
import FooterButton from './components/footer-button.vue';

const props = defineProps<{
  screen: RenderedScreen;
  loading?: boolean;
}>();

const body = computed(() => props.screen.children.filter((node) => node.type !== 'Footer'));
const footer = computed(() => props.screen.children.find((node) => node.type === 'Footer'));

const emit = defineEmits<{
  action: [action: Action, options?: { validate?: boolean }];
  input: [name: string, value: unknown];
}>();

function onAction(action: Action, options?: { validate?: boolean }) {
  emit('action', action, options);
}

function onInput(node: RenderedNode, value: unknown) {
  if (node.name) emit('input', node.name, value);
}
</script>

<template>
  <div class="wa-screen" :class="{ 'wa-screen--loading': loading }">
    <div class="wa-screen__body">
      <div v-if="screen.errorMessage" class="wa-screen__error" role="alert">{{ screen.errorMessage }}</div>
      <template v-for="node in body" :key="`${screen.id}:${node.key}`">
        <component
          :is="componentFor(node.type)"
          :node="node"
          :disabled="loading"
          @action="onAction"
          @input="(value: unknown) => onInput(node, value)"
        />
      </template>
    </div>
    <div class="wa-screen__footer">
      <FooterButton v-if="footer" :node="footer" :disabled="loading || !screen.canSubmit" @action="onAction" />
      <div class="wa-screen__managed">Managed by the business. <span class="wa-screen__learn">Learn more</span></div>
    </div>
    <div v-if="loading" class="wa-screen__spinner" aria-live="polite">Loading…</div>
  </div>
</template>

<style scoped>
.wa-screen {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  position: relative;
}
.wa-screen__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 16px 8px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.wa-screen__footer {
  padding: 8px 16px 12px;
  border-top: 1px solid var(--wa-border);
  background: var(--wa-bg);
}
.wa-screen__managed {
  margin-top: 10px;
  text-align: center;
  font-size: 11px;
  color: var(--wa-text-muted);
}
.wa-screen__learn {
  color: var(--wa-green-dark);
}
.wa-screen--loading .wa-screen__body,
.wa-screen--loading .wa-screen__footer {
  opacity: 0.6;
  pointer-events: none;
}
.wa-screen__error {
  padding: 10px 12px;
  border-radius: var(--wa-radius);
  background: #fdecea;
  color: var(--wa-error);
  font-size: 14px;
}
.wa-screen__spinner {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--wa-text-muted);
  font-size: 13px;
}
</style>
