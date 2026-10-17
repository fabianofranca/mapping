/**
 * Laboratório "Componentes": declaração de origem executável (fase L2). A especialização diz
 * como ler um JSON externo (SDUI de um backend, por exemplo) e transformá-lo numa tela:
 *
 * - `origins` (raiz da especialização): onde ficam a largura, a altura e as raízes da tela, e
 *   quais chaves do nó são o tipo, as props e os filhos;
 * - `sources` nos tipos e nos campos (o mesmo formato da `formatVersion` 3, com `slot` e
 *   `ignore` a mais): a que tipo externo cada tipo corresponde e de que caminho de `props` vem
 *   cada campo.
 *
 * O núcleo não conhece nenhum sistema: `system` é só um nome. `translateSource` produz a árvore
 * sem geometria (`LayoutScreen`); `screenFromSource` a arruma (`layoutScreen`) numa `Screen`.
 * Puro, sem DOM, e nunca lança: o que não deu certo vira `error` ou aviso.
 */
import type { FieldValue, FieldValues } from './componentFormat';
import type { TextMeasurer } from './instantiate';
import {
  SCREEN_ANCHORS,
  layoutScreen,
  type LayoutNode,
  type LayoutRoot,
  type LayoutScreen,
  type ScreenAnchor,
} from './layout';
import type { FieldDef, Library, TypeDef } from './library';
import type { Screen } from './screen';

// ---------------------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------------------

export type Literal = string | number;

/** Um literal, ou um caminho (com tradução de valores e valor padrão). */
export type ValueSource =
  | Literal
  | {
      readonly path: string;
      /** Valor de origem (texto) → valor traduzido. */
      readonly values?: Readonly<Record<string, string>>;
      readonly default?: Literal;
    };

export interface RootSource {
  /** Caminho da raiz no documento; `[*]` = cada elemento da lista vira uma raiz. */
  readonly path: string;
  /** Âncora na tela (caminho relativo ao nó da raiz); ausente = no fluxo. */
  readonly anchor?: ValueSource;
  /** Margem das bordas da âncora, em px (caminho relativo ao nó da raiz). */
  readonly margin?: ValueSource;
  /** Id do tipo desenhado por baixo da raiz, cobrindo a tela (película de modal). */
  readonly scrim?: string;
}

export interface ScreenSource {
  readonly id?: ValueSource;
  readonly name?: ValueSource;
  readonly width: ValueSource;
  readonly height: ValueSource;
  readonly background?: ValueSource;
  readonly roots: readonly RootSource[];
}

export interface Origin {
  readonly system: string;
  readonly name?: string;
  /** Chaves do nó no documento. */
  readonly node: {
    readonly type: string;
    readonly props: string;
    readonly children: string;
  };
  readonly screen: ScreenSource;
  /** Tradução de um booleano JSON para texto, nos campos sem `values` próprio. */
  readonly booleans?: { readonly true: string; readonly false: string };
}

/** `sources` de um tipo de anotação (formato v3 + `slot` e `ignore`). */
export interface TypeSource {
  readonly system: string;
  readonly id?: string;
  readonly name?: string;
  /** Nome do nó `slot` do template que recebe os filhos (ausente = o slot do componente). */
  readonly slot?: string;
  /** Props aceitas e não desenhadas (sem aviso de propriedade desconhecida). */
  readonly ignore?: readonly string[];
}

/** `sources` de um campo: `name` é o caminho dentro de `props` numa origem executável. */
export interface FieldSource {
  readonly system: string;
  readonly name: string;
  readonly values?: Readonly<Record<string, string>>;
}

export interface TranslateResult {
  readonly layout?: LayoutScreen;
  readonly warnings: string[];
  readonly error?: string;
}

export interface SourceResult {
  readonly screen?: Screen;
  readonly warnings: readonly string[];
  readonly error?: string;
}

export interface SourceOptions {
  /** Sistema da origem; ausente = a primeira origem da especialização. */
  readonly system?: string;
}

// ---------------------------------------------------------------------------------------
// Caminhos: `a.b[0].c`
// ---------------------------------------------------------------------------------------

/** Chave (texto), índice (número) ou `[*]` (`null`). */
export type PathSegment = string | number | null;

export type ParsedPath =
  | { readonly ok: true; readonly segments: readonly PathSegment[] }
  | { readonly ok: false; readonly error: string };

