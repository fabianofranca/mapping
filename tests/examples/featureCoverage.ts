import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { z } from 'zod';
import { specSchema } from '../../src/model/spec';

/**
 * Auxiliar da guarda de cobertura dos exemplos (`featureCoverage.test.ts`): lista os recursos
 * dos formatos de especialização e de componente e diz quais um arquivo de exemplo usa.
 * Um recurso é um texto: um caminho de chave (`a[].b`, `{}` para chaves livres de um `record`) ou
 * um valor aceito (`a[].b=valor`). Os da especialização saem do `specSchema`; os do
 * componente são uma lista explícita (o formato é lido à mão em `parseComponent.ts`).
 */

type Rec = Record<string, unknown>;
type Zod = z.ZodType;
type Def = Rec & { type: string };

const isRec = (v: unknown): v is Rec =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const defOf = (schema: Zod): Def =>
  (schema as unknown as { _zod: { def: Def } })._zod.def;

// ---------------------------------------------------------------------------------------
// Arquivos
// ---------------------------------------------------------------------------------------

export function listJsonFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listJsonFiles(full));
    else if (name.endsWith('.json')) out.push(full);
  }
  return out;
}

export function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8')) as unknown;
}

export type FileKind = 'spec' | 'component' | 'other';

export function classify(data: unknown): FileKind {
  if (!isRec(data)) return 'other';
  if (data.format === 'mapping-spec' || data.format === 'mapeador-spec') return 'spec';
  if (data.format === 'mapping-component') return 'component';
  return 'other';
}

// ---------------------------------------------------------------------------------------
// Especialização: percorre o schema (zod 4), com ou sem um dado
// ---------------------------------------------------------------------------------------

/** Campos da coluna de uma `table` que não fazem sentido numa coluna (o schema os aceita). */
const COLUMN_SKIP = new Set(['columns', 'rowLabel', 'tags', 'platforms']);

/** Marca "sem dado": percorre o schema inteiro. */
const ALL = Symbol('all');

function unwrap(schema: Zod): Zod {
  let current = schema;
  for (;;) {
    const def = defOf(current);
    if (
      ['optional', 'nullable', 'default', 'prefault', 'nonoptional', 'readonly'].includes(
        def.type,
      )
    ) {
      current = def.innerType as Zod;
    } else if (def.type === 'pipe') current = def.in as Zod;
    else return current;
  }
}

/**
 * Percorre `schema`. Com `ALL`, emite todo caminho e valor possíveis; com um dado, só os que o
 * dado usa. `format` e `formatVersion` entram só como caminho (os literais são ignorados).
 */
function visit(
  schema: Zod,
  data: unknown,
  path: string,
  out: Set<string>,
  skip: ReadonlySet<string> = new Set(),
): void {
  const inner = unwrap(schema);
  const def = defOf(inner);
  const all = data === ALL;
  switch (def.type) {
    case 'object': {
      if (!all && !isRec(data)) return;
      const shape = def.shape as Record<string, Zod>;
      for (const [key, child] of Object.entries(shape)) {
        if (skip.has(key)) continue;
        if (!all && !(key in (data as Rec))) continue;
        const p = path === '' ? key : `${path}.${key}`;
        out.add(p);
        if (path === '' && (key === 'format' || key === 'formatVersion')) continue;
        const value = all ? ALL : (data as Rec)[key];
        const childDef = defOf(unwrap(child));
        if (
          key === 'columns' &&
          childDef.type === 'array' &&
          defOf(childDef.element as Zod).type === 'unknown'
        ) {
          // as colunas são lidas pela mesma forma do campo (`fieldShape`), mas o schema as
          // declara como `unknown[]`: percorre a forma do próprio campo, sem as chaves de tabela
          const items = all ? [ALL] : Array.isArray(value) ? value : [];
          for (const item of items) visit(inner, item, `${p}[]`, out, COLUMN_SKIP);
          continue;
        }
        visit(child, value, p, out);
      }
      return;
    }
    case 'array': {
      const items = all ? [ALL] : Array.isArray(data) ? data : [];
      for (const item of items) visit(def.element as Zod, item, `${path}[]`, out);
      return;
    }
    case 'tuple':
      return;
    case 'union':
      for (const option of def.options as Zod[]) visit(option, data, path, out);
      return;
    case 'record': {
      const values = all ? [ALL] : isRec(data) ? Object.values(data) : [];
      for (const value of values) visit(def.valueType as Zod, value, `${path}{}`, out);
      return;
    }
    case 'enum': {
      for (const value of Object.values(def.entries as Record<string, string>)) {
        if (all || data === value) out.add(`${path}=${value}`);
      }
      return;
    }
    case 'literal': {
      if (path === 'format' || path === 'formatVersion') return;
      for (const value of def.values as unknown[]) {
        if (all || data === value) out.add(`${path}=${String(value)}`);
      }
      return;
    }
    default:
      return;
  }
}

