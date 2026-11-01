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
 * do caso substituem os da base; `params` e `values` se somam a eles, chave por chave. Sem
 * `variants` devolve o próprio `code`; nunca devolve `variants`.
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
  const { symbol, path, notes, params, values: caseValues } = kase;
  return {
    ...base,
    ...(symbol === undefined ? {} : { symbol }),
    ...(path === undefined ? {} : { path }),
    ...(notes === undefined ? {} : { notes }),
    ...(params === undefined ? {} : { params: { ...base.params, ...params } }),
    ...(caseValues === undefined ? {} : { values: { ...base.values, ...caseValues } }),
  };
}
