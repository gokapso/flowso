// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Preview from '../playground/preview.vue';

async function create(flow: unknown) {
  let events: { onopen?: () => void } = {};
  vi.stubGlobal('EventSource', class {
    onopen?: () => void;
    constructor() { events = this; }
    addEventListener() {}
    close() {}
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ flow, fileName: 'test.json' }) }));
  const wrapper = mount(Preview);
  events.onopen!();
  await flushPromises();
  return wrapper;
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('opens external links from the phone-only preview', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const wrapper = await create({ version: '7.3', routing_model: {}, screens: [{
    id: 'START', title: 'Links', terminal: true,
    layout: { type: 'SingleColumnLayout', children: [
      { type: 'EmbeddedLink', text: 'Visit docs', 'on-click-action': { name: 'open_url', url: 'https://example.com/docs' } },
      { type: 'Footer', label: 'Done', 'on-click-action': { name: 'complete', payload: {} } },
    ] },
  }] });
  try {
    await wrapper.get('.wa-link').trigger('click');
    expect(open).toHaveBeenCalledWith('https://example.com/docs', '_blank', 'noopener,noreferrer');
  } finally { wrapper.unmount(); }
});

it('shows the validation path when the file is invalid', async () => {
  const wrapper = await create({ version: '7.3', routing_model: {}, screens: [] });
  try {
    expect(wrapper.get('[role="alert"]').text()).toContain('screens');
    expect(wrapper.get('[role="alert"]').text()).not.toContain('undefined:');
  } finally { wrapper.unmount(); }
});
