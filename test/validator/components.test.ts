import { describe, expect, it } from 'vitest';
import { validateFlowJson } from '../../src/validator';
import { expectIssue, flow, footer, screen } from './helpers';

describe('components and actions', () => {
  it('rejects malformed children and unknown components without throwing', () => {
    const result = validateFlowJson(flow({ screens: [screen([null, 1, {}, { type: 'MadeUp' }, { type: 'constructor' }])] }));
    expectIssue(result, 'INVALID_PROPERTY_VALUE', 'screens[0].layout.children[0]');
    expectIssue(result, 'INVALID_PROPERTY_VALUE', 'screens[0].layout.children[1]');
    expectIssue(result, 'MISSING_REQUIRED_PROPERTY', 'screens[0].layout.children[2].type');
    expectIssue(result, 'UNKNOWN_COMPONENT', 'screens[0].layout.children[3].type');
    expectIssue(result, 'UNKNOWN_COMPONENT', 'screens[0].layout.children[4].type');
  });

  it.each([
    ['TextHeading', 'text'], ['TextSubheading', 'text'], ['TextBody', 'text'], ['TextCaption', 'text'],
    ['RichText', 'text'], ['Image', 'src'], ['TextInput', 'name'], ['TextArea', 'label'],
    ['RadioButtonsGroup', 'data-source'], ['CheckboxGroup', 'data-source'], ['Dropdown', 'data-source'],
    ['ChipsSelector', 'data-source'], ['Footer', 'label'], ['Footer', 'on-click-action'],
    ['EmbeddedLink', 'text'], ['EmbeddedLink', 'on-click-action'], ['NavigationList', 'name'],
    ['NavigationList', 'list-items'], ['If', 'condition'], ['If', 'then'], ['Switch', 'value'],
    ['Switch', 'cases'], ['Form', 'name'], ['Form', 'children'], ['ImageCarousel', 'images'],
    ['OptIn', 'name'], ['DatePicker', 'label'], ['CalendarPicker', 'label'],
    ['PhotoPicker', 'label'], ['DocumentPicker', 'name'],
  ])('requires %s.%s', (type, property) => {
    expectIssue(validateFlowJson(flow({ screens: [screen([{ type }])] })),
      'MISSING_REQUIRED_PROPERTY', `screens[0].layout.children[0].${property}`);
  });

  it('validates required property types and malformed branches', () => {
    const result = validateFlowJson(flow({ screens: [screen([
      { type: 'If', condition: {}, then: [], else: 1 },
      { type: 'Switch', value: 1, cases: { broken: null, nested: [{ type: 'TextInput', name: 1, label: null }] } },
      { type: 'Form', name: 'form', children: {} }, { type: 'Switch', value: 'literal', cases: {} },
      { type: 'TextHeading', text: ' ' },
    ])] }));
    for (const path of ['[0].condition', '[0].then', '[0].else', '[1].value', '[1].cases.broken',
      '[1].cases.nested[0].name', '[1].cases.nested[0].label', '[2].children', '[3].cases', '[4].text']) {
      expectIssue(result, 'INVALID_PROPERTY_VALUE', `screens[0].layout.children${path}`);
    }
  });

  it('detects duplicate names across Form/If/Switch branches', () => {
    const input = { type: 'TextInput', name: 'email', label: 'Email' };
    const result = validateFlowJson(flow({ screens: [screen([
      { type: 'Form', name: 'details', children: [input] },
      { type: 'If', condition: true, then: [input], else: [
        { type: 'Switch', value: 'a', cases: { a: [input] } },
      ] }, footer(),
    ])] }));
    expectIssue(result, 'DUPLICATE_FIELD_NAME', 'screens[0].layout.children[1].then[0].name');
    expectIssue(result, 'DUPLICATE_FIELD_NAME', 'screens[0].layout.children[1].else[0].cases.a[0].name');
    expect(result.issues).toHaveLength(2);
  });

  it('allows the same input name on different screens', () => {
    const children = [{ type: 'TextInput', name: 'name', label: 'Name' }, footer()];
    const result = validateFlowJson(flow({ screens: [screen(children), screen(children, { id: 'END' })] }));
    expect(result.valid).toBe(true);
    expect(result.issues.some((issue) => issue.error === 'DUPLICATE_FIELD_NAME')).toBe(false);
  });

  it('requires one Footer placed last in the layout or its Form', () => {
    const result = validateFlowJson(flow({ screens: [screen([
      footer(), { type: 'Form', name: 'details', children: [footer(), { type: 'TextBody', text: 'After' }] },
    ])] }));
    expectIssue(result, 'INVALID_FOOTER_POSITION', 'screens[0].layout.children[0]');
    expectIssue(result, 'INVALID_FOOTER_POSITION', 'screens[0].layout.children[1].children[0]');
    expect(result.issues.some((issue) => issue.message.includes('at most one Footer'))).toBe(true);
  });

  it('follows the requested Footer placement rule even for conditional branches', () => {
    const result = validateFlowJson(flow({ screens: [screen([{ type: 'If', condition: true, then: [footer()] }])] }));
    expectIssue(result, 'INVALID_FOOTER_POSITION', 'screens[0].layout.children[0].then[0]');
  });

  it.each([
    [{ name: 'navigate', next: {} }, 'next.name'], [{ name: 'open_url' }, 'url'],
    [{ name: 'update_data' }, 'payload'], [{}, 'name'],
  ])('requires action fields in %j', (action, property) => {
    expectIssue(validateFlowJson(flow({ screens: [screen([
      { type: 'EmbeddedLink', text: 'Continue', 'on-click-action': action }, footer(),
    ])] })), 'MISSING_REQUIRED_PROPERTY', `screens[0].layout.children[0].on-click-action.${property}`);
  });

  it('checks unknown, malformed, and selection item actions', () => {
    const result = validateFlowJson(flow({ screens: [screen([
      { type: 'EmbeddedLink', text: 'Go', 'on-click-action': null },
      { type: 'OptIn', name: 'opt', label: 'Yes', 'on-select-action': { name: 'unknown' } },
      { type: 'Dropdown', name: 'choice', label: 'Choice', 'data-source': [
        { id: 'x', title: 'X', 'on-unselect-action': { name: 'update_data', payload: [] } },
      ] }, footer(),
    ])] }));
    expectIssue(result, 'INVALID_PROPERTY_VALUE', 'screens[0].layout.children[0].on-click-action');
    expectIssue(result, 'UNKNOWN_ACTION', 'screens[0].layout.children[1].on-select-action.name');
    expectIssue(result, 'INVALID_PROPERTY_VALUE', 'screens[0].layout.children[2].data-source[0].on-unselect-action.payload');
  });

  it('does not mistake action-shaped payload data for an action', () => {
    const result = validateFlowJson(flow({ screens: [screen([footer('data_exchange', {
      payload: { 'on-click-action': { name: 'customer_value' }, type: 'Footer' },
    })])] }));
    expect(result.issues).toEqual([]);
  });

  it.each([['PhotoPicker', 'PhotoPicker'], ['DocumentPicker', 'DocumentPicker'], ['PhotoPicker', 'DocumentPicker']])(
    'warns on multiple media pickers: %s, %s', (first, second) => {
      const result = validateFlowJson(flow({ screens: [screen([
        { type: first, name: 'first', label: 'First' }, { type: second, name: 'second', label: 'Second' }, footer(),
      ])] }));
      expectIssue(result, 'COMPONENT_LIMIT_EXCEEDED', 'screens[0].layout.children[1]', 'warning');
      expect(result.valid).toBe(true);
    });
});
