import { addIssue, isObject, type Rule } from './context';

/** Meta requires `data_api_version` on flows that use `data_exchange` actions. */
export const validateEndpointUsage: Rule = (context) => {
  const usesEndpoint = context.screens.some((screen) =>
    screen.actions.some(({ value }) => isObject(value) && value.name === 'data_exchange'),
  );
  if (usesEndpoint && !Object.hasOwn(context.flow, 'data_api_version')) {
    addIssue(context, 'MISSING_DATA_API_VERSION', 'data_api_version',
      'data_api_version is required when the flow uses data_exchange actions');
  }
};
