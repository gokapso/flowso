/**
 * Dynamic values in Flow JSON:
 *  - A whole-string reference: "${data.x}", "${form.x}", "${screen.ID.data.x}", "${screen.ID.form.x}".
 *  - A nested expression (v6.0+): a string wrapped in backticks, e.g. "`'Hello ' ${data.name}`",
 *    "`${form.age} >= 18`", "`(${data.a} == 'x') && !${form.b}`".
 *  - Anything else is a literal.
 */

export type EvaluationContext = {
  data: Record<string, unknown>;
  form: Record<string, unknown>;
  screen: Record<string, { data: Record<string, unknown>; form: Record<string, unknown> }>;
};

export type ReferenceScope = 'data' | 'form' | 'screen';

export type ParsedReference = {
  raw: string;
  scope: ReferenceScope;
  /** For `screen.ID.form.x`, the screen id. */
  screenId?: string;
  /** For `screen.ID.form.x`, 'form' or 'data'. */
  screenScope?: 'data' | 'form';
  /** Path segments after the scope. Dynamic bracket segments hold the inner reference text. */
  path: string[];
  /** Indexes into `path` whose segment is a dynamic lookup like `countries[form.selected_country]`. */
  dynamicIndexes?: number[];
};

const WHOLE_REFERENCE = /^\$\{\s*([^}]+?)\s*\}$/;
const REFERENCE_INSIDE = /\$\{\s*([^}]+?)\s*\}/g;

export function isWholeReference(value: unknown): value is string {
  return typeof value === 'string' && WHOLE_REFERENCE.test(value);
}

export function isNestedExpression(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 2 && value.startsWith('`') && value.endsWith('`');
}

export function isDynamic(value: unknown): boolean {
  return isWholeReference(value) || isNestedExpression(value);
}

export function parseReference(raw: string): ParsedReference | null {
  const match = WHOLE_REFERENCE.exec(raw.trim());
  const body = match ? match[1] : raw;
  if (!body) return null;
  const { segments, dynamicIndexes } = splitPath(body.trim());
  const scope = segments[0];
  const shift = (offset: number) => dynamicIndexes.map((index) => index - offset).filter((index) => index >= 0);
  if (scope === 'data' || scope === 'form') {
    return withDynamic({ raw, scope, path: segments.slice(1) }, shift(1));
  }
  if (scope === 'screen') {
    const screenId = segments[1];
    const screenScope = segments[2];
    if (!screenId || (screenScope !== 'data' && screenScope !== 'form')) return null;

    return withDynamic({ raw, scope, screenId, screenScope, path: segments.slice(3) }, shift(3));
  }

  return null;
}

function withDynamic(reference: ParsedReference, dynamicIndexes: number[]): ParsedReference {
  return dynamicIndexes.length > 0 ? { ...reference, dynamicIndexes } : reference;
}

/**
 * Split `a.b[0].c` into ['a', 'b', '0', 'c']. Bracket contents that are not a number or a quoted
 * string are dynamic lookups (`countries[form.selected_country]`) and are reported in `dynamicIndexes`.
 */
