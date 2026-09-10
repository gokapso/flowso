import { addIssue, isObject, type Rule } from './context';

/**
 * Flows that talk to a data endpoint need `data_api_version`, and Meta's preview then requires
 * `flow_token` and `phone_number` in the URL. Surface both facts before the flow is uploaded.
 */
export const validateEndpointUsage: Rule = (context) => {
  const exchanges = context.screens.flatMap((screen) =>
    screen.actions.filter(({ value }) => isObject(value) && value.name === 'data_exchange'),
  );
  const hasVersion = Object.hasOwn(context.flow, 'data_api_version');
  if (exchanges.length > 0 && !hasVersion) {
    addIssue(context, 'MISSING_DATA_API_VERSION', 'data_api_version',
      'data_api_version is required when the flow uses data_exchange actions');
  }
  if (exchanges.length > 0 || hasVersion) {
    const first = exchanges[0];
    addIssue(context, 'ENDPOINT_REQUIRED', first ? first.path : 'data_api_version',
      'This flow talks to a data endpoint: it needs an endpoint URI (and encryption) before publishing, and Meta\'s preview needs flow_token and phone_number. Remove data_api_version and data_exchange actions for a static flow.',
      'warning');
  }
};