/**
 * `origins` é `z.unknown()` no schema (validado por `parseOrigins`, em
 * `src/model/components/origin.ts`): os recursos ficam à mão aqui. Um "valor de origem"
 * (`ValueSource`) é um literal ou `{ path, values?, default? }`.
 */
export const ORIGIN_FEATURES = [
  'origins[]',
  'origins[].system',
  'origins[].name',
  'origins[].node',
  'origins[].node.type',
  'origins[].node.props',
  'origins[].node.children',
  'origins[].screen',
  'origins[].screen.id',
  'origins[].screen.name',
  'origins[].screen.width',
  'origins[].screen.height',
  'origins[].screen.background',
  'origins[].screen.roots',
  'origins[].screen.roots[].path',
  'origins[].screen.roots[].anchor',
  'origins[].screen.roots[].margin',
  'origins[].screen.roots[].scrim',
  'origins[].booleans',
  'origins[].booleans.true',
  'origins[].booleans.false',
  'origins[].examples',
  'origins[].examples[].name',
  'origins[].examples[].file',
  'origins[].valueSource=literal',
  'origins[].valueSource.path',
  'origins[].valueSource.values',
  'origins[].valueSource.default',
];

function originFeatures(origins: unknown, out: Set<string>): void {
  if (!Array.isArray(origins)) return;
  const add = (feature: string): void => void out.add(feature);
  const valueSource = (value: unknown): void => {
    if (value === undefined) return;
    if (!isRec(value)) return add('origins[].valueSource=literal');
    for (const key of ['path', 'values', 'default']) {
      if (key in value) add(`origins[].valueSource.${key}`);
    }
  };
  const keys = (prefix: string, value: unknown, names: readonly string[]): void => {
    if (!isRec(value)) return;
    for (const name of names) if (name in value) add(`${prefix}.${name}`);
  };
  for (const origin of origins) {
    if (!isRec(origin)) continue;
    add('origins[]');
    keys('origins[]', origin, [
      'system',
      'name',
      'node',
      'screen',
      'booleans',
      'examples',
    ]);
    keys('origins[].node', origin.node, ['type', 'props', 'children']);
    keys('origins[].booleans', origin.booleans, ['true', 'false']);
    if (Array.isArray(origin.examples)) {
      for (const example of origin.examples) {
        keys('origins[].examples[]', example, ['name', 'file']);
      }
    }
    const screen = origin.screen;
    if (!isRec(screen)) continue;
    keys('origins[].screen', screen, [
      'id',
      'name',
      'width',
      'height',
      'background',
      'roots',
    ]);
    for (const key of ['id', 'name', 'width', 'height', 'background']) {
      valueSource(screen[key]);
    }
    if (Array.isArray(screen.roots)) {
      for (const root of screen.roots) {
        keys('origins[].screen.roots[]', root, ['path', 'anchor', 'margin', 'scrim']);
        if (isRec(root)) {
          valueSource(root.anchor);
          valueSource(root.margin);
        }
      }
    }
  }
}

/** Todos os recursos da especialização: o schema inteiro mais os de `origins`. */
export function specFeatureList(): string[] {
  const out = new Set<string>();
  visit(specSchema as unknown as Zod, ALL, '', out);
  for (const feature of ORIGIN_FEATURES) out.add(feature);
  return [...out].sort();
}

