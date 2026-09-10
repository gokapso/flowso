<script setup lang="ts">
import { computed } from 'vue';
import type { RenderedNode } from '../../runtime/types';
import { renderBlockMarkdown, textLines } from './markdown';

const props = defineProps<{ node: RenderedNode; disabled?: boolean }>();
const html = computed(() => renderBlockMarkdown(textLines(props.node.props.text)));
</script>

<template>
  <div class="wa-rich-text" v-html="html" />
</template>

<style scoped>
.wa-rich-text {
  font-size: 15px;
  line-height: 1.45;
  word-break: break-word;
}
.wa-rich-text :deep(h1) { font-size: 22px; margin: 0 0 8px; }
.wa-rich-text :deep(h2) { font-size: 18px; margin: 0 0 8px; }
.wa-rich-text :deep(h3) { font-size: 16px; margin: 0 0 6px; }
.wa-rich-text :deep(p) { margin: 0 0 8px; }
.wa-rich-text :deep(ul),
.wa-rich-text :deep(ol) { margin: 0 0 8px; padding-left: 20px; }
</style>
