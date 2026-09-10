<script setup lang="ts">
import type { GalleryState } from './use-gallery';
import type { CatalogCategory } from '../src/catalog/component-catalog';

defineProps<{ gallery: GalleryState }>();

const ICONS: Record<CatalogCategory, string> = {
  text: 'Aa',
  media: '▣',
  input: '▭',
  selection: '◉',
  datetime: '▦',
  action: '➜',
  logic: '⑂',
  pattern: '▤',
};
</script>

<template>
  <div class="gal-list">
    <input v-model="gallery.search.value" class="gal__search" type="search" placeholder="Search components and patterns…" />
    <div class="gal-list__hint">Hover to peek in the phone, click to select.</div>
    <nav class="gal-list__items" @mouseleave="gallery.hoveredId.value = null">
      <div v-for="category in gallery.grouped.value" :key="category.id" class="gal__group">
        <div class="gal__group-title">{{ category.label }}</div>
        <button
          v-for="item in category.entries"
          :key="item.id"
          type="button"
          class="gal__item"
          :class="{ 'gal__item--active': item.id === gallery.selectedId.value, 'gal__item--peek': item.id === gallery.hoveredId.value }"
          :title="item.description"
          @mouseenter="gallery.hoveredId.value = item.id"
          @click="gallery.selectedId.value = item.id"
        >
          <span class="gal__icon" :class="`gal__icon--${category.id}`" aria-hidden="true">{{ ICONS[category.id] }}</span>
          <span class="gal__label">{{ item.name }}</span>
          <span
            class="gal__version"
            :class="{ 'gal__version--unsupported': gallery.needsNewerVersion(item) }"
            :title="gallery.needsNewerVersion(item) ? `Needs Flow JSON ${item.minVersion} or newer; your flow is ${gallery.flowVersion.value}` : `Available since Flow JSON ${item.minVersion}`"
          >v{{ item.minVersion }}+</span>
        </button>
      </div>
    </nav>
  </div>
</template>
