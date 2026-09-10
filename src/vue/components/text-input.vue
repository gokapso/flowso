<script setup lang="ts">
import { computed } from 'vue';
import type { RenderedNode } from '../../runtime/types';
import FieldWrapper from './field-wrapper.vue';
import { nextId } from './data-source';

const props = defineProps<{ node: RenderedNode; disabled?: boolean }>();
const emit = defineEmits<{ input: [value: unknown] }>();
const id = nextId('wa-text-input');

const inputType = computed(() => {
  const type = props.node.props['input-type'];
  if (type === 'password' || type === 'passcode') return 'password';
  if (type === 'email') return 'email';
  if (type === 'phone') return 'tel';
  if (type === 'number') return 'number';

  return 'text';
});
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
    <input
      :id="id"
      class="wa-input"
      :type="inputType"
      :value="node.value ?? ''"
      :disabled="disabled || node.props.enabled === false"
      :maxlength="typeof node.props['max-chars'] === 'number' ? node.props['max-chars'] : undefined"
      :inputmode="node.props['input-type'] === 'passcode' ? 'numeric' : undefined"
      @input="emit('input', ($event.target as HTMLInputElement).value)"
    />
  </FieldWrapper>
</template>
