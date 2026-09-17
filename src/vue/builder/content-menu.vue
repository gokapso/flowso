<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import { COMPONENT_CATALOG } from '../../catalog/component-catalog';

const props = defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ select: [id: string] }>();
const menuId = useId();
const trigger = ref<HTMLButtonElement>();
const menu = ref<HTMLElement>();
const submenu = ref<HTMLElement>();
const isOpen = ref(false);
const activeGroup = ref<number | null>(null);
const isCompact = ref(false);
const position = ref({ left: '0px', top: '0px' });
const subPosition = ref({ left: '0px', top: '0px' });
const groups = [
  { label: 'Text', icon: 'text', ids: ['text-heading', 'text-subheading', 'text-body', 'text-body-markdown', 'text-caption', 'rich-text'] },
  { label: 'Media', icon: 'image', ids: ['image', 'image-carousel', 'photo-picker', 'document-picker'] },
  { label: 'Text response', icon: 'input', ids: ['text-input', 'text-area', 'date-picker', 'calendar-picker-range', 'text-input-email', 'text-input-pattern'] },
  { label: 'Selection', icon: 'list', ids: ['radio-buttons-group', 'checkbox-group', 'dropdown', 'chips-selector', 'opt-in', 'radio-buttons-group-dynamic', 'update-data'] },
  { label: 'Advanced', icon: 'logic', ids: ['embedded-link', 'navigation-list', 'footer', 'footer-captions', 'form', 'if', 'switch'] },
];
const names: Record<string, string> = {
  'text-heading': 'Heading', 'text-subheading': 'Small heading', 'text-body': 'Body text',
  'text-body-markdown': 'Formatted text', 'text-caption': 'Caption', 'rich-text': 'Rich text',
  image: 'Image', 'image-carousel': 'Image carousel', 'photo-picker': 'Photo upload', 'document-picker': 'Document upload',
  'text-input': 'Short answer', 'text-area': 'Paragraph', 'date-picker': 'Date picker',
  'calendar-picker-range': 'Date range', 'text-input-email': 'Email address', 'text-input-pattern': 'Pattern input',
  'radio-buttons-group': 'Single choice', 'checkbox-group': 'Multiple choice', dropdown: 'Dropdown',
  'chips-selector': 'Chips', 'opt-in': 'Opt-in', 'radio-buttons-group-dynamic': 'Dynamic choices',
  'update-data': 'Update data on selection', 'embedded-link': 'Link', 'navigation-list': 'Navigation list',
  footer: 'Button', 'footer-captions': 'Button with captions', form: 'Form', if: 'Condition', switch: 'Switch',
};
const icons: Record<string, string> = {
  text: 'm4 18 5-12 5 12M6 14h6M16 12c4-3 6 0 4 2-5-1-5 5 0 3v-6',
  image: 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM3 16l6-6 5 5 3-3 4 4M16 7h.01',
  input: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 12 3-8 3 8m-5-2h4m4-3h2m-2 3h2',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  logic: 'M8 3h8v6H8zM12 9v4M5 13h14M5 13v3m14-3v3M2 16h6v5H2zM16 16h6v5h-6z',
  paragraph: 'M4 5h16M4 10h12M4 15h16M4 20h9',
  calendar: 'M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2ZM7 3v4m10-4v4M3 11h18M8 11v9m8-9v9M3 15h18',
};
const group = computed(() => activeGroup.value === null ? null : groups[activeGroup.value]);
const entries = computed(() => (group.value?.ids ?? []).map(id => COMPONENT_CATALOG.find(entry => entry.id === id)!));
function entryIcon(id: string) {
  if (id === 'text-area') return icons.paragraph;
  if (id === 'date-picker' || id === 'calendar-picker-range') return icons.calendar;
  return icons[group.value!.icon];
}
function items(element: HTMLElement | undefined) { return Array.from(element?.children ?? []).filter((child): child is HTMLButtonElement => child instanceof HTMLButtonElement && child.getAttribute('role') === 'menuitem'); }
function focusItem(element: HTMLElement | undefined, index: number) {
  const buttons = items(element);
  buttons.forEach((button, i) => { button.tabIndex = i === index ? 0 : -1; });
  buttons[index]?.focus();
}
function close(restoreFocus = true) {
  menu.value?.hidePopover();
  isOpen.value = false;
  activeGroup.value = null;
  if (restoreFocus) trigger.value?.focus();
}
function reposition() {
  if (!isOpen.value || !trigger.value || !menu.value) return;
  const anchor = trigger.value.getBoundingClientRect();
  isCompact.value = window.innerWidth < 560;
  const width = Math.min(248, window.innerWidth - 16);
  const height = menu.value.offsetHeight;
  const below = window.innerHeight - anchor.bottom - 8;
  const top = below >= height ? anchor.bottom + 6 : Math.max(8, anchor.top - height - 6);
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
  position.value = { left: `${left}px`, top: `${Math.min(top, window.innerHeight - height - 8)}px` };
  if (submenu.value && activeGroup.value !== null && !isCompact.value) {
    const row = items(menu.value)[activeGroup.value]?.getBoundingClientRect();
    const subWidth = submenu.value.offsetWidth;
    const subLeft = left + width + subWidth + 8 <= window.innerWidth ? left + width : Math.max(8, left - subWidth);
    subPosition.value = { left: `${subLeft}px`, top: `${Math.max(8, Math.min(row?.top ?? top, window.innerHeight - submenu.value.offsetHeight - 8))}px` };
  }
}
async function open(last = false) {
  if (props.disabled) return;
  isOpen.value = true;
  activeGroup.value = null;
  menu.value?.showPopover();
  await nextTick();
  reposition();
  focusItem(menu.value, last ? groups.length - 1 : 0);
}
async function activate(index: number, focus = false) {
  activeGroup.value = index;
  await nextTick();
  reposition();
  if (focus) focusItem(submenu.value, 0);
}
async function back() {
  const previous = activeGroup.value ?? 0;
  activeGroup.value = null;
  await nextTick();
  reposition();
  focusItem(menu.value, previous);
}
function pick(id: string) {
  if (props.disabled) return;
  emit('select', id);
  close();
}
function keydown(event: KeyboardEvent, sub = false) {
  const target = sub ? submenu.value : menu.value;
  const buttons = items(target);
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const movements: Record<string, number> = { ArrowDown: (current + 1) % buttons.length, ArrowUp: (current - 1 + buttons.length) % buttons.length, Home: 0, End: buttons.length - 1 };
  if (event.key in movements) { event.preventDefault(); focusItem(target, movements[event.key]!); }
  else if (event.key === 'ArrowRight' && !sub && current >= 0) { event.preventDefault(); void activate(current, true); }
  else if ((event.key === 'ArrowLeft' || event.key === 'Escape') && sub) { event.preventDefault(); void back(); }
  else if (event.key === 'Escape') { event.preventDefault(); close(); }
  else if (event.key === 'Tab') { close(); }
  else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.key !== ' ') {
    const match = buttons.findIndex((_, offset) => buttons[(current + 1 + offset) % buttons.length]?.textContent?.trim().toLowerCase().startsWith(event.key.toLowerCase()));
    if (match >= 0) { event.preventDefault(); focusItem(target, (current + 1 + match) % buttons.length); }
  }
}
function toggled(event: Event) {
  if ((event as ToggleEvent).newState === 'closed') { isOpen.value = false; activeGroup.value = null; }
}
watch(isOpen, (value) => {
  const method = value ? 'addEventListener' : 'removeEventListener';
  window[method]('resize', reposition);
  window[method]('scroll', reposition, true);
});
watch(() => props.disabled, value => { if (value && isOpen.value) close(); });
onBeforeUnmount(() => { window.removeEventListener('resize', reposition); window.removeEventListener('scroll', reposition, true); });
</script>

