<script setup lang="ts">
import type { Action } from '../../schema/flow-json';
import type { RenderedNode } from '../../runtime/types';

const props = defineProps<{ node: RenderedNode; disabled?: boolean }>();
const emit = defineEmits<{ action: [action: Action, options?: { validate?: boolean }] }>();

function click() {
  const action = props.node.props['on-click-action'] as Action | undefined;
  if (action) emit('action', action);
}
</script>

<template>
  <div class="wa-footer">
    <div v-if="node.props['left-caption'] || node.props['center-caption'] || node.props['right-caption']" class="wa-footer__captions">
      <span>{{ node.props['left-caption'] ?? '' }}</span>
      <span>{{ node.props['center-caption'] ?? '' }}</span>
      <span>{{ node.props['right-caption'] ?? '' }}</span>
    </div>
    <button class="wa-footer__button" type="button" :disabled="disabled || node.props.enabled === false" @click="click">
      {{ node.props.label }}
    </button>
  </div>
</template>

<style>
.wa-footer {
  margin-top: auto;
  padding-top: 8px;
}
.wa-footer__captions {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--wa-text-muted);
  margin-bottom: 8px;
}
.wa-footer__button {
  width: 100%;
  padding: 12px 16px;
  border: 0;
  border-radius: 24px;
  background: var(--wa-green);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
.wa-footer__button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
