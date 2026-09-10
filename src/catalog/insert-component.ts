import type { Component, FlowJson, Screen } from '../schema/flow-json';
import { isInputComponent } from '../schema/flow-json';
import { COMPONENT_MIN_VERSION, compareVersions } from '../schema/versions';
import { collectInputs } from '../runtime/render';

export type InsertResult =
  | { ok: true; flow: FlowJson; screenId: string; path: string }
  | { ok: false; error: string };

export type InsertComponentOptions = {
  /** Screen to insert into. Defaults to the first screen. */
  screenId?: string;
  /** When the screen has a Form, insert inside it (default true). */
  intoForm?: boolean;
  /** Rename inputs whose `name` already exists on the screen (default true). */
  renameDuplicates?: boolean;
};

/**
 * Insert a component into a screen: inside the first Form when there is one, otherwise at the
 * layout level, always before an existing Footer. Returns a new flow (input is not mutated).
 */
export function insertComponent(flow: FlowJson, component: Component, options: InsertComponentOptions = {}): InsertResult {
  const screenId = options.screenId ?? flow.screens[0]?.id;
  const screenIndex = flow.screens.findIndex((screen) => screen.id === screenId);
  const screen = flow.screens[screenIndex];
  if (!screen || screenId === undefined) return { ok: false, error: `Screen "${screenId ?? ''}" does not exist` };

  const minVersion = COMPONENT_MIN_VERSION[component.type];
  if (minVersion && compareVersions(flow.version, minVersion) < 0) {
    return { ok: false, error: `${component.type} needs Flow JSON ${minVersion} or newer; this flow is ${flow.version}` };
  }

  if (component.type === 'Footer' && screenHasFooter(screen)) {
    return { ok: false, error: 'This screen already has a Footer' };
  }

  const next = structuredClone(component);
  if (isInputComponent(next)) {
    const existing = new Set(collectInputs(screen.layout.children).map((input) => input.name as string));
    if (existing.has(next.name)) {
      if (options.renameDuplicates === false) return { ok: false, error: `An input named "${next.name}" already exists on ${screenId}` };
      next.name = uniqueName(next.name, existing);
    }
  }

  const newScreen = structuredClone(screen) as Screen;
  const formIndex = options.intoForm === false ? -1 : newScreen.layout.children.findIndex((child) => child.type === 'Form');
  const container = formIndex >= 0
    ? (newScreen.layout.children[formIndex] as Extract<Component, { type: 'Form' }>).children
    : newScreen.layout.children;
  const footerIndex = container.findIndex((child) => child.type === 'Footer');
  const insertAt = footerIndex >= 0 ? footerIndex : container.length;
  container.splice(insertAt, 0, next);

  const path = formIndex >= 0
    ? `screens[${screenIndex}].layout.children[${formIndex}].children[${insertAt}]`
    : `screens[${screenIndex}].layout.children[${insertAt}]`;
  const screens = flow.screens.map((item, index) => (index === screenIndex ? newScreen : item));

  return { ok: true, flow: { ...flow, screens }, screenId, path };
}

/** Add a whole screen. Rewires `NEXT` targets in the inserted screen to nothing and adds a routing entry. */
export function insertScreen(flow: FlowJson, screen: Screen): InsertResult {
  const next = structuredClone(screen);
  const ids = new Set(flow.screens.map((item) => item.id));
  if (ids.has(next.id)) next.id = uniqueName(next.id, ids, '_');
  const routing = flow.routing_model ? { ...flow.routing_model, [next.id]: [] } : undefined;
  const screens = [...flow.screens, next];

  return { ok: true, flow: routing ? { ...flow, screens, routing_model: routing } : { ...flow, screens }, screenId: next.id, path: `screens[${screens.length - 1}]` };
}

/** Rewrite `navigate` targets named `NEXT` (used by catalog snippets) to a real screen id. */
export function rewireNextTargets<T>(value: T, target: string): T {
  if (Array.isArray(value)) return value.map((item) => rewireNextTargets(item, target)) as unknown as T;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record.name === 'navigate' && record.next && typeof record.next === 'object' && (record.next as { name?: string }).name === 'NEXT') {
      return { ...record, next: { ...(record.next as object), name: target } } as T;
    }
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(record)) result[key] = rewireNextTargets(item, target);

    return result as T;
  }

  return value;
}

function screenHasFooter(screen: Screen): boolean {
  const walk = (components: Component[]): boolean =>
    components.some((component) => {
      if (component.type === 'Footer') return true;
      if (component.type === 'Form') return walk(component.children);
      if (component.type === 'If') return walk(component.then) || walk(component.else ?? []);
      if (component.type === 'Switch') return Object.values(component.cases).some(walk);

      return false;
    });

  return walk(screen.layout.children);
}

function uniqueName(base: string, taken: Set<string>, separator = '_'): string {
  let index = 2;
  while (taken.has(`${base}${separator}${index}`)) index += 1;

  return `${base}${separator}${index}`;
}
