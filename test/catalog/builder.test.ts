import { describe, it, expect } from 'vitest';
import { newBuilderScreen, parseBuilderFlow, removeBuilderScreen, reorderComponents, reorderItem } from '../../src/catalog/builder';
import type { Component, FlowJson } from '../../src/schema/flow-json';
import feedback from '../../fixtures/feedback.flow.json';

const flow = feedback as FlowJson;
describe('visual builder', () => {
  it('reorders without dropping unknown component properties or mutating the source', () => {
    const children: Component[] = [{ type: 'TextBody', text: 'A', custom: { enabled: true } }, { type: 'TextBody', text: 'B' }, { type: 'Footer', label: 'Done', 'on-click-action': { name: 'complete', payload: {} } }];
    expect(reorderComponents(children, 0, 1)).toEqual([children[1], children[0], children[2]]);
    expect(reorderComponents(children, 0, 2)).toBe(children);
    expect(reorderComponents(children, 2, 0)).toBe(children);
    expect(children[0]!.text).toBe('A');
  });
  it('refuses malformed editor shapes but preserves unrecognized fields', () => {
    for (const source of ['null', '{}', '{', JSON.stringify({ version: '7.3', screens: [{ id: 'X', layout: { children: [null] } }] })]) {
      expect(() => parseBuilderFlow(source)).toThrow();
    }
    expect(parseBuilderFlow(JSON.stringify({ ...flow, custom: 'keep' }))).toHaveProperty('custom', 'keep');
  });
  it('keeps navigation references intact when screens are reordered', () => {
    const screens = reorderItem(flow.screens, 0, 1);
    expect(screens).toEqual([flow.screens[1], flow.screens[0]]);
    expect(removeBuilderScreen(flow, 'THANKS').ok).toBe(false);
    expect(flow.screens[0]!.id).toBe('FEEDBACK');
  });
  it('blocks deletion of data references and the last screen', () => {
    const next = structuredClone(flow);
    next.screens[1]!.layout.children = [{ type: 'TextBody', text: '${screen.FEEDBACK.form.rating}' }];
    expect(removeBuilderScreen(next, 'FEEDBACK').ok).toBe(false);
    expect(removeBuilderScreen({ ...flow, screens: [flow.screens[0]!] }, 'FEEDBACK').ok).toBe(false);
  });
  it('removes unreferenced screens and their routing entries, and creates unique screen IDs', () => {
    const extra = newBuilderScreen(flow);
    const added = { ...flow, screens: [...flow.screens, extra], routing_model: { ...flow.routing_model, [extra.id]: [] } };
    const result = removeBuilderScreen(added, extra.id);
    expect(result.ok && result.flow.screens).toEqual(flow.screens);
    expect(result.ok && result.flow.routing_model).not.toHaveProperty(extra.id);
    expect(newBuilderScreen(added).id).not.toBe(extra.id);
  });
});
