import { addIssue, createContext, isObject } from './context';
import { rules } from './rules';
import type { ValidationIssue, ValidationResult } from './types';

export type { ValidationSeverity, ValidationPointer, ValidationIssue, ValidationResult } from './types';

export function validateFlowJson(input: unknown): ValidationResult {
  if (!isObject(input)) {
    const result: ValidationResult = { valid: false, issues: [] };
    addIssue(result, 'INVALID_PROPERTY_VALUE', '$', 'Flow JSON must be an object');
    return result;
  }
  const context = createContext(input);
  for (const rule of rules) rule(context);
  return { valid: !context.issues.some((issue) => issue.severity === 'error'), issues: context.issues };
}

export function formatIssue(issue: ValidationIssue): string {
  return `${issue.error} at ${issue.pointers.map((pointer) => pointer.path).join(', ')}: ${issue.message}`;
}
