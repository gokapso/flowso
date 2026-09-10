<script setup lang="ts">
import { computed } from 'vue';
import type { RenderedNode } from '../../runtime/types';
import FieldWrapper from './field-wrapper.vue';
import { nextId } from './data-source';

const props = defineProps<{ node: RenderedNode; disabled?: boolean }>();
const emit = defineEmits<{ input: [value: unknown] }>();
const id = nextId('wa-file');

const isPhoto = computed(() => props.node.type === 'PhotoPicker');
const max = computed(() => {
  const value = props.node.props[isPhoto.value ? 'max-uploaded-photos' : 'max-uploaded-documents'];

  return typeof value === 'number' ? value : 1;
});
const files = computed(() => (Array.isArray(props.node.value) ? (props.node.value as Array<{ file_name: string }>) : []));

/**
 * The real client uploads media and sends encrypted media descriptors. The simulator stores a
 * descriptor with the file name and size only.
 */
function onChange(event: Event) {
  const list = Array.from((event.target as HTMLInputElement).files ?? []).slice(0, max.value);
  emit(
    'input',
    list.map((file) => ({
      file_name: file.name,
      media_id: `simulated_${Math.random().toString(36).slice(2, 10)}`,
      cdn_url: '',
      encryption_metadata: { encrypted_hash: '', hmac_key: '', encryption_key: '', iv: '', plaintext_hash: '' },
      _simulated: { size: file.size, type: file.type },
    })),
  );
}
</script>

<template>
  <FieldWrapper
    :label="String(node.props.label ?? '')"
    :helper="node.props.description ? String(node.props.description) : undefined"
    :error="node.error"
    :required="node.props.required === true"
    :input-id="id"
  >
    <input
      :id="id"
      class="wa-file"
      type="file"
      :accept="isPhoto ? 'image/*' : (Array.isArray(node.props['allowed-mime-types']) ? (node.props['allowed-mime-types'] as string[]).join(',') : undefined)"
      :multiple="max > 1"
      :disabled="disabled || node.props.enabled === false"
      @change="onChange"
    />
    <ul v-if="files.length" class="wa-file__list">
      <li v-for="file in files" :key="file.file_name">{{ file.file_name }}</li>
    </ul>
    <div class="wa-field__helper">Simulated upload: the real client sends encrypted media descriptors.</div>
  </FieldWrapper>
</template>

<style scoped>
.wa-file {
  font-size: 14px;
}
.wa-file__list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
}
</style>
