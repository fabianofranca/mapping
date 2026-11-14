/**
 * Minimal JSON Schema checker for the tests (no dependency). Understands only the subset
 * used in `docs/*.schema.json`: type (including list), enum, const, required, properties,
 * additionalProperties, items, prefixItems, $ref/$defs, oneOf, anyOf, pattern, minimum, maximum,
 * exclusiveMinimum, minLength, minItems, maxItems, propertyNames (`pattern` only). An unknown keyword fails (it is not ignored).
 */
type Rec = Record<string, unknown>;

const KNOWN = new Set([
  '$schema',
  '$id',
  '$defs',
  '$ref',
  'title',
  'description',
  'type',
  'enum',
  'const',
  'required',
  'properties',
  'additionalProperties',
  'items',
  'prefixItems',
  'oneOf',
  'anyOf',
  'pattern',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'minLength',
  'minItems',
  'maxItems',
  'propertyNames',
]);

function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function matchesType(v: unknown, t: string): boolean {
  const actual = typeOf(v);
  return actual === t || (t === 'number' && actual === 'integer');
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Returns the problems of `value` against `schema` (empty list = accepted), each one `"path: text"`. */
export function checkSchema(root: Rec, value: unknown, at = '$'): string[] {
  return walk(root, root, value, at);
}

function walk(root: Rec, schema: unknown, value: unknown, at: string): string[] {
  if (schema === true) return [];
  if (schema === false) return [`${at}: not allowed`];
  if (!isRec(schema)) return [`${at}: invalid schema`];
  for (const key of Object.keys(schema)) {
    if (!KNOWN.has(key)) return [`${at}: unsupported schema keyword: ${key}`];
  }
  if (typeof schema.$ref === 'string') {
    const name = schema.$ref.replace(/^#\/\$defs\//, '');
    const defs = isRec(root.$defs) ? root.$defs : {};
    return name in defs
      ? walk(root, defs[name], value, at)
      : [`${at}: $ref desconhecido: ${schema.$ref}`];
  }
  const out: string[] = [];
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, String(t))))
      return [`${at}: expected ${types.join('|')}, got ${typeOf(value)}`];
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => same(e, value)))
    out.push(`${at}: not in enum`);
  if ('const' in schema && !same(schema.const, value)) out.push(`${at}: not equal to const`);
  if (Array.isArray(schema.anyOf)) {
    if (!schema.anyOf.some((s) => walk(root, s, value, at).length === 0))
      out.push(`${at}: no anyOf alternative accepts it`);
  }
  if (Array.isArray(schema.oneOf)) {
    const n = schema.oneOf.filter((s) => walk(root, s, value, at).length === 0).length;
    if (n !== 1) out.push(`${at}: oneOf accepted by ${n} alternatives`);
  }
  if (typeof value === 'string') {
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value))
      out.push(`${at}: outside the pattern ${schema.pattern}`);
    if (typeof schema.minLength === 'number' && value.length < schema.minLength)
      out.push(`${at}: text too short`);
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum)
      out.push(`${at}: less than ${schema.minimum}`);
    if (typeof schema.maximum === 'number' && value > schema.maximum)
      out.push(`${at}: greater than ${schema.maximum}`);
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum)
      out.push(`${at}: not greater than ${schema.exclusiveMinimum}`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems)
      out.push(`${at}: too few items`);
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems)
      out.push(`${at}: too many items`);
    const prefix = Array.isArray(schema.prefixItems) ? schema.prefixItems : [];
    value.forEach((item, i) => {
      const s = i < prefix.length ? prefix[i] : schema.items;
      if (s !== undefined) out.push(...walk(root, s, item, `${at}[${i}]`));
    });
  }
  if (isRec(value)) {
    const props = isRec(schema.properties) ? schema.properties : {};
    if (Array.isArray(schema.required))
      for (const key of schema.required)
        if (!(String(key) in value)) out.push(`${at}.${String(key)}: required`);
    const names = isRec(schema.propertyNames) ? schema.propertyNames.pattern : undefined;
    for (const [key, item] of Object.entries(value)) {
      const path = `${at}.${key}`;
      if (typeof names === 'string' && !new RegExp(names).test(key))
        out.push(`${path}: name outside the pattern ${names}`);
      if (key in props) out.push(...walk(root, props[key], item, path));
      else if (schema.additionalProperties === false)
        out.push(`${path}: unknown key`);
      else if (schema.additionalProperties !== undefined)
        out.push(...walk(root, schema.additionalProperties, item, path));
    }
  }
  return out;
}
