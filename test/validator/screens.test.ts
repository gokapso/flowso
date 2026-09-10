import { describe, expect, it } from 'vitest';
import { validateFlowJson } from '../../src/validator';
import { expectIssue, flow, footer, screen } from './helpers';

describe('screens', () => {
  it('reports duplicate and reserved ids', () => {
    const result = validateFlowJson(flow({ screens: [screen(), screen(), screen([], { id: 'SUCCESS' })] }));
    expectIssue(result, 'DUPLICATE_SCREEN_ID', 'screens[1].id');
    expectIssue(result, 'INVALID_PROPERTY_VALUE', 'screens[2].id');
  });

  it.each(['1START', 'BAD-ID', 'HAS SPACE', ''])('rejects malformed id %s', (id) => {
    expectIssue(validateFlowJson(flow({ screens: [screen([], { id })] })), 'INVALID_PROPERTY_VALUE', 'screens[0].id');
  });

  it('treats lowercase ids as a style warning', () => {
    const result = validateFlowJson(flow({ screens: [screen([footer()], { id: 'Start_here' })] }));
    expectIssue(result, 'INVALID_PROPERTY_VALUE', 'screens[0].id', 'warning');
    expect(result.valid).toBe(true);
  });

  it('requires the screen id and layout', () => {
    const result = validateFlowJson(flow({ screens: [{ terminal: true }] }));
    expectIssue(result, 'MISSING_REQUIRED_PROPERTY', 'screens[0].id');
    expectIssue(result, 'MISSING_REQUIRED_PROPERTY', 'screens[0].layout');
  });

  it('checks layout, title, and terminal property types', () => {
    const result = validateFlowJson(flow({ screens: [screen([], {
      layout: { type: 'Grid', children: null }, title: 3, terminal: 'true',
    })] }));
    for (const path of ['layout.type', 'layout.children', 'title', 'terminal']) {
      expectIssue(result, 'INVALID_PROPERTY_VALUE', `screens[0].${path}`);
    }
  });

  it('requires at least one terminal screen and limits complete to terminal screens', () => {
    const result = validateFlowJson(flow({ screens: [screen([footer()], { terminal: false })] }));
    expectIssue(result, 'INVALID_TERMINAL_SCREEN', 'screens');
    expectIssue(result, 'INVALID_TERMINAL_SCREEN', 'screens[0].layout.children[0].on-click-action.name');
    expect(result.issues.find((issue) => issue.pointers[0]?.path === 'screens')?.message)
      .toBe('flow must have at least one terminal screen');
  });

  it('warns if a terminal screen has no completing Footer', () => {
    const result = validateFlowJson(flow());
    expectIssue(result, 'INVALID_TERMINAL_SCREEN', 'screens[0].layout.children', 'warning');
    expect(result.valid).toBe(true);
  });

  it.each(['complete', 'data_exchange'])('accepts a terminal Footer with %s', (name) => {
    expect(validateFlowJson(flow({ screens: [screen([footer(name)])] })).issues).toEqual([]);
  });

  it('checks data declarations, including nested types, with examples optional below the root', () => {
    const result = validateFlowJson(flow({ screens: [screen([], { data: {
      missing: {}, malformed: null,
      items: { type: 'array', __example__: [], items: { type: 'object', properties: { bad: {} } } },
    } })] }));
    expectIssue(result, 'MISSING_REQUIRED_PROPERTY', 'screens[0].data.missing.type');
    expectIssue(result, 'MISSING_REQUIRED_PROPERTY', 'screens[0].data.missing.__example__', 'warning');
    expectIssue(result, 'INVALID_PROPERTY_VALUE', 'screens[0].data.malformed');
    expectIssue(result, 'MISSING_REQUIRED_PROPERTY', 'screens[0].data.items.items.properties.bad.type');
    expect(result.issues.some((issue) => issue.pointers[0]?.path === 'screens[0].data.items.items.__example__')).toBe(false);
  });

  it('resolves sensitive entries against inputs in nested containers on the same screen', () => {
    const result = validateFlowJson(flow({ screens: [screen([
      { type: 'Form', name: 'details', children: [{ type: 'If', condition: true, then: [
        { type: 'TextInput', name: 'secret', label: 'Secret' },
      ] }] }, footer(),
    ], { sensitive: ['secret', 'other'] })] }));
    expectIssue(result, 'INVALID_DYNAMIC_REFERENCE', 'screens[0].sensitive[1]');
    expect(result.issues).toHaveLength(1);
  });
});
