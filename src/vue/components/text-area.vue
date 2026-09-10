<script setup lang="ts">
import type { RenderedNode } from '../../runtime/types';
import FieldWrapper from './field-wrapper.vue';
import { nextId } from './data-source';

defineProps<{ node: RenderedNode; disabled?: boolean }>();
const emit = defineEmits<{ input: [value: unknown] }>();
const id = nextId('wa-text-area');
</script>

<template>
  <FieldWrapper
    :label="String(node.props.label ?? '')"
    :helper="node.props['helper-text'] ? String(node.props['helper-text']) : undefined"
    :error="node.error"
    :required="node.props.required === true"
    :large="node.props['label-variant'] === 'large'"
    :input-id="id"
  >
    <textarea
      :id="id"
      class="wa-input wa-textarea"
      rows="3"
      :value="String(node.value ?? '')"
      :disabled="disabled || node.props.enabled === false"
      :maxlength="typeof node.props['max-length'] === 'number' ? node.props['max-length'] : undefined"
      @input="emit('input', ($event.target as HTMLTextAreaElement).value)"
    />
  </FieldWrapper>
</template>

<style scoped>
.wa-textarea {
  resize: vertical;
  min-height: 72px;
}
</style>
