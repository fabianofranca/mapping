/**
 * Motor dos componentes (etapa Biblioteca): validação do arquivo `mapping-component` (`componentFormat.ts`).
 *
 * Estreitamento escrito à mão sobre `unknown` (sem zod). O formato é estrito: chave desconhecida
 * em nó ou expressão é problema, para que erros de digitação apareçam. Cada problema é
 * `"<caminho>: <mensagem>"`, com o caminho JSON (`template.children[1].text`); problemas na
 * raiz usam o nome da chave (`format`).
 */
import {
  COMPONENT_FORMAT,
  COMPONENT_FORMAT_VERSIONS,
  COMPONENT_FORMAT_VERSION_FIDELITY,
  STROKE_SIDES,
  type ComponentFile,
} from './componentFormat';
import { checkRemoteImageUrl } from '../remoteImages';
import { isValidFontFamily } from './fontFamily';
import { referencedFields } from './expressions';

/** Um problema do arquivo: caminho JSON (vazio = arquivo inteiro) e mensagem. */
export type ComponentIssue = { path: string; message: string };

export type ComponentParseResult =
  | { ok: true; component: ComponentFile; warnings: ComponentIssue[] }
  | { ok: false; issues: ComponentIssue[]; errors: string[] };

type Rec = Record<string, unknown>;
/** Confere um literal (valor que não é expressão) e acrescenta os problemas a `out`. */
type Check = (value: unknown, path: string, out: ComponentIssue[]) => void;

const NODE_TYPES = [
  'frame',
  'rect',
  'ellipse',
  'text',
  'path',
  'slot',
  'repeat',
  'image',
] as const;
const EXPR_OPS = ['$field', '$if', '$switch', '$concat'] as const;
const CONDITION_OPS = ['$field', '$eq', '$has', '$not', '$and', '$or'] as const;
/** Operadores que só existem em condição (`$field` é ambíguo e fica como expressão). */
const DIRECT_CONDITION_OPS: readonly string[] = ['$eq', '$has', '$not', '$and', '$or'];
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const PERCENT_PATTERN = /^\d+(\.\d+)?%$/;

/** Chaves de estilo que o `repeat` não tem: o desenho é do `template` de cada linha. */
const REPEAT_REJECTED_KEYS = ['fill', 'stroke', 'shadow', 'cornerRadius'];

