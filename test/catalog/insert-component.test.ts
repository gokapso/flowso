import { describe, it, expect } from 'vitest';
import { insertComponent, insertScreen, rewireNextTargets } from '../../src/catalog/insert-component';
import type { FlowJson } from '../../src/schema/flow-json';
import appointment from '../../fixtures/appointment.flow.json';

const flow = appointment as unknown as FlowJson;

describe('insertComponent', () => {
  it('inserts inside the Form and before the Footer', () => {
    const result = insertComponent(flow, { type: 'TextBody', text: 'Hello' }, { screenId: 'WELCOME' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const form = result.flow.screens[0]!.layout.children[2] as { children: Array<{ type: string }> };
    expect(form.children.map((c) => c.type)).toEqual(['TextInput', 'TextInput', 'RadioButtonsGroup', 'TextBody', 'Footer']);
    expect(result.path).toBe('screens[0].layout.children[2].children[3]');
    expect((flow.screens[0]!.layout.children[2] as { children: unknown[] }).children).toHaveLength(4);
  });

  it('inserts at layout level before the Footer when there is no Form', () => {
    const result = insertComponent(flow, { type: 'TextCaption', text: 'Note' }, { screenId: 'DETAILS' });
    expect(result.ok && result.flow.screens[1]!.layout.children.map((c) => c.type)).toEqual(['TextSubheading', 'Switch', 'Dropdown', 'TextCaption', 'Footer']);
  });

  it('renames duplicate input names', () => {
    const result = insertComponent(flow, { type: 'TextInput', name: 'email', label: 'Other email' }, { screenId: 'WELCOME' });
    expect(result.ok && (result.flow.screens[0]!.layout.children[2] as { children: Array<{ name?: string }> }).children[3]?.name).toBe('email_2');
    const strict = insertComponent(flow, { type: 'TextInput', name: 'email', label: 'x' }, { screenId: 'WELCOME', renameDuplicates: false });
    expect(strict).toEqual({ ok: false, error: 'An input named "email" already exists on WELCOME' });
  });

  it('rejects a second Footer and components newer than the flow version', () => {
    expect(insertComponent(flow, { type: 'Footer', label: 'x', 'on-click-action': { name: 'complete' } }, { screenId: 'WELCOME' })).toMatchObject({ ok: false });
    const old = { ...flow, version: '5.0' };
    expect(insertComponent(old, { type: 'ChipsSelector', name: 'c', label: 'C', 'data-source': [] })).toEqual({
      ok: false,
      error: 'ChipsSelector needs Flow JSON 6.3 or newer; this flow is 5.0',
    });
  });

  it('fails for unknown screens', () => {
    expect(insertComponent(flow, { type: 'TextBody', text: 'x' }, { screenId: 'NOPE' })).toEqual({ ok: false, error: 'Screen "NOPE" does not exist' });
  });
});

describe('insertScreen and rewireNextTargets', () => {
  it('adds the screen with a routing entry and a unique id', () => {
    const result = insertScreen(flow, { id: 'CONFIRM', layout: { type: 'SingleColumnLayout', children: [] } });
    expect(result.ok && result.screenId).toBe('CONFIRM_2');
    expect(result.ok && result.flow.routing_model?.CONFIRM_2).toEqual([]);
    expect(flow.screens).toHaveLength(3);
  });

  it('rewires NEXT navigate targets', () => {
    const footer = { type: 'Footer', label: 'Go', 'on-click-action': { name: 'navigate', next: { type: 'screen', name: 'NEXT' } } };
    expect(rewireNextTargets(footer, 'DETAILS')['on-click-action'].next.name).toBe('DETAILS');
  });
});
