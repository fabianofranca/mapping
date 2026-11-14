import {
  SIGNATURE_FORMAT,
  SIGNATURE_FORMAT_VERSION,
  SIGNATURE_ROLES,
  SIGNATURE_VALUE_KINDS,
  type Signature,
} from './types';

// `parseSignature`: validates the JSON of a `mapping-signature` sheet (strict) and returns the
// sheet or the list of problems, each with its path (`params[3].factory.params[0].factory`).
// Pure, no browser: the importer, the MCP server and the extractor use this same function.

export interface SignatureIssue {
  /** `params[3].role`; empty for the root. */
  readonly path: string;
  readonly message: string;
}

export type SignatureParseResult =
  | { readonly ok: true; readonly signature: Signature }
  | { readonly ok: false; readonly issues: readonly SignatureIssue[] };

type Json = Record<string, unknown>;

const isRecord = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const quoted = (keys: readonly string[]): string => keys.map((k) => `"${k}"`).join(', ');
const oneOf = (values: readonly string[]): string =>
  `use ${values.map((v) => `"${v}"`).join(', ')}`;

/** Is `value` one of the `set`? */
const oneOfSet = (value: unknown, set: readonly string[]): boolean =>
  typeof value === 'string' && set.includes(value);

const EXTRACTOR_RE = /^(agent|mapping-signature\/[a-z0-9-]+@[0-9]+)$/;

class Collector {
  readonly issues: SignatureIssue[] = [];

  add(path: string, message: string): void {
    this.issues.push({ path, message });
  }

  /** Strict object: only the allowed keys. Returns `false` if it is not an object. */
  object(value: unknown, path: string, allowed: readonly string[]): value is Json {
    if (!isRecord(value)) {
      this.add(path, 'must be an object');
      return false;
    }
    const extra = Object.keys(value).filter((k) => !allowed.includes(k));
    if (extra.length > 0) this.add(path, `unknown property: ${quoted(extra)}`);
    return true;
  }

  text(obj: Json, key: string, path: string, required = true): void {
    const value = obj[key];
    const at = path === '' ? key : `${path}.${key}`;
    if (value === undefined) {
      if (required) this.add(at, 'required');
    } else if (typeof value !== 'string') this.add(at, 'must be text');
    else if (value === '') this.add(at, 'cannot be empty');
  }

  literal(obj: Json, key: string, path: string): void {
    const value = obj[key];
    if (value === undefined) return;
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      this.add(`${path}.${key}`, 'must be text, a number or true/false');
    }
  }
}

function checkOptions(options: unknown, kind: unknown, path: string, c: Collector): void {
  if (options === undefined) {
    if (kind === 'enum') c.add(`${path}.options`, 'required for enum');
    return;
  }
  const valid =
    Array.isArray(options) && options.every((o) => typeof o === 'string' && o !== '');
  if (!valid) c.add(`${path}.options`, 'must be a list of non-empty texts');
  else if (kind !== 'enum') c.add(`${path}.options`, 'only allowed for enum');
}

function checkValue(value: unknown, path: string, c: Collector): void {
  if (!c.object(value, path, ['kind', 'default', 'options'])) return;
  const kind = value.kind;
  if (kind === undefined) c.add(`${path}.kind`, 'required');
  else if (!oneOfSet(kind, SIGNATURE_VALUE_KINDS)) {
    c.add(`${path}.kind`, `"${String(kind)}" is invalid; ${oneOf(SIGNATURE_VALUE_KINDS)}`);
  }
  c.literal(value, 'default', path);
  checkOptions(value.options, kind, path, c);
}

const PARAM_KEYS = [
  'name',
  'label',
  'id',
  'role',
  'type',
  'default',
  'required',
  'value',
  'factory',
] as const;

function checkParamRole(role: unknown, path: string, c: Collector): void {
  if (role === undefined) c.add(`${path}.role`, 'required');
  else if (!oneOfSet(role, SIGNATURE_ROLES)) {
    c.add(`${path}.role`, `"${String(role)}" is invalid; ${oneOf(SIGNATURE_ROLES)}`);
  }
}

function checkParamFlags(value: Json, path: string, c: Collector): void {
  if (value.default !== undefined && typeof value.default !== 'string') {
    c.add(`${path}.default`, 'must be text');
  }
  if (value.required !== undefined && typeof value.required !== 'boolean') {
    c.add(`${path}.required`, 'must be true or false');
  }
}

