<script setup lang="ts">
defineProps<{
  label?: string;
  helper?: string;
  error?: string | null;
  required?: boolean;
  large?: boolean;
  inputId?: string;
}>();
</script>

<template>
  <div class="wa-field" :class="{ 'wa-field--error': !!error }">
    <label v-if="label" class="wa-field__label" :class="{ 'wa-field__label--large': large }" :for="inputId">
      {{ label }}<span v-if="required" class="wa-field__required"> *</span>
    </label>
    <slot />
    <div v-if="error" class="wa-field__error" role="alert">{{ error }}</div>
    <div v-else-if="helper" class="wa-field__helper">{{ helper }}</div>
  </div>
</template>

<style>
.wa-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.wa-field__label {
  font-size: 14px;
  font-weight: 500;
  color: var(--wa-text);
}
.wa-field__label--large {
  font-size: 17px;
  font-weight: 600;
}
.wa-field__required {
  color: var(--wa-error);
}
.wa-field__helper {
  font-size: 12px;
  color: var(--wa-text-muted);
}
.wa-field__error {
  font-size: 12px;
  color: var(--wa-error);
}
.wa-input {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--wa-border);
  border-radius: var(--wa-radius);
  background: var(--wa-bg);
  color: var(--wa-text);
  font-size: 15px;
  font-family: inherit;
}
.wa-input:focus {
  outline: 2px solid var(--wa-green);
  border-color: transparent;
}
.wa-field--error .wa-input {
  border-color: var(--wa-error);
}
.wa-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--wa-border);
  cursor: pointer;
}
.wa-option:last-child {
  border-bottom: 0;
}
.wa-option__control {
  margin-top: 2px;
  accent-color: var(--wa-green);
  width: 18px;
  height: 18px;
}
.wa-option__title {
  font-size: 15px;
}
.wa-option__description {
  font-size: 13px;
  color: var(--wa-text-muted);
}
.wa-option__image {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  object-fit: cover;
  background: var(--wa-bg-muted);
}
.wa-option--large .wa-option__image {
  width: 64px;
  height: 64px;
}
.wa-option--disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
