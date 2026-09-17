// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { Storage } from 'happy-dom';
import App from '../playground/app.vue';
import feedback from '../fixtures/feedback.flow.json';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', new Storage());
  localStorage.setItem('flowso:flow', JSON.stringify(feedback));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

async function create() {
  const wrapper = mount(App, { global: { stubs: { JsonEditor: true } } });
  await vi.advanceTimersByTimeAsync(350);
  await flushPromises();
  return wrapper;
}

describe('playground component previews', () => {
  it('previews selected and hovered components after choosing a builder screen, then restores that screen', async () => {
    const wrapper = await create();
    try {
      await wrapper.findAll('.fb-screen .fb-row-title')[1]!.trigger('click');
      await flushPromises();
      const builderTitle = wrapper.find('.wa-phone__title').text();
      await wrapper.findAll('.pg__tab')[1]!.trigger('click');
      const caption = wrapper.findAll('.gal__item').find(item => item.find('.gal__label').text() === 'TextCaption')!;
      await caption.trigger('click');
      await flushPromises();
      expect(wrapper.find('.wa-phone__body').text()).toContain('All appointment times are local.');
      const heading = wrapper.findAll('.gal__item')[0]!;
      await heading.trigger('mouseenter');
      await flushPromises();
      expect(wrapper.find('.wa-phone__title').text()).toBe('TextHeading');
      await wrapper.find('.gal-list__items').trigger('mouseleave');
      await flushPromises();
      expect(wrapper.find('.wa-phone__title').text()).toBe('TextCaption');
      await wrapper.findAll('button').find(button => button.text() === 'Restart')!.trigger('click');
      await flushPromises();
      await wrapper.findAll('.pg__tab')[0]!.trigger('click');
      await flushPromises();
      expect(wrapper.find('.wa-phone__title').text()).toBe(builderTitle);
    } finally { wrapper.unmount(); }
  });
  it('starts gallery examples locally even when the builder uses a data endpoint', async () => {
    const wrapper = await create();
    try {
      await wrapper.findAll('.pg__tab')[1]!.trigger('click');
      await wrapper.find('.pg__select select').setValue('data_exchange');
      await flushPromises();
      expect(wrapper.find('.wa-phone__title').text()).toBe('TextHeading');
      expect(wrapper.find('.wa-phone__body').text()).toContain('Book your visit');
      expect(fetch).toHaveBeenCalledTimes(1); // Only the CLI discovery request, never a gallery INIT.
    } finally { wrapper.unmount(); }
  });
});
