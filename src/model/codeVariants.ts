import type { SpecCode, SpecField } from './spec';
import { inheritedOutsideCase, type ExpandModels } from './signatures/codeLink';
import type { Signature } from './signatures/types';
import type { JsonValue } from './types';

// `resolveCode` (formatVersion 9): the only place that applies the `variants` case to the `code` of
// a platform. Every per-annotation `code` reader (get_code_hints, find_by_code, the
// "Definition" in Details, get_marking) goes through it. Pure function, no browser.

/**
 * What `resolveCode` needs to read the case's own signature sheet: `read` gives the sheet cited by a `signature`
 * (or `null` if it is not available) and `models` is the platform's `fieldModels`. Without it, nothing is left out.
 */
export interface CaseSheets {
  readonly read: (ref: string) => Signature | null;
  readonly models?: ExpandModels | undefined;
}

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
 * `code` itself; never returns `variants`. With `sheets`, a case with its own readable `signature` does not inherit the
 * base `params` its sheet lacks (`inheritedOutsideCase`); without it, or with a case without its own sheet, the result is
 * the one above.
 */
export function resolveCode(
  code: SpecCode,
  values: Readonly<Record<string, JsonValue>> | null | undefined,
  fields: readonly SpecField[],
  sheets?: CaseSheets,
): SpecCode {
  const { variants, ...base } = code;
  if (variants === undefined) return code;
  const value = chosenValue(variants, values, fields);
  const kase =
    value !== undefined && Object.hasOwn(variants.cases, value)
      ? variants.cases[value]
      : undefined;
  if (kase === undefined) return base;
  return applyCase(base, kase, sheets);
}

/** The case's `symbol`, `path`, `notes`, `signature` and `ignore` replace; the rest is added, key by key. */
function applyCase(
  from: SpecCode,
  kase: NonNullable<SpecCode['variants']>['cases'][string],
  sheets: CaseSheets | undefined,
): SpecCode {
  const { symbol, path, notes, signature, ignore } = kase;
  const base = withoutInherited(from, kase, sheets);
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

/** The base without the `params` the case's own sheet lacks (`inheritedOutsideCase`); the base itself without a sheet. */
function withoutInherited(
  base: SpecCode,
  kase: NonNullable<SpecCode['variants']>['cases'][string],
  sheets: CaseSheets | undefined,
): SpecCode {
  const sheet =
    kase.signature === undefined ? null : (sheets?.read(kase.signature) ?? null);
  if (sheet === null || base.params === undefined) return base;
  const left = new Set(
    inheritedOutsideCase(base, kase, sheet, sheets?.models).map((o) => o.field),
  );
  if (left.size === 0) return base;
  const params = Object.fromEntries(
    Object.entries(base.params).filter(([field]) => !left.has(field)),
  );
  return { ...base, params };
}
