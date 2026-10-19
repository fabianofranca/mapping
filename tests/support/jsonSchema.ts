/**
 * Verificador mínimo de JSON Schema para os testes (sem dependência). Entende só o subconjunto
 * usado em `docs/*.schema.json`: type (inclusive lista), enum, const, required, properties,
 * additionalProperties, items, prefixItems, $ref/$defs, oneOf, anyOf, pattern, minimum, maximum,
 * exclusiveMinimum, minLength, minItems, maxItems. Palavra desconhecida falha (não é ignorada).
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

/** Devolve os problemas de `value` contra `schema` (lista vazia = aceito), cada um `"caminho: texto"`. */
export function checkSchema(root: Rec, value: unknown, at = '$'): string[] {
  return walk(root, root, value, at);
}

function walk(root: Rec, schema: unknown, value: unknown, at: string): string[] {
  if (schema === true) return [];
  if (schema === false) return [`${at}: não permitido`];
  if (!isRec(schema)) return [`${at}: schema inválido`];
  for (const key of Object.keys(schema)) {
    if (!KNOWN.has(key)) return [`${at}: palavra do schema não suportada: ${key}`];
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
      return [`${at}: esperava ${types.join('|')}, veio ${typeOf(value)}`];
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => same(e, value)))
    out.push(`${at}: fora de enum`);
  if ('const' in schema && !same(schema.const, value)) out.push(`${at}: fora de const`);
  if (Array.isArray(schema.anyOf)) {
    if (!schema.anyOf.some((s) => walk(root, s, value, at).length === 0))
      out.push(`${at}: nenhuma alternativa de anyOf aceita`);
  }
  if (Array.isArray(schema.oneOf)) {
    const n = schema.oneOf.filter((s) => walk(root, s, value, at).length === 0).length;
    if (n !== 1) out.push(`${at}: oneOf aceito por ${n} alternativas`);
  }
  if (typeof value === 'string') {
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value))
      out.push(`${at}: fora do padrão ${schema.pattern}`);
    if (typeof schema.minLength === 'number' && value.length < schema.minLength)
      out.push(`${at}: texto curto demais`);
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum)
      out.push(`${at}: menor que ${schema.minimum}`);
    if (typeof schema.maximum === 'number' && value > schema.maximum)
      out.push(`${at}: maior que ${schema.maximum}`);
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum)
      out.push(`${at}: não maior que ${schema.exclusiveMinimum}`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems)
      out.push(`${at}: poucos itens`);
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems)
      out.push(`${at}: itens demais`);
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
        if (!(String(key) in value)) out.push(`${at}.${String(key)}: obrigatório`);
    for (const [key, item] of Object.entries(value)) {
      const path = `${at}.${key}`;
      if (key in props) out.push(...walk(root, props[key], item, path));
      else if (schema.additionalProperties === false)
        out.push(`${path}: chave desconhecida`);
      else if (schema.additionalProperties !== undefined)
        out.push(...walk(root, schema.additionalProperties, item, path));
    }
  }
  return out;
}
