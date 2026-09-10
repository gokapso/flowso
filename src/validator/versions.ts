import { ACTION_MIN_VERSION, COMPONENT_MIN_VERSION, compareVersions } from '../schema/versions';
import { addIssue, isObject, isString, type Rule } from './context';

export const validateVersions: Rule = (context) => {
  const { version } = context;
  if (!version) return;
  if (compareVersions(version, '4.0') < 0) {
    addIssue(context, 'UNSUPPORTED_VERSION', 'version', 'older versions may not be accepted for publishing', 'warning');
  }
  const components: Readonly<Record<string, string>> = COMPONENT_MIN_VERSION;
  const actions: Readonly<Record<string, string>> = ACTION_MIN_VERSION;
  for (const screen of context.screens) {
    for (const { value, path } of screen.components) {
      if (!isObject(value) || !isString(value.type) || !Object.hasOwn(components, value.type)) continue;
      const minimum = components[value.type];
      if (minimum && compareVersions(version, minimum) < 0) {
        addIssue(context, 'COMPONENT_NOT_AVAILABLE_IN_VERSION', `${path}.type`, `${value.type} requires Flow JSON ${minimum} or later`);
      }
    }
    for (const { value, path } of screen.actions) {
      if (!isObject(value) || !isString(value.name) || !Object.hasOwn(actions, value.name)) continue;
      const minimum = actions[value.name];
      if (minimum && compareVersions(version, minimum) < 0) {
        addIssue(context, 'ACTION_NOT_AVAILABLE_IN_VERSION', `${path}.name`, `${value.name} requires Flow JSON ${minimum} or later`);
      }
    }
  }
};
