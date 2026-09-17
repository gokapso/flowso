import type { FlowRuntime, RenderedNode } from '../runtime/types';
import { isObject } from './scenario';

export function snapshot(runtime: FlowRuntime) {
  const state = runtime.getState();
  const screen = runtime.render();
  const fields: Record<string, unknown> = {};
  const actions: { target: string; label: unknown; action: unknown; item?: string; enabled: boolean }[] = [];
  const components = (screen?.children ?? []).map(node => {
    const enabled = node.props.enabled !== false;
    if (node.name) fields[node.name] = {
      type: node.type, label: node.props.label ?? null, value: node.value ?? null,
      required: node.props.required === true, enabled, error: node.error ?? null,
      ...(Array.isArray(node.props['data-source']) ? { options: node.props['data-source'] } : {}),
    };
    if (isObject(node.props['on-click-action'])) actions.push({
      target: node.path, label: node.props.label ?? node.props.text ?? node.type,
      action: node.props['on-click-action'].name, enabled,
    });
    if (node.type === 'NavigationList' && Array.isArray(node.props['list-items'])) {
      for (const item of node.props['list-items']) {
        const action = isObject(item) ? item['on-click-action'] ?? node.props['on-click-action'] : undefined;
        if (isObject(item) && typeof item.id === 'string' && isObject(action)) {
          actions.push({ target: node.path, item: item.id, label: item['main-content'] ?? item.id,
            action: action.name,
            enabled: enabled && item.enabled !== false });
        }
      }
    }
    return { target: node.path, type: node.type, ...(node.props.text !== undefined ? { text: node.props.text } : {}),
      ...(node.props.label !== undefined ? { label: node.props.label } : {}), enabled };
  });
  return {
    status: state.status, screen: state.screenId, title: screen?.title ?? null, history: state.history,
    data: state.screenId ? state.screenData[state.screenId] ?? {} : {}, fields, components, actions,
    canSubmit: screen?.canSubmit ?? false,
    fieldErrors: state.screenId ? state.fieldErrors[state.screenId] ?? {} : {},
    errorMessage: screen?.errorMessage ?? state.errorMessage, error: state.error,
    completion: state.completion ? JSON.parse(state.completion.responseJson) as Record<string, unknown> : null,
  };
}

export function input(runtime: FlowRuntime, name: string): RenderedNode {
  const matches = runtime.render()?.children.filter(node => node.name === name) ?? [];
  if (matches.length !== 1) throw new Error(`Expected one visible field named "${name}", found ${matches.length}; inspect fields before filling`);
  const node = matches[0]!;
  if (node.props.enabled === false) throw new Error(`Field "${name}" is disabled`);
  return node;
}

/** JSON Pointer lookup; never evaluates scenario code or expressions. */
export function pointer(value: unknown, path: string): unknown {
  if (!path.startsWith('/')) throw new Error('valueFrom must be a JSON Pointer, e.g. /fields/slot/options/0/id');
  for (const segment of path.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))) {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, segment)) throw new Error(`No value at ${path}`);
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

/** Objects match a subset; arrays match length/order, scalars match exactly. Empty objects assert emptiness. */
export function mismatch(actual: unknown, expected: unknown, path = ''): string | undefined {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return `${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
    for (let i = 0; i < expected.length; i += 1) {
      const error = mismatch(actual[i], expected[i], `${path}/${i}`);
      if (error) return error;
    }
  } else if (isObject(expected)) {
    if (!isObject(actual)) return `${path}: expected an object, got ${JSON.stringify(actual)}`;
    if (!Object.keys(expected).length && Object.keys(actual).length) return `${path}: expected {}, got ${JSON.stringify(actual)}`;
    for (const [key, value] of Object.entries(expected)) {
      const error = mismatch(actual[key], value, `${path}/${key}`);
      if (error) return error;
    }
  } else if (!Object.is(actual, expected)) return `${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
  return undefined;
}
