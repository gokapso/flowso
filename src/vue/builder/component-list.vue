<script setup lang="ts">
import { ref } from 'vue';
import type { Component } from '../../schema/flow-json';
import { reorderComponents } from '../../catalog/builder';
import ComponentFields from './component-fields.vue';

const props = withDefaults(defineProps<{ components: Component[]; disabled?: boolean; depth?: number }>(), { depth: 0 });
const emit = defineEmits<{ update: [components: Component[]] }>();
const expanded = ref<number | null>(null);
const dragged = ref<number | null>(null);
const over = ref<number | null>(null);
const labels: Record<string, string> = {
  TextHeading: 'Heading', TextSubheading: 'Subheading', TextBody: 'Text', TextCaption: 'Caption',
  TextInput: 'Text input', TextArea: 'Paragraph', RadioButtonsGroup: 'Single choice',
  CheckboxGroup: 'Multiple choice', Footer: 'Button', EmbeddedLink: 'Link',
};
function title(component: Component) { return labels[component.type] ?? component.type; }
function summary(component: Component) { return String(component.text ?? component.label ?? component.name ?? ''); }
function replace(index: number, component: Component) { emit('update', props.components.map((item, i) => i === index ? component : item)); }
function move(from: number, to: number) {
  const next = reorderComponents(props.components, from, to);
  if (next === props.components) return;
  expanded.value = null;
  emit('update', next);
}
function canMove(index: number, target: number) {
  return !props.disabled && props.components[index]?.type !== 'Footer'
    && target >= 0 && target < props.components.length && props.components[target]?.type !== 'Footer';
}
function start(index: number, event: DragEvent) {
  dragged.value = index;
  if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); }
}
function dragOver(index: number, event: DragEvent) {
  if (dragged.value === null || !canMove(dragged.value, index)) return;
  event.preventDefault();
  over.value = index;
}
function drop(index: number) {
  if (dragged.value !== null && canMove(dragged.value, index)) move(dragged.value, index);
  dragged.value = null; over.value = null;
}
function branches(component: Component): Array<{ name: string; items: Component[] }> {
  if (component.type === 'Form') return [{ name: 'children', items: component.children }];
  if (component.type === 'If') return [{ name: 'then', items: component.then }, { name: 'else', items: component.else ?? [] }];
  if (component.type === 'Switch') return Object.entries(component.cases).map(([name, items]) => ({ name, items }));
  return [];
}
function updateBranch(index: number, component: Component, name: string, items: Component[]) {
  replace(index, component.type === 'Switch' ? { ...component, cases: { ...component.cases, [name]: items } } : { ...component, [name]: items } as Component);
}
</script>

<template>
  <div class="fb-components" :class="{ 'fb-components--nested': depth > 0 }" role="list" aria-label="Components">
    <div v-for="(component, index) in components" :key="`${index}:${component.type}`" class="fb-component" :class="{ 'fb-component--over': over === index, 'fb-component--open': expanded === index }" role="listitem" @dragover.stop="dragOver(index, $event)" @drop.prevent.stop="drop(index)">
      <div class="fb-row">
        <button v-if="component.type !== 'Footer'" type="button" class="fb-grip" :draggable="!disabled" :disabled="disabled" :aria-label="`Drag ${title(component)}. Alt+Arrow keys to move.`" @dragstart.stop="start(index, $event)" @dragend="dragged = null; over = null" @keydown.alt.up.prevent="canMove(index, index - 1) && move(index, index - 1)" @keydown.alt.down.prevent="canMove(index, index + 1) && move(index, index + 1)">⠿</button>
        <button type="button" class="fb-row-title" :aria-expanded="expanded === index" @click="expanded = expanded === index ? null : index">
          <span>{{ title(component) }}</span><span class="fb-summary">{{ summary(component) }}</span><span aria-hidden="true">{{ expanded === index ? '⌃' : '⌄' }}</span>
        </button>
      </div>
      <div v-if="expanded === index" class="fb-component-body">
        <ComponentFields :component="component" :disabled="disabled" @update="replace(index, $event)" />
        <div class="fb-actions">
          <button type="button" :disabled="!canMove(index, index - 1)" aria-label="Move component up" @click="move(index, index - 1)">↑ Move up</button>
          <button type="button" :disabled="!canMove(index, index + 1)" aria-label="Move component down" @click="move(index, index + 1)">↓ Move down</button>
          <button type="button" :disabled="disabled" class="fb-remove" @click="expanded = null; emit('update', components.filter((_, i) => i !== index))">Remove</button>
        </div>
      </div>
      <div v-for="branch in branches(component)" :key="branch.name" class="fb-branch">
        <span class="fb-branch-label">{{ component.type === 'Form' ? 'Form content' : branch.name }}</span>
        <ComponentList :components="branch.items" :disabled="disabled" :depth="depth + 1" @update="updateBranch(index, component, branch.name, $event)" />
        <p v-if="!branch.items.length" class="fb-muted">Empty branch · add content in JSON</p>
      </div>
    </div>
  </div>
</template>
