/**
 * Component engine (Library stage): evaluation of the template expressions against the values of the
 * annotation's fields (`componentFormat.ts`). Pure functions, no DOM.
 */
import type {
  BoolExpr,
  Condition,
  Expr,
  FieldValue,
  FieldValues,
} from './componentFormat';

/** Numeric operations (format 4): the key and the arity (list of `min` or more, or fixed). */
export const NUMERIC_OPS: Readonly<
  Record<string, { readonly min: number; readonly max: number | null }>
> = {
  $add: { min: 2, max: null },
  $mul: { min: 2, max: null },
  $min: { min: 2, max: null },
  $max: { min: 2, max: null },
  $sub: { min: 2, max: 2 },
  $div: { min: 2, max: 2 },
  $mod: { min: 2, max: 2 },
  $clamp: { min: 3, max: 3 },
  $round: { min: 1, max: 1 },
  $floor: { min: 1, max: 1 },
  $ceil: { min: 1, max: 1 },
  $abs: { min: 1, max: 1 },
  $sin: { min: 1, max: 1 },
  $cos: { min: 1, max: 1 },
};
/** The key is a numeric operation (only its own: `constructor` and the like do not count). */
export function isNumericOp(key: string): boolean {
  return Object.hasOwn(NUMERIC_OPS, key);
}
/** Numeric comparisons: `[a, b]`. */
export const COMPARISON_OPS = ['$gt', '$gte', '$lt', '$lte'] as const;

const FALSY_TEXT = new Set(['', 'não', 'nao', 'false', '0', 'off', 'no']);

/** Empty: `null`, `undefined`, text with only spaces, or a table with no rows. */
export function isEmpty(value: FieldValue): boolean {
  if (Array.isArray(value)) return value.length === 0;
  return value === null || value === undefined || String(value).trim() === '';
}

/** "True" for boolean fields stored as enum (`sim`/`não`) or text. */
export function truthy(value: FieldValue): boolean {
  if (isEmpty(value)) return false;
  if (Array.isArray(value)) return true;
  if (typeof value === 'number') return value !== 0;
  return !FALSY_TEXT.has(String(value).trim().toLowerCase());
}

/** The number of an evaluated operand, or none: empty, non-numeric text (a comma does not count) and non-finite. */
export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : undefined;
}

/** Rounds off the floating-point noise of trigonometry (`cos(90°)` is 0, not 6e-17). */
function snap(n: number): number {
  return Math.round(n * 1e12) / 1e12 + 0;
}

const RAD = Math.PI / 180;

/** The values field where the engine delivers the instance's size (`$size`). */
export function sizeKey(axis: 'width' | 'height'): string {
  return `$size:${axis}`;
}

/** The values field where the engine delivers the number of measured lines of the text node `name` (`$lines`). */
export function linesKey(name: string): string {
  return `$lines:${name}`;
}

const LINES_SCOPE = /^\$r\d+_\d+:/;

/** The name of the text node of a `$lines` key (without the row scope of a `repeat`, `$r0_1:`). */
export function linesNodeName(key: string): string {
  return key.replace(LINES_SCOPE, '');
}

/** The names that the `$lines` expressions of the tree cite (at any depth). */
export function linesCitations(tree: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(tree)) {
    for (const item of tree) linesCitations(item, out);
    return out;
  }
  if (typeof tree !== 'object' || tree === null) return out;
  for (const [key, value] of Object.entries(tree)) {
    if (key === '$lines' && typeof value === 'string') out.add(value);
    else linesCitations(value, out);
  }
  return out;
}

/** Values offered by the ancestors' slots (inherited color, v4), by name, already resolved. */
export type ProvidedValues = Readonly<Record<string, string | number>>;

/** The values field where the engine delivers the inherited value `name` (`$provided`). */
export function providedKey(name: string): string {
  return `$provided:${name}`;
}

/** The field name of a `repeat` row's index (`{ "$field": "$index" }`). */
export const INDEX_FIELD = '$index';