const BASE_KEYS = [
  'type',
  'name',
  'visible',
  'opacity',
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'anchors',
  'fill',
  'stroke',
  'shadow',
  'cornerRadius',
];

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Um objeto com algum operador `$…`: uma expressão, não um literal. */
function isExprObject(value: unknown): value is Rec {
  return isRecord(value) && Object.keys(value).some((k) => k.startsWith('$'));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function join(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

function add(out: ComponentIssue[], path: string, message: string): void {
  out.push({ path, message });
}

/** Acrescenta "chave desconhecida" para cada chave fora de `allowed`. */
function checkKeys(
  value: Rec,
  allowed: readonly string[],
  path: string,
  out: ComponentIssue[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) add(out, join(path, key), `chave desconhecida: ${key}`);
  }
}

// ---------------------------------------------------------------------------------------
// Literais
// ---------------------------------------------------------------------------------------

const checkBoolean: Check = (v, p, out) => {
  if (typeof v !== 'boolean') add(out, p, 'esperava booleano');
};

const checkNumber: Check = (v, p, out) => {
  if (!isFiniteNumber(v)) add(out, p, 'esperava número');
};

const checkNonNegative: Check = (v, p, out) => {
  if (!isFiniteNumber(v) || v < 0) add(out, p, 'esperava número maior ou igual a 0');
};

const checkUnit: Check = (v, p, out) => {
  if (!isFiniteNumber(v) || v < 0 || v > 1) add(out, p, 'esperava número entre 0 e 1');
};

const checkWeight: Check = (v, p, out) => {
  if (!isFiniteNumber(v) || v < 100 || v > 900)
    add(out, p, 'esperava peso entre 100 e 900');
};

const checkString: Check = (v, p, out) => {
  if (typeof v !== 'string') add(out, p, 'esperava texto');
};

const checkTextOrNumber: Check = (v, p, out) => {
  if (typeof v !== 'string' && !isFiniteNumber(v))
    add(out, p, 'esperava texto ou número');
};

const checkColor: Check = (v, p, out) => {
  if (typeof v !== 'string' || v.trim() === '')
    add(out, p, 'esperava cor (texto não vazio)');
};

function oneOf(options: readonly string[]): Check {
  return (v, p, out) => {
    if (typeof v !== 'string' || !options.includes(v))
      add(out, p, `esperava um de: ${options.join(', ')}`);
  };
}

const checkCornerRadius: Check = (v, p, out) => {
  const isRadius = (n: unknown): boolean => isFiniteNumber(n) && n >= 0;
  if (isRadius(v)) return;
  if (Array.isArray(v) && v.length === 4 && v.every(isRadius)) return;
  add(out, p, 'esperava número maior ou igual a 0 ou lista de 4 números');
};

const checkFill: Check = (v, p, out) => {
  if (typeof v === 'string') return checkColor(v, p, out);
  if (!isRecord(v)) return add(out, p, 'esperava cor ou gradiente');
  checkKeys(v, ['type', 'angle', 'stops'], p, out);
  if (v.type !== 'linear') add(out, join(p, 'type'), 'esperava "linear"');
  if (!isFiniteNumber(v.angle)) add(out, join(p, 'angle'), 'esperava número');
  const stops = join(p, 'stops');
  if (!Array.isArray(v.stops)) return add(out, stops, 'esperava lista de paradas');
  if (v.stops.length < 2) add(out, stops, 'esperava ao menos 2 paradas');
  v.stops.forEach((stop: unknown, i) => {
    const sp = `${stops}[${i}]`;
    if (!isRecord(stop)) return add(out, sp, 'esperava objeto');
    checkKeys(stop, ['offset', 'color'], sp, out);
    checkUnit(stop.offset, join(sp, 'offset'), out);
    checkColor(stop.color, join(sp, 'color'), out);
  });
};

// ---------------------------------------------------------------------------------------
// Condições e expressões
// ---------------------------------------------------------------------------------------

function checkCondition(value: unknown, path: string, out: ComponentIssue[]): void {
  if (!isRecord(value)) return add(out, path, 'esperava condição (objeto)');
  const ops = Object.keys(value).filter((k) =>
    (CONDITION_OPS as readonly string[]).includes(k),
  );
  if (ops.length !== 1) {
    if (ops.length === 0) {
      add(out, path, `condição sem operador (${CONDITION_OPS.join(', ')})`);
    } else {
      add(out, path, `condição com mais de um operador: ${ops.join(', ')}`);
    }
    return;
  }
  const op = ops[0] as (typeof CONDITION_OPS)[number];
  checkKeys(value, [op], path, out);
  const at = join(path, op);
  const operand = value[op];
  switch (op) {
    case '$field':
    case '$has':
      if (typeof operand !== 'string' || operand === '')
        add(out, at, 'esperava chave de campo (texto não vazio)');
      return;
    case '$eq':
      if (
        !Array.isArray(operand) ||
        operand.length !== 2 ||
        typeof operand[0] !== 'string' ||
        (typeof operand[1] !== 'string' && !isFiniteNumber(operand[1]))
      )
        add(
          out,
          at,
          'esperava lista [campo, valor] com campo texto e valor texto ou número',
        );
      return;
    case '$not':
      return checkCondition(operand, at, out);
    case '$and':
    case '$or':
      if (!Array.isArray(operand)) return add(out, at, 'esperava lista de condições');
      operand.forEach((c: unknown, i) => checkCondition(c, `${at}[${i}]`, out));
  }
}

function checkFieldKey(value: unknown, path: string, out: ComponentIssue[]): void {
  if (typeof value !== 'string' || value === '')
    add(out, path, 'esperava chave de campo (texto não vazio)');
}

/** Confere uma expressão: operador (`$field`, `$if`…) ou o literal conferido por `check`. */
function checkExpr(
  value: unknown,
  path: string,
  check: Check,
  out: ComponentIssue[],
): void {
  if (!isExprObject(value)) return check(value, path, out);
  const ops = Object.keys(value).filter((k) =>
    (EXPR_OPS as readonly string[]).includes(k),
  );
  if (ops.length === 0) {
    checkKeys(value, [], path, out);
    return;
  }
  if (ops.length > 1) {
    add(out, path, `expressão com mais de um operador: ${ops.join(', ')}`);
    return;
  }
  const op = ops[0] as (typeof EXPR_OPS)[number];
  const at = join(path, op);
  switch (op) {
    case '$field':
      checkKeys(value, ['$field', 'default'], path, out);
      checkFieldKey(value.$field, at, out);
      if ('default' in value) check(value.default, join(path, 'default'), out);
      return;
    case '$if':
      checkKeys(value, ['$if', 'then', 'else'], path, out);
      checkCondition(value.$if, at, out);
      if (!('then' in value)) add(out, join(path, 'then'), 'campo obrigatório');
      else checkExpr(value.then, join(path, 'then'), check, out);
      if ('else' in value) checkExpr(value.else, join(path, 'else'), check, out);
      return;
    case '$switch': {
      checkKeys(value, ['$switch', 'cases', 'default'], path, out);
      checkFieldKey(value.$switch, at, out);
      const cases = join(path, 'cases');
      if (!isRecord(value.cases)) add(out, cases, 'esperava objeto de casos');
      else
        for (const [key, c] of Object.entries(value.cases))
          checkExpr(c, join(cases, key), check, out);
      if ('default' in value) checkExpr(value.default, join(path, 'default'), check, out);
      return;
    }
    case '$concat':
      checkKeys(value, ['$concat'], path, out);
      if (!Array.isArray(value.$concat)) return add(out, at, 'esperava lista de partes');
      value.$concat.forEach((part: unknown, i) =>
        checkExpr(part, `${at}[${i}]`, checkTextOrNumber, out),
      );
  }
}

// ---------------------------------------------------------------------------------------
// Nós
// ---------------------------------------------------------------------------------------

/** `BoolExpr`: condição direta (`$has`, `$not`…) ou expressão booleana (`$field`, `$if`…). */
function checkBoolExpr(value: unknown, path: string, out: ComponentIssue[]): void {
  if (isRecord(value) && Object.keys(value).some((k) => DIRECT_CONDITION_OPS.includes(k)))
    return checkCondition(value, path, out);
  checkExpr(value, path, checkBoolean, out);
}

function checkSize(value: unknown, path: string, out: ComponentIssue[]): void {
  if (isFiniteNumber(value) && value >= 0) return;
  if (value === 'fill' || value === 'hug') return;
  if (typeof value === 'string' && PERCENT_PATTERN.test(value)) return;
  add(out, path, 'esperava número maior ou igual a 0, "fill", "hug" ou "<número>%"');
}

/** Como `checkSize`, mas sem `hug`: o nó `image` não depende da imagem baixada. */
const checkSizeNoHug: Check = (v, p, out) => {
  if (v === 'hug')
    add(out, p, 'o nó image não aceita hug: a arrumação não depende da imagem baixada');
  else checkSize(v, p, out);
};

const SIZE_LIMIT_AXES = [
  ['minWidth', 'maxWidth'],
  ['minHeight', 'maxHeight'],
] as const;

/** `width`/`height` (literal ou expressão), `min*`/`max*` e a ordem entre `min` e `max`. */
function checkNodeSizes(
  value: Rec,
  path: string,
  nodeType: string,
  out: ComponentIssue[],
): void {
  const check = nodeType === 'image' ? checkSizeNoHug : checkSize;
  for (const key of ['width', 'height']) {
    if (key in value) checkExpr(value[key], join(path, key), check, out);
  }
  for (const [min, max] of SIZE_LIMIT_AXES) {
    if (min in value) checkExpr(value[min], join(path, min), checkNonNegative, out);
    if (max in value) checkExpr(value[max], join(path, max), checkNonNegative, out);
    const lo = value[min];
    const hi = value[max];
    if (isFiniteNumber(lo) && isFiniteNumber(hi) && lo > hi)
      add(out, join(path, min), `não pode ser maior que ${max}`);
  }
}

function checkAnchors(value: unknown, path: string, out: ComponentIssue[]): void {
  if (!isRecord(value)) return add(out, path, 'esperava objeto');
  checkKeys(value, ['left', 'right', 'top', 'bottom', 'centerX', 'centerY'], path, out);
  for (const key of ['left', 'right', 'top', 'bottom']) {
    if (key in value) checkNumber(value[key], join(path, key), out);
  }
  for (const key of ['centerX', 'centerY']) {
    if (key in value) checkBoolean(value[key], join(path, key), out);
  }
}

/** `stroke.sides`: lista não vazia de lados, sem repetição. */
const checkSides: Check = (v, p, out) => {
  if (!Array.isArray(v)) return add(out, p, 'esperava lista de lados');
  if (v.length === 0) return add(out, p, 'esperava ao menos um lado');
  const seen = new Set<unknown>();
  v.forEach((side: unknown, i) => {
    const at = `${p}[${i}]`;
    oneOf(STROKE_SIDES)(side, at, out);
    if (seen.has(side)) add(out, at, `lado repetido: ${String(side)}`);
    seen.add(side);
  });
};

/** As chaves da v4 do traço (`cap`, `join`, `sides`); o `sides` só vale em `frame` e `rect`. */
function checkStrokeV4(
  value: Rec,
  path: string,
  nodeType: string | undefined,
  out: ComponentIssue[],
): void {
  if ('cap' in value)
    checkExpr(value.cap, join(path, 'cap'), oneOf(['butt', 'round', 'square']), out);
  if ('join' in value)
    checkExpr(value.join, join(path, 'join'), oneOf(['miter', 'round', 'bevel']), out);
  if (!('sides' in value)) return;
  const at = join(path, 'sides');
  if (nodeType !== undefined && nodeType !== 'frame' && nodeType !== 'rect')
    add(out, at, `só vale em frame e rect (este é ${nodeType})`);
  else checkExpr(value.sides, at, checkSides, out);
}

function checkStroke(
  value: unknown,
  path: string,
  out: ComponentIssue[],
  nodeType?: string,
): void {
  if (!isRecord(value)) return add(out, path, 'esperava objeto');
  checkKeys(
    value,
    ['color', 'width', 'align', 'dash', 'cap', 'join', 'sides'],
    path,
    out,
  );
  if (!('color' in value)) add(out, join(path, 'color'), 'campo obrigatório');
  else checkExpr(value.color, join(path, 'color'), checkColor, out);
  if ('width' in value)
    checkExpr(value.width, join(path, 'width'), checkNonNegative, out);
  if ('align' in value)
    oneOf(['inside', 'center', 'outside'])(value.align, join(path, 'align'), out);
  if ('dash' in value) {
    const dash = join(path, 'dash');
    if (!Array.isArray(value.dash)) add(out, dash, 'esperava lista de números');
    else value.dash.forEach((n: unknown, i) => checkNonNegative(n, `${dash}[${i}]`, out));
  }
  checkStrokeV4(value, path, nodeType, out);
}

function checkShadow(value: unknown, path: string, out: ComponentIssue[]): void {
  if (!isRecord(value)) return add(out, path, 'esperava objeto');
  checkKeys(value, ['color', 'x', 'y', 'blur'], path, out);
  if (!('color' in value)) add(out, join(path, 'color'), 'campo obrigatório');
  else checkExpr(value.color, join(path, 'color'), checkColor, out);
  if ('x' in value) checkNumber(value.x, join(path, 'x'), out);
  if ('y' in value) checkNumber(value.y, join(path, 'y'), out);
  if ('blur' in value) checkNonNegative(value.blur, join(path, 'blur'), out);
}

/** `font.maxLines`: inteiro maior ou igual a 1. */
const checkPositiveInteger: Check = (v, p, out) => {
  if (!Number.isInteger(v) || (v as number) < 1)
    add(out, p, 'esperava inteiro maior ou igual a 1');
};

function checkFont(value: unknown, path: string, out: ComponentIssue[]): void {
  if (!isRecord(value)) return add(out, path, 'esperava objeto');
  const specs: Record<string, Check> = {
    family: checkString,
    size: checkNumber,
    weight: checkWeight,
    italic: checkBoolean,
    lineHeight: checkNumber,
    letterSpacing: checkNumber,
    align: oneOf(['left', 'center', 'right']),
    verticalAlign: oneOf(['top', 'middle', 'bottom']),
    decoration: oneOf(['none', 'underline', 'line-through']),
    wrap: oneOf(['word', 'none']),
    ellipsis: checkBoolean,
    maxLines: checkPositiveInteger,
  };
  checkKeys(value, Object.keys(specs), path, out);
  for (const [key, check] of Object.entries(specs)) {
    if (!(key in value)) continue;
    if (key === 'italic' || key === 'ellipsis')
      checkBoolExpr(value[key], join(path, key), out);
    else checkExpr(value[key], join(path, key), check, out);
  }
}

function checkPadding(value: unknown, path: string, out: ComponentIssue[]): void {
  const ok = (n: unknown): boolean => isFiniteNumber(n) && n >= 0;
  if (ok(value)) return;
  if (
    Array.isArray(value) &&
    (value.length === 2 || value.length === 4) &&
    value.every(ok)
  )
    return;
  add(
    out,
    path,
    'esperava número, lista de 2 ou lista de 4 números (maiores ou iguais a 0)',
  );
}

const checkLayoutType: Check = (v, p, out) => {
  if (v !== 'none' && v !== 'row' && v !== 'column')
    add(out, p, 'esperava "none", "row" ou "column"');
};

/** As chaves de um layout `row`/`column` (ou de `type` por expressão), na v4 também por expressão. */
function checkLayoutFlow(value: Rec, path: string, out: ComponentIssue[]): void {
  checkKeys(value, ['type', 'gap', 'padding', 'align', 'justify'], path, out);
  if ('gap' in value) checkExpr(value.gap, join(path, 'gap'), checkNonNegative, out);
  if ('padding' in value)
    checkExpr(value.padding, join(path, 'padding'), checkPadding, out);
  if ('align' in value)
    checkExpr(
      value.align,
      join(path, 'align'),
      oneOf(['start', 'center', 'end', 'stretch']),
      out,
    );
  if ('justify' in value)
    checkExpr(
      value.justify,
      join(path, 'justify'),
      oneOf(['start', 'center', 'end', 'space-between']),
      out,
    );
}

function checkLayout(value: unknown, path: string, out: ComponentIssue[]): void {
  if (!isRecord(value)) return add(out, path, 'esperava objeto');
  if (value.type === 'none') return checkKeys(value, ['type'], path, out);
  const at = join(path, 'type');
  if (isExprObject(value.type)) checkExpr(value.type, at, checkLayoutType, out);
  else if (value.type !== 'row' && value.type !== 'column')
    return add(out, at, 'esperava "none", "row" ou "column"');
  checkLayoutFlow(value, path, out);
}

function checkViewBox(value: unknown, path: string, out: ComponentIssue[]): void {
  const ok = (n: unknown): boolean => isFiniteNumber(n) && n > 0;
  if (!Array.isArray(value) || value.length !== 2 || !value.every(ok))
    add(out, path, 'esperava [largura, altura] com números positivos');
}

/** Chaves de um trecho de texto rico (`runs[i]`). */
const RUN_KEYS = [
  'text',
  'weight',
  'italic',
  'color',
  'decoration',
  'family',
  'size',
  'background',
  'radius',
  'padding',
];

/** `runs[i].padding`: número (os dois eixos) ou `[vertical, horizontal]`, não negativos. */
const checkRunPadding: Check = (v, p, out) => {
  const ok = (n: unknown): boolean => isFiniteNumber(n) && n >= 0;
  if (ok(v)) return;
  if (Array.isArray(v) && v.length === 2 && v.every(ok)) return;
  add(
    out,
    p,
    'esperava número ou lista [vertical, horizontal] de números (maiores ou iguais a 0)',
  );
};

/** Um trecho de `runs`: `text` obrigatório e o estilo, cada chave com literal ou expressão. */
function checkRun(value: unknown, path: string, out: ComponentIssue[]): void {
  if (!isRecord(value)) return add(out, path, 'esperava objeto (trecho)');
  checkKeys(value, RUN_KEYS, path, out);
  if (!('text' in value)) add(out, join(path, 'text'), 'campo obrigatório');
  const specs: Record<string, Check> = {
    text: checkTextOrNumber,
    weight: checkWeight,
    color: checkColor,
    decoration: oneOf(['none', 'underline', 'line-through']),
    family: checkString,
    size: checkNumber,
    background: checkColor,
    radius: checkNonNegative,
    padding: checkRunPadding,
  };
  for (const [key, check] of Object.entries(specs))
    if (key in value) checkExpr(value[key], join(path, key), check, out);
  if ('italic' in value) checkBoolExpr(value.italic, join(path, 'italic'), out);
}

function checkRuns(value: unknown, path: string, out: ComponentIssue[]): void {
  if (!Array.isArray(value) || value.length === 0)
    return add(out, path, 'esperava lista não vazia de trechos');
  value.forEach((run: unknown, i) => checkRun(run, `${path}[${i}]`, out));
}

/** Nó `text`: `text` ou `runs` (um dos dois), mais `font` e `color`. */
function checkTextNode(value: Rec, path: string, out: ComponentIssue[]): void {
  const hasText = 'text' in value;
  const hasRuns = 'runs' in value;
  if (hasText && hasRuns) add(out, path, 'text e runs juntos: use um ou outro');
  else if (!hasText && !hasRuns) add(out, join(path, 'text'), 'campo obrigatório');
  if (hasText) checkExpr(value.text, join(path, 'text'), checkTextOrNumber, out);
  if (hasRuns) checkRuns(value.runs, join(path, 'runs'), out);
  if ('font' in value) checkFont(value.font, join(path, 'font'), out);
  if ('color' in value) checkExpr(value.color, join(path, 'color'), checkColor, out);
}

function checkNode(value: unknown, path: string, out: ComponentIssue[]): void {
  if (!isRecord(value)) return add(out, path, 'esperava objeto (nó)');
  const type = value.type;
  if (typeof type !== 'string' || !(NODE_TYPES as readonly string[]).includes(type)) {
    add(
      out,
      join(path, 'type'),
      `tipo de nó desconhecido: ${JSON.stringify(type)} (esperava ${NODE_TYPES.join(', ')})`,
    );
    return;
  }

  const extra: Record<string, readonly string[]> = {
    frame: ['clip', 'layout', 'children'],
    rect: [],
    ellipse: [],
    text: ['text', 'runs', 'font', 'color'],
    path: ['d', 'viewBox', 'fillRule'],
    slot: ['label', 'layout'],
    repeat: ['field', 'direction', 'gap', 'distribute', 'template'],
    image: ['src', 'fit'],
  };
  // children/layout em nó que não é quadro têm mensagem própria, em vez de "chave desconhecida"
  for (const key of ['children', 'layout']) {
    if (type === 'slot' && key === 'layout') continue;
    if (type !== 'frame' && key in value)
      add(out, join(path, key), `só nós do tipo frame aceitam ${key} (este é ${type})`);
  }
  for (const key of Object.keys(value)) {
    if (type === 'slot' && key === 'layout') continue;
    if (type !== 'frame' && (key === 'children' || key === 'layout')) continue;
    if (type === 'repeat' && REPEAT_REJECTED_KEYS.includes(key)) {
      add(out, join(path, key), `não vale em repeat; o desenho é do template (${key})`);
      continue;
    }
    if (!BASE_KEYS.includes(key) && !extra[type]?.includes(key))
      add(out, join(path, key), `chave desconhecida: ${key}`);
  }

  if ('name' in value) checkString(value.name, join(path, 'name'), out);
  if ('visible' in value) checkBoolExpr(value.visible, join(path, 'visible'), out);
  if ('opacity' in value) checkExpr(value.opacity, join(path, 'opacity'), checkUnit, out);
  checkNodeSizes(value, path, type, out);
  if ('anchors' in value) checkAnchors(value.anchors, join(path, 'anchors'), out);
  if ('fill' in value) checkExpr(value.fill, join(path, 'fill'), checkFill, out);
  if ('stroke' in value) checkStroke(value.stroke, join(path, 'stroke'), out, type);
  if ('shadow' in value) checkShadow(value.shadow, join(path, 'shadow'), out);
  if ('cornerRadius' in value)
    checkExpr(value.cornerRadius, join(path, 'cornerRadius'), checkCornerRadius, out);

  switch (type) {
    case 'frame': {
      if ('clip' in value) checkBoolean(value.clip, join(path, 'clip'), out);
      if ('layout' in value) checkLayout(value.layout, join(path, 'layout'), out);
      if ('children' in value) {
        const children = join(path, 'children');
        if (!Array.isArray(value.children)) add(out, children, 'esperava lista de nós');
        else
          value.children.forEach((c: unknown, i) =>
            checkNode(c, `${children}[${i}]`, out),
          );
      }
      return;
    }
    case 'text':
      checkTextNode(value, path, out);
      return;
    case 'path':
      if (!('d' in value)) add(out, join(path, 'd'), 'campo obrigatório');
      else checkExpr(value.d, join(path, 'd'), checkString, out);
      if (!('viewBox' in value)) add(out, join(path, 'viewBox'), 'campo obrigatório');
      else checkViewBox(value.viewBox, join(path, 'viewBox'), out);
      if ('fillRule' in value)
        oneOf(['nonzero', 'evenodd'])(value.fillRule, join(path, 'fillRule'), out);
      return;
    case 'slot':
      if ('label' in value) checkExpr(value.label, join(path, 'label'), checkString, out);
      if ('layout' in value) checkLayout(value.layout, join(path, 'layout'), out);
      return;
    case 'repeat':
      checkRepeat(value, path, out);
      return;
    case 'image':
      checkImage(value, path, out);
      return;
  }
}

/**
 * `image` (formatVersion 3): `src` obrigatório e restrito (URL `https://` literal ou exatamente
 * `{ "$field": "<campo>" }`), `fit` e nenhum `hug` (conferido em `checkNodeSizes`: a arrumação não
 * depende da imagem baixada).
 * O host local não é erro de formato aqui: a política da app decide em tempo de execução.
 */
function checkImage(value: Rec, path: string, out: ComponentIssue[]): void {
  const at = join(path, 'src');
  if (!('src' in value)) add(out, at, 'campo obrigatório');
  else {
    const src = value.src;
    if (typeof src === 'string') {
      const check = checkRemoteImageUrl(src, {
        allowHttp: false,
        allowLocalNetwork: true,
      });
      if (!check.ok) add(out, at, `esperava URL https:// absoluta (${check.reason})`);
    } else if (isRecord(src) && Object.keys(src).length === 1 && '$field' in src) {
      checkFieldKey(src.$field, join(at, '$field'), out);
    } else {
      add(out, at, 'src só aceita texto literal ou { "$field": "<campo>" }');
    }
  }
  if ('fit' in value)
    oneOf(['cover', 'contain', 'fill'])(value.fit, join(path, 'fit'), out);
}

/** `repeat`: o campo `table`, a direção, o espaço e o `template` (um quadro, sem `repeat` nem `slot`). */
function checkRepeat(value: Rec, path: string, out: ComponentIssue[]): void {
  if (!('field' in value)) add(out, join(path, 'field'), 'campo obrigatório');
  else checkFieldKey(value.field, join(path, 'field'), out);
  if ('direction' in value)
    oneOf(['column', 'row'])(value.direction, join(path, 'direction'), out);
  if ('gap' in value) checkExpr(value.gap, join(path, 'gap'), checkNonNegative, out);
  if ('distribute' in value)
    oneOf(['none', 'fill'])(value.distribute, join(path, 'distribute'), out);
  const at = join(path, 'template');
  if (!('template' in value)) return add(out, at, 'campo obrigatório');
  const template = value.template;
  if (isRecord(template) && template.type !== 'frame') {
    add(out, join(at, 'type'), 'o template de uma linha deve ser do tipo "frame"');
  }
  checkNode(template, at, out);
  for (const nested of nodesOfTypes(template, at, ['repeat', 'slot'])) {
    add(out, nested.path, `${nested.type} não é permitido dentro de um repeat`);
  }
}

/** Caminhos (cadeias de chaves) das chaves que só existem na formatVersion 4, em qualquer nó. */
const V4_NODE_KEYS: readonly (readonly string[])[] = [
  ['stroke', 'cap'],
  ['stroke', 'join'],
  ['stroke', 'sides'],
  ['minWidth'],
  ['maxWidth'],
  ['minHeight'],
  ['maxHeight'],
  ['distribute'],
  ['font', 'wrap'],
  ['font', 'ellipsis'],
  ['font', 'maxLines'],
  ['runs'],
];

/** Chaves que valem em qualquer versão como literal, mas só com expressão na formatVersion 4. */
const V4_EXPR_KEYS: readonly (readonly string[])[] = [
  ['width'],
  ['height'],
  ['layout', 'type'],
  ['layout', 'align'],
  ['layout', 'justify'],
];

/**
 * A regra genérica da v4: para cada nó da árvore (`children` e `template` do repeat) que traz uma
 * das chaves de `keys` (cadeias como `['stroke', 'cap']`), numa versão anterior à 4, devolve
 * `só é permitido com formatVersion 4` no caminho da chave. As fases seguintes só acrescentam
 * cadeias a `V4_NODE_KEYS`. As cadeias de `exprKeys` só contam quando o valor é uma expressão
 * (objeto com operador `$…`): o literal continua valendo em todas as versões.
 */
export function v4OnlyKeyIssues(
  version: unknown,
  node: unknown,
  path: string,
  keys: readonly (readonly string[])[],
  exprKeys: readonly (readonly string[])[] = [],
): ComponentIssue[] {
  const out: ComponentIssue[] = [];
  if (typeof version === 'number' && version >= COMPONENT_FORMAT_VERSION_FIDELITY)
    return out;
  const walk = (n: unknown, at: string): void => {
    if (!isRecord(n)) return;
    const flag = (chain: readonly string[], exprOnly: boolean): void => {
      let cursor: unknown = n;
      for (const key of chain) cursor = isRecord(cursor) ? cursor[key] : undefined;
      if (cursor !== undefined && (!exprOnly || isExprObject(cursor)))
        add(out, [at, ...chain].filter((x) => x !== '').join('.'), V4_ONLY_MESSAGE);
    };
    keys.forEach((chain) => flag(chain, false));
    exprKeys.forEach((chain) => flag(chain, true));
    if (Array.isArray(n.children))
      n.children.forEach((c: unknown, i) => walk(c, `${join(at, 'children')}[${i}]`));
    if (n.type === 'repeat') walk(n.template, join(at, 'template'));
  };
  walk(node, path);
  return out;
}

const V4_ONLY_MESSAGE = 'só é permitido com formatVersion 4';

/** Caminhos dos nós dos tipos dados na árvore (pelos `children` dos quadros e `template` dos repeat). */
function nodesOfTypes(
  node: unknown,
  path: string,
  types: readonly string[],
  found: { path: string; type: string }[] = [],
): { path: string; type: string }[] {
  if (!isRecord(node)) return found;
  if (typeof node.type === 'string' && types.includes(node.type)) {
    found.push({ path: join(path, 'type'), type: node.type });
  }
  if (Array.isArray(node.children)) {
    node.children.forEach((child: unknown, i) =>
      nodesOfTypes(child, `${join(path, 'children')}[${i}]`, types, found),
    );
  }
  if (node.type === 'repeat')
    nodesOfTypes(node.template, join(path, 'template'), types, found);
  return found;
}

// ---------------------------------------------------------------------------------------
// Arquivo
// ---------------------------------------------------------------------------------------

/** `{ width, height }` com números positivos; devolve o par quando válido. */
function checkDimensions(
  value: unknown,
  path: string,
  out: ComponentIssue[],
): { width: number; height: number } | null {
  if (!isRecord(value)) {
    add(out, path, 'esperava objeto { width, height }');
    return null;
  }
  checkKeys(value, ['width', 'height'], path, out);
  let valid = true;
  for (const key of ['width', 'height']) {
    const v = value[key];
    if (!isFiniteNumber(v) || v <= 0) {
      add(out, join(path, key), 'esperava número positivo');
      valid = false;
    }
  }
  return valid ? { width: value.width as number, height: value.height as number } : null;
}

const ROOT_KEYS = [
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
];

/** `sizing`: `{ width?, height? }`, cada eixo px (≥ 0), `"fill"` ou `"hug"`. */
function checkSizing(value: unknown, path: string, out: ComponentIssue[]): void {
  if (!isRecord(value)) return add(out, path, 'esperava objeto { width?, height? }');
  checkKeys(value, ['width', 'height'], path, out);
  for (const key of ['width', 'height']) {
    if (!(key in value)) continue;
    const v = value[key];
    if (v === 'fill' || v === 'hug' || (isFiniteNumber(v) && v >= 0)) continue;
    add(out, join(path, key), 'esperava número maior ou igual a 0, "fill" ou "hug"');
  }
}

/** Todos os problemas do arquivo, com caminho e mensagem separados; lista vazia = válido. */
function collectIssues(input: unknown): ComponentIssue[] {
  const out: ComponentIssue[] = [];
  if (!isRecord(input)) {
    add(out, 'componente', 'esperava objeto');
    return out;
  }
  checkKeys(input, ROOT_KEYS, '', out);

  if (input.format !== COMPONENT_FORMAT)
    add(out, 'format', `esperava "${COMPONENT_FORMAT}"`);
  const version = input.formatVersion;
  if (!(COMPONENT_FORMAT_VERSIONS as readonly unknown[]).includes(version))
    add(
      out,
      'formatVersion',
      `esperava ${COMPONENT_FORMAT_VERSIONS.slice(0, -1).join(', ')} ou ${COMPONENT_FORMAT_VERSIONS.at(-1)}`,
    );

  if (typeof input.id !== 'string' || !ID_PATTERN.test(input.id))
    add(out, 'id', 'esperava texto no padrão ^[a-z0-9][a-z0-9-_]*$');
  if (typeof input.name !== 'string' || input.name.trim() === '')
    add(out, 'name', 'esperava texto não vazio');
  if ('description' in input) checkString(input.description, 'description', out);

  let size: { width: number; height: number } | null = null;
  if (!('size' in input)) add(out, 'size', 'campo obrigatório');
  else size = checkDimensions(input.size, 'size', out);

  if ('minSize' in input) {
    const min = checkDimensions(input.minSize, 'minSize', out);
    if (min && size && (min.width > size.width || min.height > size.height))
      add(out, 'minSize', 'não pode ser maior que size');
  }

  if ('sizing' in input) checkSizing(input.sizing, 'sizing', out);

  if ('preview' in input) {
    if (!isRecord(input.preview)) add(out, 'preview', 'esperava objeto');
    else
      for (const [key, v] of Object.entries(input.preview)) {
        if (Array.isArray(v)) checkPreviewRows(v, join('preview', key), out);
        else if (v !== null && typeof v !== 'string' && !isFiniteNumber(v))
          add(
            out,
            join('preview', key),
            'esperava texto, número ou null (ou uma lista de linhas, num campo table)',
          );
      }
  }

  if (!('template' in input)) {
    add(out, 'template', 'campo obrigatório');
  } else {
    const type = isRecord(input.template) ? input.template.type : undefined;
    if (type !== 'frame' && (NODE_TYPES as readonly unknown[]).includes(type))
      add(out, 'template.type', 'a raiz do template deve ser do tipo "frame"');
    checkNode(input.template, 'template', out);
    if (version === 1) {
      for (const node of nodesOfTypes(input.template, 'template', ['repeat'])) {
        add(out, node.path, 'o nó repeat só existe na formatVersion 2');
      }
    }
    out.push(
      ...v4OnlyKeyIssues(version, input.template, 'template', V4_NODE_KEYS, V4_EXPR_KEYS),
    );
    if (version === 1 || version === 2) {
      for (const node of nodesOfTypes(input.template, 'template', ['image'])) {
        add(out, node.path, 'o nó image só existe na formatVersion 3');
      }
    }
  }
  return out;
}

/** Linhas do `preview` de um campo `table`: objetos com valores texto, número ou null. */
function checkPreviewRows(rows: unknown[], path: string, out: ComponentIssue[]): void {
  rows.forEach((row, i) => {
    const at = `${path}[${i}]`;
    if (!isRecord(row)) return add(out, at, 'esperava objeto (uma linha)');
    for (const [column, v] of Object.entries(row)) {
      if (v !== null && typeof v !== 'string' && !isFiniteNumber(v))
        add(out, join(at, column), 'esperava texto, número ou null');
    }
  });
}

function formatIssue(issue: ComponentIssue): string {
  return issue.path ? `${issue.path}: ${issue.message}` : issue.message;
}

/** Todos os problemas do arquivo, cada um `"<caminho>: <mensagem>"`; lista vazia = válido. */
export function validateComponent(input: unknown): string[] {
  return collectIssues(input).map(formatIssue);
}

/** Valida um JSON já lido (não lança). */
export function parseComponent(input: unknown): ComponentParseResult {
  const issues = collectIssues(input);
  if (issues.length > 0) return { ok: false, issues, errors: issues.map(formatIssue) };
  const component = input as ComponentFile;
  return {
    ok: true,
    component,
    warnings: collectWarnings(component.template, 'template'),
  };
}

/** Aviso de um `family` literal (no `font` do nó ou num trecho) que o CSS não aceita. */
function familyWarning(holder: unknown, path: string): ComponentIssue[] {
  const family = isRecord(holder) ? holder.family : undefined;
  if (typeof family !== 'string' || isValidFontFamily(family)) return [];
  return [
    {
      path: join(path, 'family'),
      message: `família de fonte inválida para o CSS (${JSON.stringify(family)}): o texto cai em sans-serif`,
    },
  ];
}

/**
 * Avisos (não erros): hoje, um `font.family` (ou `runs[i].family`) literal que o CSS não aceita
 * (o desenho cai em `sans-serif`). Expressões não são conferidas aqui.
 */
function collectWarnings(node: unknown, path: string): ComponentIssue[] {
  if (!isRecord(node)) return [];
  const out: ComponentIssue[] = [];
  out.push(...familyWarning(node.font, join(path, 'font')));
  if (Array.isArray(node.runs))
    node.runs.forEach((run: unknown, i) =>
      out.push(...familyWarning(run, `${join(path, 'runs')}[${i}]`)),
    );
  const children = Array.isArray(node.children) ? node.children : [];
  children.forEach((child: unknown, i) =>
    out.push(...collectWarnings(child, `${join(path, 'children')}[${i}]`)),
  );
  if (node.template !== undefined)
    out.push(...collectWarnings(node.template, join(path, 'template')));
  return out;
}

/** Lê o texto JSON de um arquivo de componente (JSON inválido vira issue de caminho vazio). */
export function parseComponentText(text: string): ComponentParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const issues = [{ path: '', message: `JSON inválido: ${message}` }];
    return { ok: false, issues, errors: issues.map(formatIssue) };
  }
  return parseComponent(json);
}

/** Chaves de campo citadas em qualquer ponto do template, ordenadas e sem repetição. */
export function collectFieldKeys(component: ComponentFile): string[] {
  return [...referencedFields(component.template)].sort();
}