function splitPath(path: string): { segments: string[]; dynamicIndexes: number[] } {
  const segments: string[] = [];
  const dynamicIndexes: number[] = [];
  let current = '';
  let i = 0;
  const flush = () => {
    if (current !== '') segments.push(current);
    current = '';
  };
  while (i < path.length) {
    const char = path[i] as string;
    if (char === '.') {
      segments.push(current);
      current = '';
      i += 1;
      continue;
    }
    if (char === '[') {
      flush();
      const end = path.indexOf(']', i);
      if (end === -1) {
        current += path.slice(i);
        break;
      }
      const inner = path.slice(i + 1, end).trim();
      const quoted = /^(['"])(.*)\1$/.exec(inner);
      if (quoted && quoted[2] !== undefined) {
        segments.push(quoted[2]);
      } else if (/^\d+$/.test(inner)) {
        segments.push(inner);
      } else {
        dynamicIndexes.push(segments.length);
        segments.push(inner);
      }
      i = end + 1;
      if (path[i] === '.') i += 1;
      continue;
    }
    current += char;
    i += 1;
  }
  if (current !== '' || path.endsWith('.')) segments.push(current);

  return { segments, dynamicIndexes };
}

export function resolveReference(reference: ParsedReference, context: EvaluationContext): unknown {
  let root: unknown;
  if (reference.scope === 'data') root = context.data;
  else if (reference.scope === 'form') root = context.form;
  else {
    const screen = reference.screenId ? context.screen[reference.screenId] : undefined;
    root = screen ? screen[reference.screenScope ?? 'data'] : undefined;
  }

  const path = reference.path.map((segment, index) => {
    if (!reference.dynamicIndexes?.includes(index)) return segment;
    const inner = parseReference(segment);
    const resolved = inner ? resolveReference(inner, context) : undefined;

    return resolved === undefined || resolved === null ? '' : String(resolved);
  });

  return getPath(root, path);
}

function getPath(root: unknown, path: string[]): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
      continue;
    }

    return undefined;
  }

  return current;
}

/** Collect every `${...}` reference inside a string (whole or nested). */
export function collectReferences(value: string): ParsedReference[] {
  const references: ParsedReference[] = [];
  for (const match of value.matchAll(REFERENCE_INSIDE)) {
    const parsed = parseReference(match[0]);
    if (parsed) references.push(parsed);
  }

  return references;
}

// ---------------------------------------------------------------------------
// Nested expression parser (v6.0+)
// ---------------------------------------------------------------------------

type Token =
  | { kind: 'ref'; reference: ParsedReference }
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'op'; value: string }
  | { kind: 'lparen' }
  | { kind: 'rparen' };

const OPERATORS = ['==', '!=', '>=', '<=', '&&', '||', '>', '<', '!', '+', '-', '*', '/', '%'];

export class ExpressionError extends Error {
  constructor(message: string, public readonly expression: string) {
    super(message);
    this.name = 'ExpressionError';
  }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i] as string;
    if (/\s/.test(char)) {
      i += 1;
      continue;
    }
    if (char === '$' && source[i + 1] === '{') {
      const end = source.indexOf('}', i);
      if (end === -1) throw new ExpressionError('Unterminated reference', source);
      const raw = source.slice(i, end + 1);
      const reference = parseReference(raw);
      if (!reference) throw new ExpressionError(`Invalid reference ${raw}`, source);
      tokens.push({ kind: 'ref', reference });
      i = end + 1;
      continue;
    }
    if (char === "'" || char === '"') {
      let j = i + 1;
      let value = '';
      while (j < source.length && source[j] !== char) {
        if (source[j] === '\\' && j + 1 < source.length) {
          j += 1;
        }
        value += source[j];
        j += 1;
      }
      if (j >= source.length) throw new ExpressionError('Unterminated string literal', source);
      tokens.push({ kind: 'string', value });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
      const match = /^[0-9]*\.?[0-9]+/.exec(source.slice(i));
      const text = match ? match[0] : char;
      tokens.push({ kind: 'number', value: Number(text) });
      i += text.length;
      continue;
    }
    if (char === '(') {
      tokens.push({ kind: 'lparen' });
      i += 1;
      continue;
    }
    if (char === ')') {
      tokens.push({ kind: 'rparen' });
      i += 1;
      continue;
    }
    const word = /^(true|false)(?![A-Za-z0-9_])/.exec(source.slice(i));
    if (word) {
      tokens.push({ kind: 'boolean', value: word[1] === 'true' });
      i += word[0].length;
      continue;
    }
    const operator = OPERATORS.find((op) => source.startsWith(op, i));
    if (operator) {
      tokens.push({ kind: 'op', value: operator });
      i += operator.length;
      continue;
    }
    throw new ExpressionError(`Unexpected character '${char}' at ${i}`, source);
  }

  return tokens;
}