/** The values field where the engine delivers the instance's direction (`{ "$direction": … }` outside a node). */
export const DIRECTION_FIELD = '$direction';

/** The prefix of the anchor pseudo-fields (`$anchor.side`, `$anchor.x`…; v4). */
export const ANCHOR_PREFIX = '$anchor.';

/** The anchor pseudo-fields that the engine delivers (the rest of `$anchor.*` does not exist). */
export const ANCHOR_FIELDS = [
  '$anchor.side',
  '$anchor.x',
  '$anchor.y',
  '$anchor.width',
  '$anchor.height',
] as const;

/** Is the name that of an anchor pseudo-field (valid or not: the prefix is enough)? */
export function isAnchorFieldName(name: string): boolean {
  return name.startsWith(ANCHOR_PREFIX);
}

/** The rows of a `table` field (a value that is not a list counts 0). */
function rowCount(value: FieldValue): number {
  return Array.isArray(value) ? value.length : 0;
}

/** `$rows`, `$lines` and `$size`: the number the expression produces, or none. */
function evaluateCount(
  expr: Record<string, unknown>,
  values: FieldValues,
): number | undefined {
  if ('$rows' in expr) return rowCount(values[expr.$rows as string]);
  if ('$lines' in expr) return toNumber(values[linesKey(expr.$lines as string)]);
  return toNumber(values[sizeKey(expr.$size === 'height' ? 'height' : 'width')]);
}

type NumericFn = (n: readonly number[]) => number | undefined;

export const NUMERIC_FNS: Readonly<Record<string, NumericFn>> = {
  $add: (n) => n.reduce((x, y) => x + y, 0),
  $mul: (n) => n.reduce((x, y) => x * y, 1),
  $min: (n) => Math.min(...n),
  $max: (n) => Math.max(...n),
  $sub: ([a, b]) => (a as number) - (b as number),
  $div: ([a, b]) => (b === 0 ? undefined : (a as number) / (b as number)),
  $mod: ([a, b]) =>
    b === 0
      ? undefined
      : (((a as number) % (b as number)) + (b as number)) % (b as number),
  $clamp: ([a, b, c]) => Math.min(Math.max(a as number, b as number), c as number),
  $round: ([a]) => Math.round(a as number),
  $floor: ([a]) => Math.floor(a as number),
  $ceil: ([a]) => Math.ceil(a as number),
  $abs: ([a]) => Math.abs(a as number),
  $sin: ([a]) => snap(Math.sin((a as number) * RAD)),
  $cos: ([a]) => snap(Math.cos((a as number) * RAD)),
};

function applyNumeric(op: string, n: readonly number[]): number | undefined {
  return NUMERIC_FNS[op]?.(n);
}

/** Evaluates a numeric operation (`$add`…): the number, or none if some operand has no value. */
function evaluateNumeric(
  op: string,
  operand: unknown,
  values: FieldValues,
): number | undefined {
  const list = Array.isArray(operand) ? (operand as unknown[]) : [operand];
  const numbers: number[] = [];
  for (const item of list) {
    const n = toNumber(evaluate<unknown>(item as Expr<unknown>, values, undefined));
    if (n === undefined) return undefined;
    numbers.push(n);
  }
  const result = applyNumeric(op, numbers);
  return result !== undefined && Number.isFinite(result) ? result : undefined;
}

function compare(op: string, operand: unknown, values: FieldValues): boolean {
  if (!Array.isArray(operand)) return false;
  const [a, b] = operand.map((item) =>
    toNumber(evaluate<unknown>(item as Expr<unknown>, values, undefined)),
  );
  if (a === undefined || b === undefined) return false;
  if (op === '$gt') return a > b;
  if (op === '$gte') return a >= b;
  return op === '$lt' ? a < b : a <= b;
}

/** Text of a number: an integer as is; a non-integer with up to 6 decimals, no trailing zeros. */
export function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(6)));
}

function partText(value: unknown): string {
  return typeof value === 'number' ? formatNumber(value) : String(value);
}

