<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { RenderedNode } from '../../runtime/types';

const props = defineProps<{ node: RenderedNode; disabled?: boolean }>();
const index = ref(0);
const images = computed(() => (Array.isArray(props.node.props.images) ? (props.node.props.images as Array<{ src: string; 'alt-text'?: string }>) : []));
const current = computed(() => images.value[index.value]);
watch(images, (list) => {
  if (index.value >= list.length) index.value = 0;
});

function srcFor(value: string): string {
  return value.startsWith('http') || value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
}
</script>

<template>
  <div class="wa-carousel">
    <img v-if="current" class="wa-carousel__image" :src="srcFor(current.src)" :alt="current['alt-text'] ?? ''" />
    <div v-if="images.length > 1" class="wa-carousel__dots">
      <button
        v-for="(_, i) in images"
        :key="i"
        type="button"
        class="wa-carousel__dot"
        :class="{ 'wa-carousel__dot--active': i === index }"
        :aria-label="`Image ${i + 1}`"
        @click="index = i"
      />
    </div>
  </div>
</template>

<style scoped>
.wa-carousel__image {
  display: block;
  width: 100%;
  border-radius: var(--wa-radius);
  background: var(--wa-bg-muted);
  object-fit: cover;
}
.wa-carousel__dots {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-top: 8px;
}
.wa-carousel__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 0;
  background: var(--wa-border);
  cursor: pointer;
  padding: 0;
}
.wa-carousel__dot--active {
  background: var(--wa-green);
}
</style>