export type ExpressionNode =
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'ref'; reference: ParsedReference }
  | { kind: 'unary'; operator: '!' | '-'; operand: ExpressionNode }
  | { kind: 'binary'; operator: string; left: ExpressionNode; right: ExpressionNode }
  | { kind: 'concat'; parts: ExpressionNode[] };

/** Operators with precedence at or above this value are arithmetic and bind tighter than juxtaposition. */
const ARITHMETIC_PRECEDENCE = 5;

const PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '>': 4,
  '<': 4,
  '>=': 4,
  '<=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[], private readonly source: string) {}

  parse(): ExpressionNode {
    const node = this.parseExpression(0);
    if (this.index < this.tokens.length) {
      throw new ExpressionError('Unexpected token after expression', this.source);
    }

    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private next(): Token {
    const token = this.tokens[this.index];
    if (!token) throw new ExpressionError('Unexpected end of expression', this.source);
    this.index += 1;

    return token;
  }

  /** Logical and comparison operators (precedence < ARITHMETIC_PRECEDENCE) over concatenations. */
  private parseExpression(minPrecedence: number): ExpressionNode {
    let left = this.parseConcat();
    for (;;) {
      const token = this.peek();
      if (!token || token.kind !== 'op') break;
      const precedence = PRECEDENCE[token.value];
      if (precedence === undefined || precedence >= ARITHMETIC_PRECEDENCE || precedence < minPrecedence) break;
      this.next();
      const right = this.parseExpression(precedence + 1);
      left = { kind: 'binary', operator: token.value, left, right };
    }

    return left;
  }

  /**
   * Adjacent operands (no operator between them) concatenate as strings: `'Hi ' ${data.name}`.
   * Arithmetic binds tighter: `'Total: ' ${data.a} / ${data.b}` concatenates the quotient.
   */
  private parseConcat(): ExpressionNode {
    const parts: ExpressionNode[] = [this.parseArithmetic(ARITHMETIC_PRECEDENCE)];
    for (;;) {
      const token = this.peek();
      if (!token || token.kind === 'op' || token.kind === 'rparen') break;
      parts.push(this.parseArithmetic(ARITHMETIC_PRECEDENCE));
    }

    return parts.length === 1 ? (parts[0] as ExpressionNode) : { kind: 'concat', parts };
  }

  private parseArithmetic(minPrecedence: number): ExpressionNode {
    let left = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (!token || token.kind !== 'op') break;
      const precedence = PRECEDENCE[token.value];
      if (precedence === undefined || precedence < ARITHMETIC_PRECEDENCE || precedence < minPrecedence) break;
      this.next();
      const right = this.parseArithmetic(precedence + 1);
      left = { kind: 'binary', operator: token.value, left, right };
    }

    return left;
  }

  private parseUnary(): ExpressionNode {
    const token = this.peek();
    if (token && token.kind === 'op' && (token.value === '!' || token.value === '-')) {
      this.next();

      return { kind: 'unary', operator: token.value, operand: this.parseUnary() };
    }

    return this.parsePrimary();
  }

  private parsePrimary(): ExpressionNode {
    const token = this.next();
    switch (token.kind) {
      case 'ref':
        return { kind: 'ref', reference: token.reference };
      case 'string':
      case 'number':
      case 'boolean':
        return { kind: 'literal', value: token.value };
      case 'lparen': {
        const inner = this.parseExpression(0);
        const closing = this.next();
        if (closing.kind !== 'rparen') throw new ExpressionError('Expected )', this.source);

        return inner;
      }
      default:
        throw new ExpressionError('Unexpected token', this.source);
    }
  }
}

export function parseNestedExpression(expression: string): ExpressionNode {
  const source = isNestedExpression(expression) ? expression.slice(1, -1) : expression;

  return new Parser(tokenize(source), source).parse();
}

function truthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value === '' || value === null || value === undefined) return false;

  return Boolean(value);
}

function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'string') return a === Number(b);
  if (typeof a === 'string' && typeof b === 'number') return Number(a) === b;
  if (typeof a === 'boolean' && typeof b === 'string') return String(a) === b;
  if (typeof a === 'string' && typeof b === 'boolean') return a === String(b);

  return false;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  if (typeof value === 'boolean') return value ? 1 : 0;

  return Number.NaN;
}

function toDisplayString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);

  return String(value);
}

export function evaluateNode(node: ExpressionNode, context: EvaluationContext): unknown {
  switch (node.kind) {
    case 'literal':
      return node.value;
    case 'ref':
      return resolveReference(node.reference, context);
    case 'unary': {
      const operand = evaluateNode(node.operand, context);

      return node.operator === '!' ? !truthy(operand) : -toNumber(operand);
    }
    case 'concat':
      return node.parts.map((part) => toDisplayString(evaluateNode(part, context))).join('');
    case 'binary': {
      if (node.operator === '&&') {
        return truthy(evaluateNode(node.left, context)) && truthy(evaluateNode(node.right, context));
      }
      if (node.operator === '||') {
        return truthy(evaluateNode(node.left, context)) || truthy(evaluateNode(node.right, context));
      }
      const left = evaluateNode(node.left, context);
      const right = evaluateNode(node.right, context);
      switch (node.operator) {
        case '==':
          return looseEquals(left, right);
        case '!=':
          return !looseEquals(left, right);
        case '>':
          return toNumber(left) > toNumber(right);
        case '<':
          return toNumber(left) < toNumber(right);
        case '>=':
          return toNumber(left) >= toNumber(right);
        case '<=':
          return toNumber(left) <= toNumber(right);
        case '+':
          if (typeof left === 'string' || typeof right === 'string') {
            return toDisplayString(left) + toDisplayString(right);
          }

          return toNumber(left) + toNumber(right);
        case '-':
          return toNumber(left) - toNumber(right);
        case '*':
          return toNumber(left) * toNumber(right);
        case '/':
          return toNumber(left) / toNumber(right);
        case '%':
          return toNumber(left) % toNumber(right);
        default:
          throw new Error(`Unknown operator ${node.operator}`);
      }
    }
    default:
      return undefined;
  }
}

const expressionCache = new Map<string, ExpressionNode>();

export function evaluateNestedExpression(expression: string, context: EvaluationContext): unknown {
  let node = expressionCache.get(expression);
  if (!node) {
    node = parseNestedExpression(expression);
    expressionCache.set(expression, node);
  }

  return evaluateNode(node, context);
}

/**
 * Resolve a single property value: whole references and nested expressions are evaluated,
 * everything else is returned as-is.
 */
export function resolveValue(value: unknown, context: EvaluationContext): unknown {
  if (typeof value !== 'string') return value;
  if (isWholeReference(value)) {
    const reference = parseReference(value);

    return reference ? resolveReference(reference, context) : value;
  }
  if (isNestedExpression(value)) return evaluateNestedExpression(value, context);

  return value;
}

export type ResolveDeepOptions = {
  /** Keys whose values are copied without resolution (used to keep action payloads raw until dispatch). */
  skipKey?: (key: string) => boolean;
};

/** Resolve dynamic values inside any JSON structure (objects and arrays, recursively). */
export function resolveDeep<T>(value: T, context: EvaluationContext, options: ResolveDeepOptions = {}): T {
  if (Array.isArray(value)) {
    return value.map((item) => resolveDeep(item, context, options)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = options.skipKey?.(key) ? item : resolveDeep(item, context, options);
    }

    return result as T;
  }

  return resolveValue(value, context) as T;
}

/** Action properties (`on-click-action`, `on-select-action`, ...) are resolved once, at dispatch time. */
export function isActionKey(key: string): boolean {
  return key.endsWith('-action');
}
