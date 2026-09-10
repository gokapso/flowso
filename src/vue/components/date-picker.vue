<script setup lang="ts">
import { computed } from 'vue';
import type { RenderedNode } from '../../runtime/types';
import FieldWrapper from './field-wrapper.vue';
import { nextId } from './data-source';

const props = defineProps<{ node: RenderedNode; disabled?: boolean }>();
const emit = defineEmits<{ input: [value: unknown] }>();
const id = nextId('wa-date');

/** Flow JSON dates are ISO `YYYY-MM-DD` (v5.0+) or epoch milliseconds (older). Render as ISO. */
function toIso(value: unknown): string {
  if (typeof value === 'number') return new Date(value).toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d+$/.test(value)) return new Date(Number(value)).toISOString().slice(0, 10);

  return typeof value === 'string' ? value : '';
}

const value = computed(() => toIso(props.node.value));
const min = computed(() => toIso(props.node.props['min-date']) || undefined);
const max = computed(() => toIso(props.node.props['max-date']) || undefined);
</script>

<template>
  <FieldWrapper
    :label="String(node.props.label ?? '')"
    :helper="node.props['helper-text'] ? String(node.props['helper-text']) : undefined"
    :error="node.error"
    :required="node.props.required === true"
    :input-id="id"
  >
    <input
      :id="id"
      class="wa-input"
      type="date"
      :value="value"
      :min="min"
      :max="max"
      :disabled="disabled || node.props.enabled === false"
      @input="emit('input', ($event.target as HTMLInputElement).value || undefined)"
    />
  </FieldWrapper>
</template>
