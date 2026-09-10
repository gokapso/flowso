import { addIssue, checkProperty, isNonEmptyString, isObject, isString, type Rule, type ValidationContext } from './context';

function validateDeclaration(context: ValidationContext, value: unknown, path: string, topLevel: boolean): void {
  if (!isObject(value)) {
    addIssue(context, 'INVALID_PROPERTY_VALUE', path, 'data declaration must be an object');
    return;
  }
  checkProperty(context, value, 'type', path,
    (type) => isString(type) && ['string', 'number', 'boolean', 'array', 'object'].includes(type), 'a supported data type');
  if (topLevel && !Object.hasOwn(value, '__example__')) {
    addIssue(context, 'MISSING_REQUIRED_PROPERTY', `${path}.__example__`, 'data declaration should include __example__', 'warning');
  }
  if (Object.hasOwn(value, 'items')) validateDeclaration(context, value.items, `${path}.items`, false);
  if (Object.hasOwn(value, 'properties')) {
    if (!isObject(value.properties)) addIssue(context, 'INVALID_PROPERTY_VALUE', `${path}.properties`, 'properties must be an object');
    else Object.entries(value.properties).forEach(([key, declaration]) =>
      validateDeclaration(context, declaration, `${path}.properties.${key}`, false));
  }
}

export const validateScreens: Rule = (context) => {
  const seen = new Set<string>();
  if (!context.screens.some((screen) => screen.value.terminal === true)) {
    addIssue(context, 'INVALID_TERMINAL_SCREEN', 'screens', 'flow must have at least one terminal screen');
  }
  for (const screen of context.screens) {
    const { value, path } = screen;
    checkProperty(context, value, 'id', path, isNonEmptyString, 'a non-empty string');
    if (isString(value.id)) {
      if (seen.has(value.id)) addIssue(context, 'DUPLICATE_SCREEN_ID', `${path}.id`, `Duplicate screen id ${value.id}`);
      seen.add(value.id);
      if (value.id === 'SUCCESS') addIssue(context, 'INVALID_PROPERTY_VALUE', `${path}.id`, 'SUCCESS is a reserved screen id');
      if (!/^[A-Z][A-Z0-9_]*$/.test(value.id)) {
        const lowercaseOnly = /^[A-Za-z][A-Za-z0-9_]*$/.test(value.id);
        addIssue(context, 'INVALID_PROPERTY_VALUE', `${path}.id`, 'screen id should match /^[A-Z][A-Z0-9_]*$/',
          lowercaseOnly ? 'warning' : 'error');
      }
    }
    checkProperty(context, value, 'title', path, isString, 'a string', false);
    for (const key of ['terminal', 'success', 'refresh_on_back']) {
      checkProperty(context, value, key, path, (flag) => typeof flag === 'boolean', 'a boolean', false);
    }
    checkProperty(context, value, 'layout', path, isObject, 'an object');
    if (isObject(value.layout)) {
      checkProperty(context, value.layout, 'type', `${path}.layout`, (type) => type === 'SingleColumnLayout', 'SingleColumnLayout');
      checkProperty(context, value.layout, 'children', `${path}.layout`, Array.isArray, 'an array');
    }
    checkProperty(context, value, 'data', path, isObject, 'an object', false);
    if (isObject(value.data)) {
      Object.entries(value.data).forEach(([key, declaration]) => validateDeclaration(context, declaration, `${path}.data.${key}`, true));
    }
    checkProperty(context, value, 'sensitive', path, Array.isArray, 'an array of input names', false);
    if (Array.isArray(value.sensitive)) {
      value.sensitive.forEach((name: unknown, index) => {
        if (!isString(name) || !screen.inputs.has(name)) {
          addIssue(context, 'INVALID_DYNAMIC_REFERENCE', `${path}.sensitive[${index}]`, 'sensitive must reference an input name on this screen');
        }
      });
    }
    for (const action of screen.actions) {
      if (isObject(action.value) && action.value.name === 'complete' && value.terminal !== true) {
        addIssue(context, 'INVALID_TERMINAL_SCREEN', `${action.path}.name`, 'complete actions are only allowed on terminal screens');
      }
    }
    const hasFinalFooter = screen.components.some(({ value: component }) => {
      if (!isObject(component) || component.type !== 'Footer') return false;
      const action = component['on-click-action'];
      return isObject(action) && (action.name === 'complete' || action.name === 'data_exchange');
    });
    if (value.terminal === true && !hasFinalFooter) {
      addIssue(context, 'INVALID_TERMINAL_SCREEN', `${path}.layout.children`,
        'terminal screen should contain a Footer with a complete or data_exchange action', 'warning');
    }
  }
};
