import type { z } from 'zod';
import { NAMED_VALUES_VERSION } from './specTokens';
import { addSpecIssue, specMsg } from './specIssueCode';

// `{ "$tokens": "<group>" }` in a `suggestions` list (`formatVersion` 23, stage #1900, NV1): the item stands
// for the text values of the tokens whose `$group` is `<group>`, in the file order of `tokens.values`,
// leaving out the ones marked `deprecated` or `removed`. The file keeps the item; `parseSpec` expands it
// into the parsed `Spec`, which carries a plain `string[]` (the consumers of `suggestions` do not change).
// No browser APIs: reusable by the MCP server.

export const MAX_SUGGESTIONS = 200;

type Obj = Readonly<Record<string, unknown>>;
type Path = (string | number)[];

const isObject = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** An item `{ "$tokens": "<group>" }` (the shape check, one key only, is the schema's). */
export function isTokensItem(item: unknown): item is { readonly $tokens: string } {
  return isObject(item) && typeof item.$tokens === 'string';
}

// ---- The tokens of a group -------------------------------------------------------------------------

const WRAPPER_KEYS = ['$value', '$description', '$group', '$notices'];

const isWrapper = (entry: unknown): entry is Obj =>
  isObject(entry) && WRAPPER_KEYS.some((key) => key in entry);

const unwrap = (entry: unknown): unknown => (isWrapper(entry) ? entry.$value : entry);

const groupOf = (entry: unknown): string | undefined =>
  isWrapper(entry) && typeof entry.$group === 'string' ? entry.$group : undefined;

/** A token with a `deprecated` or `removed` notice is not suggested. */
function isLeftOut(entry: unknown): boolean {
  if (!isWrapper(entry) || !Array.isArray(entry.$notices)) return false;
  return entry.$notices.some(
    (n: unknown) => isObject(n) && (n.kind === 'deprecated' || n.kind === 'removed'),
  );
}

/** The field `field` of a composite value (never of a per-axis value or an alias). */
function fieldOf(target: unknown, field: string): unknown {
  const plain = isObject(target) && !('$axis' in target) && !('$token' in target);
  return plain && Object.hasOwn(target, field) ? target[field] : undefined;
}

/**
 * The fixed text of a value: a literal string, or an alias (with no `alpha`/`over`) that leads to one
 * without choosing an axis entry. A number, a composite, a per-axis value, a built-in or a cycle are not.
 */
function fixedText(
  value: unknown,
  values: Obj,
  seen: ReadonlySet<string>,
): string | undefined {
  if (typeof value === 'string') return value;
  if (!isObject(value) || typeof value.$token !== 'string') return undefined;
  const ref = value.$token;
  if (Object.keys(value).length !== 1 || seen.has(ref)) return undefined;
  const dot = ref.indexOf('.');
  const name = dot < 0 ? ref : ref.slice(0, dot);
  if (!Object.hasOwn(values, name)) return undefined;
  const target = unwrap(values[name]);
  const next = dot < 0 ? target : fieldOf(target, ref.slice(dot + 1));
  return fixedText(next, values, new Set(seen).add(ref));
}

const valuesOf = (tokens: unknown): Obj =>
  isObject(tokens) && isObject(tokens.values) ? tokens.values : {};

/** The texts of a group (in file order) and the problems that stop it from being a list of texts. */
function expandGroup(group: string, tokens: unknown) {
  const values = valuesOf(tokens);
  const members = Object.entries(values).filter(
    ([, entry]) => groupOf(entry) === group && !isLeftOut(entry),
  );
  const texts: string[] = [];
  const errors: ReturnType<typeof specMsg>[] = [];
  if (members.length === 0) {
    errors.push(specMsg('spec.suggestionsGroupEmpty', { group }));
  }
  for (const [name, entry] of members) {
    const text = fixedText(unwrap(entry), values, new Set());
    if (text === undefined) {
      errors.push(specMsg('spec.suggestionsTokenNotText', { name, group }));
    } else {
      texts.push(text);
    }
  }
  return { texts, errors };
}

// ---- Validation (`specSchema`'s superRefine) -------------------------------------------------------

interface Context {
  readonly formatVersion: number;
  readonly tokens: unknown;
  readonly ctx: z.RefinementCtx;
}

/** One `$tokens` item: the version, then the group; returns its texts (none when it is an error). */
function checkItem(group: string, at: Path, env: Context): readonly string[] {
  const { ctx } = env;
  if (env.formatVersion < NAMED_VALUES_VERSION) {
    addSpecIssue(
      ctx,
      at,
      specMsg('spec.onlyFormat', { version: String(NAMED_VALUES_VERSION) }),
    );
    return [];
  }
  const { texts, errors } = expandGroup(group, env.tokens);
  for (const error of errors) addSpecIssue(ctx, at, error);
  if (texts.some((text) => text !== text.trim())) {
    addSpecIssue(ctx, at, specMsg('spec.suggestionsTrim'));
  }
  return texts;
}

/** A list with `$tokens` items: each item, then the 200 limit of the expanded list (repeats dropped). */
function checkList(list: readonly unknown[], path: Path, env: Context): void {
  if (!list.some(isTokensItem)) return;
  const unique = new Set<string>();
  list.forEach((item, i) => {
    if (typeof item === 'string') unique.add(item);
    else if (isTokensItem(item)) {
      for (const text of checkItem(item.$tokens, [...path, 'suggestions', i], env)) {
        unique.add(text);
      }
    }
  });
  const literals = list.filter((item) => typeof item === 'string').length;
  // A list of more than 200 literals is already reported with the plain list's rules.
  if (unique.size > MAX_SUGGESTIONS && literals <= MAX_SUGGESTIONS) {
    addSpecIssue(
      env.ctx,
      [...path, 'suggestions'],
      specMsg('spec.suggestionsMax', { max: MAX_SUGGESTIONS }),
    );
  }
}

interface FieldLike {
  readonly type: string;
  readonly suggestions?: readonly unknown[];
  readonly columns?: readonly unknown[];
}

function checkColumns(columns: readonly unknown[], path: Path, env: Context): void {
  columns.forEach((column, ci) => {
    if (!isObject(column) || column.type !== 'string') return;
    if (Array.isArray(column.suggestions)) {
      checkList(column.suggestions, [...path, 'columns', ci], env);
    }
  });
}

function checkField(field: FieldLike, path: Path, env: Context): void {
  if (field.type === 'string' && field.suggestions !== undefined) {
    checkList(field.suggestions, path, env);
  }
  if (field.type === 'table' && field.columns !== undefined) {
    checkColumns(field.columns, path, env);
  }
}

interface Layered {
  readonly formatVersion: number;
  readonly tokens?: unknown;
  readonly layers: readonly {
    readonly annotationTypes: readonly { readonly fields: readonly FieldLike[] }[];
  }[];
}

/** The `$tokens` items of every string field and column: version, group, texts and the 200 limit. */
export function checkTokenSuggestions(spec: Layered, ctx: z.RefinementCtx): void {
  const env: Context = { formatVersion: spec.formatVersion, tokens: spec.tokens, ctx };
  spec.layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      type.fields.forEach((field, fi) => {
        checkField(field, ['layers', li, 'annotationTypes', ti, 'fields', fi], env);
      });
    });
  });
}

