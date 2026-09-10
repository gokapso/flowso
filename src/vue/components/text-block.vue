<script setup lang="ts">
import { computed } from 'vue';
import type { RenderedNode } from '../../runtime/types';
import { renderInlineMarkdown, textLines } from './markdown';

const props = defineProps<{ node: RenderedNode; disabled?: boolean }>();

const text = computed(() => textLines(props.node.props.text));
const html = computed(() => (props.node.props.markdown ? renderInlineMarkdown(text.value) : null));
const classes = computed(() => ({
  'wa-text--heading': props.node.type === 'TextHeading',
  'wa-text--subheading': props.node.type === 'TextSubheading',
  'wa-text--body': props.node.type === 'TextBody',
  'wa-text--caption': props.node.type === 'TextCaption',
  'wa-text--bold': props.node.props['font-weight'] === 'bold' || props.node.props['font-weight'] === 'bold_italic',
  'wa-text--italic': props.node.props['font-weight'] === 'italic' || props.node.props['font-weight'] === 'bold_italic',
  'wa-text--strike': props.node.props.strikethrough === true,
}));
</script>

<template>
  <p v-if="html !== null" class="wa-text" :class="classes" v-html="html" />
  <p v-else class="wa-text" :class="classes">{{ text }}</p>
</template>

<style scoped>
.wa-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
.wa-text--heading {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
}
.wa-text--subheading {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.35;
}
.wa-text--body {
  font-size: 15px;
  line-height: 1.45;
}
.wa-text--caption {
  font-size: 13px;
  line-height: 1.4;
  color: var(--wa-text-muted);
}
.wa-text--bold {
  font-weight: 700;
}
.wa-text--italic {
  font-style: italic;
}
.wa-text--strike {
  text-decoration: line-through;
}
</style>
