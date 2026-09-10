<script setup lang="ts">
import { computed } from 'vue';
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

function edit(kind: ScreenEdit['kind'], node: RenderedNode) {
  emit('edit', { kind, node, screenId: props.screen.id });
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
        <div v-if="editable" class="wa-edit" :data-path="node.path" @click.self="edit('select', node)">
          <component
            :is="componentFor(node.type)"
            :node="node"
            :disabled="loading"
            @action="onAction"
            @input="(value: unknown) => onInput(node, value)"
          />
          <div class="wa-edit__bar" role="toolbar" :aria-label="`Edit ${node.type}`">
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
      <div v-if="footer && editable" class="wa-edit" :data-path="footer.path">
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
