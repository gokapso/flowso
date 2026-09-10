// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import FlowPhone from '../src/vue/flow-phone.vue';
import type { FlowJson } from '../src/schema/flow-json';
import appointment from '../fixtures/appointment.flow.json';

const flow = appointment as unknown as FlowJson;

async function settle() {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

describe('FlowPhone', () => {
  it('renders the first screen with resolved text and inputs', async () => {
    const wrapper = mount(FlowPhone, { props: { flow } });
    await settle();
    expect(wrapper.text()).toContain('Welcome to Kapso Dental');
    expect(wrapper.text()).toContain('10% off your first visit');
    expect(wrapper.find('input[type="email"]').exists()).toBe(true);
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(2);
    expect(wrapper.find('.wa-footer__button').text()).toBe('Continue');
  });

  it('greys out the footer until required fields are filled, like the WhatsApp client', async () => {
    const wrapper = mount(FlowPhone, { props: { flow } });
    await settle();
    const button = wrapper.find('.wa-footer__button');
    expect(button.attributes('disabled')).toBeDefined();
    await wrapper.find('input[type="email"]').setValue('ana@example.com');
    await wrapper.findAll('input[type="radio"]')[0]!.setValue(true);
    await settle();
    expect(wrapper.find('.wa-footer__button').attributes('disabled')).toBeUndefined();
    expect(wrapper.text()).toContain('Managed by the business');
  });

  it('shows validation errors for filled but invalid fields on submit', async () => {
    const wrapper = mount(FlowPhone, { props: { flow } });
    await settle();
    await wrapper.find('input[type="email"]').setValue('not-an-email');
    await wrapper.findAll('input[type="radio"]')[0]!.setValue(true);
    await settle();
    await wrapper.find('.wa-footer__button').trigger('click');
    await settle();
    expect(wrapper.findAll('.wa-field__error').map((e) => e.text())).toEqual(['Enter a valid email']);
    expect(wrapper.find('.wa-phone__title').text()).toBe('Book an appointment');
  });

  it('navigates to the next screen with the form payload', async () => {
    const wrapper = mount(FlowPhone, { props: { flow } });
    await settle();
    await wrapper.find('input[type="email"]').setValue('ana@example.com');
    await wrapper.findAll('input[type="radio"]')[1]!.setValue(true);
    await settle();
    expect(wrapper.text()).toContain('Book your visit');
    await wrapper.find('.wa-footer__button').trigger('click');
    await settle();
    expect(wrapper.find('.wa-phone__title').text()).toBe('Pick a slot');
    expect(wrapper.text()).toContain('Hi Ana');
    expect(wrapper.text()).toContain('Whitening takes 60 minutes');
    expect(wrapper.find('select option[value="s1"]').exists()).toBe(true);
  });

  it('completes the flow and shows the response payload', async () => {
    const wrapper = mount(FlowPhone, {
      props: { flow, startOptions: { mode: 'navigate', screen: 'CONFIRM', data: { confirmation_code: 'C9' } } },
    });
    await settle();
    await wrapper.find('.wa-footer__button').trigger('click');
    await settle();
    expect(wrapper.text()).toContain('Flow completed');
    expect(wrapper.text()).toContain('"confirmation_code": "C9"');
  });

  it('renders nothing for a null flow', () => {
    const wrapper = mount(FlowPhone, { props: { flow: null } });
    expect(wrapper.text()).toContain('No flow loaded');
  });
});
