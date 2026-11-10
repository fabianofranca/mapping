/**
 * Motor dos componentes (etapa Biblioteca): avaliação das expressões do template contra os valores dos
 * campos da anotação (`componentFormat.ts`). Funções puras, sem DOM.
 */
import type {
  BoolExpr,
  Condition,
  Expr,
  FieldValue,
  FieldValues,
} from './componentFormat';

/** Operações numéricas (formato 4): a chave e a aridade (lista de `min` ou mais, ou fixa). */
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
/** A chave é uma operação numérica (só as próprias: `constructor` e afins não contam). */
export function isNumericOp(key: string): boolean {
  return Object.hasOwn(NUMERIC_OPS, key);
}
/** Comparações numéricas: `[a, b]`. */
export const COMPARISON_OPS = ['$gt', '$gte', '$lt', '$lte'] as const;

const FALSY_TEXT = new Set(['', 'não', 'nao', 'false', '0', 'off', 'no']);

/** Vazio: `null`, `undefined`, texto só com espaços ou uma tabela sem linhas. */
export function isEmpty(value: FieldValue): boolean {
  if (Array.isArray(value)) return value.length === 0;
  return value === null || value === undefined || String(value).trim() === '';
}

/** "Verdadeiro" para campos booleanos gravados como enum (`sim`/`não`) ou texto. */
export function truthy(value: FieldValue): boolean {
  if (isEmpty(value)) return false;
  if (Array.isArray(value)) return true;
  if (typeof value === 'number') return value !== 0;
  return !FALSY_TEXT.has(String(value).trim().toLowerCase());
}

/** O número de um operando avaliado, ou nenhum: vazio, texto não numérico (a vírgula não vale) e não finito. */
export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : undefined;
}

/** Arredonda o ruído de ponto flutuante da trigonometria (`cos(90°)` vale 0, não 6e-17). */
function snap(n: number): number {
  return Math.round(n * 1e12) / 1e12 + 0;
}

const RAD = Math.PI / 180;

/** O campo de valores onde o motor entrega o tamanho da instância (`$size`). */
export function sizeKey(axis: 'width' | 'height'): string {
  return `$size:${axis}`;
}

/** O nome de campo do índice da linha de um `repeat` (`{ "$field": "$index" }`). */
export const INDEX_FIELD = '$index';

/** As linhas de um campo `table` (valor que não é lista conta 0). */
function rowCount(value: FieldValue): number {
  return Array.isArray(value) ? value.length : 0;
}

/** `$rows` e `$size`: o número que a expressão produz, ou nenhum. */
function evaluateCount(
  expr: Record<string, unknown>,
  values: FieldValues,
): number | undefined {
  if ('$rows' in expr) return rowCount(values[expr.$rows as string]);
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

/** Avalia uma operação numérica (`$add`…): o número, ou nenhum se algum operando não tem valor. */
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

/** Texto de um número: inteiro como é; não inteiro com até 6 casas, sem zeros à direita. */
export function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(6)));
}

function partText(value: unknown): string {
  return typeof value === 'number' ? formatNumber(value) : String(value);
}

export function evaluateCondition(condition: Condition, values: FieldValues): boolean {
  for (const op of COMPARISON_OPS)
    if (op in condition)
      return compare(op, (condition as Record<string, unknown>)[op], values);
  if ('$field' in condition) return truthy(values[condition.$field]);
  if ('$eq' in condition) {
    const [field, expected] = condition.$eq;
    const actual = values[field];
    if (isEmpty(actual)) return false;
    return String(actual) === String(expected);
  }
  if ('$has' in condition) return !isEmpty(values[condition.$has]);
  if ('$not' in condition) return !evaluateCondition(condition.$not, values);
  if ('$and' in condition)
    return condition.$and.every((c) => evaluateCondition(c, values));
  if ('$or' in condition) return condition.$or.some((c) => evaluateCondition(c, values));
  return false;
}

function isExprObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    ('$field' in value ||
      '$if' in value ||
      '$switch' in value ||
      '$concat' in value ||
      '$rows' in value ||
      '$size' in value ||
      Object.keys(value).some(isNumericOp))
  );
}

/**
 * Avalia uma expressão. `fallback` é usado quando a expressão não produz valor (campo vazio
 * sem `default`, `$if` sem `else`, `$switch` sem caso nem `default`). O tipo do resultado não
 * é conferido aqui: os literais vêm do arquivo validado por `parseComponent`.
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
  if ('$rows' in expr || '$size' in expr) {
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

const CONDITION_KEYS = ['$eq', '$has', '$not', '$and', '$or', ...COMPARISON_OPS];

function isCondition(value: unknown): value is Condition {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    CONDITION_KEYS.some((key) => key in value)
  );
}

/** `$field` booleano: campo vazio vale o `default` (se houver; senão falso); preenchido, a veracidade. */
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
 * Avalia uma expressão booleana (`visible`, `italic`): condição direta, `$field` por
 * veracidade (`"sim"`/`"não"`), `$if`/`$switch` com ramos booleanos ou o literal.
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

/** Texto para exibir: números viram texto; vazio vira `fallback`. */
export function evaluateText(
  expr: Expr<string | number>,
  values: FieldValues,
  fallback = '',
): string {
  const value = evaluate<string | number>(expr, values, fallback);
  return isEmpty(value) ? fallback : partText(value);
}

/**
 * Chaves citadas dentro do `template` dos nós `repeat` (colunas da linha ou campos do tipo),
 * ordenadas na ordem em que aparecem, sem repetição. `referencedFields` não as inclui.
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

/** Campos citados pela expressão ou condição (para saber o que redesenha o quê). */
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
    // `repeat`: conta o campo `table` e as expressões do próprio nó; o `template` lê as colunas
    // da linha (`repeatInnerFields`), não os campos do tipo.
    if (isRepeat && key === 'template') continue;
    if (isRepeat && key === 'field' && typeof value === 'string') {
      out.add(value);
    } else if (
      (key === '$field' || key === '$has' || key === '$switch' || key === '$rows') &&
      typeof value === 'string'
    ) {
      // `$index` é o índice da linha de um `repeat`, não um campo do tipo.
      if (!(key === '$field' && value === INDEX_FIELD)) out.add(value);
    } else if (key === '$eq' && Array.isArray(value) && typeof value[0] === 'string') {
      out.add(value[0]);
    } else {
      referencedFields(value, out);
    }
  }
  return out;
}
