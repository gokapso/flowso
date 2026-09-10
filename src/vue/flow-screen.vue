<script setup lang="ts">
import type { Action } from '../schema/flow-json';
import type { RenderedNode, RenderedScreen } from '../runtime/types';
import { componentFor } from './component-map';

defineProps<{
  screen: RenderedScreen;
  loading?: boolean;
}>();

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
    <div v-if="screen.errorMessage" class="wa-screen__error" role="alert">{{ screen.errorMessage }}</div>
    <template v-for="node in screen.children" :key="`${screen.id}:${node.key}`">
      <component
        :is="componentFor(node.type)"
        :node="node"
        :disabled="loading"
        @action="onAction"
        @input="(value: unknown) => onInput(node, value)"
      />
    </template>
    <div v-if="loading" class="wa-screen__spinner" aria-live="polite">Loading…</div>
  </div>
</template>

<style scoped>
.wa-screen {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  flex: 1;
  position: relative;
}
.wa-screen--loading > :not(.wa-screen__spinner) {
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
