<script setup lang="ts">
import { computed } from 'vue';
import type { RenderedNode } from '../../runtime/types';
import FieldWrapper from './field-wrapper.vue';
import { dataSourceItems, imageSrc } from './data-source';

const props = defineProps<{ node: RenderedNode; disabled?: boolean }>();
const emit = defineEmits<{ input: [value: unknown] }>();

const items = computed(() => dataSourceItems(props.node.props['data-source']));
const selected = computed(() => (Array.isArray(props.node.value) ? (props.node.value as string[]) : []));
const large = computed(() => props.node.props['media-size'] === 'large');

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
    <div class="wa-options">
      <label
        v-for="item in items"
        :key="item.id"
        class="wa-option"
        :class="{ 'wa-option--large': large, 'wa-option--disabled': item.enabled === false || disabled || node.props.enabled === false }"
      >
        <input
          class="wa-option__control"
          type="checkbox"
          :checked="selected.includes(item.id)"
          :disabled="item.enabled === false || disabled || node.props.enabled === false"
          @change="toggle(item.id)"
        />
        <img v-if="item.image" class="wa-option__image" :src="imageSrc(item.image)" :alt="item['alt-text'] ?? ''" />
        <span>
          <div class="wa-option__title">{{ item.title }}</div>
          <div v-if="item.description" class="wa-option__description">{{ item.description }}</div>
          <div v-if="item.metadata" class="wa-option__description">{{ item.metadata }}</div>
        </span>
      </label>
    </div>
  </FieldWrapper>
</template>
