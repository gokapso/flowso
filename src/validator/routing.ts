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
  for (const screen of context.screens) {
    for (const { value: action, path } of screen.actions) {
      if (!isObject(action) || action.name !== 'navigate' || !isObject(action.next) || !isString(action.next.name)) continue;
      const target = action.next.name;
      if (!ids.has(target)) addIssue(context, 'INVALID_SCREEN_REFERENCE', `${path}.next.name`, `Unknown screen ${target}`);
      else incoming.add(target);
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
