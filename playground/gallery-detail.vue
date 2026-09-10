<script setup lang="ts">
import type { GalleryState } from './use-gallery';
import type { FlowJson } from '../src/schema/flow-json';

const props = defineProps<{ gallery: GalleryState; hasFlow: boolean }>();
const emit = defineEmits<{ insert: [flow: FlowJson, path: string] }>();

function insert() {
  const result = props.gallery.insert();
  if (result) emit('insert', result.flow, result.path);
}
</script>

<template>
  <div v-if="gallery.entry.value" class="gal__detail">
    <h2 class="gal__name">{{ gallery.entry.value.name }}</h2>
    <p class="gal__desc">{{ gallery.entry.value.description }}</p>
    <ul v-if="gallery.entry.value.limits?.length" class="gal__limits">
      <li v-for="limit in gallery.entry.value.limits" :key="limit">{{ limit }}</li>
    </ul>
    <div class="pg__muted">
      Flow JSON {{ gallery.entry.value.minVersion }} or newer ·
      <a :href="gallery.entry.value.docsUrl" target="_blank" rel="noreferrer">Meta docs</a>
    </div>
    <textarea v-model="gallery.snippetSource.value" class="gal__json" spellcheck="false" />
    <div v-if="gallery.snippetError.value" class="bad">{{ gallery.snippetError.value }}</div>
    <div v-for="(issue, i) in gallery.previewIssues.value" :key="i" class="bad">{{ issue.error }}: {{ issue.message }}</div>
    <div class="gal__actions">
      <button class="pg__btn" type="button" @click="gallery.copyJson()">Copy JSON</button>
      <template v-if="gallery.entry.value.placement === 'component'">
        <select v-model="gallery.targetScreen.value" :disabled="!gallery.screens.value.length">
          <option v-for="screen in gallery.screens.value" :key="screen.id" :value="screen.id">{{ screen.id }}</option>
        </select>
        <button class="pg__btn pg__btn--primary" type="button" :disabled="!hasFlow || !gallery.parsedSnippet.value" @click="insert">Insert into screen</button>
      </template>
      <button v-else class="pg__btn pg__btn--primary" type="button" :disabled="!hasFlow || !gallery.parsedSnippet.value" @click="insert">Add as new screen</button>
    </div>
    <div v-if="gallery.message.value" class="pg__muted">{{ gallery.message.value }}</div>
  </div>
</template>
