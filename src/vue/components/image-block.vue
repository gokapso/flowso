<script setup lang="ts">
import { computed } from 'vue';
import type { RenderedNode } from '../../runtime/types';

const props = defineProps<{ node: RenderedNode; disabled?: boolean }>();

const src = computed(() => {
  const value = String(props.node.props.src ?? '');
  if (value.startsWith('http') || value.startsWith('data:')) return value;

  return `data:image/png;base64,${value}`;
});
const style = computed(() => ({
  width: typeof props.node.props.width === 'number' ? `${props.node.props.width}px` : '100%',
  height: typeof props.node.props.height === 'number' ? `${props.node.props.height}px` : undefined,
  aspectRatio: typeof props.node.props['aspect-ratio'] === 'number' ? String(props.node.props['aspect-ratio']) : undefined,
  objectFit: (props.node.props['scale-type'] === 'contain' ? 'contain' : 'cover') as 'contain' | 'cover',
}));
</script>

<template>
  <img class="wa-image" :src="src" :alt="String(node.props['alt-text'] ?? '')" :style="style" />
</template>

<style scoped>
.wa-image {
  display: block;
  max-width: 100%;
  border-radius: var(--wa-radius);
  background: var(--wa-bg-muted);
}
</style>
