import {
  FORMAT_OPERATION_KEYS,
  FORMAT_PLUGIN_LIMITS,
  FORMAT_RESULT_OPERATIONS,
  type FormatInput,
  type FormatResult,
  type FormatResultOperationName,
} from './formatPlugin';
import { isRecord } from './isRecord';
import { parseRef } from './itemRef';
import { parseAnyRef } from './refGrammar';

// Checking what a format plugin returned (stage #1923, decisions 9, 14 and 16): the shape, the
// operations of the allowed subset and their keys, the local aliases, the references (they must
// exist in the input or be an alias created earlier in the same result) and the limits. Pure; no
// browser APIs. What the batch checks later (types, values, geometry, the model's rules) is not
// repeated here: the checked operations go through the usual batch.

export type FormatResultProblemCode = 'plugin-output-invalid' | 'plugin-limit';

/** One problem; `path` is inside the result (`operations[3].op`). */
export interface FormatResultProblem {
  readonly code: FormatResultProblemCode;
  readonly path: string;
  readonly message: string;
}

export type FormatResultCheck =
  | { readonly ok: true; readonly result: FormatResult }
  | { readonly ok: false; readonly problems: readonly FormatResultProblem[] };

/** `operations[3].op: not allowed in a plugin result: delete_marking`. */
export function formatResultProblemText(problem: FormatResultProblem): string {
  return `${problem.path}: ${problem.message}`;
}

/** Problems reported at most; the rest repeats the same mistake. */
const MAX_PROBLEMS = 100;
/** Depth of the `values` scan: a result that comes from JSON is never deeper in practice. */
const MAX_VALUES_DEPTH = 32;
const ALIAS = /^\$[A-Za-z0-9_-]+$/;
const NOT_ALLOWED = 'not allowed in a plugin result';

/** `m` marking or arrow, `i` container, `a` annotation, `r` a table row (`_as`). */
type Kind = 'm' | 'i' | 'a' | 'r';

const KIND_NAME: Record<Kind, string> = {
  m: 'marking',
  i: 'container',
  a: 'annotation',
  r: 'row',
};

/** The keys that must be there (`undefined` is missing; `null` counts as given). */
const REQUIRED: Readonly<Record<FormatResultOperationName, readonly string[]>> = {
  add_container: ['width', 'height', 'background'],
  create_marking: [],
  update_marking: ['marking'],
  create_annotation: ['marking'],
  update_annotation: ['annotation'],
  create_arrow: ['from', 'to'],
};

interface CiteRule {
  readonly key: string;
  readonly kinds: readonly Kind[];
  /** `null` is allowed: the key clears the link. */
  readonly nullable?: boolean;
}

/** The keys that cite an item, by operation. */
const CITES: Readonly<Record<FormatResultOperationName, readonly CiteRule[]>> = {
  add_container: [{ key: 'beside', kinds: ['i'] }],
  create_marking: [
    { key: 'container', kinds: ['i'] },
    { key: 'near', kinds: ['i', 'm'] },
    { key: 'inside', kinds: ['m'] },
  ],
  update_marking: [
    { key: 'marking', kinds: ['m'] },
    { key: 'container', kinds: ['i'], nullable: true },
  ],
  create_annotation: [
    { key: 'marking', kinds: ['m'] },
    { key: 'owner', kinds: ['a'], nullable: true },
  ],
  update_annotation: [
    { key: 'annotation', kinds: ['a'] },
    { key: 'owner', kinds: ['a'], nullable: true },
  ],
  create_arrow: [
    { key: 'from', kinds: ['m'] },
    { key: 'to', kinds: ['m'] },
  ],
};

/** What an operation's `as` names. */
const ALIAS_KIND: Readonly<Partial<Record<FormatResultOperationName, Kind>>> = {
  add_container: 'i',
  create_marking: 'm',
  create_annotation: 'a',
  create_arrow: 'm',
};

const CREATE_MARKING_ANNOTATION_KEYS = new Set(['type', 'layer', 'name', 'values']);
const REF_OBJECT_KEYS = new Set(['annotation', 'entry', 'key', 'row']);

/**
 * The codes of the items the projection names without listing them: the end of an arrow, the
 * anchor target, the owner or a `ref` value may point at an item that holds no annotation of the
 * format, so it is not in `markings` (it is still a reference the plugin was handed).
 */