export function parsePath(text: string): ParsedPath {
  const segments: PathSegment[] = [];
  let i = 0;
  const readKey = (): string | undefined => {
    const start = i;
    while (i < text.length && text[i] !== '.' && text[i] !== '[' && text[i] !== ']') i++;
    return i > start ? text.slice(start, i) : undefined;
  };
  const first = readKey();
  if (first === undefined) return { ok: false, error: 'segmento vazio' };
  segments.push(first);
  while (i < text.length) {
    const ch = text[i];
    if (ch === '.') {
      i++;
      const key = readKey();
      if (key === undefined) return { ok: false, error: 'segmento vazio' };
      segments.push(key);
    } else if (ch === '[') {
      const close = text.indexOf(']', i);
      if (close < 0) return { ok: false, error: 'faltou "]"' };
      const inner = text.slice(i + 1, close);
      if (inner === '*') segments.push(null);
      else if (/^\d+$/.test(inner)) segments.push(Number(inner));
      else return { ok: false, error: `índice inválido: [${inner}]` };
      i = close + 1;
    } else {
      return { ok: false, error: `caractere inesperado: ${ch ?? ''}` };
    }
  }
  return { ok: true, segments };
}

/** `['a', 'b', 0, 'c']` → `a.b[0].c` (`null` vira `[*]`). */
export function formatPath(segments: readonly PathSegment[]): string {
  let out = '';
  for (const segment of segments) {
    if (typeof segment === 'string') out += out === '' ? segment : `.${segment}`;
    else out += segment === null ? '[*]' : `[${segment}]`;
  }
  return out;
}

export interface ReadResult {
  readonly found: boolean;
  readonly value?: unknown;
}

const NOT_FOUND: ReadResult = { found: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Lê o caminho em `root`. `[*]` e valor `null`/`undefined` contam como não encontrado. */
export function readPath(
  root: unknown,
  path: string | readonly PathSegment[],
): ReadResult {
  let segments: readonly PathSegment[];
  if (typeof path === 'string') {
    const parsed = parsePath(path);
    if (!parsed.ok) return NOT_FOUND;
    segments = parsed.segments;
  } else {
    segments = path;
  }
  let current: unknown = root;
  for (const segment of segments) {
    if (segment === null) return NOT_FOUND;
    if (typeof segment === 'number') {
      if (!Array.isArray(current) || segment >= current.length) return NOT_FOUND;
      current = current[segment];
    } else {
      if (!isRecord(current) || !Object.hasOwn(current, segment)) return NOT_FOUND;
      current = current[segment];
    }
  }
  if (current === null || current === undefined) return NOT_FOUND;
  return { found: true, value: current };
}

/** Expande os `[*]` do caminho: um resultado por elemento, com o caminho concreto. */
function expandPath(
  root: unknown,
  segments: readonly PathSegment[],
): { path: string; value: unknown }[] {
  const out: { path: string; value: unknown }[] = [];
  const visit = (current: unknown, index: number, done: readonly PathSegment[]): void => {
    if (current === null || current === undefined) return;
    if (index === segments.length) {
      out.push({ path: formatPath(done), value: current });
      return;
    }
    const segment = segments[index];
    if (segment === undefined) return;
    if (segment === null) {
      if (Array.isArray(current)) {
        current.forEach((item, i) => visit(item, index + 1, [...done, i]));
      }
    } else if (typeof segment === 'number') {
      if (Array.isArray(current) && segment < current.length) {
        visit(current[segment], index + 1, [...done, segment]);
      }
    } else if (isRecord(current) && Object.hasOwn(current, segment)) {
      visit(current[segment], index + 1, [...done, segment]);
    }
  };
  visit(root, 0, []);
  return out;
}

// ---------------------------------------------------------------------------------------
// Validação (estrita, com caminho)
// ---------------------------------------------------------------------------------------

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function checkKeys(
  raw: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  problems: string[],
): void {
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key))
      problems.push(`${path}.${key}: chave desconhecida: ${key}`);
  }
}

