// The frozen `tests/fixtures/material3-*-v1.json` carry the Portuguese text of the old packages, and `libraries/**` is in
// English now. Ids, keys, types, numbers and enum values did not change. `withCurrentText` rewrites ONLY the free-text
// strings of the expected value (labels, descriptions, example names, the values of free-string fields) to the ones in the
// current value, at the same path, so that everything else is still compared exactly.
type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Keys that hold prose wherever they appear in a type (never an id, a token or an enum value). */
const PROSE_KEYS = new Set(['label', 'description', 'name']);

/** The `type` of every field of a type, by key (`prose` is the only kind of value that may be translated). */
export function fieldTypesOf(type: unknown): Record<string, string> {
  const fields = (type as { fields?: Raw[] }).fields ?? [];
  const out: Record<string, string> = {};
  // `prose`: a free string (no suggestions, so not an icon or a token)
  const kind = (f: Raw): string =>
    f.type === 'string' && f.suggestions === undefined ? 'prose' : String(f.type);
  for (const f of fields) {
    if (typeof f.key === 'string') out[f.key] = kind(f);
  }
  // the columns of a table field: the keys of its rows
  for (const f of fields) {
    for (const c of (f.columns as Raw[] | undefined) ?? []) {
      if (typeof c.key === 'string' && !(c.key in out)) {
        out[c.key] = kind(c);
      }
    }
  }
  return out;
}

function adopt(
  expected: unknown,
  current: unknown,
  fieldTypes: Record<string, string>,
  inValues: boolean,
  key: string,
): unknown {
  if (typeof expected === 'string') {
    if (typeof current !== 'string') return expected;
    const prose = inValues ? fieldTypes[key] === 'prose' : PROSE_KEYS.has(key);
    return prose ? current : expected;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(current)) return expected;
    return expected.map((item, i) => adopt(item, current[i], fieldTypes, inValues, key));
  }
  if (isObject(expected)) {
    if (!isObject(current)) return expected;
    return Object.fromEntries(
      Object.entries(expected).map(([k, v]) => [
        k,
        adopt(v, current[k], fieldTypes, inValues || k === 'values', k),
      ]),
    );
  }
  return expected;
}

/**
 * `expected` (from a v1 fixture) with its free-text strings replaced by the ones of `current` at the same path.
 * `fieldTypes` (see `fieldTypesOf`) tells which keys of an example's `values` are free text.
 */
export function withCurrentText(
  expected: unknown,
  current: unknown,
  fieldTypes: Record<string, string>,
): unknown {
  return adopt(expected, current, fieldTypes, false, '');
}

/** The same, for a `preview` (its keys are field keys, all of them in the values position). */
export function previewWithCurrentText(
  expected: unknown,
  current: unknown,
  fieldTypes: Record<string, string>,
): unknown {
  return adopt(expected, current, fieldTypes, true, '');
}
