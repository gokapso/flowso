import { describe, expect, it } from 'vitest';
import { validateFlowJson } from '../../src/validator';
import { expectIssue, flow, footer, screen } from './helpers';

describe('versions', () => {
  it('warns without hard-failing a valid legacy flow with wrapped inputs', () => {
    const result = validateFlowJson(flow({ version: '3.1', screens: [screen([
      { type: 'Form', name: 'details', children: [{ type: 'TextInput', name: 'email', label: 'Email' }, footer()] },
    ])] }));
    expectIssue(result, 'UNSUPPORTED_VERSION', 'version', 'warning');
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(1);
  });

  it('requires a Form before 4.0 but permits unwrapped inputs at 4.0', () => {
    const screens = [screen([{ type: 'TextInput', name: 'email', label: 'Email' }, footer()])];
    expectIssue(validateFlowJson(flow({ version: '3.1', screens })), 'MISSING_FORM_WRAPPER', 'screens[0].layout.children[0]');
    expect(validateFlowJson(flow({ version: '4.0', screens })).issues).toEqual([]);
  });

  it.each([
    ['RichText', '5.0', '5.1', { text: 'Hello' }],
    ['ChipsSelector', '6.2', '6.3', { name: 'choice', label: 'Choice', 'data-source': [] }],
    ['ImageCarousel', '7.0', '7.1', { images: [] }],
  ])('checks the %s version boundary', (type, before, minimum, properties) => {
    const screens = [screen([{ type, ...properties }, footer()])];
    expectIssue(validateFlowJson(flow({ version: before, screens })), 'COMPONENT_NOT_AVAILABLE_IN_VERSION', 'screens[0].layout.children[0].type');
    expect(validateFlowJson(flow({ version: minimum, screens })).issues).toEqual([]);
  });

  it.each(['open_url', 'update_data'])('checks the %s action version boundary', (name) => {
    const screens = [screen([
      { type: 'EmbeddedLink', text: 'Go', 'on-click-action': { name, url: 'https://example.com', payload: {} } }, footer(),
    ])];
    expectIssue(validateFlowJson(flow({ version: '5.1', screens })), 'ACTION_NOT_AVAILABLE_IN_VERSION',
      'screens[0].layout.children[0].on-click-action.name');
    expect(validateFlowJson(flow({ version: '6.0', screens })).issues).toEqual([]);
  });

  it('compares versions numerically', () => {
    const result = validateFlowJson(flow({ version: '10.0', screens: [screen([{ type: 'ImageCarousel', images: [] }, footer()])] }));
    expect(result.issues).toEqual([]);
  });
});