/** Os recursos da especialização que um arquivo usa. */
export function specFeaturesUsed(data: unknown): Set<string> {
  const out = new Set<string>();
  visit(specSchema as unknown as Zod, data, '', out);
  if (isRec(data)) originFeatures(data.origins, out);
  return out;
}

// ---------------------------------------------------------------------------------------
// Componente: lista explícita (docs/COMPONENT-FORMAT.md e parseComponent.ts)
// ---------------------------------------------------------------------------------------

export const NODE_TYPES = [
  'frame',
  'rect',
  'ellipse',
  'text',
  'path',
  'slot',
  'repeat',
  'image',
] as const;
export const EXPR_OPS = ['$field', '$if', '$switch', '$concat'] as const;
export const CONDITION_OPS = ['$field', '$eq', '$has', '$not', '$and', '$or'] as const;
export const ROOT_KEYS = [
  'format',
  'formatVersion',
  'id',
  'name',
  'description',
  'size',
  'minSize',
  'sizing',
  'preview',
  'template',
] as const;
/** Chaves comuns a todo nó (fora `type`). */
export const BASE_KEYS = [
  'name',
  'visible',
  'opacity',
  'width',
  'height',
  'anchors',
  'fill',
  'stroke',
  'shadow',
  'cornerRadius',
] as const;
/** Chaves de cada tipo de nó, além das comuns. */
export const EXTRA_KEYS: Record<(typeof NODE_TYPES)[number], readonly string[]> = {
  frame: ['clip', 'layout', 'children'],
  rect: [],
  ellipse: [],
  text: ['text', 'font', 'color'],
  path: ['d', 'viewBox', 'fillRule'],
  slot: ['label', 'layout'],
  repeat: ['field', 'direction', 'gap', 'template'],
  image: ['src', 'fit'],
};
/** O `repeat` só aceita estas chaves comuns: o desenho é do `template` de cada linha. */
export const REPEAT_BASE_KEYS = [
  'name',
  'visible',
  'opacity',
  'width',
  'height',
  'anchors',
];

const ANCHOR_KEYS = ['left', 'right', 'top', 'bottom', 'centerX', 'centerY'] as const;
const LAYOUT_KEYS = ['gap', 'padding', 'align', 'justify'] as const;
const STROKE_KEYS = ['color', 'width', 'align', 'dash'] as const;
const SHADOW_KEYS = ['color', 'x', 'y', 'blur'] as const;
const FONT_KEYS = [
  'family',
  'size',
  'weight',
  'italic',
  'lineHeight',
  'letterSpacing',
  'align',
  'verticalAlign',
  'decoration',
] as const;
const ENUM_VALUES = {
  'layout.type': ['none', 'row', 'column'],
  'layout.align': ['start', 'center', 'end', 'stretch'],
  'layout.justify': ['start', 'center', 'end', 'space-between'],
  'stroke.align': ['inside', 'center', 'outside'],
  'font.align': ['left', 'center', 'right'],
  'font.verticalAlign': ['top', 'middle', 'bottom'],
  'font.decoration': ['none', 'underline', 'line-through'],
  'path.fillRule': ['nonzero', 'evenodd'],
  'image.fit': ['cover', 'contain', 'fill'],
  'repeat.direction': ['column', 'row'],
} as const;
/** Formas de um valor: `size` (largura/altura do nó), `padding`, `fill`, `cornerRadius` etc. */
const SHAPE_FEATURES = [
  'size=px',
  'size=fill',
  'size=hug',
  'size=percent',
  'sizing=px',
  'sizing=fill',
  'sizing=hug',
  'layout.padding=number',
  'layout.padding=pair',
  'layout.padding=quad',
  'fill=color',
  'fill=none',
  'fill=gradient',
  'cornerRadius=number',
  'cornerRadius=quad',
  'image.src=literal',
  'image.src=$field',
  'root.preview=table',
  'expr.$field.default',
  'expr.$if.else',
  'expr.$switch.default',
];

