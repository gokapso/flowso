// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import ContentMenu from '../src/vue/builder/content-menu.vue';
import { COMPONENT_CATALOG } from '../src/catalog/component-catalog';
import FlowBuilderPanel from '../src/vue/builder/flow-builder-panel.vue';

// happy-dom has no top-layer popover implementation; real browser checks cover dismissal and geometry.
beforeAll(() => {
  HTMLElement.prototype.showPopover = function () { this.removeAttribute('popover'); };
  HTMLElement.prototype.hidePopover = function () {};
});
afterEach(() => { document.body.innerHTML = ''; });

const sample = {
  version: '7.3', extra: 'preserve', screens: [{ id: 'FIRST', title: 'First', terminal: true,
    layout: { type: 'SingleColumnLayout', children: [
      { type: 'Form', name: 'form', children: [
        { type: 'TextBody', text: 'One', custom: 'keep' },
        { type: 'TextBody', text: 'Two' },
        { type: 'Footer', label: 'Done', 'on-click-action': { name: 'complete', payload: {} } },
      ] },
    ] } }],
};
function create(disabled = false) {
  return mount(defineComponent({
    components: { FlowBuilderPanel },
    setup() { return { source: ref(JSON.stringify(sample)), disabled }; },
    template: '<FlowBuilderPanel v-model="source" :disabled="disabled" />',
  }));
}
describe('builder panel', () => {
  it('edits nested content, reorders it, and retains it across visual / JSON switches', async () => {
    const wrapper = create();
    const row = wrapper.findAll('.fb-row-title').find((item) => item.text().includes('One'))!;
    await row.trigger('click');
    await wrapper.find('textarea').setValue('Updated');
    await wrapper.find('button[aria-label="Move component down"]').trigger('click');
    await wrapper.findAll('.fb-toggle button')[1]!.trigger('click');
    const json = JSON.parse((wrapper.find('textarea').element as HTMLTextAreaElement).value);
    expect(json.extra).toBe('preserve');
    expect(json.screens[0].layout.children[0].children.map((item: { text?: string; type: string }) => item.text ?? item.type)).toEqual(['Two', 'Updated', 'Footer']);
    expect(json.screens[0].layout.children[0].children[1].custom).toBe('keep');
    await wrapper.findAll('.fb-toggle button')[0]!.trigger('click');
    expect(wrapper.text()).toContain('Updated');
  });
  it('preserves invalid JSON and prevents visual edits until repaired', async () => {
    const wrapper = create();
    await wrapper.findAll('.fb-toggle button')[1]!.trigger('click');
    await wrapper.find('textarea').setValue('{ broken');
    await wrapper.findAll('.fb-toggle button')[0]!.trigger('click');
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.find('.fb-components').exists()).toBe(false);
    await wrapper.findAll('.fb-toggle button')[1]!.trigger('click');
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('{ broken');
  });
  it('adds content before the Footer and supports keyboard reordering', async () => {
    const wrapper = create();
    await wrapper.find('.fb-add--border').trigger('click');
    await wrapper.findAll('.fb-content-menu > button')[0]!.trigger('click');
    const add = wrapper.find('[data-component-id="text-body"]');
    expect(add.exists()).toBe(true);
    await add.trigger('click');
    const handle = wrapper.findAll('.fb-grip').find((item) => item.attributes('aria-label')?.startsWith('Drag Text.'))!;
    await handle.trigger('keydown', { key: 'ArrowDown', altKey: true });
    const parsed = JSON.parse(wrapper.vm.source);
    expect(parsed.screens[0].layout.children[0].children.at(-1).type).toBe('Footer');
    expect(parsed.screens[0].layout.children[0].children[0].text).toBe('Two');
  });
  it('makes published flows read only in either mode', async () => {
    const wrapper = create(true);
    expect(wrapper.find('.fb-add--border').attributes('disabled')).toBeDefined();
    await wrapper.findAll('.fb-toggle button')[1]!.trigger('click');
    expect(wrapper.find('textarea').attributes('readonly')).toBeDefined();
  });
});


describe('content menu', () => {
  it('keeps every component available in one category and emits the selected catalog id', async () => {
    const wrapper = mount(ContentMenu);
    await wrapper.find('.fb-add').trigger('click');
    const ids: string[] = [];
    for (const category of wrapper.findAll('.fb-content-menu > button')) {
      await category.trigger('click');
      ids.push(...wrapper.findAll('[data-component-id]').map(button => button.attributes('data-component-id')!));
    }
    expect(ids.sort()).toEqual(COMPONENT_CATALOG.filter(entry => entry.placement === 'component').map(entry => entry.id).sort());
    await wrapper.findAll('.fb-content-menu > button')[2]!.trigger('click');
    await wrapper.find('[data-component-id="text-area"]').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['text-area']]);
    expect(wrapper.find('.fb-add').attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });
  it('navigates categories and submenus with arrows and restores focus on Escape', async () => {
    const wrapper = mount(ContentMenu, { attachTo: document.body });
    const trigger = wrapper.find('.fb-add');
    await trigger.trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toContain('Text');
    const first = wrapper.findAll('.fb-content-menu > button')[0]!;
    await first.trigger('keydown', { key: 'ArrowRight' });
    expect(document.activeElement?.textContent).toContain('Heading');
    await wrapper.find('[data-component-id="text-heading"]').trigger('keydown', { key: 'Escape' });
    expect(document.activeElement).toBe(first.element);
    await first.trigger('keydown', { key: 'Escape' });
    expect(document.activeElement).toBe(trigger.element);
    expect(trigger.attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });
});