/**
 * The leaf conditions, in the order in which `evaluateCondition` consults them: comparison, `$field`,
 * `$eq` and `$has`. `undefined` when the condition is none of them (the combining ones and `$direction`
 * stay in `evaluateCondition`, which keeps the previous order).
 */
function evaluateLeaf(condition: Condition, values: FieldValues): boolean | undefined {
  for (const op of COMPARISON_OPS)
    if (op in condition)
      return compare(op, (condition as Record<string, unknown>)[op], values);
  if ('$field' in condition) return truthy(values[condition.$field]);
  if ('$eq' in condition) {
    const [field, expected] = condition.$eq;
    const actual = values[field];
    return isEmpty(actual) ? false : String(actual) === String(expected);
  }
  if ('$has' in condition) return !isEmpty(values[condition.$has]);
  return undefined;
}

export function evaluateCondition(condition: Condition, values: FieldValues): boolean {
  const leaf = evaluateLeaf(condition, values);
  if (leaf !== undefined) return leaf;
  if ('$not' in condition) return !evaluateCondition(condition.$not, values);
  if ('$direction' in condition)
    return (values[DIRECTION_FIELD] ?? 'ltr') === condition.$direction;
  if ('$and' in condition)
    return condition.$and.every((c) => evaluateCondition(c, values));
  if ('$or' in condition) return condition.$or.some((c) => evaluateCondition(c, values));
  return false;
}

/** Keys that mark an object as an expression (the numeric operations apart, in `NUMERIC_OPS`). */
const EXPR_KEYS = [
  '$field',
  '$if',
  '$switch',
  '$concat',
  '$rows',
  '$size',
  '$lines',
  '$provided',
];

function isExprObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return EXPR_KEYS.some((key) => key in value) || Object.keys(value).some(isNumericOp);
}

/**
 * Evaluates an expression. `fallback` is used when the expression produces no value (empty field
 * without `default`, `$if` without `else`, `$switch` with no case and no `default`). The result type is not
 * checked here: the literals come from the file validated by `parseComponent`.
 */
export function evaluate<T>(expr: Expr<T>, values: FieldValues, fallback: T): T {
  if (!isExprObject(expr)) return expr as T;
  if ('$field' in expr) {
    const value = values[expr.$field as string];
    if (isEmpty(value))
      return ('default' in expr ? (expr.default as T) : undefined) ?? fallback;
    return value as unknown as T;
  }
  if ('$if' in expr) {
    const e = expr as { $if: Condition; then: Expr<T>; else?: Expr<T> };
    if (evaluateCondition(e.$if, values)) return evaluate(e.then, values, fallback);
    return e.else === undefined ? fallback : evaluate(e.else, values, fallback);
  }
  if ('$switch' in expr) {
    const e = expr as {
      $switch: string;
      cases: Record<string, Expr<T>>;
      default?: Expr<T>;
    };
    const key = values[e.$switch];
    const name = String(key);
    const chosen =
      !isEmpty(key) && Object.hasOwn(e.cases, name) ? e.cases[name] : undefined;
    if (chosen !== undefined) return evaluate(chosen, values, fallback);
    return e.default === undefined ? fallback : evaluate(e.default, values, fallback);
  }
  if ('$provided' in expr) {
    const e = expr as { $provided: string; default?: Expr<T> };
    const value = values[providedKey(e.$provided)];
    if (!isEmpty(value)) return value as unknown as T;
    return e.default === undefined ? fallback : evaluate(e.default, values, fallback);
  }
  if ('$rows' in expr || '$size' in expr || '$lines' in expr) {
    const n = evaluateCount(expr as Record<string, unknown>, values);
    return (n === undefined ? fallback : n) as T;
  }
  const numericOp = Object.keys(expr).find(isNumericOp);
  if (numericOp !== undefined) {
    const n = evaluateNumeric(
      numericOp,
      (expr as Record<string, unknown>)[numericOp],
      values,
    );
    return (n === undefined ? fallback : n) as T;
  }
  const parts = (expr as { $concat: Expr<string | number>[] }).$concat;
  return parts
    .map((part) => partText(evaluate<string | number>(part, values, '')))
    .join('') as T;
}