/** Todos os recursos do componente, na ordem de leitura do formato. */
export function componentFeatureList(): string[] {
  const out = new Set<string>();
  for (const key of ROOT_KEYS) {
    if (key !== 'format' && key !== 'formatVersion') out.add(`root.${key}`);
  }
  for (const type of NODE_TYPES) {
    out.add(`node.${type}`);
    for (const key of EXTRA_KEYS[type]) out.add(`node.${type}.${key}`);
  }
  for (const key of BASE_KEYS) out.add(`node.${key}`);
  for (const key of ANCHOR_KEYS) out.add(`anchors.${key}`);
  for (const key of LAYOUT_KEYS) out.add(`layout.${key}`);
  for (const key of STROKE_KEYS) out.add(`stroke.${key}`);
  for (const key of SHADOW_KEYS) out.add(`shadow.${key}`);
  for (const key of FONT_KEYS) out.add(`font.${key}`);
  for (const [group, values] of Object.entries(ENUM_VALUES)) {
    for (const value of values) out.add(`${group}=${value}`);
  }
  for (const op of EXPR_OPS) out.add(`expr.${op}`);
  for (const op of CONDITION_OPS) out.add(`cond.${op}`);
  for (const feature of SHAPE_FEATURES) out.add(feature);
  return [...out].sort();
}

const DIRECT_CONDITION_OPS: readonly string[] = ['$eq', '$has', '$not', '$and', '$or'];

/** As folhas de uma expressão (o literal ou objeto de cada ramo), sem os operadores. */
function leaves(expr: unknown): unknown[] {
  if (isRec(expr)) {
    if ('$if' in expr) return [...leaves(expr.then), ...leaves(expr.else)];
    if ('$switch' in expr) {
      const cases = isRec(expr.cases) ? Object.values(expr.cases) : [];
      return [...cases.flatMap(leaves), ...leaves(expr.default)];
    }
    if ('$field' in expr) return leaves(expr.default);
    if ('$concat' in expr) return [];
  }
  return expr === undefined ? [] : [expr];
}

function sizeFeature(value: unknown, prefix: 'size' | 'sizing'): string | undefined {
  if (typeof value === 'number') return `${prefix}=px`;
  if (value === 'fill' || value === 'hug') return `${prefix}=${value}`;
  if (typeof value === 'string' && prefix === 'size') return 'size=percent';
  return undefined;
}

/** Operadores de expressão e de condição em qualquer lugar do valor. */
function exprFeatures(value: unknown, out: Set<string>, inCondition = false): void {
  if (Array.isArray(value)) {
    for (const item of value) exprFeatures(item, out, inCondition);
    return;
  }
  if (!isRec(value)) return;
  if (inCondition || Object.keys(value).some((k) => DIRECT_CONDITION_OPS.includes(k))) {
    for (const op of CONDITION_OPS) if (op in value) out.add(`cond.${op}`);
    if ('$not' in value) exprFeatures(value.$not, out, true);
    for (const op of ['$and', '$or']) {
      if (Array.isArray(value[op])) {
        for (const item of value[op] as unknown[]) exprFeatures(item, out, true);
      }
    }
    return;
  }
  if ('$if' in value) {
    out.add('expr.$if');
    if ('else' in value) out.add('expr.$if.else');
    exprFeatures(value.$if, out, true);
    exprFeatures(value.then, out);
    exprFeatures(value.else, out);
    return;
  }
  if ('$switch' in value) {
    out.add('expr.$switch');
    if ('default' in value) out.add('expr.$switch.default');
    exprFeatures(value.cases, out);
    exprFeatures(value.default, out);
    return;
  }
  if ('$concat' in value) {
    out.add('expr.$concat');
    exprFeatures(value.$concat, out);
    return;
  }
  if ('$field' in value) {
    out.add('expr.$field');
    if ('default' in value) out.add('expr.$field.default');
    return;
  }
  for (const item of Object.values(value)) exprFeatures(item, out);
}