/** Confere um caminho; `wildcard` libera `[*]` (só em `roots[].path`). */
function checkPath(
  value: unknown,
  path: string,
  problems: string[],
  wildcard = false,
): boolean {
  if (!nonEmptyString(value)) {
    problems.push(`${path}: esperava um caminho (texto não vazio)`);
    return false;
  }
  const parsed = parsePath(value);
  if (!parsed.ok) {
    problems.push(`${path}: caminho inválido "${value}" (${parsed.error})`);
    return false;
  }
  if (!wildcard && parsed.segments.includes(null)) {
    problems.push(`${path}: "[*]" só vale em roots[].path`);
    return false;
  }
  return true;
}

function parseStringMap(
  raw: unknown,
  path: string,
  problems: string[],
): Record<string, string> | undefined {
  if (!isRecord(raw)) {
    problems.push(`${path}: esperava um objeto (origem → destino)`);
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [key, target] of Object.entries(raw)) {
    if (typeof target !== 'string') {
      problems.push(`${path}.${key}: esperava texto`);
    } else {
      out[key] = target;
    }
  }
  return out;
}

function parseValueSource(
  raw: unknown,
  path: string,
  problems: string[],
): ValueSource | undefined {
  if (typeof raw === 'string' || (typeof raw === 'number' && Number.isFinite(raw))) {
    return raw;
  }
  if (!isRecord(raw)) {
    problems.push(`${path}: esperava um literal ou { path }`);
    return undefined;
  }
  const before = problems.length;
  checkKeys(raw, ['path', 'values', 'default'], path, problems);
  checkPath(raw.path, `${path}.path`, problems);
  const values =
    raw.values === undefined
      ? undefined
      : parseStringMap(raw.values, `${path}.values`, problems);
  let def: Literal | undefined;
  if (raw.default !== undefined) {
    if (typeof raw.default === 'string' || typeof raw.default === 'number') {
      def = raw.default;
    } else {
      problems.push(`${path}.default: esperava texto ou número`);
    }
  }
  if (problems.length > before) return undefined;
  return {
    path: raw.path as string,
    ...(values ? { values } : {}),
    ...(def !== undefined ? { default: def } : {}),
  };
}

function parseRoot(
  raw: unknown,
  path: string,
  problems: string[],
): RootSource | undefined {
  if (!isRecord(raw)) {
    problems.push(`${path}: esperava um objeto`);
    return undefined;
  }
  const before = problems.length;
  checkKeys(raw, ['path', 'anchor', 'margin', 'scrim'], path, problems);
  checkPath(raw.path, `${path}.path`, problems, true);
  let anchor: ValueSource | undefined;
  if (raw.anchor !== undefined) {
    anchor = parseValueSource(raw.anchor, `${path}.anchor`, problems);
    const literal =
      typeof anchor === 'string'
        ? anchor
        : typeof anchor === 'object' && typeof anchor.default === 'string'
          ? anchor.default
          : undefined;
    if (literal !== undefined && !SCREEN_ANCHORS.includes(literal as ScreenAnchor)) {
      problems.push(
        `${path}.anchor: âncora inválida: ${literal}; use ${SCREEN_ANCHORS.join(', ')}`,
      );
    }
  }
  const margin =
    raw.margin === undefined
      ? undefined
      : parseValueSource(raw.margin, `${path}.margin`, problems);
  if (raw.scrim !== undefined && !nonEmptyString(raw.scrim)) {
    problems.push(`${path}.scrim: esperava o id de um tipo (texto não vazio)`);
  }
  if (problems.length > before) return undefined;
  return {
    path: raw.path as string,
    ...(anchor !== undefined ? { anchor } : {}),
    ...(margin !== undefined ? { margin } : {}),
    ...(typeof raw.scrim === 'string' ? { scrim: raw.scrim } : {}),
  };
}

