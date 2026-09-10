import type { DataSourceItem } from '../../schema/flow-json';

export function dataSourceItems(value: unknown): DataSourceItem[] {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is DataSourceItem => !!item && typeof item === 'object' && 'id' in item);
}

export function imageSrc(value: string | undefined): string | undefined {
  if (!value) return undefined;

  return value.startsWith('http') || value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
}

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;

  return `${prefix}-${counter}`;
}
