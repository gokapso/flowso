import { describe, expect, it } from 'vitest';
import { validateFlowJson } from '../../src/validator';
import { expectIssue, flow, footer, screen } from './helpers';

describe('literal limits', () => {
  it.each([
    ['TextHeading', 'text', 80], ['TextSubheading', 'text', 80], ['TextBody', 'text', 4096],
    ['TextCaption', 'text', 409], ['TextInput', 'label', 20], ['Footer', 'label', 35],
  ])('warns only above the %s.%s limit', (type, key, maximum) => {
    function check(length: number) {
      const component = { type, name: 'field', [key]: 'a'.repeat(length), 'on-click-action': { name: 'complete' } };
      return validateFlowJson(flow({ screens: [screen(type === 'Footer' ? [component] : [component, footer()])] }));
    }
    expect(check(maximum).issues).toEqual([]);
    const result = check(maximum + 1);
    expectIssue(result, 'PROPERTY_LIMIT_EXCEEDED', `screens[0].layout.children[0].${key}`, 'warning');
    expect(result.valid).toBe(true);
  });

  it.each([['RadioButtonsGroup', 20], ['CheckboxGroup', 20], ['Dropdown', 200]])(
    'warns only above the %s item limit', (type, maximum) => {
      function check(count: number) {
        return validateFlowJson(flow({ screens: [screen([
          { type, name: 'choice', label: 'Choice', 'data-source': Array.from({ length: count }, (_, index) => ({ id: `${index}`, title: 'Item' })) },
          footer(),
        ])] }));
      }
      expect(check(maximum).issues).toEqual([]);
      const result = check(maximum + 1);
      expectIssue(result, 'PROPERTY_LIMIT_EXCEEDED', 'screens[0].layout.children[0].data-source', 'warning');
      expect(result.valid).toBe(true);
    });

  it('uses the documented 100-item Dropdown limit when images are present', () => {
    const result = validateFlowJson(flow({ screens: [screen([
      { type: 'Dropdown', name: 'choice', label: 'Choice', 'data-source': Array.from({ length: 101 }, (_, index) => ({ id: `${index}`, title: 'Item', image: 'base64' })) },
      footer(),
    ])] }));
    expectIssue(result, 'PROPERTY_LIMIT_EXCEEDED', 'screens[0].layout.children[0].data-source', 'warning');
    expect(result.valid).toBe(true);
  });

  it('does not measure dynamic source code as rendered text or data-source length', () => {
    const field = 'long_name_'.repeat(12);
    const result = validateFlowJson(flow({ screens: [screen([
      { type: 'TextHeading', text: '${data.' + field + '}' },
      { type: 'TextInput', name: 'name', label: "`'Long expression that evaluates dynamically: ' ${data." + field + '}`' },
      { type: 'Dropdown', name: 'choice', label: 'Choice', 'data-source': '${data.items}' }, footer(),
    ], { data: { [field]: { type: 'string', __example__: 'Hi' }, items: { type: 'array', __example__: [] } } })] }));
    expect(result.issues).toEqual([]);
  });
});