function parseScreen(
  raw: unknown,
  path: string,
  problems: string[],
): ScreenSource | undefined {
  if (!isRecord(raw)) {
    problems.push(`${path}: esperava um objeto`);
    return undefined;
  }
  const before = problems.length;
  checkKeys(
    raw,
    ['id', 'name', 'width', 'height', 'background', 'roots'],
    path,
    problems,
  );
  const optional = (key: 'id' | 'name' | 'background'): ValueSource | undefined =>
    raw[key] === undefined
      ? undefined
      : parseValueSource(raw[key], `${path}.${key}`, problems);
  const id = optional('id');
  const name = optional('name');
  const background = optional('background');
  const required = (key: 'width' | 'height'): ValueSource | undefined => {
    if (raw[key] === undefined) {
      problems.push(`${path}.${key}: obrigatório`);
      return undefined;
    }
    return parseValueSource(raw[key], `${path}.${key}`, problems);
  };
  const width = required('width');
  const height = required('height');
  const roots: RootSource[] = [];
  if (!Array.isArray(raw.roots) || raw.roots.length === 0) {
    problems.push(`${path}.roots: esperava uma lista com pelo menos uma raiz`);
  } else {
    raw.roots.forEach((item, index) => {
      const root = parseRoot(item, `${path}.roots[${index}]`, problems);
      if (root) roots.push(root);
    });
  }
  if (problems.length > before || width === undefined || height === undefined) {
    return undefined;
  }
  return {
    ...(id !== undefined ? { id } : {}),
    ...(name !== undefined ? { name } : {}),
    width,
    height,
    ...(background !== undefined ? { background } : {}),
    roots,
  };
}

function parseOrigin(raw: unknown, path: string, problems: string[]): Origin | undefined {
  if (!isRecord(raw)) {
    problems.push(`${path}: esperava um objeto`);
    return undefined;
  }
  const before = problems.length;
  checkKeys(raw, ['system', 'name', 'node', 'screen', 'booleans'], path, problems);
  if (!nonEmptyString(raw.system)) {
    problems.push(`${path}.system: esperava texto não vazio`);
  }
  if (raw.name !== undefined && typeof raw.name !== 'string') {
    problems.push(`${path}.name: esperava texto`);
  }
  let node: Origin['node'] | undefined;
  if (!isRecord(raw.node)) {
    problems.push(`${path}.node: esperava um objeto com type, props e children`);
  } else {
    const nodePath = `${path}.node`;
    checkKeys(raw.node, ['type', 'props', 'children'], nodePath, problems);
    const keyOk = (key: 'type' | 'props' | 'children'): boolean => {
      if (nonEmptyString((raw.node as Record<string, unknown>)[key])) return true;
      problems.push(`${nodePath}.${key}: obrigatório (nome da chave, texto não vazio)`);
      return false;
    };
    const ok = [keyOk('type'), keyOk('props'), keyOk('children')].every(Boolean);
    if (ok) {
      const n = raw.node;
      node = {
        type: n.type as string,
        props: n.props as string,
        children: n.children as string,
      };
    }
  }
  const screen =
    raw.screen === undefined
      ? (problems.push(`${path}.screen: obrigatório`), undefined)
      : parseScreen(raw.screen, `${path}.screen`, problems);
  let booleans: Origin['booleans'];
  if (raw.booleans !== undefined) {
    const bPath = `${path}.booleans`;
    if (!isRecord(raw.booleans)) {
      problems.push(`${bPath}: esperava { "true": texto, "false": texto }`);
    } else {
      checkKeys(raw.booleans, ['true', 'false'], bPath, problems);
      const t = raw.booleans.true;
      const f = raw.booleans.false;
      if (typeof t !== 'string') problems.push(`${bPath}.true: esperava texto`);
      if (typeof f !== 'string') problems.push(`${bPath}.false: esperava texto`);
      if (typeof t === 'string' && typeof f === 'string')
        booleans = { true: t, false: f };
    }
  }
  if (problems.length > before || !node || !screen) return undefined;
  return {
    system: raw.system as string,
    ...(typeof raw.name === 'string' ? { name: raw.name } : {}),
    node,
    screen,
    ...(booleans ? { booleans } : {}),
  };
}

/**
 * `origins` da especialização. Estrito: chave desconhecida é problema, com o caminho
 * (`origins[0].screen.roots[1].path: …`). Uma origem com problema é descartada; as outras
 * seguem. `[*]` só vale em `roots[].path`.
 */
export function parseOrigins(
  raw: unknown,
  path = 'origins',
): { origins: Origin[]; problems: string[] } {
  const problems: string[] = [];
  const origins: Origin[] = [];
  if (raw === undefined) return { origins, problems };
  if (!Array.isArray(raw)) {
    return { origins, problems: [`${path}: esperava uma lista`] };
  }
  raw.forEach((item, index) => {
    const origin = parseOrigin(item, `${path}[${index}]`, problems);
    if (!origin) return;
    if (origins.some((o) => o.system === origin.system)) {
      problems.push(`${path}[${index}].system: origem repetida: ${origin.system}`);
      return;
    }
    origins.push(origin);
  });
  return { origins, problems };
}