function recordKeys(
  prefix: string,
  value: unknown,
  keys: readonly string[],
  out: Set<string>,
) {
  if (!isRec(value)) return;
  for (const key of keys) if (key in value) out.add(`${prefix}.${key}`);
}

function layoutFeatures(layout: unknown, out: Set<string>): void {
  if (!isRec(layout)) return;
  if (typeof layout.type === 'string') out.add(`layout.type=${layout.type}`);
  recordKeys('layout', layout, LAYOUT_KEYS, out);
  for (const key of ['align', 'justify'] as const) {
    for (const leaf of leaves(layout[key])) out.add(`layout.${key}=${String(leaf)}`);
  }
  for (const leaf of leaves(layout.padding)) {
    if (typeof leaf === 'number') out.add('layout.padding=number');
    else if (Array.isArray(leaf)) {
      out.add(leaf.length === 2 ? 'layout.padding=pair' : 'layout.padding=quad');
    }
  }
}

function nodeFeatures(node: unknown, out: Set<string>): void {
  if (!isRec(node) || typeof node.type !== 'string') return;
  const type = node.type;
  out.add(`node.${type}`);
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    if ((BASE_KEYS as readonly string[]).includes(key)) out.add(`node.${key}`);
    else out.add(`node.${type}.${key}`);
  }
  for (const axis of ['width', 'height'] as const) {
    const feature = sizeFeature(node[axis], 'size');
    if (feature) out.add(feature);
  }
  recordKeys('anchors', node.anchors, ANCHOR_KEYS, out);
  recordKeys('stroke', node.stroke, STROKE_KEYS, out);
  recordKeys('shadow', node.shadow, SHADOW_KEYS, out);
  recordKeys('font', node.font, FONT_KEYS, out);
  if (isRec(node.stroke)) {
    for (const leaf of leaves(node.stroke.align)) out.add(`stroke.align=${String(leaf)}`);
  }
  if (isRec(node.font)) {
    for (const key of ['align', 'verticalAlign', 'decoration'] as const) {
      for (const leaf of leaves(node.font[key])) out.add(`font.${key}=${String(leaf)}`);
    }
  }
  for (const leaf of leaves(node.fill)) {
    if (leaf === 'none') out.add('fill=none');
    else if (typeof leaf === 'string') out.add('fill=color');
    else if (isRec(leaf)) out.add('fill=gradient');
  }
  for (const leaf of leaves(node.cornerRadius)) {
    if (typeof leaf === 'number') out.add('cornerRadius=number');
    else if (Array.isArray(leaf)) out.add('cornerRadius=quad');
  }
  layoutFeatures(node.layout, out);
  for (const key of ['fillRule', 'fit', 'direction'] as const) {
    if (typeof node[key] === 'string') {
      const group = type === 'path' ? 'path' : type === 'image' ? 'image' : 'repeat';
      out.add(`${group}.${key}=${node[key]}`);
    }
  }
  if (type === 'image') {
    if (typeof node.src === 'string') out.add('image.src=literal');
    else if (isRec(node.src) && '$field' in node.src) out.add('image.src=$field');
  }
  // expressões e condições nos atributos do nó (não nos filhos, visitados abaixo)
  const { children, template, ...rest } = node;
  exprFeatures(rest, out);
  if (Array.isArray(children)) for (const child of children) nodeFeatures(child, out);
  if (template !== undefined) nodeFeatures(template, out);
}

/** Os recursos do componente que um arquivo usa. */
export function componentFeaturesUsed(data: unknown): Set<string> {
  const out = new Set<string>();
  if (!isRec(data)) return out;
  for (const key of ROOT_KEYS) {
    if (key !== 'format' && key !== 'formatVersion' && key in data)
      out.add(`root.${key}`);
  }
  if (isRec(data.sizing)) {
    for (const axis of ['width', 'height']) {
      const feature = sizeFeature(data.sizing[axis], 'sizing');
      if (feature) out.add(feature);
    }
  }
  if (isRec(data.preview) && Object.values(data.preview).some(Array.isArray)) {
    out.add('root.preview=table');
  }
  nodeFeatures(data.template, out);
  return out;
}
