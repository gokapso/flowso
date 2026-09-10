<script setup lang="ts">
import { computed } from 'vue';
import type { RenderedNode } from '../../runtime/types';
import FieldWrapper from './field-wrapper.vue';
import { dataSourceItems, nextId } from './data-source';

const props = defineProps<{ node: RenderedNode; disabled?: boolean }>();
const emit = defineEmits<{ input: [value: unknown] }>();
const id = nextId('wa-dropdown');
const items = computed(() => dataSourceItems(props.node.props['data-source']));
</script>

<template>
  <FieldWrapper
    :label="String(node.props.label ?? '')"
    :helper="node.props.description ? String(node.props.description) : undefined"
    :error="node.error"
    :required="node.props.required === true"
    :input-id="id"
  >
    <select
      :id="id"
      class="wa-input"
      :value="node.value ?? ''"
      :disabled="disabled || node.props.enabled === false"
      @change="emit('input', ($event.target as HTMLSelectElement).value || undefined)"
    >
      <option value="">Select…</option>
      <option v-for="item in items" :key="item.id" :value="item.id" :disabled="item.enabled === false">
        {{ item.title }}{{ item.description ? ` — ${item.description}` : '' }}
      </option>
    </select>
  </FieldWrapper>
</template>