/** `sources` de um tipo (qualquer sistema). Entrada malformada vira problema e é descartada. */
export function parseTypeSources(
  raw: unknown,
  path: string,
  problems: string[],
): TypeSource[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    problems.push(`${path}: esperava uma lista`);
    return [];
  }
  const out: TypeSource[] = [];
  raw.forEach((item, index) => {
    const at = `${path}[${index}]`;
    if (!isRecord(item)) {
      problems.push(`${at}: esperava um objeto`);
      return;
    }
    const before = problems.length;
    checkKeys(item, ['system', 'id', 'name', 'slot', 'ignore'], at, problems);
    if (!nonEmptyString(item.system))
      problems.push(`${at}.system: esperava texto não vazio`);
    for (const key of ['id', 'name', 'slot'] as const) {
      if (item[key] !== undefined && !nonEmptyString(item[key])) {
        problems.push(`${at}.${key}: esperava texto não vazio`);
      }
    }
    if (item.id === undefined && item.name === undefined) {
      problems.push(`${at}: precisa de id ou name`);
    }
    let ignore: string[] | undefined;
    if (item.ignore !== undefined) {
      if (Array.isArray(item.ignore) && item.ignore.every(nonEmptyString)) {
        ignore = item.ignore as string[];
      } else {
        problems.push(`${at}.ignore: esperava uma lista de textos`);
      }
    }
    if (problems.length > before) return;
    out.push({
      system: item.system as string,
      ...(typeof item.id === 'string' ? { id: item.id } : {}),
      ...(typeof item.name === 'string' ? { name: item.name } : {}),
      ...(typeof item.slot === 'string' ? { slot: item.slot } : {}),
      ...(ignore ? { ignore } : {}),
    });
  });
  return out;
}

/** `sources` de um campo (qualquer sistema). */
export function parseFieldSources(
  raw: unknown,
  path: string,
  problems: string[],
): FieldSource[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    problems.push(`${path}: esperava uma lista`);
    return [];
  }
  const out: FieldSource[] = [];
  raw.forEach((item, index) => {
    const at = `${path}[${index}]`;
    if (!isRecord(item)) {
      problems.push(`${at}: esperava um objeto`);
      return;
    }
    const before = problems.length;
    checkKeys(item, ['system', 'name', 'values'], at, problems);
    if (!nonEmptyString(item.system))
      problems.push(`${at}.system: esperava texto não vazio`);
    if (!nonEmptyString(item.name)) problems.push(`${at}.name: esperava texto não vazio`);
    const values =
      item.values === undefined
        ? undefined
        : parseStringMap(item.values, `${at}.values`, problems);
    if (problems.length > before) return;
    out.push({
      system: item.system as string,
      name: item.name as string,
      ...(values ? { values } : {}),
    });
  });
  return out;
}

// ---------------------------------------------------------------------------------------
// Tradução
// ---------------------------------------------------------------------------------------

function isScalar(value: unknown): value is string | number | boolean {
  return (
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  );
}

/** Valor de uma `ValueSource` no documento (ou no nó): traduzido por `values`, senão `default`. */
function readSource(source: ValueSource | undefined, doc: unknown): unknown {
  if (source === undefined) return undefined;
  if (typeof source !== 'object') return source;
  const read = readPath(doc, source.path);
  if (!read.found) return source.default;
  const value = read.value;
  if (isScalar(value) && source.values) {
    const key = String(value);
    if (Object.hasOwn(source.values, key)) return source.values[key];
  }
  return value;
}

function describeSource(source: ValueSource): string {
  return typeof source === 'object' ? source.path : String(source);
}

function positiveNumber(value: unknown): number | undefined {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
}

interface Context {
  readonly origin: Origin;
  readonly byName: ReadonlyMap<string, TypeDef>;
  readonly warnings: string[];
}

function sourceOf(type: TypeDef, system: string, name: string): TypeSource | undefined {
  return type.sources.find((s) => s.system === system && s.name === name);
}

function fieldPath(field: FieldDef, system: string): string | undefined {
  return field.sources.find((s) => s.system === system)?.name;
}

function firstKey(path: string): string | undefined {
  const parsed = parsePath(path);
  const first = parsed.ok ? parsed.segments[0] : undefined;
  return typeof first === 'string' ? first : undefined;
}

