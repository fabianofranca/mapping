import type { SpecCode, SpecField } from './spec';
import type { JsonValue } from './types';

// `resolveCode` (formatVersion 9): o único lugar que aplica o caso de `variants` ao `code` de
// uma plataforma. Todo leitor de `code` por anotação (get_code_hints, find_by_code, a
// "Definição" dos Detalhes, get_marking) passa por ela. Função pura, sem navegador.

/** Caso escolhido por `variants` para esses valores, ou `undefined` (usa a base). */
function chosenValue(
  variants: NonNullable<SpecCode['variants']>,
  values: Readonly<Record<string, JsonValue>> | null | undefined,
  fields: readonly SpecField[],
): string | undefined {
  const own = values?.[variants.field];
  if (typeof own === 'string' && own !== '') return own;
  const field = fields.find((f) => f.key === variants.field);
  return field?.type === 'enum' && field.default !== undefined && field.default !== ''
    ? field.default
    : undefined;
}

/**
 * O `code` de uma plataforma para uma anotação: a base com o caso de `variants` do valor da
 * anotação no campo escolhido (ou o `default` do campo) aplicado. `symbol`, `path` e `notes`
 * do caso substituem os da base, e na `formatVersion` 16 também `signature` e `ignore`; `params`,
 * `values`, `calls` e `formats` se somam a eles, chave por chave (o `calls` do caso troca o da base
 * para o mesmo parâmetro: `ButtonDefaults.outlinedButtonColors`). Sem `variants` devolve o próprio
 * `code`; nunca devolve `variants`.
 */
export function resolveCode(
  code: SpecCode,
  values: Readonly<Record<string, JsonValue>> | null | undefined,
  fields: readonly SpecField[],
): SpecCode {
  const { variants, ...base } = code;
  if (variants === undefined) return code;
  const value = chosenValue(variants, values, fields);
  const kase =
    value !== undefined && Object.hasOwn(variants.cases, value)
      ? variants.cases[value]
      : undefined;
  if (kase === undefined) return base;
  return applyCase(base, kase);
}

/** `symbol`, `path`, `notes`, `signature` e `ignore` do caso substituem; o resto se soma, chave por chave. */
function applyCase(
  base: SpecCode,
  kase: NonNullable<SpecCode['variants']>['cases'][string],
): SpecCode {
  const { symbol, path, notes, signature, ignore } = kase;
  return {
    ...base,
    ...(symbol === undefined ? {} : { symbol }),
    ...(path === undefined ? {} : { path }),
    ...(notes === undefined ? {} : { notes }),
    ...(signature === undefined ? {} : { signature }),
    ...(ignore === undefined ? {} : { ignore }),
    ...merged(base, kase, 'params'),
    ...merged(base, kase, 'calls'),
    ...merged(base, kase, 'formats'),
    ...(kase.values === undefined ? {} : { values: { ...base.values, ...kase.values } }),
  };
}

/** `{ key: { ...base[key], ...kase[key] } }` quando o caso traz a chave; senão nada. */
function merged<K extends 'params' | 'calls' | 'formats'>(
  base: SpecCode,
  kase: { readonly [P in K]?: Record<string, string> | undefined },
  key: K,
): { [P in K]?: Record<string, string> } {
  const own = kase[key];
  return own === undefined
    ? {}
    : ({ [key]: { ...base[key], ...own } } as { [P in K]?: Record<string, string> });
}