function mentionedCodes(input: FormatInput): Record<'m' | 'i' | 'a', Set<string>> {
  const found = { m: new Set<string>(), i: new Set<string>(), a: new Set<string>() };
  const note = (text: string): void => {
    if (!text.startsWith('mapping://')) return;
    const ref = parseAnyRef(text)?.ref;
    if (ref === undefined) return;
    if (ref.type !== 'item') found.a.add(ref.annotation);
    else if (ref.kind === 'm' || ref.kind === 'i' || ref.kind === 'a') {
      found[ref.kind].add(ref.code);
    }
  };
  const visit = (value: unknown, depth: number): void => {
    if (depth > MAX_VALUES_DEPTH) return;
    if (typeof value === 'string') note(value);
    else if (Array.isArray(value)) value.forEach((v) => visit(v, depth + 1));
    else if (isRecord(value)) Object.values(value).forEach((v) => visit(v, depth + 1));
  };
  visit([input.markings, input.annotations, input.arrows], 0);
  return found;
}

/** What the check knows: the input's items by kind, the aliases created so far and the problems. */
class Checker {
  readonly problems: FormatResultProblem[] = [];
  private readonly aliases = new Map<string, Kind>();
  private readonly codes: Readonly<Record<Kind, ReadonlySet<string>>>;
  private readonly project: string;

  constructor(readonly input: FormatInput) {
    this.project = input.project.name;
    const mentioned = mentionedCodes(input);
    this.codes = {
      m: new Set([...input.markings, ...input.arrows].map((x) => x.code)),
      i: new Set(input.containers.map((x) => x.code)),
      a: new Set(input.annotations.map((x) => x.code)),
      r: new Set(),
    };
    for (const kind of ['m', 'i', 'a'] as const) {
      mentioned[kind].forEach((code) => (this.codes[kind] as Set<string>).add(code));
    }
  }

  add(
    path: string,
    message: string,
    code: FormatResultProblemCode = 'plugin-output-invalid',
  ) {
    if (this.problems.length < MAX_PROBLEMS) this.problems.push({ code, path, message });
  }

  /** Creates an alias; a bad name or a repeated one is a problem. */
  define(path: string, alias: unknown, kind: Kind): void {
    if (typeof alias !== 'string' || !ALIAS.test(alias)) {
      return this.add(
        path,
        'an alias starts with "$" and has letters, numbers, "_" or "-"',
      );
    }
    if (this.aliases.has(alias)) {
      return this.add(path, `the alias ${alias} was already created`);
    }
    this.aliases.set(alias, kind);
  }

  /** Is `text` an alias created earlier, of one of the `kinds`? A problem otherwise. */
  private checkAlias(path: string, text: string, kinds: readonly Kind[]): void {
    const kind = this.aliases.get(text);
    if (kind === undefined) {
      return this.add(path, `the alias ${text} is not created before this operation`);
    }
    if (!kinds.includes(kind)) {
      this.add(path, `the alias ${text} is a ${KIND_NAME[kind]}, ${expected(kinds)}`);
    }
  }

  /** A reference, a code or an alias that must name an item of one of the `kinds`. */
  cite(path: string, value: unknown, rule: Pick<CiteRule, 'kinds' | 'nullable'>): void {
    if (value === null && rule.nullable) return;
    if (typeof value !== 'string') {
      return this.add(path, 'must be a reference, a code or an alias');
    }
    if (value.startsWith('$')) return this.checkAlias(path, value, rule.kinds);
    this.checkReference(path, value, rule.kinds);
  }

  /** A reference or a code: of the right kind and in the input. */
  private checkReference(path: string, value: string, kinds: readonly Kind[]): void {
    const parsed = parseRef(value);
    if (parsed === null) return this.add(path, `not a reference or a code: ${value}`);
    if (parsed.kind !== null && !kinds.includes(parsed.kind)) {
      return this.add(path, `${KIND_NAME[parsed.kind]} reference, ${expected(kinds)}`);
    }
    const searched = parsed.kind === null ? kinds : [parsed.kind];
    const known = searched.some((k) => this.codes[k].has(parsed.code));
    const sameProject = parsed.project === null || parsed.project === this.project;
    if (!known || !sameProject) {
      this.add(path, `not in the input and not an alias created earlier: ${value}`);
    }
  }
}

function expected(kinds: readonly Kind[]): string {
  return `expected ${kinds.map((k) => KIND_NAME[k]).join(' or ')}`;
}

// ------------------------------------------------------------------------------ one operation

function checkKeys(
  raw: { readonly [key: string]: unknown },
  allowed: readonly string[],
  path: string,
  check: Checker,
): void {
  for (const key of Object.keys(raw)) {
    if (key !== 'op' && !allowed.includes(key)) check.add(`${path}.${key}`, NOT_ALLOWED);
  }
}

function checkRequired(
  op: FormatResultOperationName,
  raw: { readonly [key: string]: unknown },
  path: string,
  check: Checker,
): void {
  for (const key of REQUIRED[op]) {
    if (raw[key] === undefined) check.add(`${path}.${key}`, 'required');
  }
}

