<script setup lang="ts">
import type { Action } from '../../schema/flow-json';
import type { RenderedNode } from '../../runtime/types';

const props = defineProps<{ node: RenderedNode; disabled?: boolean }>();
const emit = defineEmits<{ input: [value: unknown]; action: [action: Action, options?: { validate?: boolean }] }>();

function readMore() {
  if (props.disabled) return;
  const action = props.node.props['on-click-action'] as Action | undefined;
  if (action) emit('action', action, { validate: false });
}
</script>

<template>
  <div class="wa-optin" :class="{ 'wa-optin--error': !!node.error }">
    <label class="wa-option">
      <input
        class="wa-option__control"
        type="checkbox"
        :checked="node.value === true"
        :disabled="disabled"
        @change="emit('input', ($event.target as HTMLInputElement).checked)"
      />
      <span class="wa-option__title">
        {{ node.props.label }}
        <button v-if="node.props['on-click-action']" type="button" class="wa-optin__link" :disabled="disabled" @click="readMore">Read more</button>
      </span>
    </label>
    <div v-if="node.error" class="wa-field__error" role="alert">{{ node.error }}</div>
  </div>
</template>

<style scoped>
.wa-optin .wa-option {
  border-bottom: 0;
  padding: 0;
}
.wa-optin__link {
  border: 0;
  background: transparent;
  color: var(--wa-green-dark);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  padding: 0 0 0 6px;
  text-decoration: underline;
}
</style>
