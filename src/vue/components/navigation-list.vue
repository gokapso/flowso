<script setup lang="ts">
import { computed } from 'vue';
import type { Action, NavigationListItem } from '../../schema/flow-json';
import type { RenderedNode } from '../../runtime/types';
import { imageSrc } from './data-source';

const props = defineProps<{ node: RenderedNode; disabled?: boolean }>();
const emit = defineEmits<{ action: [action: Action, options?: { validate?: boolean }] }>();

const items = computed(() => (Array.isArray(props.node.props['list-items']) ? (props.node.props['list-items'] as NavigationListItem[]) : []));

function click(item: NavigationListItem) {
  const action = (item['on-click-action'] ?? props.node.props['on-click-action']) as Action | undefined;
  if (action) emit('action', action, { validate: false });
}
</script>

<template>
  <div class="wa-nav-list">
    <button v-for="item in items" :key="item.id" type="button" class="wa-nav-item" :disabled="disabled" @click="click(item)">
      <img v-if="item.start?.image" class="wa-nav-item__image" :src="imageSrc(item.start.image)" :alt="item.start['alt-text'] ?? ''" />
      <span class="wa-nav-item__main">
        <span class="wa-nav-item__title">{{ item['main-content'].title }}</span>
        <span v-if="item['main-content'].description" class="wa-nav-item__description">{{ item['main-content'].description }}</span>
        <span v-if="item['main-content'].metadata" class="wa-nav-item__description">{{ item['main-content'].metadata }}</span>
        <span v-if="item.tags?.length" class="wa-nav-item__tags"><span v-for="tag in item.tags" :key="tag" class="wa-nav-item__tag">{{ tag }}</span></span>
      </span>
      <span v-if="item.end" class="wa-nav-item__end">
        <span class="wa-nav-item__title">{{ item.end.title }}</span>
        <span v-if="item.end.description" class="wa-nav-item__description">{{ item.end.description }}</span>
      </span>
      <span v-if="item.badge" class="wa-nav-item__badge">{{ item.badge }}</span>
      <span class="wa-nav-item__chevron">›</span>
    </button>
  </div>
</template>

<style scoped>
.wa-nav-list {
  display: flex;
  flex-direction: column;
}
.wa-nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 0;
  border: 0;
  border-bottom: 1px solid var(--wa-border);
  background: transparent;
  color: var(--wa-text);
  text-align: left;
  font-family: inherit;
  cursor: pointer;
}
.wa-nav-item:last-child {
  border-bottom: 0;
}
.wa-nav-item__image {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--wa-bg-muted);
}
.wa-nav-item__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.wa-nav-item__end {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.wa-nav-item__title {
  font-size: 15px;
}
.wa-nav-item__description {
  font-size: 13px;
  color: var(--wa-text-muted);
}
.wa-nav-item__tags {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}
.wa-nav-item__tag,
.wa-nav-item__badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 10px;
  background: var(--wa-bg-muted);
  color: var(--wa-text-muted);
}
.wa-nav-item__chevron {
  color: var(--wa-text-muted);
  font-size: 20px;
}
</style>
