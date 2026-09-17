import { addIssue, isObject, isString, type Rule } from './context';

const TOP_LEVEL_KEYS = new Set(['version', 'screens', 'routing_model', 'data_api_version', 'data_channel_uri']);

export const validateStructure: Rule = (context) => {
  const { flow } = context;
  for (const key of ['version', 'screens']) {
    if (!Object.hasOwn(flow, key)) addIssue(context, 'MISSING_REQUIRED_PROPERTY', key, `${key} is required`);
  }
  if (Object.hasOwn(flow, 'data_api_version') && !Object.hasOwn(flow, 'routing_model')) {
    addIssue(context, 'MISSING_REQUIRED_PROPERTY', 'routing_model',
      'routing_model is required when data_api_version is declared');
  }
  if (Object.hasOwn(flow, 'version') && (!isString(flow.version) || !/^\d+\.\d+$/.test(flow.version))) {
    addIssue(context, 'INVALID_PROPERTY_VALUE', 'version', 'version must be a string in major.minor format');
  }
  if (Object.hasOwn(flow, 'screens')) {
    if (!Array.isArray(flow.screens) || flow.screens.length === 0) {
      addIssue(context, 'INVALID_PROPERTY_VALUE', 'screens', 'screens must be a non-empty array');
    } else {
      flow.screens.forEach((screen: unknown, index) => {
        if (!isObject(screen)) addIssue(context, 'INVALID_PROPERTY_VALUE', `screens[${index}]`, 'screen must be an object');
      });
    }
  }
  if (Object.hasOwn(flow, 'routing_model') && !isObject(flow.routing_model)) {
    addIssue(context, 'INVALID_PROPERTY_VALUE', 'routing_model', 'routing_model must be an object');
  }
  if (Object.hasOwn(flow, 'data_api_version') && !isString(flow.data_api_version)) {
    addIssue(context, 'INVALID_PROPERTY_VALUE', 'data_api_version', 'data_api_version must be a string');
  }
  for (const key of Object.keys(flow)) {
    if (!TOP_LEVEL_KEYS.has(key)) addIssue(context, 'UNKNOWN_PROPERTY', key, `Unknown top-level property ${key}`, 'warning');
  }
};
