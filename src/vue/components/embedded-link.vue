<script setup lang="ts">
import type { Action } from '../../schema/flow-json';
import type { RenderedNode } from '../../runtime/types';

const props = defineProps<{ node: RenderedNode; disabled?: boolean }>();
const emit = defineEmits<{ action: [action: Action, options?: { validate?: boolean }] }>();

function click() {
  const action = props.node.props['on-click-action'] as Action | undefined;
  if (action) emit('action', action, { validate: false });
}
</script>

<template>
  <button class="wa-link" type="button" :disabled="disabled" @click="click">{{ node.props.text }}</button>
</template>

<style scoped>
.wa-link {
  align-self: flex-start;
  border: 0;
  background: transparent;
  padding: 0;
  color: var(--wa-green-dark);
  font-size: 15px;
  font-family: inherit;
  cursor: pointer;
  text-decoration: underline;
}
</style>
