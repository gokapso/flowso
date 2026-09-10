import type { ComponentType, ActionName } from './flow-json';

/** First Flow JSON version in which each component is available. */
export const COMPONENT_MIN_VERSION: Record<ComponentType, string> = {
  TextHeading: '2.1',
  TextSubheading: '2.1',
  TextBody: '2.1',
  TextCaption: '2.1',
  RichText: '5.1',
  Image: '2.1',
  ImageCarousel: '7.1',
  TextInput: '2.1',
  TextArea: '2.1',
  CheckboxGroup: '2.1',
  RadioButtonsGroup: '2.1',
  Dropdown: '2.1',
  ChipsSelector: '6.3',
  OptIn: '2.1',
  DatePicker: '2.1',
  CalendarPicker: '6.1',
  PhotoPicker: '4.0',
  DocumentPicker: '4.0',
  Footer: '2.1',
  EmbeddedLink: '2.1',
  NavigationList: '6.2',
  Form: '2.1',
  If: '4.0',
  Switch: '4.0',
};

export const ACTION_MIN_VERSION: Record<ActionName, string> = {
  navigate: '2.1',
  complete: '2.1',
  data_exchange: '3.0',
  update_data: '6.0',
  open_url: '6.0',
};

export const LATEST_FLOW_JSON_VERSION = '7.3';
export const LATEST_DATA_API_VERSION = '3.0';

/** Compare dotted versions numerically: returns <0, 0, >0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  const length = Math.max(pa.length, pb.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

export function supportsNestedExpressions(version: string): boolean {
  return compareVersions(version, '6.0') >= 0;
}

export function requiresFormWrapper(version: string): boolean {
  return compareVersions(version, '4.0') < 0;
}