/** Walks `values` calling `visit` with each object and its path (arrays and objects only). */
function walkValues(
  value: unknown,
  path: string,
  visit: (object: { readonly [key: string]: unknown }, path: string) => void,
  depth = 0,
): void {
  if (depth > MAX_VALUES_DEPTH) return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => walkValues(item, `${path}[${i}]`, visit, depth + 1));
  } else if (isRecord(value)) {
    visit(value, path);
    for (const [key, item] of Object.entries(value)) {
      walkValues(item, `${path}.${key}`, visit, depth + 1);
    }
  }
}

/**
 * The aliases a `values` object cites: `{ annotation: "$a" }` and `row: "$r"` in a reference shape.
 * Only an alias is checked here (the other references are the batch's): a text column named
 * `annotation` is not a reference.
 */
function checkValuesCites(values: unknown, path: string, check: Checker): void {
  walkValues(values, path, (object, at) => {
    const isRef =
      'annotation' in object && Object.keys(object).every((k) => REF_OBJECT_KEYS.has(k));
    if (!isRef) return;
    for (const [key, kind] of [['annotation', 'a'] as const, ['row', 'r'] as const]) {
      const cited = object[key];
      if (typeof cited === 'string' && cited.startsWith('$')) {
        check.cite(`${at}.${key}`, cited, { kinds: [kind] });
      }
    }
  });
}

/** The aliases a `values` object creates: the `_as` of its rows. */
function defineValuesAliases(values: unknown, path: string, check: Checker): void {
  walkValues(values, path, (object, at) => {
    if ('_as' in object) check.define(`${at}._as`, object._as, 'r');
  });
}

function anchorTarget(raw: { readonly [key: string]: unknown }): unknown {
  return isRecord(raw.anchor) ? raw.anchor.to : undefined;
}

function checkCites(
  op: FormatResultOperationName,
  raw: { readonly [key: string]: unknown },
  path: string,
  check: Checker,
): void {
  for (const rule of CITES[op]) {
    if (raw[rule.key] !== undefined)
      check.cite(`${path}.${rule.key}`, raw[rule.key], rule);
  }
  if (anchorTarget(raw) !== undefined) {
    check.cite(`${path}.anchor.to`, anchorTarget(raw), { kinds: ['m'] });
  }
  checkValuesCites(raw.values, `${path}.values`, check);
  if (isRecord(raw.annotation)) {
    checkValuesCites(raw.annotation.values, `${path}.annotation.values`, check);
  }
}

/** The type the `annotation` of a `create_marking` names, in the format's specialization. */
function typeHasComponent(input: FormatInput, name: string): boolean | null {
  const spec = input.specialization;
  const id = name.startsWith(`${spec.id}/`) ? name.slice(spec.id.length + 1) : name;
  if (id.includes('/')) return null;
  for (const layer of spec.layers) {
    const type = layer.annotationTypes.find((t) => t.id === id || t.name === id);
    if (type) return type.component !== undefined;
  }
  return null;
}

/** The `annotation` that `create_marking` creates with the marking has its own few keys. */
function checkAnnotationKeys(
  raw: { readonly [key: string]: unknown },
  path: string,
  check: Checker,
): void {
  if (!isRecord(raw.annotation)) return;
  for (const key of Object.keys(raw.annotation)) {
    if (!CREATE_MARKING_ANNOTATION_KEYS.has(key)) {
      check.add(`${path}.annotation.${key}`, NOT_ALLOWED);
    }
  }
}

/**
 * A marking without `rect` exists only for a type with a component (the MCP rule today): for a
 * type without one the plugin computes the rectangle. A type of another specialization is left to
 * the batch.
 */
function checkRect(
  raw: { readonly [key: string]: unknown },
  path: string,
  check: Checker,
): void {
  if (raw.rect !== undefined) return;
  const annotation = isRecord(raw.annotation) ? raw.annotation : null;
  if (annotation === null) {
    return check.add(
      `${path}.rect`,
      'required: without an annotation there is no component',
    );
  }
  const type = annotation.type;
  const component = typeof type === 'string' ? typeHasComponent(check.input, type) : null;
  if (component === false) {
    check.add(`${path}.rect`, `required: the type ${String(type)} has no component`);
  }
}

function defineAliases(
  op: FormatResultOperationName,
  raw: { readonly [key: string]: unknown },
  path: string,
  check: Checker,
): void {
  const kind = ALIAS_KIND[op];
  if (raw.as !== undefined) check.define(`${path}.as`, raw.as, kind ?? 'm');
  if (raw.annotationAs !== undefined)
    check.define(`${path}.annotationAs`, raw.annotationAs, 'a');
}

