/**
 * TypeScript model of WhatsApp Flow JSON (target: version 7.3, tolerant of 4.0+).
 * Property names are the canonical wire names (kebab-case where Meta uses it).
 * Any string-typed property may hold a dynamic reference (`${data.x}`, `${form.x}`,
 * `${screen.ID.form.x}`) or a backtick nested expression. `Dynamic<T>` records that.
 */

export type Dynamic<T> = T | string;

export type FlowJson = {
  version: string;
  data_api_version?: string;
  data_channel_uri?: string;
  routing_model?: Record<string, string[]>;
  screens: Screen[];
};

export type Screen = {
  id: string;
  title?: string;
  terminal?: boolean;
  success?: boolean;
  refresh_on_back?: boolean;
  data?: Record<string, ScreenDataDeclaration>;
  sensitive?: string[];
  layout: Layout;
};

/** JSON-Schema-like declaration of a screen data property. */
export type ScreenDataDeclaration = {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  __example__?: unknown;
  items?: ScreenDataDeclaration;
  properties?: Record<string, ScreenDataDeclaration>;
  [key: string]: unknown;
};

export type Layout = {
  type: 'SingleColumnLayout';
  children: Component[];
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type NavigateAction = {
  name: 'navigate';
  next: { type: 'screen'; name: string };
  payload?: Record<string, unknown>;
};

export type CompleteAction = {
  name: 'complete';
  payload?: Record<string, unknown>;
};

export type DataExchangeAction = {
  name: 'data_exchange';
  payload?: Record<string, unknown>;
};

export type UpdateDataAction = {
  name: 'update_data';
  payload: Record<string, unknown>;
};

export type OpenUrlAction = {
  name: 'open_url';
  url: string;
};

export type Action =
  | NavigateAction
  | CompleteAction
  | DataExchangeAction
  | UpdateDataAction
  | OpenUrlAction;

export type ActionName = Action['name'];

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export type ComponentBase = {
  type: string;
  visible?: Dynamic<boolean>;
  [key: string]: unknown;
};

export type TextComponentType = 'TextHeading' | 'TextSubheading' | 'TextBody' | 'TextCaption';

export type TextComponent = ComponentBase & {
  type: TextComponentType;
  text: Dynamic<string> | string[];
  'font-weight'?: 'bold' | 'italic' | 'bold_italic' | 'normal';
  strikethrough?: Dynamic<boolean>;
  markdown?: boolean;
};

export type RichTextComponent = ComponentBase & {
  type: 'RichText';
  text: Dynamic<string> | string[];
};

export type ImageComponent = ComponentBase & {
  type: 'Image';
  src: Dynamic<string>;
  width?: number;
  height?: number;
  'scale-type'?: 'cover' | 'contain';
  'aspect-ratio'?: number;
  'alt-text'?: Dynamic<string>;
};

export type ImageCarouselComponent = ComponentBase & {
  type: 'ImageCarousel';
  images: Dynamic<Array<{ src: string; 'alt-text'?: string }>>;
  'scale-type'?: 'cover' | 'contain';
  'aspect-ratio'?: number;
};

export type InputBase = ComponentBase & {
  name: string;
  label: Dynamic<string>;
  required?: Dynamic<boolean>;
  enabled?: Dynamic<boolean>;
  'init-value'?: Dynamic<unknown>;
  'error-message'?: Dynamic<string>;
  'on-select-action'?: Action;
  'on-unselect-action'?: Action;
};

export type TextInputComponent = InputBase & {
  type: 'TextInput';
  'input-type'?: 'text' | 'number' | 'email' | 'password' | 'passcode' | 'phone';
  'helper-text'?: Dynamic<string>;
  'min-chars'?: number;
  'max-chars'?: number;
  pattern?: Dynamic<string>;
  'label-variant'?: 'default' | 'large';
};

export type TextAreaComponent = InputBase & {
  type: 'TextArea';
  'helper-text'?: Dynamic<string>;
  'max-length'?: number;
  'label-variant'?: 'default' | 'large';
};

export type DataSourceItem = {
  id: string;
  title: string;
  description?: string;
  metadata?: string;
  enabled?: boolean;
  image?: string;
  'alt-text'?: string;
  'on-select-action'?: Action;
  'on-unselect-action'?: Action;
};

export type SelectionBase = InputBase & {
  'data-source': Dynamic<DataSourceItem[]>;
  description?: Dynamic<string>;
  'media-size'?: 'regular' | 'large';
};

export type CheckboxGroupComponent = SelectionBase & {
  type: 'CheckboxGroup';
  'min-selected-items'?: number;
  'max-selected-items'?: number;
};

export type RadioButtonsGroupComponent = SelectionBase & {
  type: 'RadioButtonsGroup';
};

export type DropdownComponent = SelectionBase & {
  type: 'Dropdown';
};

export type ChipsSelectorComponent = SelectionBase & {
  type: 'ChipsSelector';
  'min-selected-items'?: number;
  'max-selected-items'?: number;
};

export type OptInComponent = ComponentBase & {
  type: 'OptIn';
  name: string;
  label: Dynamic<string>;
  required?: Dynamic<boolean>;
  'init-value'?: Dynamic<boolean>;
  'on-click-action'?: Action;
  'on-select-action'?: Action;
  'on-unselect-action'?: Action;
};

export type DatePickerComponent = InputBase & {
  type: 'DatePicker';
  'min-date'?: Dynamic<string>;
  'max-date'?: Dynamic<string>;
  'unavailable-dates'?: Dynamic<string[]>;
  'helper-text'?: Dynamic<string>;
};

export type CalendarPickerComponent = InputBase & {
  type: 'CalendarPicker';
  title?: Dynamic<string>;
  description?: Dynamic<string>;
  'helper-text'?: Dynamic<string>;
  mode?: 'single' | 'range';
  'min-date'?: Dynamic<string>;
  'max-date'?: Dynamic<string>;
  'unavailable-dates'?: Dynamic<string[]>;
  'include-days'?: string[];
  'min-days'?: number;
  'max-days'?: number;
};

export type PhotoPickerComponent = InputBase & {
  type: 'PhotoPicker';
  description?: Dynamic<string>;
  'photo-source'?: 'camera_gallery' | 'camera' | 'gallery';
  'min-uploaded-photos'?: number;
  'max-uploaded-photos'?: number;
  'max-file-size-kb'?: number;
};

export type DocumentPickerComponent = InputBase & {
  type: 'DocumentPicker';
  description?: Dynamic<string>;
  'min-uploaded-documents'?: number;
  'max-uploaded-documents'?: number;
  'max-file-size-kb'?: number;
  'allowed-mime-types'?: string[];
};

export type FooterComponent = ComponentBase & {
  type: 'Footer';
  label: Dynamic<string>;
  'left-caption'?: Dynamic<string>;
  'center-caption'?: Dynamic<string>;
  'right-caption'?: Dynamic<string>;
  enabled?: Dynamic<boolean>;
  'on-click-action': Action;
};

export type EmbeddedLinkComponent = ComponentBase & {
  type: 'EmbeddedLink';
  text: Dynamic<string>;
  'on-click-action': Action;
};

export type NavigationListItem = {
  id: string;
  'main-content': {
    title: string;
    description?: string;
    metadata?: string;
  };
  start?: { image: string; 'alt-text'?: string };
  end?: { title?: string; description?: string };
  badge?: string;
  tags?: string[];
  'on-click-action'?: Action;
};

export type NavigationListComponent = ComponentBase & {
  type: 'NavigationList';
  name: string;
  'list-items': Dynamic<NavigationListItem[]>;
  'media-size'?: 'regular' | 'large';
  'on-click-action'?: Action;
};

export type FormComponent = ComponentBase & {
  type: 'Form';
  name: string;
  'init-values'?: Dynamic<Record<string, unknown>>;
  'error-messages'?: Dynamic<Record<string, string>>;
  children: Component[];
};

export type IfComponent = ComponentBase & {
  type: 'If';
  condition: Dynamic<boolean>;
  then: Component[];
  else?: Component[];
};

export type SwitchComponent = ComponentBase & {
  type: 'Switch';
  value: Dynamic<string>;
  cases: Record<string, Component[]>;
};

export type Component =
  | TextComponent
  | RichTextComponent
  | ImageComponent
  | ImageCarouselComponent
  | TextInputComponent
  | TextAreaComponent
  | CheckboxGroupComponent
  | RadioButtonsGroupComponent
  | DropdownComponent
  | ChipsSelectorComponent
  | OptInComponent
  | DatePickerComponent
  | CalendarPickerComponent
  | PhotoPickerComponent
  | DocumentPickerComponent
  | FooterComponent
  | EmbeddedLinkComponent
  | NavigationListComponent
  | FormComponent
  | IfComponent
  | SwitchComponent;

export type ComponentType = Component['type'];

/** Components that hold a user-entered value under `name`. */
export const INPUT_COMPONENT_TYPES = [
  'TextInput',
  'TextArea',
  'CheckboxGroup',
  'RadioButtonsGroup',
  'Dropdown',
  'ChipsSelector',
  'OptIn',
  'DatePicker',
  'CalendarPicker',
  'PhotoPicker',
  'DocumentPicker',
] as const satisfies readonly ComponentType[];

export type InputComponentType = (typeof INPUT_COMPONENT_TYPES)[number];

export type InputComponent = Extract<Component, { type: InputComponentType }>;

/** Components whose children are rendered in place (logic and grouping). */
export const CONTAINER_COMPONENT_TYPES = ['Form', 'If', 'Switch'] as const satisfies readonly ComponentType[];

export function isInputComponent(component: Component): component is InputComponent {
  return (INPUT_COMPONENT_TYPES as readonly string[]).includes(component.type);
}
