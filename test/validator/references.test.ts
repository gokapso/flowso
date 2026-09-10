import { describe, expect, it } from 'vitest';
import { ExpressionError, parseNestedExpression } from '../../src/runtime/expressions';
import { validateFlowJson } from '../../src/validator';
import { expectIssue, flow, footer, screen } from './helpers';

describe('references and expressions', () => {
  it.each([
    '${data.missing}', '${form.missing}', '${screen.MISSING.data.name}', '${screen.END.form.missing}',
    '${screen.END.data.missing}', '${other.name}', '${data}', '${form.}', '${data.name..child}', '${data.constructor}',
  ])('rejects invalid reference %s', (text) => {
    const result = validateFlowJson(flow({ screens: [screen([{ type: 'TextBody', text }, footer()], {
      data: { name: { type: 'string', __example__: 'Hi' } },
    }), screen([footer()], { id: 'END' })] }));
    expectIssue(result, 'INVALID_DYNAMIC_REFERENCE', 'screens[0].layout.children[0].text');
  });

  it('accepts same-screen and cross-screen references, array paths, and nested branch inputs', () => {
    const result = validateFlowJson(flow({ routing_model: { START: ['END'] }, screens: [screen([
      { type: 'If', condition: true, then: [{ type: 'TextInput', name: 'email', label: 'Email' }] },
      footer('data_exchange', { payload: {
        local: '${form.email}', nested: '${data.items[0].title}',
        remote: '${screen.END.form.accepted}', remoteData: '${screen.END.data.message}',
      } }),
    ], { data: { items: { type: 'array', __example__: [] } } }), screen([
      { type: 'Switch', value: 'yes', cases: { yes: [{ type: 'OptIn', name: 'accepted', label: 'Accept' }] } },
      { type: 'TextBody', text: "`'Hi ' ${screen.START.form.email}`" }, footer(),
    ], { id: 'END', data: { message: { type: 'string', __example__: 'Hello' } } })] }));
    expect(result.issues).toEqual([]);
  });

  it('checks deeply nested data_exchange payload values in the current screen context', () => {
    const result = validateFlowJson(flow({ screens: [screen([footer('data_exchange', {
      payload: { nested: [{ answer: '${form.missing}' }] },
    })])] }));
    expectIssue(result, 'INVALID_DYNAMIC_REFERENCE', 'screens[0].layout.children[0].on-click-action.payload.nested[0].answer');
  });

  it('checks every string, including examples, arrays and item properties', () => {
    const result = validateFlowJson(flow({ screens: [screen([
      { type: 'TextBody', text: ['Hello', '${data.missing}'] }, footer(),
    ], { data: { name: { type: 'string', __example__: '${form.missing}' } } })] }));
    expectIssue(result, 'INVALID_DYNAMIC_REFERENCE', 'screens[0].layout.children[0].text[1]');
    expectIssue(result, 'INVALID_DYNAMIC_REFERENCE', 'screens[0].data.name.__example__');
  });

  it('explains how to fix plain-string interpolation', () => {
    const result = validateFlowJson(flow({ screens: [screen([{ type: 'TextBody', text: 'Hello ${data.name}' }, footer()])] }));
    expectIssue(result, 'INVALID_DYNAMIC_REFERENCE', 'screens[0].layout.children[0].text');
    expect(result.issues[0]?.message).toContain('backtick nested expression');
  });

  it('returns the nested-expression parser message unchanged', () => {
    const text = '`${data.name} +`';
    let parserMessage = '';
    try { parseNestedExpression(text); } catch (error) {
      expect(error).toBeInstanceOf(ExpressionError);
      if (error instanceof ExpressionError) parserMessage = error.message;
    }
    const result = validateFlowJson(flow({ screens: [screen([{ type: 'TextBody', text }, footer()])] }));
    expectIssue(result, 'INVALID_EXPRESSION', 'screens[0].layout.children[0].text');
    expect(result.issues[0]?.message).toBe(parserMessage);
  });

  it.each(['`1 + 2', '1 + 2`', '`${other.name}`', '``'])('rejects malformed expression %s', (text) => {
    expectIssue(validateFlowJson(flow({ screens: [screen([{ type: 'TextBody', text }, footer()])] })),
      'INVALID_EXPRESSION', 'screens[0].layout.children[0].text');
  });

  it('checks declarations inside successfully parsed nested expressions', () => {
    expectIssue(validateFlowJson(flow({ screens: [screen([{ type: 'TextBody', text: "`'Hi ' ${data.missing}`" }, footer()])] })),
      'INVALID_DYNAMIC_REFERENCE', 'screens[0].layout.children[0].text');
  });

  it('gates nested expressions at 6.0', () => {
    const screens = [screen([{ type: 'TextBody', text: '`1 + 2`' }, footer()])];
    expectIssue(validateFlowJson(flow({ version: '5.1', screens })), 'INVALID_EXPRESSION', 'screens[0].layout.children[0].text');
    expect(validateFlowJson(flow({ version: '6.0', screens })).issues).toEqual([]);
  });
});