/** The row aliases (`_as`) of the operation's `values`: a later row of the same table may cite them. */
function defineRowAliases(
  raw: { readonly [key: string]: unknown },
  path: string,
  check: Checker,
): void {
  defineValuesAliases(raw.values, `${path}.values`, check);
  if (isRecord(raw.annotation)) {
    defineValuesAliases(raw.annotation.values, `${path}.annotation.values`, check);
  }
}

function isAllowedOperation(op: unknown): op is FormatResultOperationName {
  return (FORMAT_RESULT_OPERATIONS as readonly unknown[]).includes(op);
}

function checkOperation(raw: unknown, index: number, check: Checker): void {
  const path = `operations[${index}]`;
  if (!isRecord(raw)) return check.add(path, 'must be an object');
  const op = raw.op;
  if (typeof op !== 'string')
    return check.add(`${path}.op`, 'required: the operation name');
  if (!isAllowedOperation(op)) return check.add(`${path}.op`, `${NOT_ALLOWED}: ${op}`);
  checkKeys(raw, FORMAT_OPERATION_KEYS[op], path, check);
  checkRequired(op, raw, path, check);
  defineRowAliases(raw, path, check);
  checkCites(op, raw, path, check);
  if (op === 'create_marking') {
    checkAnnotationKeys(raw, path, check);
    checkRect(raw, path, check);
  }
  defineAliases(op, raw, path, check);
}

// --------------------------------------------------------------------------------- the result

/** Cuts each warning at the limit and the list at the limit, with a warning that says it was cut. */
function normalizeWarnings(warnings: readonly string[]): string[] {
  const { warnings: max, warningChars } = FORMAT_PLUGIN_LIMITS;
  const cut = warnings.map((w) => w.slice(0, warningChars));
  if (cut.length <= max) return cut;
  const kept = cut.slice(0, max - 1);
  const dropped = cut.length - kept.length;
  return [...kept, `${dropped} more warnings were cut (the limit is ${max})`];
}

/** The warnings of the result, cut at the limits; `null` when there are none or they are invalid. */
function checkWarnings(raw: unknown, check: Checker): string[] | null {
  if (raw === undefined) return null;
  if (!Array.isArray(raw)) {
    check.add('warnings', 'must be a list of texts');
    return null;
  }
  raw.forEach((item, i) => {
    if (typeof item !== 'string') check.add(`warnings[${i}]`, 'must be a text');
  });
  return raw.every((item) => typeof item === 'string')
    ? normalizeWarnings(raw as string[])
    : null;
}

function isThenable(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function invalid(path: string, message: string): FormatResultCheck {
  return { ok: false, problems: [{ code: 'plugin-output-invalid', path, message }] };
}

function limitProblem(count: number): FormatResultCheck {
  const max = FORMAT_PLUGIN_LIMITS.operations;
  const message = `more than ${max} operations (${count})`;
  return { ok: false, problems: [{ code: 'plugin-limit', path: 'operations', message }] };
}

/** The `operations` list: its shape, then each operation. */
function checkOperations(operations: unknown, check: Checker): void {
  if (operations === undefined) return check.add('operations', 'required');
  if (!Array.isArray(operations)) return check.add('operations', 'must be a list');
  operations.forEach((op, index) => checkOperation(op, index, check));
}

/**
 * Checks the value `parse` returned against the contract. `input` is the projection the plugin
 * received: the references the result cites must be in it (or be an alias created earlier in the
 * result), and the specialization says which types have a component. A problem's `path` is
 * inside the result. Above `FORMAT_PLUGIN_LIMITS.operations` operations the problem is
 * `plugin-limit`; more warnings than the limit are cut, with one warning saying so.
 */
export function checkFormatResult(raw: unknown, input: FormatInput): FormatResultCheck {
  if (isThenable(raw)) {
    return invalid('result', 'a plugin is synchronous: it returned a Promise');
  }
  if (!isRecord(raw)) return invalid('result', 'must be an object with `operations`');
  const { operations } = raw;
  if (Array.isArray(operations) && operations.length > FORMAT_PLUGIN_LIMITS.operations) {
    return limitProblem(operations.length);
  }
  const check = new Checker(input);
  for (const key of Object.keys(raw)) {
    if (key !== 'operations' && key !== 'warnings') check.add(key, NOT_ALLOWED);
  }
  checkOperations(operations, check);
  const warnings = checkWarnings(raw.warnings, check);
  if (check.problems.length > 0) return { ok: false, problems: check.problems };
  return {
    ok: true,
    result: {
      operations: operations as FormatResult['operations'],
      ...(warnings === null ? {} : { warnings }),
    },
  };
}
