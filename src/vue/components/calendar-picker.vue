<script setup lang="ts">
import { computed } from 'vue';
import type { RenderedNode } from '../../runtime/types';
import FieldWrapper from './field-wrapper.vue';
import { nextId } from './data-source';

const props = defineProps<{ node: RenderedNode; disabled?: boolean }>();
const emit = defineEmits<{ input: [value: unknown] }>();
const id = nextId('wa-calendar');

const isRange = computed(() => props.node.props.mode === 'range');
const current = computed(() => {
  const value = props.node.value as { 'start-date'?: string; 'end-date'?: string } | string | undefined;
  if (isRange.value && value && typeof value === 'object') return value;

  return { 'start-date': typeof value === 'string' ? value : undefined, 'end-date': undefined };
});

function setStart(date: string) {
  if (!isRange.value) {
    emit('input', date || undefined);

    return;
  }
  emit('input', { ...current.value, 'start-date': date || undefined });
}

function setEnd(date: string) {
  emit('input', { ...current.value, 'end-date': date || undefined });
}
</script>

<template>
  <FieldWrapper
    :label="String(node.props.label ?? node.props.title ?? '')"
    :helper="node.props['helper-text'] ? String(node.props['helper-text']) : node.props.description ? String(node.props.description) : undefined"
    :error="node.error"
    :required="node.props.required === true"
    :input-id="id"
  >
    <div class="wa-calendar">
      <input
        :id="id"
        class="wa-input"
        type="date"
        :value="current['start-date'] ?? ''"
        :min="node.props['min-date'] ? String(node.props['min-date']) : undefined"
        :max="node.props['max-date'] ? String(node.props['max-date']) : undefined"
        :disabled="disabled || node.props.enabled === false"
        @input="setStart(($event.target as HTMLInputElement).value)"
      />
      <input
        v-if="isRange"
        class="wa-input"
        type="date"
        aria-label="End date"
        :value="current['end-date'] ?? ''"
        :min="current['start-date'] ?? undefined"
        :max="node.props['max-date'] ? String(node.props['max-date']) : undefined"
        :disabled="disabled || node.props.enabled === false"
        @input="setEnd(($event.target as HTMLInputElement).value)"
      />
    </div>
  </FieldWrapper>
</template>

<style scoped>
.wa-calendar {
  display: flex;
  gap: 8px;
}
</style>
