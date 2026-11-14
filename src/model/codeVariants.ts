import type { SpecCode, SpecField } from './spec';
import type { JsonValue } from './types';

// `resolveCode` (formatVersion 9): the only place that applies the `variants` case to the `code` of
// a platform. Every per-annotation `code` reader (get_code_hints, find_by_code, the
// "Definition" in Details, get_marking) goes through it. Pure function, no browser.

/** Case chosen by `variants` for these values, or `undefined` (uses the base). */
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
 * The `code` of a platform for an annotation: the base with the `variants` case for the value of the
 * annotation in the chosen field (or the field's `default`) applied. The case's `symbol`, `path` and `notes`
 * replace the base's, and in `formatVersion` 16 so do `signature` and `ignore`; `params`,
 * `values`, `calls` and `formats` are added to them, key by key (the case's `calls` replaces the base's
 * for the same parameter: `ButtonDefaults.outlinedButtonColors`). Without `variants` returns the
 * `code` itself; never returns `variants`.
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

/** The case's `symbol`, `path`, `notes`, `signature` and `ignore` replace; the rest is added, key by key. */
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

/** `{ key: { ...base[key], ...kase[key] } }` when the case brings the key; otherwise nothing. */
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
