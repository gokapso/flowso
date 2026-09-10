<script setup lang="ts">
import { computed } from 'vue';
import type { RenderedNode } from '../../runtime/types';
import FieldWrapper from './field-wrapper.vue';
import { dataSourceItems, imageSrc, nextId } from './data-source';

const props = defineProps<{ node: RenderedNode; disabled?: boolean }>();
const emit = defineEmits<{ input: [value: unknown] }>();
const group = nextId('wa-radio');

const items = computed(() => dataSourceItems(props.node.props['data-source']));
const large = computed(() => props.node.props['media-size'] === 'large');
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
          class="wa-option__control wa-option__control--end"
          type="radio"
          :name="group"
          :value="item.id"
          :checked="node.value === item.id"
          :disabled="item.enabled === false || disabled || node.props.enabled === false"
          @change="emit('input', item.id)"
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
