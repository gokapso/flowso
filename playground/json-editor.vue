<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { linter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { indentWithTab } from '@codemirror/commands';

const props = defineProps<{ modelValue: string; diagnostics?: Diagnostic[] }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const host = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;

onMounted(() => {
  view = new EditorView({
    parent: host.value ?? undefined,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup,
        json(),
        linter(jsonParseLinter()),
        keymap.of([indentWithTab]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) emit('update:modelValue', update.state.doc.toString());
        }),
      ],
    }),
  });
});

watch(
  () => props.modelValue,
  (value) => {
    if (view && value !== view.state.doc.toString()) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  },
);

watch(
  () => props.diagnostics,
  (diagnostics) => {
    if (view) view.dispatch(setDiagnostics(view.state, diagnostics ?? []));
  },
  { deep: true },
);

onBeforeUnmount(() => view?.destroy());
</script>

<template>
  <div ref="host" class="pg__editor-body" />
</template>