// ---- Expansion (`parseSpec`) -----------------------------------------------------------------------

function expandList(list: readonly unknown[], tokens: unknown): string[] {
  const out = new Set<string>();
  for (const item of list) {
    if (typeof item === 'string') out.add(item);
    else if (isTokensItem(item)) {
      for (const text of expandGroup(item.$tokens, tokens).texts) out.add(text);
    }
  }
  return [...out];
}

/** A field (or column) with its `$tokens` items expanded; the same object when there is none. */
function expandField(field: unknown, tokens: unknown): unknown {
  if (!isObject(field)) return field;
  let out: Obj = field;
  if (Array.isArray(field.suggestions) && field.suggestions.some(isTokensItem)) {
    // `suggestionsSource` keeps the written list (with the `$tokens` items) for `serializeSpec`.
    out = {
      ...out,
      suggestions: expandList(field.suggestions, tokens),
      suggestionsSource: field.suggestions,
    };
  }
  const before: unknown = field.columns;
  if (Array.isArray(before)) {
    const columns = before.map((column: unknown) => expandField(column, tokens));
    if (columns.some((column, i) => column !== before[i])) {
      out = { ...out, columns };
    }
  }
  return out;
}

/**
 * The specialization with every `{ "$tokens": "<group>" }` item of `suggestions` replaced, in place, by the
 * texts of the group (repeats dropped, the first wins). Call it on a validated specialization: the parsed
 * `Spec` then holds `string[]`. The input is not changed; without items the result is the input itself.
 */
export function expandTokenSuggestions<S extends Omit<Layered, 'formatVersion'>>(
  spec: S,
): S {
  let changed = false;
  const layers = spec.layers.map((layer) => ({
    ...layer,
    annotationTypes: layer.annotationTypes.map((type) => {
      const fields = type.fields.map((field) => expandField(field, spec.tokens));
      if (fields.every((field, i) => field === type.fields[i])) return type;
      changed = true;
      return { ...type, fields };
    }),
  }));
  return changed ? ({ ...spec, layers } as S) : spec;
}
