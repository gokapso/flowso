import type { RenderedNode } from './types';

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (value === false) return true;

  return false;
}

/**
 * Validate the visible inputs of a rendered screen the way the WhatsApp client does before a
 * Footer action runs. Returns a map of field name to error message.
 */
export function validateRenderedInputs(nodes: RenderedNode[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const node of nodes) {
    if (!node.name) continue;
    const props = node.props;
    if (props.enabled === false) continue;
    const value = node.value;
    const required = props.required === true;

    if (required && isEmpty(value)) {
      errors[node.name] = 'This field is required';
      continue;
    }
    if (node.type === 'PhotoPicker' || node.type === 'DocumentPicker') {
      const count = Array.isArray(value) ? value.length : 0;
      const min = numberProp(props[node.type === 'PhotoPicker' ? 'min-uploaded-photos' : 'min-uploaded-documents']);
      const max = numberProp(props[node.type === 'PhotoPicker' ? 'max-uploaded-photos' : 'max-uploaded-documents']);
      if (min !== undefined && count < min) {
        errors[node.name] = `Upload at least ${min}`;
        continue;
      }
      if (max !== undefined && count > max) {
        errors[node.name] = `Upload at most ${max}`;
        continue;
      }
    }
    if (isEmpty(value)) continue;

    if (['Dropdown', 'RadioButtonsGroup', 'CheckboxGroup', 'ChipsSelector'].includes(node.type) && Array.isArray(props['data-source'])) {
      const options = props['data-source'] as { id: string; enabled?: boolean }[];
      const selected = Array.isArray(value) ? value : [value];
      if (selected.some(id => !options.some(option => option.id === id && option.enabled !== false))) {
        errors[node.name] = 'Choose an available option';
        continue;
      }
    }

    if (node.type === 'DatePicker' || node.type === 'CalendarPicker') {
      const error = validateDates(node.type, value, props);
      if (error) {
        errors[node.name] = error;
        continue;
      }
    }

    if (node.type === 'TextInput' || node.type === 'TextArea') {
      const text = String(value);
      const minChars = numberProp(props['min-chars']);
      const maxChars = numberProp(props['max-chars'] ?? props['max-length']);
      if (minChars !== undefined && text.length < minChars) {
        errors[node.name] = `Enter at least ${minChars} characters`;
        continue;
      }
      if (maxChars !== undefined && text.length > maxChars) {
        errors[node.name] = `Enter at most ${maxChars} characters`;
        continue;
      }
      const inputType = props['input-type'];
      if (inputType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
        errors[node.name] = 'Enter a valid email';
        continue;
      }
      if (inputType === 'number' && Number.isNaN(Number(text))) {
        errors[node.name] = 'Enter a valid number';
        continue;
      }
      const pattern = typeof props.pattern === 'string' ? props.pattern : undefined;
      if (pattern) {
        let matches = true;
        try {
          matches = new RegExp(pattern).test(text);
        } catch {
          matches = true;
        }
        if (!matches) {
          errors[node.name] = stringProp(props['error-message']) ?? 'Invalid format';
          continue;
        }
      }
    }

    if (node.type === 'CheckboxGroup' || node.type === 'ChipsSelector') {
      const selected = Array.isArray(value) ? value.length : 0;
      const min = numberProp(props['min-selected-items']);
      const max = numberProp(props['max-selected-items']);
      if (min !== undefined && selected < min) {
        errors[node.name] = `Select at least ${min}`;
        continue;
      }
      if (max !== undefined && selected > max) {
        errors[node.name] = `Select at most ${max}`;
        continue;
      }
    }
  }

  return errors;
}

function toIsoDate(value: unknown): string | undefined {
  if (typeof value === 'number') return new Date(value).toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{10,}$/.test(value)) return new Date(Number(value)).toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  return undefined;
}

function validateDates(type: 'DatePicker' | 'CalendarPicker', value: unknown, props: Record<string, unknown>): string | undefined {
  const min = toIsoDate(props['min-date']);
  const max = toIsoDate(props['max-date']);
  const unavailable = Array.isArray(props['unavailable-dates'])
    ? (props['unavailable-dates'] as unknown[]).map(toIsoDate).filter((date): date is string => !!date)
    : [];
  const dates: string[] = [];
  if (type === 'CalendarPicker' && props.mode === 'range') {
    const range = (value && typeof value === 'object' ? value : {}) as { 'start-date'?: unknown; 'end-date'?: unknown };
    const start = toIsoDate(range['start-date']);
    const end = toIsoDate(range['end-date']);
    if (!start || !end) return 'Select a start and an end date';
    if (end < start) return 'End date must be after start date';
    dates.push(start, end);
  } else {
    const date = toIsoDate(value);
    if (!date) return 'Enter a valid date';
    dates.push(date);
  }
  for (const date of dates) {
    if (min && date < min) return `Date must be on or after ${min}`;
    if (max && date > max) return `Date must be on or before ${max}`;
    if (unavailable.includes(date)) return 'That date is not available';
  }

  return undefined;
}

function numberProp(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function stringProp(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
