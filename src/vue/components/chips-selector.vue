<script setup lang="ts">
import { computed } from 'vue';
import type { RenderedNode } from '../../runtime/types';
import FieldWrapper from './field-wrapper.vue';
import { dataSourceItems } from './data-source';

const props = defineProps<{ node: RenderedNode; disabled?: boolean }>();
const emit = defineEmits<{ input: [value: unknown] }>();

const items = computed(() => dataSourceItems(props.node.props['data-source']));
const selected = computed(() => (Array.isArray(props.node.value) ? (props.node.value as string[]) : []));

function toggle(id: string) {
  const next = selected.value.includes(id) ? selected.value.filter((item) => item !== id) : [...selected.value, id];
  emit('input', next);
}
</script>

<template>
  <FieldWrapper
    :label="String(node.props.label ?? '')"
    :helper="node.props.description ? String(node.props.description) : undefined"
    :error="node.error"
    :required="node.props.required === true"
  >
    <div class="wa-chips">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="wa-chip"
        :class="{ 'wa-chip--selected': selected.includes(item.id) }"
        :disabled="item.enabled === false || disabled || node.props.enabled === false"
        :aria-pressed="selected.includes(item.id)"
        @click="toggle(item.id)"
      >
        {{ item.title }}
      </button>
    </div>
  </FieldWrapper>
</template>

<style scoped>
.wa-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.wa-chip {
  padding: 8px 14px;
  border-radius: 20px;
  border: 1px solid var(--wa-border);
  background: var(--wa-bg);
  color: var(--wa-text);
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
}
.wa-chip--selected {
  background: var(--wa-green);
  border-color: var(--wa-green);
  color: #fff;
}
.wa-chip:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
