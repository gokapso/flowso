<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { FlowJson, Component, Screen } from '../src/schema/flow-json';
import { COMPONENT_CATALOG, CATALOG_CATEGORIES, type CatalogEntry } from '../src/catalog/component-catalog';
import { insertComponent, insertScreen, rewireNextTargets } from '../src/catalog/insert-component';
import { validateFlowJson } from '../src/validator/index';
import FlowPhone from '../src/vue/flow-phone.vue';

const props = defineProps<{ flow: FlowJson | null; open: boolean }>();
const emit = defineEmits<{ close: []; insert: [flow: FlowJson, path: string] }>();

const search = ref('');
const selectedId = ref(COMPONENT_CATALOG[0]?.id ?? '');
const targetScreen = ref('');
const snippetSource = ref('');
const snippetError = ref<string | null>(null);
const insertMessage = ref<string | null>(null);

const entry = computed(() => COMPONENT_CATALOG.find((item) => item.id === selectedId.value) ?? null);
const screens = computed(() => props.flow?.screens ?? []);

const grouped = computed(() => {
  const term = search.value.trim().toLowerCase();
  return CATALOG_CATEGORIES.map((category) => ({
    ...category,
    entries: COMPONENT_CATALOG.filter(
      (item) => item.category === category.id && (!term || `${item.name} ${item.description}`.toLowerCase().includes(term)),
    ),
  })).filter((category) => category.entries.length > 0);
});

watch(
  entry,
  (value) => {
    snippetSource.value = value ? JSON.stringify(value.placement === 'screen' ? value.screen : value.component, null, 2) : '';
    snippetError.value = null;
    insertMessage.value = null;
  },
  { immediate: true },
);

watch(
  () => props.flow,
  (flow) => {
    if (flow && !flow.screens.some((screen) => screen.id === targetScreen.value)) targetScreen.value = flow.screens[0]?.id ?? '';
  },
  { immediate: true },
);

/** Parsed snippet (editable by hand) or null when invalid. */
const parsedSnippet = computed<Component | Screen | null>(() => {
  try {
    const value = JSON.parse(snippetSource.value) as Component | Screen;
    snippetError.value = null;

    return value;
  } catch (error) {
    snippetError.value = error instanceof Error ? error.message : String(error);

    return null;
  }
});

/** A one-screen flow around the snippet so the real runtime renders it. */
const previewFlow = computed<FlowJson | null>(() => {
  const current = entry.value;
  const snippet = parsedSnippet.value;
  if (!current || !snippet) return null;
  if (current.placement === 'screen') {
    return { version: '7.3', routing_model: {}, screens: [rewireNextTargets(snippet as Screen, 'PREVIEW')] };
  }
  const component = rewireNextTargets(snippet as Component, 'PREVIEW');
  const children: Component[] = [...(current.previewContext ?? []), component];
  if (component.type !== 'Footer') {
    children.push({ type: 'Footer', label: 'Continue', 'on-click-action': { name: 'complete', payload: {} } });
  }

  return {
    version: '7.3',
    routing_model: {},
    screens: [{ id: 'PREVIEW', title: current.name, terminal: true, data: current.previewData, layout: { type: 'SingleColumnLayout', children } }],
  };
});

const previewIssues = computed(() => (previewFlow.value ? validateFlowJson(previewFlow.value).issues.filter((issue) => issue.severity === 'error') : []));

function copyJson() {
  void navigator.clipboard.writeText(snippetSource.value);
  insertMessage.value = 'Copied to clipboard';
}

function insert() {
  const current = entry.value;
  const snippet = parsedSnippet.value;
  if (!props.flow || !current || !snippet) return;
  const result = current.placement === 'screen'
    ? insertScreen(props.flow, snippet as Screen)
    : insertComponent(props.flow, snippet as Component, { screenId: targetScreen.value });
  if (!result.ok) {
    insertMessage.value = result.error;

    return;
  }
  emit('insert', result.flow, result.path);
  insertMessage.value = `Inserted at ${result.path}`;
}
</script>

<template>
  <div v-if="open" class="gal" role="dialog" aria-label="Component gallery">
    <div class="gal__bar">
      <strong>Components</strong>
      <input v-model="search" class="gal__search" type="search" placeholder="Search components and patterns…" />
      <span class="pg__muted">Pick one, see how it renders, edit its JSON, insert it into your flow.</span>
      <button class="pg__btn" type="button" @click="emit('close')">Close</button>
    </div>
    <div class="gal__main">
      <nav class="gal__list">
        <div v-for="category in grouped" :key="category.id" class="gal__group">
          <div class="gal__group-title">{{ category.label }}</div>
          <button
            v-for="item in category.entries"
            :key="item.id"
            type="button"
            class="gal__item"
            :class="{ 'gal__item--active': item.id === selectedId }"
            @click="selectedId = item.id"
          >
            {{ item.name }}
            <span class="gal__version">{{ item.minVersion }}+</span>
          </button>
        </div>
      </nav>

      <div class="gal__preview">
        <FlowPhone v-if="previewFlow && !previewIssues.length" :key="selectedId" :flow="previewFlow" />
        <div v-else class="gal__preview-error">
          <div v-for="(issue, i) in previewIssues" :key="i">{{ issue.error }}: {{ issue.message }}</div>
          <div v-if="snippetError">{{ snippetError }}</div>
        </div>
      </div>

      <div v-if="entry" class="gal__detail">
        <h2 class="gal__name">{{ entry.name }}</h2>
        <p class="gal__desc">{{ entry.description }}</p>
        <ul v-if="entry.limits?.length" class="gal__limits">
          <li v-for="limit in entry.limits" :key="limit">{{ limit }}</li>
        </ul>
        <div class="pg__muted">Flow JSON {{ entry.minVersion }} or newer · <a :href="entry.docsUrl" target="_blank" rel="noreferrer">Meta docs</a></div>
        <textarea v-model="snippetSource" class="gal__json" spellcheck="false" />
        <div v-if="snippetError" class="bad">{{ snippetError }}</div>
        <div class="gal__actions">
          <button class="pg__btn" type="button" @click="copyJson">Copy JSON</button>
          <template v-if="entry.placement === 'component'">
            <select v-model="targetScreen" :disabled="!screens.length">
              <option v-for="screen in screens" :key="screen.id" :value="screen.id">{{ screen.id }}</option>
            </select>
            <button class="pg__btn pg__btn--primary" type="button" :disabled="!flow || !parsedSnippet" @click="insert">Insert into screen</button>
          </template>
          <button v-else class="pg__btn pg__btn--primary" type="button" :disabled="!flow || !parsedSnippet" @click="insert">Add as new screen</button>
        </div>
        <div v-if="insertMessage" class="pg__muted">{{ insertMessage }}</div>
      </div>
    </div>
  </div>
</template>