const CONDITION_KEYS = [
  '$eq',
  '$has',
  '$not',
  '$and',
  '$or',
  '$direction',
  ...COMPARISON_OPS,
];

function isCondition(value: unknown): value is Condition {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    CONDITION_KEYS.some((key) => key in value)
  );
}

/** Boolean `$field`: an empty field takes the `default` (if any; otherwise false); a filled one, its truthiness. */
function fieldBoolean(expr: Record<string, unknown>, values: FieldValues): boolean {
  const value = values[expr.$field as string];
  if (!isEmpty(value) || !('default' in expr)) return truthy(value);
  const fallbackValue = expr.default;
  if (typeof fallbackValue === 'boolean') return fallbackValue;
  return (
    (typeof fallbackValue === 'string' || typeof fallbackValue === 'number') &&
    truthy(fallbackValue)
  );
}

/**
 * Evaluates a boolean expression (`visible`, `italic`): direct condition, `$field` by
 * truthiness (`"sim"`/`"não"`), `$if`/`$switch` with boolean branches or the literal.
 */
export function evaluateBoolean(
  expr: BoolExpr,
  values: FieldValues,
  fallback: boolean,
): boolean {
  if (typeof expr === 'boolean') return expr;
  if (isCondition(expr)) return evaluateCondition(expr, values);
  if (isExprObject(expr) && '$field' in expr) return fieldBoolean(expr, values);
  const value: unknown = evaluate<unknown>(expr as Expr<unknown>, values, fallback);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string' || typeof value === 'number') return truthy(value);
  return fallback;
}

/** Text to display: numbers become text; empty becomes `fallback`. */
export function evaluateText(
  expr: Expr<string | number>,
  values: FieldValues,
  fallback = '',
): string {
  const value = evaluate<string | number>(expr, values, fallback);
  return isEmpty(value) ? fallback : partText(value);
}

/**
 * Keys cited inside the `template` of the `repeat` nodes (row columns or type fields),
 * sorted in order of appearance, without repetition. `referencedFields` does not include them.
 */
export function repeatInnerFields(
  node: unknown,
  out: Set<string> = new Set(),
): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) repeatInnerFields(item, out);
    return out;
  }
  if (typeof node !== 'object' || node === null) return out;
  const record = node as Record<string, unknown>;
  if (record.type === 'repeat') {
    referencedFields(record.template, out);
    return out;
  }
  for (const value of Object.values(record)) repeatInnerFields(value, out);
  return out;
}

/** Fields cited by the expression or condition (to know what redraws what). */
export function referencedFields(
  expr: unknown,
  out: Set<string> = new Set(),
): Set<string> {
  if (Array.isArray(expr)) {
    for (const item of expr) referencedFields(item, out);
    return out;
  }
  if (typeof expr !== 'object' || expr === null) return out;
  const record = expr as Record<string, unknown>;
  const isRepeat = record.type === 'repeat';
  for (const [key, value] of Object.entries(record)) {
    // `repeat`: counts the `table` field and the expressions of the node itself; the `template` reads the columns
    // of the row (`repeatInnerFields`), not the type's fields.
    if (isRepeat && key === 'template') continue;
    if (isRepeat && key === 'field' && typeof value === 'string') {
      out.add(value);
    } else if (
      (key === '$field' || key === '$has' || key === '$switch' || key === '$rows') &&
      typeof value === 'string'
    ) {
      // `$index` is a `repeat` row's index and `$anchor.*` come from the anchor: they are not type fields.
      if (key === '$rows' || (value !== INDEX_FIELD && !isAnchorFieldName(value)))
        out.add(value);
    } else if (key === '$eq' && Array.isArray(value) && typeof value[0] === 'string') {
      if (value[0] !== INDEX_FIELD && !isAnchorFieldName(value[0])) out.add(value[0]);
    } else {
      referencedFields(value, out);
    }
  }
  return out;
}
