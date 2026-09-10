import { isNestedExpression, isWholeReference } from '../runtime/expressions';
import { addIssue, isObject, isString, type Rule } from './context';

// Literal-only checks: expression source length says nothing about rendered length.
const TEXT_LIMITS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  TextHeading: { text: 80 }, TextSubheading: { text: 80 }, TextBody: { text: 4096 }, TextCaption: { text: 409 },
  TextInput: { label: 20 }, Footer: { label: 35 },
};

export const validateLimits: Rule = (context) => {
  for (const screen of context.screens) {
    for (const { value, path } of screen.components) {
      if (!isObject(value) || !isString(value.type)) continue;
      const limits = Object.hasOwn(TEXT_LIMITS, value.type) ? TEXT_LIMITS[value.type] : undefined;
      for (const [key, maximum] of Object.entries(limits ?? {})) {
        const text = value[key];
        const parts: unknown[] = Array.isArray(text) ? text : [text];
        if (!parts.every((part) => isString(part) && !isWholeReference(part) && !isNestedExpression(part))) continue;
        const length = parts.reduce<number>((total, part) => total + Array.from(String(part)).length, 0);
        if (length > maximum) {
          addIssue(context, 'PROPERTY_LIMIT_EXCEEDED', `${path}.${key}`, `${value.type} ${key} exceeds ${maximum} characters`, 'warning');
        }
      }
      const items = value['data-source'];
      if (!Array.isArray(items)) continue;
      let maximum: number | undefined;
      if (value.type === 'RadioButtonsGroup' || value.type === 'CheckboxGroup') maximum = 20;
      if (value.type === 'Dropdown') maximum = items.some((item: unknown) => isObject(item) && Object.hasOwn(item, 'image')) ? 100 : 200;
      if (maximum !== undefined && items.length > maximum) {
        addIssue(context, 'PROPERTY_LIMIT_EXCEEDED', `${path}.data-source`, `${value.type} data-source exceeds ${maximum} items`, 'warning');
      }
    }
  }
};
