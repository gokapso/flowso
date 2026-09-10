import { describe, it, expect } from 'vitest';
import { moveComponent, removeComponent, replaceComponent, parseLayoutPath } from '../../src/catalog/edit-component';
import { createFlowRuntime } from '../../src/runtime/runtime';
import type { FlowJson } from '../../src/schema/flow-json';
import appointment from '../../fixtures/appointment.flow.json';

const flow = appointment as unknown as FlowJson;

function types(result: { ok: boolean; flow?: FlowJson }, screen = 0, form = 2): string[] {
  if (!result.ok || !result.flow) return [];
  const container = result.flow.screens[screen]!.layout.children[form] as { children: Array<{ type: string }> };

  return container.children.map((c) => c.type);
}

describe('rendered node paths', () => {
  it('point back into the layout, through Form and If branches', async () => {
    const runtime = createFlowRuntime({ flow });
    await runtime.start();
    const paths = runtime.render()!.children.map((node) => `${node.type}@${node.path}`);
    expect(paths).toEqual([
      'TextHeading@children[0]',
      'TextBody@children[1].then[0]',
      'TextInput@children[2].children[0]',
      'TextInput@children[2].children[1]',
      'RadioButtonsGroup@children[2].children[2]',
      'Footer@children[2].children[3]',
    ]);
    expect(parseLayoutPath('children[2].children[3]')).toEqual(['children', 2, 'children', 3]);
    expect(parseLayoutPath('children[1].cases.yes[0]')).toEqual(['children', 1, 'cases', 'yes', 0]);
  });
});

describe('removeComponent', () => {
  it('removes the component at the path without mutating the input', () => {
    const result = removeComponent(flow, 'WELCOME', 'children[2].children[1]');
    expect(types(result)).toEqual(['TextInput', 'RadioButtonsGroup', 'Footer']);
    expect(types({ ok: true, flow })).toHaveLength(4);
  });

  it('removes inside an If branch', () => {
    const result = removeComponent(flow, 'WELCOME', 'children[1].then[0]');
    expect(result.ok && (result.flow.screens[0]!.layout.children[1] as { then: unknown[] }).then).toEqual([]);
  });

  it('fails for unknown paths and screens', () => {
    expect(removeComponent(flow, 'WELCOME', 'children[9]')).toEqual({ ok: false, error: 'No component at children[9]' });
    expect(removeComponent(flow, 'NOPE', 'children[0]').ok).toBe(false);
  });
});

describe('moveComponent', () => {
  it('moves up and down inside the container', () => {
    expect(types(moveComponent(flow, 'WELCOME', 'children[2].children[2]', 'up'))).toEqual(['TextInput', 'RadioButtonsGroup', 'TextInput', 'Footer']);
    expect(types(moveComponent(flow, 'WELCOME', 'children[2].children[0]', 'down'))).toEqual(['TextInput', 'TextInput', 'RadioButtonsGroup', 'Footer']);
  });

  it('refuses to move past the edges', () => {
    expect(moveComponent(flow, 'WELCOME', 'children[2].children[0]', 'up')).toEqual({ ok: false, error: 'Already at the edge' });
    expect(moveComponent(flow, 'WELCOME', 'children[2].children[3]', 'down')).toEqual({ ok: false, error: 'Already at the edge' });
  });
});

describe('replaceComponent', () => {
  it('swaps the component in place', () => {
    const result = replaceComponent(flow, 'WELCOME', 'children[0]', { type: 'TextBody', text: 'Hi' });
    expect(result.ok && result.flow.screens[0]!.layout.children[0]).toEqual({ type: 'TextBody', text: 'Hi' });
  });
});
