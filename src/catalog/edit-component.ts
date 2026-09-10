import type { Component, FlowJson, Screen } from '../schema/flow-json';

export type EditResult = { ok: true; flow: FlowJson } | { ok: false; error: string };

type Segment = string | number;

/** Parse `children[2].then[0]` into ['children', 2, 'then', 0]. */
export function parseLayoutPath(path: string): Segment[] {
  const segments: Segment[] = [];
  for (const match of path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) {
    if (match[1] !== undefined) segments.push(match[1]);
    else if (match[2] !== undefined) segments.push(Number(match[2]));
  }

  return segments;
}

/** Return the array that holds the component at `path` and the component's index in it. */
function locate(screen: Screen, path: string): { list: Component[]; index: number } | null {
  const segments = parseLayoutPath(path);
  const index = segments[segments.length - 1];
  if (typeof index !== 'number') return null;
  let current: unknown = screen.layout;
  for (const segment of segments.slice(0, -1)) {
    if (current === null || typeof current !== 'object') return null;
    current = (current as Record<string | number, unknown>)[segment];
  }
  if (!Array.isArray(current) || index < 0 || index >= current.length) return null;

  return { list: current as Component[], index };
}

function editScreen(flow: FlowJson, screenId: string, edit: (screen: Screen) => string | null): EditResult {
  const screenIndex = flow.screens.findIndex((screen) => screen.id === screenId);
  const original = flow.screens[screenIndex];
  if (!original) return { ok: false, error: `Screen "${screenId}" does not exist` };
  const screen = structuredClone(original);
  const error = edit(screen);
  if (error) return { ok: false, error };

  return { ok: true, flow: { ...flow, screens: flow.screens.map((item, index) => (index === screenIndex ? screen : item)) } };
}

/** Remove the component at `path` (from a rendered node) on the given screen. */
export function removeComponent(flow: FlowJson, screenId: string, path: string): EditResult {
  return editScreen(flow, screenId, (screen) => {
    const found = locate(screen, path);
    if (!found) return `No component at ${path}`;
    found.list.splice(found.index, 1);

    return null;
  });
}

/** Move the component at `path` one position up or down inside its container. */
export function moveComponent(flow: FlowJson, screenId: string, path: string, direction: 'up' | 'down'): EditResult {
  return editScreen(flow, screenId, (screen) => {
    const found = locate(screen, path);
    if (!found) return `No component at ${path}`;
    const target = direction === 'up' ? found.index - 1 : found.index + 1;
    if (target < 0 || target >= found.list.length) return 'Already at the edge';
    const [item] = found.list.splice(found.index, 1);
    found.list.splice(target, 0, item as Component);

    return null;
  });
}

/** Replace the component at `path` with a new one. */
export function replaceComponent(flow: FlowJson, screenId: string, path: string, component: Component): EditResult {
  return editScreen(flow, screenId, (screen) => {
    const found = locate(screen, path);
    if (!found) return `No component at ${path}`;
    found.list[found.index] = structuredClone(component);

    return null;
  });
}

/**
 * Move the component at `fromPath` so it lands before or after the component at `toPath`,
 * possibly in a different container (Form, If branch, Switch case, or the layout itself).
 */
export function moveComponentTo(
  flow: FlowJson,
  screenId: string,
  fromPath: string,
  toPath: string,
  position: 'before' | 'after',
): EditResult {
  if (fromPath === toPath) return { ok: true, flow };
  if (toPath.startsWith(`${fromPath}.`)) return { ok: false, error: 'Cannot move a component inside itself' };

  return editScreen(flow, screenId, (screen) => {
    const from = locate(screen, fromPath);
    const to = locate(screen, toPath);
    if (!from) return `No component at ${fromPath}`;
    if (!to) return `No component at ${toPath}`;
    const [item] = from.list.splice(from.index, 1);
    let index = to.index + (position === 'after' ? 1 : 0);
    if (to.list === from.list && from.index < to.index) index -= 1;
    to.list.splice(index, 0, item as Component);

    return null;
  });
}
