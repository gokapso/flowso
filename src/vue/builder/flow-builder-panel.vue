<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Component, FlowJson } from '../../schema/flow-json';
import { COMPONENT_CATALOG } from '../../catalog/component-catalog';
import { insertComponent, insertScreen } from '../../catalog/insert-component';
import { newBuilderScreen, parseBuilderFlow, removeBuilderScreen, reorderItem } from '../../catalog/builder';
import ComponentList from './component-list.vue';
import ContentMenu from './content-menu.vue';
import './builder.css';

const props = defineProps<{ modelValue: string; disabled?: boolean; screenId?: string | null }>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; 'select-screen': [id: string] }>();
const mode = ref<'visual' | 'json'>('visual');
const selectedId = ref('');
const error = ref('');
const dragged = ref<number | null>(null);
const over = ref<number | null>(null);
const parsed = computed(() => {
  try { return { flow: parseBuilderFlow(props.modelValue), error: '' }; }
  catch (failure) { return { flow: null, error: failure instanceof Error ? failure.message : 'Invalid JSON' }; }
});
const flow = computed(() => parsed.value.flow);
const screen = computed(() => flow.value?.screens.find((item) => item.id === selectedId.value));

watch([flow, () => props.screenId], ([value, requested]) => {
  if (!value) return;
  if (requested && value.screens.some((item) => item.id === requested)) selectedId.value = requested;
  if (!value.screens.some((item) => item.id === selectedId.value)) selectedId.value = value.screens[0]?.id ?? '';
}, { immediate: true });

function select(id: string) { selectedId.value = id; error.value = ''; emit('select-screen', id); }
function apply(next: FlowJson) {
  if (props.disabled) return;
  error.value = '';
  emit('update:modelValue', JSON.stringify(next, null, 2));
}
function updateChildren(children: Component[]) {
  if (!flow.value || !screen.value) return;
  apply({ ...flow.value, screens: flow.value.screens.map((item) => item.id === selectedId.value ? { ...item, layout: { ...item.layout, children } } : item) });
}
function updateTitle(title: string) {
  if (flow.value) apply({ ...flow.value, screens: flow.value.screens.map((item) => item.id === selectedId.value ? { ...item, title } : item) });
}
function addScreen() {
  if (!flow.value) return;
  const result = insertScreen(flow.value, newBuilderScreen(flow.value));
  if (result.ok) { apply(result.flow); select(result.screenId); }
}
function removeScreen(id: string) {
  if (!flow.value) return;
  const result = removeBuilderScreen(flow.value, id);
  if (!result.ok) { error.value = result.error; return; }
  const nextId = selectedId.value === id ? result.flow.screens[0]!.id : selectedId.value;
  apply(result.flow); select(nextId);
}
function moveScreen(from: number, to: number) {
  if (!flow.value || props.disabled) return;
  apply({ ...flow.value, screens: reorderItem(flow.value.screens, from, to) });
}
function startDrag(index: number, event: DragEvent) {
  dragged.value = index;
  if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); }
}
function dragOver(index: number, event: DragEvent) {
  if (dragged.value === null) return;
  event.preventDefault(); over.value = index;
}
function drop(index: number) {
  if (dragged.value !== null) moveScreen(dragged.value, index);
  dragged.value = null; over.value = null;
}
function addComponent(id: string) {
  const entry = COMPONENT_CATALOG.find((item) => item.id === id);
  if (!flow.value || !entry || entry.placement !== 'component' || !entry.component) return;
  const result = insertComponent(flow.value, entry.component, { screenId: selectedId.value });
  if (!result.ok) { error.value = result.error; return; }
  apply(result.flow);
}
function setSource(value: string) { if (!props.disabled) emit('update:modelValue', value); }
</script>

<template>
  <section class="flow-builder" aria-label="Flow builder">
    <div class="fb-toolbar">
      <strong>Edit flow</strong>
      <div class="fb-toggle" role="group" aria-label="Editor mode">
        <button type="button" :aria-pressed="mode === 'visual'" @click="mode = 'visual'">Visual</button>
        <button type="button" :aria-pressed="mode === 'json'" @click="mode = 'json'">JSON</button>
      </div>
    </div>
    <div v-if="mode === 'json'" class="fb-json">
      <slot name="json" :value="modelValue" :update="setSource">
        <textarea aria-label="Flow JSON" :value="modelValue" :readonly="disabled" spellcheck="false" @input="setSource(($event.target as HTMLTextAreaElement).value)" />
      </slot>
    </div>
    <div v-else-if="!flow" class="fb-scroll"><p class="fb-error" role="alert">{{ parsed.error }}</p><button type="button" @click="mode = 'json'">Edit JSON</button></div>
    <div v-else class="fb-scroll">
      <p v-if="disabled" class="fb-muted">Published flow · read only</p>
      <div class="fb-section-head"><h3>Screens</h3><span class="fb-muted">{{ flow.screens.length }}</span></div>
      <div role="list" aria-label="Screens">
        <div v-for="(item, index) in flow.screens" :key="item.id" role="listitem" class="fb-screen fb-row" :class="{ 'fb-screen--selected': item.id === selectedId, 'fb-component--over': over === index }" @dragover="dragOver(index, $event)" @drop.prevent="drop(index)">
          <button type="button" class="fb-grip" :draggable="!disabled" :disabled="disabled" :aria-label="`Drag screen ${item.title || item.id}. Alt+Arrow keys to move.`" @dragstart="startDrag(index, $event)" @dragend="dragged = null; over = null" @keydown.alt.up.prevent="moveScreen(index, index - 1)" @keydown.alt.down.prevent="moveScreen(index, index + 1)">⠿</button>
          <button type="button" class="fb-row-title" :aria-pressed="item.id === selectedId" @click="select(item.id)"><span>{{ item.title || item.id }}</span></button>
          <button type="button" class="fb-icon" :disabled="disabled || flow.screens.length <= 1" :aria-label="`Remove screen ${item.title || item.id}`" @click="removeScreen(item.id)">×</button>
        </div>
      </div>
      <button type="button" class="fb-add" :disabled="disabled" @click="addScreen">+ Add screen</button>
      <p v-if="error" role="alert" class="fb-error">{{ error }}</p>
      <template v-if="screen">
        <div class="fb-section-head fb-section-head--content"><h3>Edit content</h3><code class="fb-muted">{{ screen.id }}</code></div>
        <label class="fb-field fb-screen-title"><span>Screen title</span><input :value="screen.title ?? ''" :disabled="disabled" @change="updateTitle(($event.target as HTMLInputElement).value)" /></label>
        <ComponentList :key="screen.id" :components="screen.layout.children" :disabled="disabled" @update="updateChildren" />
        <ContentMenu :key="screen.id" :disabled="disabled" @select="addComponent" />
      </template>
    </div>
  </section>
</template>