function translateFieldValue(
  field: FieldDef,
  props: Record<string, unknown>,
  nodePath: string,
  ctx: Context,
): FieldValue {
  const fallback: FieldValue = field.default ?? null;
  const source = field.sources.find((s) => s.system === ctx.origin.system);
  if (!source) return fallback;
  const read = readPath(props, source.name);
  if (!read.found) return fallback;
  const where = `${nodePath}.${ctx.origin.node.props}.${source.name}`;
  const raw = read.value;
  if (!isScalar(raw)) {
    ctx.warnings.push(`${where}: esperava valor simples`);
    return null;
  }
  const values = source.values;
  let value: FieldValue;
  if (typeof raw === 'boolean') {
    const key = String(raw);
    if (values && Object.hasOwn(values, key)) value = values[key];
    else if (ctx.origin.booleans) value = ctx.origin.booleans[key as 'true' | 'false'];
    else value = key;
  } else if (typeof raw === 'number') {
    const key = String(raw);
    if (field.type === 'number') value = raw;
    else if (values && Object.hasOwn(values, key)) value = values[key];
    else value = key;
  } else if (values && Object.hasOwn(values, raw)) {
    value = values[raw];
  } else {
    value = raw;
  }
  if (
    field.type === 'enum' &&
    field.options &&
    value !== null &&
    value !== undefined &&
    !field.options.includes(String(value))
  ) {
    ctx.warnings.push(
      `${where}: valor fora das opções de ${field.key}: ${String(value)}`,
    );
  }
  return value;
}

function translateNode(raw: unknown, path: string, ctx: Context): LayoutNode | undefined {
  const { origin, warnings } = ctx;
  if (!isRecord(raw)) {
    warnings.push(`${path}: nó inválido (esperava objeto)`);
    return undefined;
  }
  const typeName = raw[origin.node.type];
  if (typeof typeName !== 'string' || typeName === '') {
    warnings.push(`${path}.${origin.node.type}: tipo ausente`);
    return undefined;
  }
  const type = ctx.byName.get(typeName);
  if (!type) {
    warnings.push(
      `${path}.${origin.node.type}: tipo externo sem tipo de anotação: ${typeName}`,
    );
    return undefined;
  }
  let props: Record<string, unknown> = {};
  const rawProps = raw[origin.node.props];
  if (isRecord(rawProps)) props = rawProps;
  else if (rawProps !== undefined && rawProps !== null) {
    warnings.push(`${path}.${origin.node.props}: esperava objeto`);
  }
  const values: Record<string, FieldValue> = {};
  const known = new Set<string>();
  for (const field of type.fields) {
    values[field.key] = translateFieldValue(field, props, path, ctx);
    const fieldSource = fieldPath(field, origin.system);
    const key = fieldSource === undefined ? undefined : firstKey(fieldSource);
    if (key !== undefined) known.add(key);
  }
  const ignore = sourceOf(type, origin.system, typeName)?.ignore ?? [];
  for (const key of Object.keys(props)) {
    if (known.has(key) || ignore.includes(key)) continue;
    warnings.push(
      `${path}.${origin.node.props}.${key}: propriedade desconhecida em ${typeName}`,
    );
  }
  const children: LayoutNode[] = [];
  const rawChildren = raw[origin.node.children];
  if (Array.isArray(rawChildren)) {
    rawChildren.forEach((child, index) => {
      const node = translateNode(child, `${path}.${origin.node.children}[${index}]`, ctx);
      if (node) children.push(node);
    });
  } else if (rawChildren !== undefined && rawChildren !== null) {
    warnings.push(`${path}.${origin.node.children}: esperava lista`);
  }
  return { id: path, typeId: type.id, values: values as FieldValues, children };
}

