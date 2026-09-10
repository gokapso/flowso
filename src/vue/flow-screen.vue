<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Action } from '../schema/flow-json';
import type { RenderedNode, RenderedScreen } from '../runtime/types';
import { componentFor } from './component-map';
import FooterButton from './components/footer-button.vue';
import type { ScreenEdit } from './edit-types';

const props = defineProps<{
  screen: RenderedScreen;
  loading?: boolean;
  /** Show a hover toolbar on every component to move or remove it (emits `edit`). */
  editable?: boolean;
}>();

const body = computed(() => props.screen.children.filter((node) => node.type !== 'Footer'));
const footer = computed(() => props.screen.children.find((node) => node.type === 'Footer'));

const emit = defineEmits<{
  action: [action: Action, options?: { validate?: boolean }];
  input: [name: string, value: unknown];
  edit: [edit: ScreenEdit];
}>();

/** Components with no click or typing behaviour: the whole card is the drag handle. */
const STATIC_TYPES = new Set(['TextHeading', 'TextSubheading', 'TextBody', 'TextCaption', 'RichText', 'Image', 'ImageCarousel']);

function isStatic(node: RenderedNode): boolean {
  return STATIC_TYPES.has(node.type);
}

function edit(kind: 'up' | 'down' | 'remove' | 'select', node: RenderedNode) {
  emit('edit', { kind, node, screenId: props.screen.id });
}

// Drag and drop (native HTML5) ---------------------------------------------
const dragging = ref<RenderedNode | null>(null);
const dropTarget = ref<{ path: string; position: 'before' | 'after' } | null>(null);

