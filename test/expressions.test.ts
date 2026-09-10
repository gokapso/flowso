import { describe, it, expect } from 'vitest';
import {
  parseReference,
  resolveValue,
  resolveDeep,
  evaluateNestedExpression,
  collectReferences,
  isDynamic,
  ExpressionError,
  type EvaluationContext,
} from '../src/runtime/expressions';

const context: EvaluationContext = {
  data: { name: 'Ana', age: 30, items: [{ id: 'a', title: 'A' }], nested: { deep: 'x' }, flag: true, empty: '' },
  form: { email: 'ana@example.com', accepted: false, count: '3' },
  screen: {
    WELCOME: { data: { greeting: 'hi' }, form: { first_name: 'Ana' } },
  },
};

describe('parseReference', () => {
  it('parses data, form and screen references', () => {
    expect(parseReference('${data.name}')).toMatchObject({ scope: 'data', path: ['name'] });
    expect(parseReference('${form.email}')).toMatchObject({ scope: 'form', path: ['email'] });
    expect(parseReference('${screen.WELCOME.form.first_name}')).toMatchObject({
      scope: 'screen',
      screenId: 'WELCOME',
      screenScope: 'form',
      path: ['first_name'],
    });
  });

  it('parses nested paths and array indexes', () => {
    expect(parseReference('${data.items[0].title}')).toMatchObject({ path: ['items', '0', 'title'] });
    expect(parseReference('${data.nested.deep}')).toMatchObject({ path: ['nested', 'deep'] });
  });

  it('rejects unknown scopes', () => {
    expect(parseReference('${vars.x}')).toBeNull();
    expect(parseReference('${screen.X.other.y}')).toBeNull();
  });
});

describe('resolveValue', () => {
  it('returns literals unchanged', () => {
    expect(resolveValue('Hello', context)).toBe('Hello');
    expect(resolveValue(42, context)).toBe(42);
    expect(resolveValue(true, context)).toBe(true);
  });

  it('resolves whole references', () => {
    expect(resolveValue('${data.name}', context)).toBe('Ana');
    expect(resolveValue('${form.accepted}', context)).toBe(false);
    expect(resolveValue('${data.items[0].title}', context)).toBe('A');
    expect(resolveValue('${screen.WELCOME.form.first_name}', context)).toBe('Ana');
    expect(resolveValue('${data.missing}', context)).toBeUndefined();
  });

  it('does not interpolate references inside plain strings', () => {
    expect(resolveValue('Hello ${data.name}', context)).toBe('Hello ${data.name}');
  });
});

describe('evaluateNestedExpression', () => {
  it('concatenates adjacent operands', () => {
    expect(evaluateNestedExpression("`'Hello ' ${data.name}`", context)).toBe('Hello Ana');
    expect(evaluateNestedExpression("`${data.name} ' is ' ${data.age}`", context)).toBe('Ana is 30');
  });

  it('evaluates comparisons with loose number/string equality', () => {
    expect(evaluateNestedExpression('`${data.age} >= 18`', context)).toBe(true);
    expect(evaluateNestedExpression("`${form.count} == 3`", context)).toBe(true);
    expect(evaluateNestedExpression("`${data.name} == 'Ana'`", context)).toBe(true);
    expect(evaluateNestedExpression("`${data.name} != 'Ana'`", context)).toBe(false);
  });

  it('evaluates logical operators with precedence and parentheses', () => {
    expect(evaluateNestedExpression('`${data.flag} && !${form.accepted}`', context)).toBe(true);
    expect(evaluateNestedExpression("`(${data.age} < 18) || (${data.name} == 'Ana')`", context)).toBe(true);
    expect(evaluateNestedExpression("`${data.age} < 18 || ${data.name} == 'Ana' && false`", context)).toBe(false);
  });

  it('evaluates arithmetic', () => {
    expect(evaluateNestedExpression('`${data.age} + 5`', context)).toBe(35);
    expect(evaluateNestedExpression('`(${data.age} - 10) * 2`', context)).toBe(40);
    expect(evaluateNestedExpression('`-${data.age}`', context)).toBe(-30);
    expect(evaluateNestedExpression('`${data.age} % 7`', context)).toBe(2);
  });

  it('treats empty strings, missing values and empty arrays as falsy', () => {
    expect(evaluateNestedExpression('`!${data.empty}`', context)).toBe(true);
    expect(evaluateNestedExpression('`!${data.missing}`', context)).toBe(true);
    expect(evaluateNestedExpression('`${data.items} && true`', context)).toBe(true);
  });

  it('throws on malformed expressions', () => {
    expect(() => evaluateNestedExpression("`'unterminated`", context)).toThrow(ExpressionError);
    expect(() => evaluateNestedExpression('`${data.a} ==`', context)).toThrow(ExpressionError);
    expect(() => evaluateNestedExpression('`${vars.a}`', context)).toThrow(ExpressionError);
  });
});

describe('resolveDeep', () => {
  it('resolves values nested in objects and arrays', () => {
    const payload = { name: '${data.name}', extra: { email: '${form.email}', list: ['${data.age}', 'x'] } };
    expect(resolveDeep(payload, context)).toEqual({ name: 'Ana', extra: { email: 'ana@example.com', list: [30, 'x'] } });
  });
});

describe('helpers', () => {
  it('collects references from mixed strings', () => {
    const refs = collectReferences("`${data.name} ' and ' ${form.email}`");
    expect(refs.map((r) => r.scope)).toEqual(['data', 'form']);
  });

  it('detects dynamic values', () => {
    expect(isDynamic('${data.x}')).toBe(true);
    expect(isDynamic('`${data.x} == 1`')).toBe(true);
    expect(isDynamic('plain')).toBe(false);
    expect(isDynamic(3)).toBe(false);
  });
});