function translateRoot(
  source: RootSource,
  node: LayoutNode,
  raw: unknown,
  ctx: Context,
): LayoutRoot {
  let anchor: ScreenAnchor | undefined;
  let margin: number | undefined;
  if (source.anchor !== undefined) {
    const value = readSource(source.anchor, raw);
    if (value === undefined) {
      anchor = 'top-start';
    } else if (SCREEN_ANCHORS.includes(value as ScreenAnchor)) {
      anchor = value as ScreenAnchor;
    } else {
      ctx.warnings.push(
        `${node.id}.${describeSourceKey(source.anchor, 'anchor')}: âncora inválida: ${String(value)}; usando top-start`,
      );
      anchor = 'top-start';
    }
    if (source.margin !== undefined) {
      const value2 = readSource(source.margin, raw);
      if (value2 !== undefined) {
        const n =
          typeof value2 === 'string' && value2.trim() !== '' ? Number(value2) : value2;
        if (typeof n === 'number' && Number.isFinite(n) && n >= 0) margin = n;
        else {
          ctx.warnings.push(
            `${node.id}.${describeSourceKey(source.margin, 'margin')}: esperava número maior ou igual a 0`,
          );
        }
      }
    }
  }
  return {
    node,
    ...(anchor !== undefined ? { anchor } : {}),
    ...(margin !== undefined ? { margin } : {}),
    ...(source.scrim !== undefined ? { scrimTypeId: source.scrim } : {}),
  };
}

function describeSourceKey(source: ValueSource, fallback: string): string {
  return typeof source === 'object' ? source.path : fallback;
}

function translate(
  library: Library,
  json: unknown,
  options: SourceOptions,
): TranslateResult {
  const warnings: string[] = [];
  const origin = options.system
    ? library.origins.find((o) => o.system === options.system)
    : library.origins[0];
  if (!origin) {
    return {
      warnings,
      error: options.system
        ? `origem não declarada na especialização: ${options.system}`
        : 'a especialização não declara origens',
    };
  }
  const width = positiveNumber(readSource(origin.screen.width, json));
  if (width === undefined) {
    return {
      warnings,
      error: `largura da tela ausente ou inválida (${describeSource(origin.screen.width)})`,
    };
  }
  const height = positiveNumber(readSource(origin.screen.height, json));
  if (height === undefined) {
    return {
      warnings,
      error: `altura da tela ausente ou inválida (${describeSource(origin.screen.height)})`,
    };
  }
  const byName = new Map<string, TypeDef>();
  for (const type of library.types) {
    for (const source of type.sources) {
      if (source.system !== origin.system || source.name === undefined) continue;
      if (!byName.has(source.name)) byName.set(source.name, type);
    }
  }
  const ctx: Context = { origin, byName, warnings };
  const text = (source: ValueSource | undefined, fallback: string): string => {
    const value = readSource(source, json);
    return isScalar(value) ? String(value) : fallback;
  };
  const roots: LayoutRoot[] = [];
  for (const rootSource of origin.screen.roots) {
    const parsed = parsePath(rootSource.path);
    if (!parsed.ok) continue;
    for (const found of expandPath(json, parsed.segments)) {
      const node = translateNode(found.value, found.path, ctx);
      if (node) roots.push(translateRoot(rootSource, node, found.value, ctx));
    }
  }
  const layout: LayoutScreen = {
    id: text(origin.screen.id, 'tela'),
    name: text(origin.screen.name, 'Tela'),
    width,
    height,
    background: text(origin.screen.background, '#FFFFFF'),
    roots,
  };
  return { layout, warnings };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * JSON externo → tela sem geometria, pela origem declarada (`options.system`; sem ele, a
 * primeira). Nunca lança: falha vira `error` (sem `layout`). Avisos: tipo externo sem tipo de
 * anotação (o nó e a subárvore ficam de fora), propriedade desconhecida, valor fora das
 * opções, valor que não é simples, âncora inválida.
 */
export function translateSource(
  library: Library,
  json: unknown,
  options: SourceOptions = {},
): TranslateResult {
  try {
    return translate(library, json, options);
  } catch (error) {
    return { warnings: [], error: messageOf(error) };
  }
}

/** `translateSource` + `layoutScreen`: do JSON externo à `Screen` pronta para desenhar. Nunca lança. */
export function screenFromSource(
  library: Library,
  json: unknown,
  options: SourceOptions & { readonly measure: TextMeasurer },
): SourceResult {
  const translated = translateSource(library, json, options);
  if (translated.error !== undefined || !translated.layout) {
    return {
      warnings: translated.warnings,
      error: translated.error ?? 'tradução sem resultado',
    };
  }
  try {
    const laid = layoutScreen(translated.layout, library, options.measure);
    const warnings = [...new Set([...translated.warnings, ...laid.warnings])];
    return { screen: laid.screen, warnings };
  } catch (error) {
    return { warnings: translated.warnings, error: messageOf(error) };
  }
}
