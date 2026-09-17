import type { FlowJson } from '../schema/flow-json';
import { isObject } from './scenario';

export function checkScreenData(flow: FlowJson, screen: string, data: Record<string, unknown>): void {
  const declarations = flow.screens.find(item => item.id === screen)?.data ?? {};
  for (const [key, declaration] of Object.entries(declarations)) {
    check(data[key], declaration, `${screen}.data.${key}`);
  }
}

function check(value: unknown, declaration: unknown, path: string): void {
  if (!isObject(declaration)) return;
  if (value === undefined) throw new Error(`${path}: missing declared data; tests do not fill __example__ values`);
  const type = declaration.type;
  const valid = type === 'array' ? Array.isArray(value) : type === 'object' ? isObject(value)
    : type === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === type;
  if (!valid) throw new Error(`${path}: expected ${String(type)}, got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`);
  if (Array.isArray(value) && declaration.items) value.forEach((item, index) => check(item, declaration.items, `${path}[${index}]`));
  if (isObject(value) && isObject(declaration.properties)) {
    for (const [key, child] of Object.entries(declaration.properties)) {
      if (Object.hasOwn(value, key)) check(value[key], child, `${path}.${key}`);
    }
  }
}
