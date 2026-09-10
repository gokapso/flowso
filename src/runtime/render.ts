import type { Component, FlowJson, Screen } from '../schema/flow-json';
import { isInputComponent } from '../schema/flow-json';
import { resolveValue, resolveDeep, isActionKey, type EvaluationContext } from './expressions';
import type { RenderedNode, RenderedScreen } from './types';

export function findScreen(flow: FlowJson, screenId: string): Screen | undefined {
  return flow.screens.find((screen) => screen.id === screenId);
}

type FlattenOptions = {
  context: EvaluationContext;
  formValues: Record<string, unknown>;
  fieldErrors: Record<string, string>;
  /** Resolved Form `error-messages` of the enclosing Form, if any. */
  formErrors?: Record<string, string>;
};

/**
 * Flatten a screen's component tree: evaluate `If` / `Switch`, unwrap `Form`, drop invisible
 * components, resolve every dynamic property, and attach values and errors to inputs.
 */
export function flattenComponents(components: Component[], options: FlattenOptions, keyPrefix = ''): RenderedNode[] {
  const nodes: RenderedNode[] = [];
  components.forEach((component, index) => {
    const key = `${keyPrefix}${index}`;
    if (component.type === 'If') {
      const condition = resolveValue(component.condition, options.context);
      const branch = truthy(condition) ? component.then : component.else ?? [];
      nodes.push(...flattenComponents(branch, options, `${key}.`));

      return;
    }
    if (component.type === 'Switch') {
      const value = String(resolveValue(component.value, options.context) ?? '');
      const branch = component.cases[value] ?? [];
      nodes.push(...flattenComponents(branch, options, `${key}.${value}.`));

      return;
    }
    if (component.visible !== undefined && !truthy(resolveValue(component.visible, options.context))) {
      return;
    }
    if (component.type === 'Form') {
      const errorMessages = resolveValue(component['error-messages'], options.context);
      const formErrors = errorMessages && typeof errorMessages === 'object' ? (errorMessages as Record<string, string>) : undefined;
      nodes.push(...flattenComponents(component.children, { ...options, formErrors: formErrors ?? options.formErrors }, `${key}.`));

      return;
    }
    const props = resolveDeep({ ...component }, options.context, { skipKey: isActionKey }) as Record<string, unknown>;
    const node: RenderedNode = { key, type: component.type, props };
    if (isInputComponent(component)) {
      node.name = component.name;
      node.value = options.formValues[component.name];
      const remote = options.formErrors?.[component.name] ?? (typeof props['error-message'] === 'string' ? props['error-message'] : undefined);
      node.error = options.fieldErrors[component.name] ?? (remote ? String(remote) : null);
    }
    nodes.push(node);
  });

  return nodes;
}

export function renderScreen(
  screen: Screen,
  options: FlattenOptions & { errorMessage: string | null },
): RenderedScreen {
  const children = flattenComponents(screen.layout.children, options);

  return {
    id: screen.id,
    title: screen.title ?? '',
    terminal: screen.terminal === true,
    success: screen.success === true,
    children,
    errorMessage: options.errorMessage,
    canSubmit: children.every((node) => !node.name || node.props.required !== true || node.props.enabled === false || !isEmptyValue(node.value)),
  };
}

/** Empty for the purpose of "required": undefined, null, '', [], false. */
export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '' || value === false) return true;

  return Array.isArray(value) && value.length === 0;
}

/** Collect input components in render order, including the ones inside Form/If/Switch. */
export function collectInputs(components: Component[]): Component[] {
  const inputs: Component[] = [];
  for (const component of components) {
    if (component.type === 'If') {
      inputs.push(...collectInputs(component.then), ...collectInputs(component.else ?? []));
    } else if (component.type === 'Switch') {
      for (const branch of Object.values(component.cases)) inputs.push(...collectInputs(branch));
    } else if (component.type === 'Form') {
      inputs.push(...collectInputs(component.children));
    } else if (isInputComponent(component)) {
      inputs.push(component);
    }
  }

  return inputs;
}

export function collectForms(components: Component[]): Extract<Component, { type: 'Form' }>[] {
  const forms: Extract<Component, { type: 'Form' }>[] = [];
  for (const component of components) {
    if (component.type === 'Form') forms.push(component);
    if (component.type === 'If') forms.push(...collectForms(component.then), ...collectForms(component.else ?? []));
    if (component.type === 'Switch') {
      for (const branch of Object.values(component.cases)) forms.push(...collectForms(branch));
    }
  }

  return forms;
}

export function truthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value === '' || value === null || value === undefined) return false;

  return Boolean(value);
}
