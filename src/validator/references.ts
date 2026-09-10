import {
  collectReferences, ExpressionError, isNestedExpression, isWholeReference, parseNestedExpression, parseReference,
  type ParsedReference,
} from '../runtime/expressions';
import { supportsNestedExpressions } from '../schema/versions';
import { addIssue, isObject, isString, type Rule, type ScreenEntry, type ValidationContext } from './context';

function validateReference(
  context: ValidationContext, screen: ScreenEntry, screens: ReadonlyMap<string, ScreenEntry>, reference: ParsedReference, path: string,
): void {
  const target = reference.scope === 'screen' ? screens.get(reference.screenId ?? '') : screen;
  const scope = reference.scope === 'screen' ? reference.screenScope : reference.scope;
  const field = reference.path[0];
  const exists = target && field && reference.path.every((segment) => segment.length > 0) && (scope === 'form'
    ? target.inputs.has(field)
    : isObject(target.value.data) && Object.hasOwn(target.value.data, field));
  if (!exists) {
    addIssue(context, 'INVALID_DYNAMIC_REFERENCE', path, `Reference ${reference.raw} does not match a declared screen data field or input`);
  }
}

function validateString(
  context: ValidationContext, screen: ScreenEntry, screens: ReadonlyMap<string, ScreenEntry>, value: string, path: string,
): void {
  // These runtime predicates narrow unknown to string, not string to a reference subtype.
  if (isWholeReference(value as unknown)) {
    const reference = parseReference(value);
    if (reference) validateReference(context, screen, screens, reference, path);
    else addIssue(context, 'INVALID_DYNAMIC_REFERENCE', path, `Invalid reference ${value}`);
    return;
  }
  if (isNestedExpression(value as unknown)) {
    if (context.version && !supportsNestedExpressions(context.version)) {
      addIssue(context, 'INVALID_EXPRESSION', path, 'nested expressions require Flow JSON 6.0 or later');
    }
    try {
      parseNestedExpression(value);
    } catch (error) {
      if (!(error instanceof ExpressionError)) throw error;
      addIssue(context, 'INVALID_EXPRESSION', path, error.message);
      return;
    }
    for (const reference of collectReferences(value)) validateReference(context, screen, screens, reference, path);
    return;
  }
  if (value.startsWith('`') || value.endsWith('`')) {
    addIssue(context, 'INVALID_EXPRESSION', path, 'nested expressions must start and end with a backtick');
  } else if (value.includes('${')) {
    addIssue(context, 'INVALID_DYNAMIC_REFERENCE', path,
      'use a whole ${...} reference or a backtick nested expression to combine references with text');
  }
}

function visitStrings(value: unknown, path: string, visit: (value: string, path: string) => void): void {
  if (isString(value)) visit(value, path);
  else if (Array.isArray(value)) value.forEach((child: unknown, index) => visitStrings(child, `${path}[${index}]`, visit));
  else if (isObject(value)) Object.entries(value).forEach(([key, child]) => visitStrings(child, `${path}.${key}`, visit));
}

export const validateReferences: Rule = (context) => {
  const screens = new Map<string, ScreenEntry>();
  for (const screen of context.screens) {
    if (isString(screen.value.id)) screens.set(screen.value.id, screen);
  }
  for (const screen of context.screens) {
    visitStrings(screen.value, screen.path, (value, path) => validateString(context, screen, screens, value, path));
  }
};