function checkParam(value: unknown, path: string, nested: boolean, c: Collector): void {
  if (!c.object(value, path, PARAM_KEYS)) return;
  c.text(value, 'name', path);
  c.text(value, 'label', path, false);
  c.text(value, 'id', path, false);
  c.text(value, 'type', path);
  checkParamFlags(value, path, c);
  checkParamRole(value.role, path, c);
  if (value.value !== undefined) {
    if (value.role !== undefined && value.role !== 'value') {
      c.add(`${path}.value`, 'only allowed with role "value"');
    } else checkValue(value.value, `${path}.value`, c);
  }
  if (value.factory === undefined) return;
  if (nested) c.add(`${path}.factory`, 'a factory cannot have a factory: one level only');
  else checkFactory(value.factory, `${path}.factory`, c);
}

function checkParams(list: unknown, path: string, nested: boolean, c: Collector): void {
  if (!Array.isArray(list)) return c.add(path, 'must be a list');
  const seen = new Set<string>();
  list.forEach((param: unknown, i) => {
    const at = `${path}[${i}]`;
    checkParam(param, at, nested, c);
    const name = isRecord(param) ? param.name : undefined;
    if (typeof name !== 'string' || name === '') return;
    if (seen.has(name)) c.add(`${at}.name`, `parameter "${name}" is repeated`);
    seen.add(name);
  });
}

function checkFactory(value: unknown, path: string, c: Collector): void {
  if (!c.object(value, path, ['call', 'params'])) return;
  c.text(value, 'call', path);
  if (value.params === undefined) c.add(`${path}.params`, 'required');
  else checkParams(value.params, `${path}.params`, true, c);
}

function checkCodeSource(value: Json, c: Collector): void {
  c.object(value, 'source', [
    'kind',
    'extractor',
    'platform',
    'language',
    'symbol',
    'path',
    'ref',
    'overload',
    'init',
  ]);
  for (const key of ['platform', 'language', 'symbol', 'path'])
    c.text(value, key, 'source');
  c.text(value, 'ref', 'source', false);
  for (const key of ['overload', 'init']) {
    const n = value[key];
    if (n !== undefined && (typeof n !== 'number' || !Number.isInteger(n) || n < 0)) {
      c.add(`source.${key}`, 'must be an integer from 0 up');
    }
  }
}

function checkExtractor(extractor: unknown, c: Collector): void {
  if (extractor === undefined) c.add('source.extractor', 'required');
  else if (typeof extractor !== 'string' || !EXTRACTOR_RE.test(extractor)) {
    c.add(
      'source.extractor',
      'invalid; use "mapping-signature/<reader>@<version>" or "agent"',
    );
  }
}

function checkSource(value: unknown, c: Collector): void {
  if (!isRecord(value)) return c.add('source', 'must be an object');
  if (value.kind === 'code') checkCodeSource(value, c);
  else if (value.kind === 'design') {
    c.object(value, 'source', ['kind', 'extractor', 'system', 'id', 'name']);
    for (const key of ['system', 'id', 'name']) c.text(value, key, 'source');
  } else {
    const kind = value.kind;
    return c.add(
      'source.kind',
      kind === undefined
        ? 'required'
        : `"${String(kind)}" is invalid; use "code" or "design"`,
    );
  }
  checkExtractor(value.extractor, c);
}

function checkDoc(value: unknown, c: Collector): void {
  if (!isRecord(value)) return c.add('doc', 'must be an object');
  for (const [name, text] of Object.entries(value)) {
    if (typeof text !== 'string') c.add(`doc.${name}`, 'must be text');
  }
}

/** Validates an already parsed JSON: the sheet, or the problems with their paths. */
export function parseSignature(data: unknown): SignatureParseResult {
  const c = new Collector();
  if (!c.object(data, '', ['format', 'formatVersion', 'source', 'params', 'doc'])) {
    return { ok: false, issues: c.issues };
  }
  if (data.format !== SIGNATURE_FORMAT) {
    c.add('format', `must be "${SIGNATURE_FORMAT}"`);
  }
  if (data.formatVersion !== SIGNATURE_FORMAT_VERSION) {
    c.add('formatVersion', `must be ${SIGNATURE_FORMAT_VERSION}`);
  }
  if (data.source === undefined) c.add('source', 'required');
  else checkSource(data.source, c);
  if (data.params === undefined) c.add('params', 'required');
  else checkParams(data.params, 'params', false, c);
  if (data.doc !== undefined) checkDoc(data.doc, c);
  if (c.issues.length > 0) return { ok: false, issues: c.issues };
  return { ok: true, signature: data as unknown as Signature };
}

/** Reads the JSON text of a sheet file. */
export function parseSignatureText(text: string): SignatureParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, issues: [{ path: '', message: `Invalid JSON: ${message}` }] };
  }
  return parseSignature(data);
}
