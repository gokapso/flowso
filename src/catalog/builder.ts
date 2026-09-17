import type { Component, FlowJson, Screen } from '../schema/flow-json';
import type { EditResult } from './edit-component';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isComponentList(value: unknown): value is Component[] {
  return Array.isArray(value) && value.every((item) => {
    if (!isRecord(item) || typeof item.type !== 'string') return false;
    if (item.type === 'Form') return isComponentList(item.children);
    if (item.type === 'If') return isComponentList(item.then) && (item.else === undefined || isComponentList(item.else));
    if (item.type === 'Switch') return isRecord(item.cases) && Object.values(item.cases).every(isComponentList);
    return true;
  });
}

/** Only checks the shape the visual editor needs; the validator owns Flow JSON rules. */
export function parseBuilderFlow(source: string): FlowJson {
  const flow: unknown = JSON.parse(source);
  if (!isRecord(flow) || typeof flow.version !== 'string' || !Array.isArray(flow.screens)
    || !flow.screens.every((screen) => isRecord(screen) && typeof screen.id === 'string'
      && isRecord(screen.layout) && isComponentList(screen.layout.children))) {
    throw new Error('Visual editing needs a Flow with a version and screens containing layout.children. Edit the JSON to continue.');
  }
  const ids = flow.screens.map((screen) => screen.id);
  if (new Set(ids).size !== ids.length) throw new Error('Screen IDs must be unique. Edit the JSON to continue.');
  return flow as FlowJson;
}

export function reorderItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Footer placement stays fixed when reordering its siblings. */
export function reorderComponents(items: Component[], from: number, to: number): Component[] {
  if (items[from]?.type === 'Footer' || items[to]?.type === 'Footer') return items;
  return reorderItem(items, from, to);
}

function referencesScreen(value: unknown, id: string): boolean {
  if (typeof value === 'string') return value.includes(`\${screen.${id}.`);
  if (Array.isArray(value)) return value.some((item) => referencesScreen(item, id));
  if (!isRecord(value)) return false;
  if (value.name === 'navigate' && isRecord(value.next) && value.next.name === id) return true;
  return Object.values(value).some((item) => referencesScreen(item, id));
}

export function removeBuilderScreen(flow: FlowJson, id: string): EditResult {
  if (flow.screens.length <= 1) return { ok: false, error: 'Keep at least one screen in the flow.' };
  if (!flow.screens.some((screen) => screen.id === id)) return { ok: false, error: 'Screen not found.' };
  const remaining = flow.screens.filter((screen) => screen.id !== id);
  if (remaining.some((screen) => referencesScreen(screen, id))) {
    return { ok: false, error: 'Another screen links to this screen or uses its data. Update those references in JSON before removing it.' };
  }
  const next = { ...flow, screens: remaining };
  if (flow.routing_model) {
    next.routing_model = Object.fromEntries(Object.entries(flow.routing_model)
      .filter(([key]) => key !== id).map(([key, targets]) => [key, targets.filter((target) => target !== id)]));
  }
  return { ok: true, flow: next };
}

export function newBuilderScreen(flow: FlowJson): Screen {
  let index = flow.screens.length + 1;
  while (flow.screens.some((screen) => screen.id === `SCREEN_${index}`)) index++;
  return {
    id: `SCREEN_${index}`, title: 'New screen', terminal: true,
    layout: { type: 'SingleColumnLayout', children: [
      { type: 'TextHeading', text: 'New screen' },
      { type: 'Footer', label: 'Done', 'on-click-action': { name: 'complete', payload: {} } },
    ] },
  };
}