function onDragStart(node: RenderedNode, event: DragEvent) {
  dragging.value = node;
  event.dataTransfer?.setData('text/plain', node.path);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function positionFor(node: RenderedNode, event: DragEvent): 'before' | 'after' {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();

  return node.type === 'Footer' || event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

function onDragOver(node: RenderedNode, event: DragEvent) {
  if (!dragging.value || dragging.value.path === node.path) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  dropTarget.value = { path: node.path, position: positionFor(node, event) };
}

function onDragLeave(node: RenderedNode, event: DragEvent) {
  // Moving between children of the same wrapper also fires dragleave; only clear when really leaving.
  const wrapper = event.currentTarget as HTMLElement;
  if (dropTarget.value?.path === node.path && !wrapper.contains(event.relatedTarget as Node | null)) dropTarget.value = null;
}

function onDrop(node: RenderedNode, event: DragEvent) {
  event.preventDefault();
  const source = dragging.value;
  dragging.value = null;
  dropTarget.value = null;
  if (!source || source.path === node.path) return;
  emit('edit', { kind: 'move', node: source, screenId: props.screen.id, target: { path: node.path, position: positionFor(node, event) } });
}

function onDragEnd() {
  dragging.value = null;
  dropTarget.value = null;
}

function dropClass(node: RenderedNode) {
  if (!dropTarget.value || dropTarget.value.path !== node.path) return null;

  return dropTarget.value.position === 'before' ? 'wa-edit--drop-before' : 'wa-edit--drop-after';
}

function onAction(action: Action, options?: { validate?: boolean }) {
  emit('action', action, options);
}

function onInput(node: RenderedNode, value: unknown) {
  if (node.name) emit('input', node.name, value);
}
</script>

<template>
  <div class="wa-screen" :class="{ 'wa-screen--loading': loading }">
    <div class="wa-screen__body">
      <div v-if="screen.errorMessage" class="wa-screen__error" role="alert">{{ screen.errorMessage }}</div>
      <template v-for="(node, index) in body" :key="`${screen.id}:${node.key}`">
        <div
          v-if="editable"
          class="wa-edit"
          :class="[dropClass(node), { 'wa-edit--dragging': dragging?.path === node.path, 'wa-edit--grab': isStatic(node) }]"
          :data-path="node.path"
          :draggable="isStatic(node)"
          :title="isStatic(node) ? 'Drag to reorder' : undefined"
          @click.self="edit('select', node)"
          @dragstart="isStatic(node) && onDragStart(node, $event)"
          @dragend="onDragEnd"
          @dragover="onDragOver(node, $event)"
          @dragleave="onDragLeave(node, $event)"
          @drop="onDrop(node, $event)"
        >
          <component
            :is="componentFor(node.type)"
            :node="node"
            :disabled="loading"
            @action="onAction"
            @input="(value: unknown) => onInput(node, value)"
          />
          <div class="wa-edit__bar" role="toolbar" :aria-label="`Edit ${node.type}`">
            <span
              class="wa-edit__btn wa-edit__btn--grip"
              draggable="true"
              title="Drag to reorder"
              @dragstart="onDragStart(node, $event)"
              @dragend="onDragEnd"
            >⋮⋮</span>
            <span class="wa-edit__type">{{ node.type }}</span>
            <button type="button" class="wa-edit__btn" title="Move up" :disabled="index === 0" @click.stop="edit('up', node)">↑</button>
            <button type="button" class="wa-edit__btn" title="Move down" :disabled="index === body.length - 1" @click.stop="edit('down', node)">↓</button>
            <button type="button" class="wa-edit__btn wa-edit__btn--danger" title="Remove" @click.stop="edit('remove', node)">✕</button>
          </div>
        </div>
        <component
          v-else
          :is="componentFor(node.type)"
          :node="node"
          :disabled="loading"
          @action="onAction"
          @input="(value: unknown) => onInput(node, value)"
        />
      </template>
    </div>
    <div class="wa-screen__footer">
      <div
        v-if="footer && editable"
        class="wa-edit"
        :class="dropClass(footer)"
        :data-path="footer.path"
        @dragover="onDragOver(footer, $event)"
        @dragleave="onDragLeave(footer, $event)"
        @drop="onDrop(footer, $event)"
      >
        <FooterButton :node="footer" :disabled="loading || !screen.canSubmit" @action="onAction" />
        <div class="wa-edit__bar" role="toolbar" aria-label="Edit Footer">
          <span class="wa-edit__type">Footer</span>
          <button type="button" class="wa-edit__btn wa-edit__btn--danger" title="Remove" @click.stop="edit('remove', footer)">✕</button>
        </div>
      </div>
      <FooterButton v-else-if="footer" :node="footer" :disabled="loading || !screen.canSubmit" @action="onAction" />
      <div class="wa-screen__managed">Managed by the business. <span class="wa-screen__learn">Learn more</span></div>
    </div>
    <div v-if="loading" class="wa-screen__spinner" aria-live="polite">Loading…</div>
  </div>
</template>

<style scoped>
.wa-edit {
  position: relative;
  border-radius: 6px;
  outline: 1px dashed transparent;
  outline-offset: 4px;
  transition: outline-color 120ms;
}
.wa-edit:hover {
  outline-color: var(--wa-green);
}
.wa-edit--dragging {
  opacity: 0.4;
}
.wa-edit::before {
  content: '';
  position: absolute;
  left: -4px;
  right: -4px;
  height: 3px;
  border-radius: 2px;
  background: var(--wa-green);
  opacity: 0;
  pointer-events: none;
}
.wa-edit--drop-before::before {
  top: -10px;
  opacity: 1;
}
.wa-edit--drop-after::before {
  bottom: -10px;
  opacity: 1;
}
.wa-edit:hover > .wa-edit__btn--grip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  cursor: grab;
  letter-spacing: -2px;
  user-select: none;
}
.wa-edit__btn--grip:active {
  cursor: grabbing;
}
.wa-edit__bar {
  position: absolute;
  top: -14px;
  right: -4px;
  display: none;
  align-items: center;
  gap: 2px;
  padding: 2px 4px;
  border-radius: 6px;
  background: var(--wa-text);
  color: #fff;
  font-size: 11px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  z-index: 2;
}
.wa-edit:hover > .wa-edit__bar {
  display: inline-flex;
}
.wa-edit__type {
  padding: 0 6px 0 4px;
  opacity: 0.8;
}
.wa-edit__btn {
  width: 22px;
  height: 20px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}
.wa-edit__btn:hover {
  background: rgba(255, 255, 255, 0.18);
}
.wa-edit__btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.wa-edit__btn--danger:hover {
  background: #e01e5a;
}
.wa-screen {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  position: relative;
}
.wa-screen__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 16px 8px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.wa-screen__footer {
  padding: 8px 16px 12px;
  border-top: 1px solid var(--wa-border);
  background: var(--wa-bg);
}
.wa-screen__managed {
  margin-top: 10px;
  text-align: center;
  font-size: 11px;
  color: var(--wa-text-muted);
}
.wa-screen__learn {
  color: var(--wa-green-dark);
}
.wa-screen--loading .wa-screen__body,
.wa-screen--loading .wa-screen__footer {
  opacity: 0.6;
  pointer-events: none;
}
.wa-screen__error {
  padding: 10px 12px;
  border-radius: var(--wa-radius);
  background: #fdecea;
  color: var(--wa-error);
  font-size: 14px;
}
.wa-screen__spinner {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--wa-text-muted);
  font-size: 13px;
}
</style>