<template>
  <div class="fb-content-picker">
    <button ref="trigger" type="button" class="fb-add fb-add--border" :disabled="disabled" aria-haspopup="menu" :aria-expanded="isOpen" :aria-controls="menuId" @click="isOpen ? close() : open()" @keydown.down.prevent="open()" @keydown.up.prevent="open(true)">
      <svg aria-hidden="true" class="fb-menu-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
      <span>Add content</span>
    </button>
    <div :id="menuId" ref="menu" popover="auto" role="menu" aria-label="Add content" class="fb-content-menu" :style="position" @toggle="toggled" @keydown.stop="keydown($event)">
      <template v-if="!isCompact || activeGroup === null">
        <button v-for="(item, index) in groups" :id="`${menuId}-${index}`" :key="item.label" type="button" role="menuitem" tabindex="-1" aria-haspopup="menu" :aria-expanded="activeGroup === index" :aria-controls="activeGroup === index ? `${menuId}-items` : undefined" @pointerenter="!isCompact && $event.pointerType === 'mouse' && activate(index)" @click="activate(index, true)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="icons[item.icon]" /></svg><span>{{ item.label }}</span><span class="fb-menu-chevron" aria-hidden="true">›</span>
        </button>
      </template>
      <div v-if="group" :id="`${menuId}-items`" ref="submenu" role="menu" :aria-label="group.label" class="fb-content-submenu" :class="{ 'fb-content-submenu--compact': isCompact }" :style="isCompact ? {} : subPosition" @keydown.stop="keydown($event, true)">
        <button v-if="isCompact" type="button" role="menuitem" tabindex="-1" class="fb-menu-back" @click="back"><span aria-hidden="true">‹</span> {{ group.label }}</button>
        <button v-for="entry in entries" :key="entry.id" type="button" role="menuitem" tabindex="-1" :data-component-id="entry.id" :title="entry.description" @click="pick(entry.id)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="entryIcon(entry.id)" /></svg><span>{{ names[entry.id] }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
