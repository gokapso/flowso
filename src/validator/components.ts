import { ACTION_MIN_VERSION, COMPONENT_MIN_VERSION, requiresFormWrapper } from '../schema/versions';
import { isNestedExpression, isWholeReference } from '../runtime/expressions';
import {
  addIssue, checkProperty, isInputType, isNonEmptyString, isObject, isString,
  type JsonObject, type Rule, type ValidationContext,
} from './context';

const REQUIRED_STRINGS: Readonly<Record<string, readonly string[]>> = {
  TextHeading: ['text'], TextSubheading: ['text'], TextBody: ['text'], TextCaption: ['text'], RichText: ['text'],
  Image: ['src'], Footer: ['label'], EmbeddedLink: ['text'], NavigationList: ['name'], Form: ['name'], Switch: ['value'],
};
const SELECTIONS = new Set(['RadioButtonsGroup', 'CheckboxGroup', 'Dropdown', 'ChipsSelector']);

function isDynamicArray(value: unknown): boolean {
  return Array.isArray(value) || isWholeReference(value) || isNestedExpression(value);
}

function validateComponentProperties(context: ValidationContext, value: JsonObject, type: string, path: string): void {
  const properties = Object.hasOwn(REQUIRED_STRINGS, type) ? REQUIRED_STRINGS[type] ?? [] : [];
  for (const key of properties) {
    const accepts = key === 'text'
      ? (text: unknown) => isNonEmptyString(text) || (Array.isArray(text) && text.length > 0 && text.every(isNonEmptyString))
      : isNonEmptyString;
    checkProperty(context, value, key, path, accepts, key === 'text' ? 'non-empty text or an array of text' : 'a non-empty string');
  }
  if (isInputType(type)) {
    checkProperty(context, value, 'name', path, isNonEmptyString, 'a non-empty string');
    checkProperty(context, value, 'label', path, isString, 'a string');
  }
  if (SELECTIONS.has(type)) checkProperty(context, value, 'data-source', path, isDynamicArray, 'an array or dynamic reference/expression');
  if (type === 'NavigationList') checkProperty(context, value, 'list-items', path, isDynamicArray, 'an array or dynamic reference/expression');
  if (type === 'ImageCarousel') checkProperty(context, value, 'images', path, isDynamicArray, 'an array or dynamic reference/expression');
  if (type === 'Footer' || type === 'EmbeddedLink') {
    // Present actions (including malformed ones) are checked once by validateAction.
    if (!Object.hasOwn(value, 'on-click-action')) {
      addIssue(context, 'MISSING_REQUIRED_PROPERTY', `${path}.on-click-action`, 'on-click-action is required');
    }
  }
  if (type === 'Form') checkProperty(context, value, 'children', path, Array.isArray, 'an array');
  if (type === 'If') {
    checkProperty(context, value, 'condition', path, (condition) => typeof condition === 'boolean' || isNonEmptyString(condition), 'a boolean or expression string');
    checkProperty(context, value, 'then', path, (branch) => Array.isArray(branch) && branch.length > 0, 'a non-empty array');
    checkProperty(context, value, 'else', path, Array.isArray, 'an array', false);
  }
  if (type === 'Switch') {
    checkProperty(context, value, 'cases', path, (cases) => isObject(cases) && Object.keys(cases).length > 0, 'a non-empty object');
    if (isObject(value.cases)) {
      for (const [key, branch] of Object.entries(value.cases)) {
        if (!Array.isArray(branch)) addIssue(context, 'INVALID_PROPERTY_VALUE', `${path}.cases.${key}`, 'case must be an array of components');
      }
    }
  }
}

function validateAction(context: ValidationContext, value: unknown, path: string): void {
  if (!isObject(value)) {
    addIssue(context, 'INVALID_PROPERTY_VALUE', path, 'action must be an object');
    return;
  }
  checkProperty(context, value, 'name', path, isNonEmptyString, 'a non-empty string');
  if (!isString(value.name)) return;
  if (!Object.hasOwn(ACTION_MIN_VERSION, value.name)) {
    addIssue(context, 'UNKNOWN_ACTION', `${path}.name`, `Unknown action ${value.name}`);
    return;
  }
  if (value.name === 'navigate') {
    checkProperty(context, value, 'next', path, isObject, 'an object');
    if (isObject(value.next)) checkProperty(context, value.next, 'name', `${path}.next`, isNonEmptyString, 'a non-empty screen id');
  }
  if (value.name === 'open_url') checkProperty(context, value, 'url', path, isNonEmptyString, 'a non-empty string');
  checkProperty(context, value, 'payload', path, isObject, 'an object', value.name === 'update_data');
}

export const validateComponents: Rule = (context) => {
  for (const screen of context.screens) {
    const names = new Set<string>();
    const footers: string[] = [];
    const pickers: string[] = [];
    for (const entry of screen.components) {
      const { value, path } = entry;
      if (!isObject(value)) {
        addIssue(context, 'INVALID_PROPERTY_VALUE', path, 'component must be an object');
        continue;
      }
      checkProperty(context, value, 'type', path, isNonEmptyString, 'a known component type');
      if (!isString(value.type)) continue;
      if (!Object.hasOwn(COMPONENT_MIN_VERSION, value.type)) {
        addIssue(context, 'UNKNOWN_COMPONENT', `${path}.type`, `Unknown component ${value.type}`);
        continue;
      }
      validateComponentProperties(context, value, value.type, path);
      if (isInputType(value.type)) {
        if (isString(value.name)) {
          if (names.has(value.name)) addIssue(context, 'DUPLICATE_FIELD_NAME', `${path}.name`, `Duplicate input name ${value.name}`);
          names.add(value.name);
        }
        if (context.version && requiresFormWrapper(context.version) && !entry.inForm) {
          addIssue(context, 'MISSING_FORM_WRAPPER', path, 'inputs must be inside a Form before Flow JSON 4.0');
        }
      }
      if (value.type === 'Footer') {
        footers.push(path);
        if (!entry.isLast || !['SingleColumnLayout', 'Form'].includes(entry.parentType)) {
          addIssue(context, 'INVALID_FOOTER_POSITION', path, 'Footer must be the last child of the layout or Form');
        }
      }
      if (value.type === 'PhotoPicker' || value.type === 'DocumentPicker') pickers.push(path);
    }
    for (const path of footers.slice(1)) addIssue(context, 'INVALID_FOOTER_POSITION', path, 'at most one Footer is allowed per screen');
    for (const path of pickers.slice(1)) {
      addIssue(context, 'COMPONENT_LIMIT_EXCEEDED', path, 'at most one PhotoPicker or DocumentPicker should be used per screen', 'warning');
    }
    for (const action of screen.actions) validateAction(context, action.value, action.path);
  }
};
