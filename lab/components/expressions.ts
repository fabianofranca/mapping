/**
 * Laboratório "Componentes": avaliação das expressões do template contra os valores dos
 * campos da anotação (`componentFormat.ts`). Funções puras, sem DOM.
 */
import type {
  BoolExpr,
  Condition,
  Expr,
  FieldValue,
  FieldValues,
} from './componentFormat';

const FALSY_TEXT = new Set(['', 'não', 'nao', 'false', '0', 'off', 'no']);

/** Vazio: `null`, `undefined` ou texto só com espaços. */
export function isEmpty(value: FieldValue): boolean {
  return value === null || value === undefined || String(value).trim() === '';
}

/** "Verdadeiro" para campos booleanos gravados como enum (`sim`/`não`) ou texto. */
export function truthy(value: FieldValue): boolean {
  if (isEmpty(value)) return false;
  if (typeof value === 'number') return value !== 0;
  return !FALSY_TEXT.has(String(value).trim().toLowerCase());
}

export function evaluateCondition(condition: Condition, values: FieldValues): boolean {
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
  return condition.$or.some((c) => evaluateCondition(c, values));
}

function isExprObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    ('$field' in value || '$if' in value || '$switch' in value || '$concat' in value)
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
    const chosen = isEmpty(key) ? undefined : e.cases[String(key)];
    if (chosen !== undefined) return evaluate(chosen, values, fallback);
    return e.default === undefined ? fallback : evaluate(e.default, values, fallback);
  }
  const parts = (expr as { $concat: Expr<string | number>[] }).$concat;
  return parts
    .map((part) => String(evaluate<string | number>(part, values, '')))
    .join('') as T;
}

const CONDITION_KEYS = ['$eq', '$has', '$not', '$and', '$or'];

function isCondition(value: unknown): value is Condition {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    CONDITION_KEYS.some((key) => key in value)
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
  if (isExprObject(expr) && '$field' in expr)
    return truthy(values[expr.$field as string]);
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
  return isEmpty(value) ? fallback : String(value);
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
  for (const [key, value] of Object.entries(record)) {
    if (
      (key === '$field' || key === '$has' || key === '$switch') &&
      typeof value === 'string'
    ) {
      out.add(value);
    } else if (key === '$eq' && Array.isArray(value) && typeof value[0] === 'string') {
      out.add(value[0]);
    } else {
      referencedFields(value, out);
    }
  }
  return out;
}
