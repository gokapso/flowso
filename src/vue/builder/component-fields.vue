<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Component } from '../../schema/flow-json';

const props = defineProps<{ component: Component; disabled?: boolean }>();
const emit = defineEmits<{ update: [component: Component] }>();
const error = ref('');
const objectDrafts = ref<Record<string, string>>({});
const labels: Record<string, string> = {
  text: 'Text', label: 'Label', name: 'Field name', required: 'Required', enabled: 'Enabled',
  'helper-text': 'Helper text', 'alt-text': 'Image description', src: 'Image URL',
  'data-source': 'Options', 'on-click-action': 'Button action',
};
const fields = computed(() => {
  const entries = { ...props.component } as Record<string, unknown>;
  // Make the most common optional controls discoverable without opening JSON.
  if ('label' in entries && 'name' in entries && !['Form', 'NavigationList'].includes(props.component.type)) {
    if (entries.required === undefined) entries.required = false;
  }
  return Object.entries(entries).filter(([key]) => !['type', 'children', 'then', 'else', 'cases'].includes(key));
});
watch(() => props.component, () => { objectDrafts.value = {}; error.value = ''; });

function label(key: string): string { return labels[key] ?? key.replaceAll('-', ' '); }
function update(key: string, value: unknown) { emit('update', { ...props.component, [key]: value } as Component); }
function updateNumber(key: string, input: HTMLInputElement) {
  if (!Number.isFinite(input.valueAsNumber)) { error.value = `${label(key)} needs a number.`; return; }
  error.value = '';
  update(key, input.valueAsNumber);
}
function commitJson(key: string) {
  try {
    const value: unknown = JSON.parse(objectDrafts.value[key]!);
    error.value = '';
    update(key, value);
  } catch { error.value = `${label(key)} must be valid JSON. Your draft has been kept.`; }
}
function options(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every((item) => item !== null && typeof item === 'object' && 'id' in item && 'title' in item);
}
function updateOption(value: Array<Record<string, unknown>>, index: number, title: string) {
  update('data-source', value.map((item, i) => i === index ? { ...item, title } : item));
}
function addOption(value: Array<Record<string, unknown>>) {
  let index = value.length + 1;
  while (value.some((item) => item.id === `option_${index}`)) index++;
  update('data-source', [...value, { id: `option_${index}`, title: 'New option' }]);
}
</script>

<template>
  <div class="fb-fields">
    <template v-for="[key, value] in fields" :key="key">
      <label v-if="typeof value === 'boolean'" class="fb-check">
        <input type="checkbox" :checked="value" :disabled="disabled" @change="update(key, ($event.target as HTMLInputElement).checked)" />{{ label(key) }}
      </label>
      <label v-else-if="typeof value === 'string' || typeof value === 'number'" class="fb-field">
        <span>{{ label(key) }}</span>
        <textarea v-if="key === 'text'" :value="String(value)" :disabled="disabled" rows="3" @change="update(key, ($event.target as HTMLTextAreaElement).value)" />
        <input v-else :type="typeof value === 'number' ? 'number' : 'text'" :value="value" :disabled="disabled" @change="typeof value === 'number' ? updateNumber(key, $event.target as HTMLInputElement) : update(key, ($event.target as HTMLInputElement).value)" />
      </label>
      <div v-else-if="key === 'data-source' && options(value)" class="fb-field">
        <span>Options</span>
        <div v-for="(option, index) in value" :key="String(option.id)" class="fb-option">
          <input :aria-label="`Option ${index + 1} title`" :value="option.title" :disabled="disabled" @change="updateOption(value, index, ($event.target as HTMLInputElement).value)" />
          <button type="button" :disabled="disabled" :aria-label="`Remove option ${index + 1}`" @click="update(key, value.filter((_, i) => i !== index))">×</button>
        </div>
        <button type="button" class="fb-add" :disabled="disabled" @click="addOption(value)">+ Add option</button>
      </div>
      <details v-else class="fb-field">
        <summary>{{ label(key) }} · JSON</summary>
        <textarea :aria-label="label(key)" :value="objectDrafts[key] ?? JSON.stringify(value, null, 2)" :disabled="disabled" rows="5" spellcheck="false" @input="objectDrafts[key] = ($event.target as HTMLTextAreaElement).value" />
        <button type="button" :disabled="disabled || objectDrafts[key] === undefined" @click="commitJson(key)">Apply {{ label(key) }}</button>
      </details>
    </template>
    <p v-if="error" class="fb-error" role="alert">{{ error }}</p>
  </div>
</template>
