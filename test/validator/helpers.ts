import { expect } from 'vitest';
import type { ValidationResult, ValidationSeverity } from '../../src/validator';

export function screen(children: unknown[] = [], properties: Record<string, unknown> = {}) {
  return { id: 'START', terminal: true, layout: { type: 'SingleColumnLayout', children }, ...properties };
}

export function flow(properties: Record<string, unknown> = {}) {
  return { version: '7.3', routing_model: {}, screens: [screen()], ...properties };
}

export function footer(name = 'complete', properties: Record<string, unknown> = {}) {
  return { type: 'Footer', label: 'Done', 'on-click-action': { name, ...properties } };
}

export function expectIssue(result: ValidationResult, error: string, path: string, severity: ValidationSeverity = 'error'): void {
  expect(result.issues).toContainEqual(expect.objectContaining({
    error, error_type: 'FLOW_JSON_ERROR', severity, pointers: [{ path }], message: expect.any(String),
  }));
  if (severity === 'error') expect(result.valid).toBe(false);
}
