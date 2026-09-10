<script setup lang="ts">
import type { GalleryState } from './use-gallery';

defineProps<{ gallery: GalleryState }>();
</script>

<template>
  <div class="gal-list">
    <input v-model="gallery.search.value" class="gal__search" type="search" placeholder="Search components and patterns…" />
    <nav class="gal-list__items">
      <div v-for="category in gallery.grouped.value" :key="category.id" class="gal__group">
        <div class="gal__group-title">{{ category.label }}</div>
        <button
          v-for="item in category.entries"
          :key="item.id"
          type="button"
          class="gal__item"
          :class="{ 'gal__item--active': item.id === gallery.selectedId.value }"
          @click="gallery.selectedId.value = item.id"
        >
          {{ item.name }}
          <span class="gal__version">{{ item.minVersion }}+</span>
        </button>
      </div>
    </nav>
  </div>
</template>
