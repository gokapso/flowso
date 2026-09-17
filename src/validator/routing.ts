import { addIssue, isObject, isString, type Rule } from './context';

export const validateRouting: Rule = (context) => {
  const ids = new Set(context.screens.map((screen) => screen.value.id).filter(isString));
  const routing = isObject(context.flow.routing_model) ? context.flow.routing_model : {};
  const incoming = new Set<string>();
  for (const [source, targets] of Object.entries(routing)) {
    const path = `routing_model.${source}`;
    if (!ids.has(source)) addIssue(context, 'INVALID_ROUTING_MODEL', path, `Unknown source screen ${source}`);
    if (!Array.isArray(targets)) {
      addIssue(context, 'INVALID_ROUTING_MODEL', path, 'route targets must be an array of screen ids');
      continue;
    }
    targets.forEach((target: unknown, index) => {
      if (!isString(target) || !ids.has(target)) {
        addIssue(context, 'INVALID_ROUTING_MODEL', `${path}[${index}]`, `Unknown target screen ${String(target)}`);
      } else if (ids.has(source)) incoming.add(target);
    });
  }
  // Only edges on the active DFS path close a cycle. Array order is not navigation order.
  const active = new Set<string>();
  const visited = new Set<string>();
  function visit(source: string): void {
    if (visited.has(source)) return;
    active.add(source);
    const targets = routing[source];
    if (Array.isArray(targets)) targets.forEach((target: unknown, index) => {
      if (!isString(target) || !ids.has(target)) return;
      if (active.has(target)) {
        addIssue(context, 'INVALID_ROUTING_MODEL', `routing_model.${source}[${index}]`,
          `Back navigation is implicit. Remove ${source} → ${target} from routing_model; this edge creates a cycle.`);
      } else visit(target);
    });
    active.delete(source);
    visited.add(source);
  }
  for (const source of Object.keys(routing)) if (ids.has(source)) visit(source);
  for (const screen of context.screens) {
    for (const { value: action, path } of screen.actions) {
      if (!isObject(action) || action.name !== 'navigate' || !isObject(action.next) || !isString(action.next.name)) continue;
      const target = action.next.name;
      if (!ids.has(target)) addIssue(context, 'INVALID_SCREEN_REFERENCE', `${path}.next.name`, `Unknown screen ${target}`);
      else incoming.add(target);
      // Meta: a navigate payload must provide every field declared in the target screen's data model.
      const targetScreen = context.screens.find((entry) => entry.value.id === target);
      const declared = targetScreen && isObject(targetScreen.value.data) ? Object.keys(targetScreen.value.data) : [];
      if (declared.length > 0) {
        const payloadKeys = isObject(action.payload) ? Object.keys(action.payload) : [];
        const missing = declared.filter((key) => !payloadKeys.includes(key));
        if (missing.length > 0) {
          addIssue(context, 'MISSING_PAYLOAD_DATA', `${path}.payload`,
            `Following fields are expected in the next screen's data model but missing in payload: [${missing.join(', ')}]`);
        }
      }
      if (Object.keys(routing).length > 0) {
        const targets = isString(screen.value.id) && Object.hasOwn(routing, screen.value.id) ? routing[screen.value.id] : undefined;
        if (!Array.isArray(targets) || !targets.includes(target)) {
          addIssue(context, 'INVALID_ROUTING_MODEL', `${path}.next.name`, `Route from ${String(screen.value.id)} to ${target} is not listed in routing_model`);
        }
      }
    }
  }
  for (const screen of context.screens) {
    if (screen.path !== 'screens[0]' && isString(screen.value.id) && !incoming.has(screen.value.id)) {
      addIssue(context, 'UNREACHABLE_SCREEN', `${screen.path}.id`, 'screen has no incoming route', 'warning');
    }
  }
};
