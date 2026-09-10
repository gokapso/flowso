import type { Component, Screen, ScreenDataDeclaration } from '../schema/flow-json';
import { ACTION_MIN_VERSION, COMPONENT_MIN_VERSION } from '../schema/versions';

export type CatalogCategory = 'text' | 'media' | 'input' | 'selection' | 'datetime' | 'action' | 'logic' | 'pattern';

export type CatalogEntry = {
  id: string;
  name: string;
  category: CatalogCategory;
  minVersion: string;
  description: string;
  limits?: string[];
  docsUrl: string;
  /** For placement 'component': the component JSON to insert into a screen. For 'screen': a whole screen. */
  placement: 'component' | 'screen';
  component?: Component;
  screen?: Screen;
  /** Screen data declarations the snippet needs when previewed (with __example__ values). */
  previewData?: Record<string, ScreenDataDeclaration>;
  /** Extra sibling components rendered before the snippet to make its preview meaningful. */
  previewContext?: Component[];
};

const DOCS_URL = 'https://developers.facebook.com/docs/whatsapp/flows/reference/components';
// A one-pixel PNG, kept as raw base64 for the Image wire format.
const PLACEHOLDER_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNQvZwGAAJ/AV9X3CpyAAAAAElFTkSuQmCC';

// Descriptions and limits follow the local whatsapp-flows-docs.md component reference.
// Property-specific version floors come from that reference; component/action floors
// come from the schema maps. RichText's preview includes a Footer, requiring 6.3.
const catalogEntries: CatalogEntry[] = [
  {
    id: 'text-heading', name: 'TextHeading', category: 'text',
    minVersion: COMPONENT_MIN_VERSION.TextHeading,
    description: 'A top-level title. Use it to introduce the main task on a screen.',
    limits: ['Maximum 80 characters.', 'Text cannot be empty or blank.'],
    docsUrl: `${DOCS_URL}#heading`, placement: 'component',
    component: { type: 'TextHeading', text: 'Book your visit' },
  },
  {
    id: 'text-subheading', name: 'TextSubheading', category: 'text',
    minVersion: COMPONENT_MIN_VERSION.TextSubheading,
    description: 'A section title. Use it to introduce a group of related fields.',
    limits: ['Maximum 80 characters.', 'Text cannot be empty or blank.'],
    docsUrl: DOCS_URL, placement: 'component',
    component: { type: 'TextSubheading', text: 'Your contact details' },
  },
  {
    id: 'text-body', name: 'TextBody', category: 'text',
    minVersion: COMPONENT_MIN_VERSION.TextBody,
    description: 'Plain body text. Use it for instructions or supporting information.',
    limits: ['Maximum 4096 characters.', 'Text cannot be empty or blank.'],
    docsUrl: DOCS_URL, placement: 'component',
    component: { type: 'TextBody', text: 'Choose a service and a time that works for you.' },
  },
  {
    id: 'text-body-markdown', name: 'TextBody with markdown', category: 'text',
    minVersion: '5.1',
    description: 'Body text with inline formatting. Use bold and italic text to emphasize short instructions.',
    limits: ['Maximum 4096 characters.', 'Markdown requires Flow JSON 5.1 or later.'],
    docsUrl: DOCS_URL, placement: 'component',
    component: { type: 'TextBody', markdown: true, text: 'Please bring your *booking number* and arrive _five minutes early_.' },
  },
  {
    id: 'text-caption', name: 'TextCaption', category: 'text',
    minVersion: COMPONENT_MIN_VERSION.TextCaption,
    description: 'Short supporting text. Use it for a note below the main content.',
    limits: ['Maximum 409 characters.', 'Text cannot be empty or blank.'],
    docsUrl: DOCS_URL, placement: 'component',
    component: { type: 'TextCaption', text: 'All appointment times are local.' },
  },
  {
    id: 'rich-text', name: 'RichText', category: 'text', minVersion: '6.3',
    description: 'A markdown block with headings, lists, and emphasis. Use it for longer instructions or policies.',
    limits: ['Must stand alone through version 6.2.', 'Can share a screen with a Footer from version 6.3.'],
    docsUrl: DOCS_URL, placement: 'component',
    component: { type: 'RichText', text: '# Before your visit\n\nBring the following:\n- Your booking number\n- A photo ID\n\n**Please arrive five minutes early.**' },
  },
  {
    id: 'image', name: 'Image', category: 'media', minVersion: COMPONENT_MIN_VERSION.Image,
    description: 'An inline base64 image. Use it to illustrate a product or service.',
    limits: ['Maximum 3 images per screen.', 'JPEG and PNG formats are supported.'],
    docsUrl: DOCS_URL, placement: 'component',
    component: { type: 'Image', src: PLACEHOLDER_PNG, width: 80, height: 80, 'scale-type': 'contain', 'alt-text': 'Placeholder image' },
  },
  {
    id: 'image-carousel', name: 'ImageCarousel', category: 'media', minVersion: COMPONENT_MIN_VERSION.ImageCarousel,
    description: 'A sequence of images users can slide through. Use it to show several views of a product.',
    limits: ['Between 1 and 3 images.', 'Maximum 2 carousels per screen.'],
    docsUrl: DOCS_URL, placement: 'component',
    component: {
      type: 'ImageCarousel', 'scale-type': 'contain',
      images: [{ src: PLACEHOLDER_PNG, 'alt-text': 'First view placeholder' }, { src: PLACEHOLDER_PNG, 'alt-text': 'Second view placeholder' }],
    },
  },
  {
    id: 'text-input', name: 'TextInput', category: 'input', minVersion: COMPONENT_MIN_VERSION.TextInput,
    description: 'A single-line text field. Use it for a name or another short answer.',
    limits: ['Label: maximum 20 characters.', 'Default maximum input length: 80 characters.'],
    docsUrl: `${DOCS_URL}#textinput`, placement: 'component',
    component: { type: 'TextInput', name: 'full_name', label: 'Full name', 'input-type': 'text' },
  },
  {
    id: 'text-input-email', name: 'TextInput email', category: 'input', minVersion: COMPONENT_MIN_VERSION.TextInput,
    description: 'An email input with helper text. Use it to collect a contact email address.',
    limits: ['Label: maximum 20 characters.', 'Helper text: maximum 80 characters.'],
    docsUrl: `${DOCS_URL}#textinput`, placement: 'component',
    component: { type: 'TextInput', name: 'contact_email', label: 'Email address', 'input-type': 'email', 'helper-text': 'We will send your booking confirmation here.' },
  },
  {
    id: 'text-input-pattern', name: 'TextInput with pattern', category: 'input', minVersion: '6.2',
    description: 'A text field checked against a regular expression. Use it when an answer must follow a specific format.',
    limits: ['Pattern requires helper-text.', 'Error message: maximum 30 characters.'],
    docsUrl: `${DOCS_URL}#textinput`, placement: 'component',
    component: {
      type: 'TextInput', name: 'booking_code', label: 'Booking code', pattern: '^[A-Z]{3}[0-9]{3}$',
      'helper-text': 'Enter three capital letters and three digits, for example ABC123.',
      'error-message': 'Use the format ABC123',
    },
  },
  {
    id: 'text-area', name: 'TextArea', category: 'input', minVersion: COMPONENT_MIN_VERSION.TextArea,
    description: 'A multiline text field. Use it for comments or a longer answer.',
    limits: ['Default maximum length: 600 characters.', 'Label: maximum 20 characters.'],
    docsUrl: DOCS_URL, placement: 'component',
    component: { type: 'TextArea', name: 'additional_notes', label: 'Additional notes', 'helper-text': 'Tell us anything else we should know.', 'max-length': 600 },
  },
  {
    id: 'checkbox-group', name: 'CheckboxGroup', category: 'selection', minVersion: COMPONENT_MIN_VERSION.CheckboxGroup,
    description: 'A list that accepts multiple selections. Use descriptions to explain each choice and require a minimum number of choices.',
    limits: ['Between 1 and 20 items.', 'Item title and description: maximum 30 characters each.'],
    docsUrl: DOCS_URL, placement: 'component',
    component: {
      type: 'CheckboxGroup', name: 'visit_services', label: 'Choose services', 'min-selected-items': 1,
      'data-source': [{ id: 'checkup', title: 'Checkup', description: 'A general health review' }, { id: 'cleaning', title: 'Cleaning', description: 'A routine cleaning' }],
    },
  },
  {
    id: 'radio-buttons-group', name: 'RadioButtonsGroup', category: 'selection', minVersion: COMPONENT_MIN_VERSION.RadioButtonsGroup,
    description: 'A list that accepts one selection. Use it when all choices should be visible at once.',
    limits: ['Between 1 and 20 items.', 'Item title: maximum 30 characters.'],
    docsUrl: DOCS_URL, placement: 'component',
    component: {
      type: 'RadioButtonsGroup', name: 'visit_type', label: 'Visit type',
      'data-source': [{ id: 'first', title: 'First visit' }, { id: 'return', title: 'Return visit' }],
    },
  },
  {
    id: 'radio-buttons-group-dynamic', name: 'RadioButtonsGroup dynamic options', category: 'selection',
    minVersion: COMPONENT_MIN_VERSION.RadioButtonsGroup,
    description: 'A single-choice list populated from screen data. Use it when available options come from your data endpoint.',
    limits: ['Between 1 and 20 items.'], docsUrl: DOCS_URL, placement: 'component',
    component: { type: 'RadioButtonsGroup', name: 'dynamic_option', label: 'Choose an option', 'data-source': '${data.options}' },
    previewData: {
      options: {
        type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } } },
        __example__: [{ id: 'standard', title: 'Standard visit' }, { id: 'extended', title: 'Extended visit' }],
      },
    },
  },
  {
    id: 'dropdown', name: 'Dropdown', category: 'selection', minVersion: COMPONENT_MIN_VERSION.Dropdown,
    description: 'A compact single-choice menu. Use it when a list of options would take too much space.',
    limits: ['Maximum 200 items without images or 100 with images.', 'Label: maximum 20 characters.'],
    docsUrl: `${DOCS_URL}#dropdown`, placement: 'component',
    component: {
      type: 'Dropdown', name: 'preferred_location', label: 'Choose a location',
      'data-source': [{ id: 'central', title: 'Central clinic' }, { id: 'north', title: 'North clinic' }, { id: 'south', title: 'South clinic' }],
    },
  },
  {
    id: 'chips-selector', name: 'ChipsSelector', category: 'selection', minVersion: COMPONENT_MIN_VERSION.ChipsSelector,
    description: 'Compact options that allow multiple selections. Use them for a short set of preferences.',
    limits: ['Between 2 and 20 options.', 'Label: maximum 80 characters.'],
    docsUrl: DOCS_URL, placement: 'component',
    component: {
      type: 'ChipsSelector', name: 'preferred_days', label: 'Preferred days',
      'data-source': [{ id: 'mon', title: 'Monday' }, { id: 'wed', title: 'Wednesday' }, { id: 'fri', title: 'Friday' }],
    },
  },
  {
    id: 'opt-in', name: 'OptIn', category: 'selection', minVersion: ACTION_MIN_VERSION.open_url,
    description: 'A checkbox for consent with a read-more action. Use it to link to the terms associated with an agreement.',
    limits: ['Label: maximum 120 characters.', 'Maximum 5 per screen.'],
    docsUrl: DOCS_URL, placement: 'component',
    component: { type: 'OptIn', name: 'terms_accepted', label: 'I agree to the terms', 'on-click-action': { name: 'open_url', url: 'https://example.com/terms' } },
  },
  {
    id: 'date-picker', name: 'DatePicker', category: 'datetime', minVersion: '5.0',
    description: 'A date input with availability constraints. Use it to prevent selections before a minimum date or on unavailable dates.',
    limits: ['YYYY-MM-DD date strings require version 5.0 or later.'],
    docsUrl: DOCS_URL, placement: 'component',
    component: { type: 'DatePicker', name: 'visit_date', label: 'Visit date', 'min-date': '2026-01-01', 'unavailable-dates': ['2026-12-25'] },
  },
  {
    id: 'calendar-picker-range', name: 'CalendarPicker range', category: 'datetime', minVersion: COMPONENT_MIN_VERSION.CalendarPicker,
    description: 'A calendar for selecting a date range, such as a stay. This preview uses the local string label; Meta documents a { start-date, end-date } label object for range mode.',
    limits: ['min-days and max-days apply only to range mode.'],
    docsUrl: DOCS_URL, placement: 'component',
    // The local schema and renderer support a single string label in range mode.
    component: { type: 'CalendarPicker', name: 'stay_dates', label: 'Stay dates', mode: 'range', 'min-days': 2, 'max-days': 14 },
  },
  {
    id: 'photo-picker', name: 'PhotoPicker', category: 'input', minVersion: COMPONENT_MIN_VERSION.PhotoPicker,
    description: 'An upload field for camera or gallery photos. Use it to collect images from the user.',
    limits: ['Maximum 1 per screen; cannot share a screen with DocumentPicker.', 'Maximum 30 photos.', 'Use min-uploaded-photos instead of required.'],
    docsUrl: DOCS_URL, placement: 'component',
    component: { type: 'PhotoPicker', name: 'visit_photos', label: 'Add photos', 'photo-source': 'camera_gallery', 'min-uploaded-photos': 1, 'max-uploaded-photos': 3 },
  },
  {
    id: 'document-picker', name: 'DocumentPicker', category: 'input', minVersion: COMPONENT_MIN_VERSION.DocumentPicker,
    description: 'An upload field for documents. Use allowed MIME types to request a specific format.',
    limits: ['Maximum 1 per screen; cannot share a screen with PhotoPicker.', 'Maximum 30 documents.', 'Use min-uploaded-documents instead of required.'],
    docsUrl: DOCS_URL, placement: 'component',
    component: { type: 'DocumentPicker', name: 'visit_documents', label: 'Add documents', 'allowed-mime-types': ['application/pdf'], 'min-uploaded-documents': 1, 'max-uploaded-documents': 3 },
  },
  {
    id: 'footer', name: 'Footer navigation', category: 'action', minVersion: COMPONENT_MIN_VERSION.Footer,
    description: 'The primary screen action. Use navigate to continue to another screen.',
    limits: ['Maximum 1 Footer per screen.', 'Label: maximum 35 characters.'],
    docsUrl: DOCS_URL, placement: 'component',
    component: { type: 'Footer', label: 'Continue', 'on-click-action': { name: 'navigate', next: { type: 'screen', name: 'NEXT' }, payload: {} } },
  },
  {
    id: 'footer-captions', name: 'Footer with captions', category: 'action', minVersion: COMPONENT_MIN_VERSION.Footer,
    description: 'A primary action with short captions above it. Use the captions to show a price or other summary information.',
    limits: ['Caption: maximum 15 characters.', 'Use left and right captions or a center caption, not all three.', 'Maximum 1 Footer per screen.'],
    docsUrl: DOCS_URL, placement: 'component',
    component: { type: 'Footer', label: 'Confirm', 'left-caption': 'Total', 'right-caption': '$25.00', 'on-click-action': { name: 'complete', payload: {} } },
  },
  {
    id: 'embedded-link', name: 'EmbeddedLink', category: 'action', minVersion: ACTION_MIN_VERSION.open_url,
    description: 'A text link with an action. Use open_url to open a help page in the browser.',
    limits: ['Text: maximum 25 characters.', 'Maximum 2 per screen.'],
    docsUrl: DOCS_URL, placement: 'component',
    component: { type: 'EmbeddedLink', text: 'Read our help guide', 'on-click-action': { name: 'open_url', url: 'https://example.com/help' } },
  },
  {
    id: 'navigation-list', name: 'NavigationList', category: 'action', minVersion: COMPONENT_MIN_VERSION.NavigationList,
    description: 'A list of destinations with supporting text. Use it to let the user choose the next step.',
    limits: ['Maximum 20 items and 2 lists per screen.', 'Only one item may have a badge.', 'Cannot be on a terminal screen or combined with other components.'],
    docsUrl: DOCS_URL, placement: 'component',
    component: {
      type: 'NavigationList', name: 'service_navigation',
      'list-items': [
        { id: 'checkup', 'main-content': { title: 'Checkup', description: 'General appointment' }, end: { title: '$25' }, badge: 'Popular' },
        { id: 'cleaning', 'main-content': { title: 'Cleaning', description: 'Routine care' }, end: { title: '$40' } },
        { id: 'consultation', 'main-content': { title: 'Consultation', description: 'Talk to a specialist' }, end: { title: '$60' } },
      ],
      'on-click-action': { name: 'data_exchange', payload: {} },
    },
  },
  {
    id: 'if', name: 'If', category: 'logic', minVersion: COMPONENT_MIN_VERSION.If,
    description: 'Conditional content with two branches. Use it to show different information to members and other visitors.',
    limits: ['Condition must resolve to a boolean.', 'Maximum nesting: 3 levels.'],
    docsUrl: DOCS_URL, placement: 'component',
    component: { type: 'If', condition: '${data.is_member}', then: [{ type: 'TextBody', text: 'Your member benefits apply to this booking.' }], else: [{ type: 'TextBody', text: 'Join our membership for additional benefits.' }] },
    previewData: { is_member: { type: 'boolean', __example__: true } },
  },
  {
    id: 'switch', name: 'Switch', category: 'logic', minVersion: COMPONENT_MIN_VERSION.Switch,
    description: 'Content selected by matching a value to a case. Use it to show the details for a chosen plan.',
    limits: ['The cases object cannot be empty.'], docsUrl: DOCS_URL, placement: 'component',
    component: {
      type: 'Switch', value: '${data.plan}', cases: {
        standard: [{ type: 'TextBody', text: 'Standard includes one visit per year.' }],
        premium: [{ type: 'TextBody', text: 'Premium includes three visits per year.' }],
      },
    },
    previewData: { plan: { type: 'string', __example__: 'premium' } },
  },
  {
    id: 'form', name: 'Form', category: 'logic', minVersion: COMPONENT_MIN_VERSION.Form,
    description: 'A group of inputs with shared initial values. Use it to prefill related fields and submit their values together.',
    docsUrl: DOCS_URL, placement: 'component',
    component: {
      type: 'Form', name: 'contact_form', 'init-values': { form_first_name: 'Alex', form_last_name: 'Rivera' },
      children: [
        { type: 'TextInput', name: 'form_first_name', label: 'First name', required: true },
        { type: 'TextInput', name: 'form_last_name', label: 'Last name', required: true },
        { type: 'Footer', label: 'Save details', 'on-click-action': { name: 'complete', payload: { first_name: '${form.form_first_name}', last_name: '${form.form_last_name}' } } },
      ],
    },
  },
  {
    id: 'update-data', name: 'Update data on selection', category: 'selection', minVersion: ACTION_MIN_VERSION.update_data,
    description: 'A selection that updates screen data immediately. Use it to show or hide details without calling a data endpoint.',
    docsUrl: DOCS_URL, placement: 'component',
    component: {
      type: 'RadioButtonsGroup', name: 'details_preference', label: 'Show details?', 'init-value': 'hide',
      'data-source': [{ id: 'show', title: 'Show details' }, { id: 'hide', title: 'Hide details' }],
      'on-select-action': { name: 'update_data', payload: { show_details: "`${form.details_preference} == 'show'`" } },
    },
    previewData: { show_details: { type: 'boolean', __example__: false } },
    previewContext: [{ type: 'If', condition: '${data.show_details}', then: [{ type: 'TextBody', text: 'Your visit includes a checkup and a written care plan.' }], else: [{ type: 'TextBody', text: 'Select Show details to learn what is included.' }] }],
  },
  {
    id: 'login-screen', name: 'Login screen', category: 'pattern', minVersion: '4.0',
    description: 'A screen collecting an email, password, and consent. Use it as a starting point for a sign-in form.',
    docsUrl: DOCS_URL, placement: 'screen',
    screen: {
      id: 'LOGIN', title: 'Sign in', terminal: true,
      layout: { type: 'SingleColumnLayout', children: [
        { type: 'TextInput', name: 'login_email', label: 'Email', 'input-type': 'email', required: true },
        { type: 'TextInput', name: 'login_password', label: 'Password', 'input-type': 'password', required: true },
        { type: 'OptIn', name: 'login_consent', label: 'I agree to the terms', required: true },
        { type: 'Footer', label: 'Sign in', 'on-click-action': { name: 'complete', payload: { email: '${form.login_email}', password: '${form.login_password}', consent: '${form.login_consent}' } } },
      ] },
    },
  },
  {
    id: 'appointment-slot-picker', name: 'Appointment slot picker', category: 'pattern', minVersion: '4.0',
    description: 'A screen with appointment options supplied by screen data. Use data_exchange to send the selected slot to a data endpoint.',
    docsUrl: `${DOCS_URL}#dropdown`, placement: 'screen',
    screen: {
      id: 'APPOINTMENT', title: 'Choose a time', terminal: true,
      data: { slots: {
        type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } } },
        __example__: [{ id: 'morning', title: '09:00' }, { id: 'afternoon', title: '14:30' }],
      } },
      layout: { type: 'SingleColumnLayout', children: [
        { type: 'TextHeading', text: 'Choose your appointment' },
        { type: 'Dropdown', name: 'appointment_slot', label: 'Available times', 'data-source': '${data.slots}', required: true },
        { type: 'Footer', label: 'Book appointment', 'on-click-action': { name: 'data_exchange', payload: { slot: '${form.appointment_slot}' } } },
      ] },
    },
  },
  {
    id: 'survey', name: 'Survey', category: 'pattern', minVersion: '4.0',
    description: 'A rating question with an optional written response. Use it to collect feedback after a visit.',
    docsUrl: DOCS_URL, placement: 'screen',
    screen: {
      id: 'SURVEY', title: 'Your feedback', terminal: true,
      layout: { type: 'SingleColumnLayout', children: [
        { type: 'RadioButtonsGroup', name: 'survey_rating', label: 'How was your visit?', required: true, 'data-source': [{ id: 'great', title: 'Great' }, { id: 'okay', title: 'Okay' }, { id: 'poor', title: 'Could be better' }] },
        { type: 'TextArea', name: 'survey_comments', label: 'Additional feedback' },
        { type: 'Footer', label: 'Send feedback', 'on-click-action': { name: 'complete', payload: { rating: '${form.survey_rating}', comments: '${form.survey_comments}' } } },
      ] },
    },
  },
  {
    id: 'success-screen', name: 'Success screen', category: 'pattern', minVersion: COMPONENT_MIN_VERSION.Footer,
    description: 'A terminal confirmation screen. Use it to acknowledge the result and complete the flow.',
    docsUrl: DOCS_URL, placement: 'screen',
    screen: {
      id: 'CONFIRMATION', title: 'All done', terminal: true, success: true,
      layout: { type: 'SingleColumnLayout', children: [
        { type: 'TextHeading', text: 'You are all set' },
        { type: 'TextBody', text: 'Thank you. Your response has been recorded.' },
        { type: 'Footer', label: 'Done', 'on-click-action': { name: 'complete', payload: {} } },
      ] },
    },
  },
];

// Keep data: entry.previewData valid even for previews without dynamic data.
export const COMPONENT_CATALOG: CatalogEntry[] = catalogEntries.map((entry) => ({ previewData: {}, ...entry }));

export function findCatalogEntry(id: string): CatalogEntry | undefined {
  return COMPONENT_CATALOG.find((entry) => entry.id === id);
}

export const CATALOG_CATEGORIES: Array<{ id: CatalogCategory; label: string }> = [
  { id: 'text', label: 'Text' },
  { id: 'media', label: 'Media' },
  { id: 'input', label: 'Input' },
  { id: 'selection', label: 'Selection' },
  { id: 'datetime', label: 'Date & time' },
  { id: 'action', label: 'Action' },
  { id: 'logic', label: 'Logic' },
  { id: 'pattern', label: 'Screen patterns' },
];
