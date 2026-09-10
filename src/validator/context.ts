import { INPUT_COMPONENT_TYPES } from '../schema/flow-json';
import type { ValidationIssue, ValidationSeverity } from './types';

export type JsonObject = Record<string, unknown>;
export type LocatedValue = { value: unknown; path: string };
export type ComponentEntry = LocatedValue & { parentType: string; isLast: boolean; inForm: boolean };
export type ScreenEntry = {
  value: JsonObject;
  path: string;
  components: ComponentEntry[];
  actions: LocatedValue[];
  inputs: Set<string>;
};
export type ValidationContext = {
  flow: JsonObject;
  version: string | undefined;
  screens: ScreenEntry[];
  issues: ValidationIssue[];
};
export type Rule = (context: ValidationContext) => void;

export function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isInputType(type: unknown): boolean {
  return typeof type === 'string' && (INPUT_COMPONENT_TYPES as readonly string[]).includes(type);
}

export function addIssue(
  context: Pick<ValidationContext, 'issues'>,
  error: string,
  path: string,
  message: string,
  severity: ValidationSeverity = 'error',
): void {
  context.issues.push({ error, error_type: 'FLOW_JSON_ERROR', message, severity, pointers: [{ path }] });
}

export function checkProperty(
  context: ValidationContext,
  object: JsonObject,
  key: string,
  path: string,
  accepts: (value: unknown) => boolean,
  expected: string,
  required = true,
): void {
  if (!Object.hasOwn(object, key)) {
    if (required) addIssue(context, 'MISSING_REQUIRED_PROPERTY', `${path}.${key}`, `${key} is required`);
  } else if (!accepts(object[key])) {
    addIssue(context, 'INVALID_PROPERTY_VALUE', `${path}.${key}`, `${key} must be ${expected}`);
  }
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function componentEntries(value: unknown, path: string, parentType: string, inForm = false): ComponentEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((component: unknown, index): ComponentEntry[] => {
    const entry = { value: component, path: `${path}[${index}]`, parentType, isLast: index === value.length - 1, inForm };
    if (!isObject(component)) return [entry];
    if (component.type === 'Form') {
      return [entry, ...componentEntries(component.children, `${entry.path}.children`, 'Form', true)];
    }
    if (component.type === 'If') {
      return [entry, ...componentEntries(component.then, `${entry.path}.then`, 'If', inForm),
        ...componentEntries(component.else, `${entry.path}.else`, 'If', inForm)];
    }
    if (component.type === 'Switch' && isObject(component.cases)) {
      return [entry, ...Object.entries(component.cases).flatMap(([key, branch]) =>
        componentEntries(branch, `${entry.path}.cases.${key}`, 'Switch', inForm))];
    }
    return [entry];
  });
}

function actionEntries(value: unknown, path: string): LocatedValue[] {
  if (!isObject(value)) return [];
  const actions: LocatedValue[] = [];
  for (const key of ['on-click-action', 'on-select-action', 'on-unselect-action']) {
    if (Object.hasOwn(value, key)) actions.push({ value: value[key], path: `${path}.${key}` });
  }
  // Item-level actions are actions too; arbitrary payload/data objects are not.
  for (const key of ['list-items', 'data-source']) {
    const items = value[key];
    if (Array.isArray(items)) {
      items.forEach((item: unknown, index) => actions.push(...actionEntries(item, `${path}.${key}[${index}]`)));
    }
  }
  return actions;
}

export function createContext(flow: JsonObject): ValidationContext {
  const screens: ScreenEntry[] = [];
  if (Array.isArray(flow.screens)) {
    flow.screens.forEach((screen: unknown, index) => {
      if (!isObject(screen)) return;
      const path = `screens[${index}]`;
      const components = isObject(screen.layout)
        ? componentEntries(screen.layout.children, `${path}.layout.children`, 'SingleColumnLayout') : [];
      const inputs = new Set<string>();
      for (const { value } of components) {
        if (isObject(value) && isInputType(value.type) && isString(value.name)) inputs.add(value.name);
      }
      screens.push({ value: screen, path, components, inputs,
        actions: components.flatMap((entry) => actionEntries(entry.value, entry.path)) });
    });
  }
  return { flow, screens, issues: [],
    version: isString(flow.version) && /^\d+\.\d+$/.test(flow.version) ? flow.version : undefined };
}
