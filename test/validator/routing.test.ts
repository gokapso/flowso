import { describe, expect, it } from 'vitest';
import { validateFlowJson } from '../../src/validator';
import { expectIssue, flow, footer, screen } from './helpers';

describe('routing', () => {
  it('checks routing sources, targets, and target arrays', () => {
    const result = validateFlowJson(flow({ routing_model: { MISSING: [], START: ['NOPE', 12], BROKEN: 'START' } }));
    expectIssue(result, 'INVALID_ROUTING_MODEL', 'routing_model.MISSING');
    expectIssue(result, 'INVALID_ROUTING_MODEL', 'routing_model.START[0]');
    expectIssue(result, 'INVALID_ROUTING_MODEL', 'routing_model.START[1]');
    expectIssue(result, 'INVALID_ROUTING_MODEL', 'routing_model.BROKEN');
  });

  it('checks navigate targets and membership in a non-empty routing model', () => {
    const result = validateFlowJson(flow({ routing_model: { START: [] }, screens: [screen([
      footer('navigate', { next: { name: 'MISSING' } }),
    ])] }));
    const path = 'screens[0].layout.children[0].on-click-action.next.name';
    expectIssue(result, 'INVALID_SCREEN_REFERENCE', path);
    expectIssue(result, 'INVALID_ROUTING_MODEL', path);
  });

  it('checks item-level actions and a missing routing source', () => {
    const result = validateFlowJson(flow({ routing_model: { END: [] }, screens: [screen([
      { type: 'NavigationList', name: 'menu', 'list-items': [
        { 'on-click-action': { name: 'navigate', next: { name: 'END' } } },
      ] },
    ], { terminal: false }), screen([footer()], { id: 'END' })] }));
    expectIssue(result, 'INVALID_ROUTING_MODEL', 'screens[0].layout.children[0].list-items[0].on-click-action.next.name');
  });

  it('accepts navigate routes with an empty model and warns only for screens without incoming routes', () => {
    const result = validateFlowJson(flow({ screens: [
      screen([footer('navigate', { next: { name: 'END' } })], { terminal: false }),
      screen([footer()], { id: 'END' }), screen([footer()], { id: 'UNUSED' }),
    ] }));
    expectIssue(result, 'UNREACHABLE_SCREEN', 'screens[2].id', 'warning');
    expect(result.issues).toHaveLength(1);
    expect(result.valid).toBe(true);
  });

  it('counts incoming routes from later screens and endpoint routing entries', () => {
    const result = validateFlowJson(flow({ routing_model: { START: ['LAST'], LAST: ['MIDDLE'] }, screens: [
      screen([], { terminal: false }), screen([footer()], { id: 'MIDDLE' }),
      screen([footer('navigate', { next: { name: 'MIDDLE' } })], { id: 'LAST', terminal: false }),
    ] }));
    expect(result.issues).toEqual([]);
  });
  it.each([
    { A: ['B'], B: ['A'] },
    { A: ['B'], B: ['C'], C: ['A'] },
    { A: ['A'] },
    { START: [], A: ['B'], B: ['A'] },
  ])('rejects cycles including disconnected cycles and self loops: %j', routing => {
    const result = validateFlowJson(flow({ routing_model: routing,
      screens: Object.keys(routing).map(id => screen([footer()], { id })),
    }));
    const issues = result.issues.filter(issue => issue.error === 'INVALID_ROUTING_MODEL');
    expect(result.valid).toBe(false);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('Back navigation is implicit. Remove');
  });

  it('accepts a converging DAG regardless of screen-array order', () => {
    for (const ids of [['A', 'B', 'C', 'D'], ['D', 'C', 'B', 'A']]) {
      const result = validateFlowJson(flow({ routing_model: { A: ['B', 'C'], B: ['D'], C: ['D'], D: [] },
        screens: ids.map(id => screen([footer()], { id })),
      }));
      expect(result.valid).toBe(true);
      expect(result.issues.filter(issue => issue.error === 'INVALID_ROUTING_MODEL')).toEqual([]);
    }
  });

});
