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
  type ComponentFile,
} from './componentFormat';
import { referencedFields } from './expressions';

/** Um problema do arquivo: caminho JSON (vazio = arquivo inteiro) e mensagem. */
export type ComponentIssue = { path: string; message: string };

export type ComponentParseResult =
  | { ok: true; component: ComponentFile }
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
  'anchors',
  'fill',
  'stroke',
  'shadow',
  'cornerRadius',
];

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  if (!isRecord(value) || !Object.keys(value).some((k) => k.startsWith('$'))) {
    return check(value, path, out);
  }
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

function checkStroke(value: unknown, path: string, out: ComponentIssue[]): void {
  if (!isRecord(value)) return add(out, path, 'esperava objeto');
  checkKeys(value, ['color', 'width', 'align', 'dash'], path, out);
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
  };
  checkKeys(value, Object.keys(specs), path, out);
  for (const [key, check] of Object.entries(specs)) {
    if (!(key in value)) continue;
    if (key === 'italic') checkBoolExpr(value[key], join(path, key), out);
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

function checkLayout(value: unknown, path: string, out: ComponentIssue[]): void {
  if (!isRecord(value)) return add(out, path, 'esperava objeto');
  if (value.type === 'none') return checkKeys(value, ['type'], path, out);
  if (value.type !== 'row' && value.type !== 'column') {
    add(out, join(path, 'type'), 'esperava "none", "row" ou "column"');
    return;
  }
  checkKeys(value, ['type', 'gap', 'padding', 'align', 'justify'], path, out);
  if ('gap' in value) checkExpr(value.gap, join(path, 'gap'), checkNonNegative, out);
  if ('padding' in value)
    checkExpr(value.padding, join(path, 'padding'), checkPadding, out);
  if ('align' in value)
    oneOf(['start', 'center', 'end', 'stretch'])(value.align, join(path, 'align'), out);
  if ('justify' in value)
    oneOf(['start', 'center', 'end', 'space-between'])(
      value.justify,
      join(path, 'justify'),
      out,
    );
}

function checkViewBox(value: unknown, path: string, out: ComponentIssue[]): void {
  const ok = (n: unknown): boolean => isFiniteNumber(n) && n > 0;
  if (!Array.isArray(value) || value.length !== 2 || !value.every(ok))
    add(out, path, 'esperava [largura, altura] com números positivos');
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
    text: ['text', 'font', 'color'],
    path: ['d', 'viewBox', 'fillRule'],
    slot: ['label', 'layout'],
    repeat: ['field', 'direction', 'gap', 'template'],
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
  if ('width' in value) checkSize(value.width, join(path, 'width'), out);
  if ('height' in value) checkSize(value.height, join(path, 'height'), out);
  if ('anchors' in value) checkAnchors(value.anchors, join(path, 'anchors'), out);
  if ('fill' in value) checkExpr(value.fill, join(path, 'fill'), checkFill, out);
  if ('stroke' in value) checkStroke(value.stroke, join(path, 'stroke'), out);
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
      if (!('text' in value)) add(out, join(path, 'text'), 'campo obrigatório');
      else checkExpr(value.text, join(path, 'text'), checkTextOrNumber, out);
      if ('font' in value) checkFont(value.font, join(path, 'font'), out);
      if ('color' in value) checkExpr(value.color, join(path, 'color'), checkColor, out);
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
  }
}

/** `repeat`: o campo `table`, a direção, o espaço e o `template` (um quadro, sem `repeat` nem `slot`). */
function checkRepeat(value: Rec, path: string, out: ComponentIssue[]): void {
  if (!('field' in value)) add(out, join(path, 'field'), 'campo obrigatório');
  else checkFieldKey(value.field, join(path, 'field'), out);
  if ('direction' in value)
    oneOf(['column', 'row'])(value.direction, join(path, 'direction'), out);
  if ('gap' in value) checkExpr(value.gap, join(path, 'gap'), checkNonNegative, out);
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
    add(out, 'formatVersion', `esperava ${COMPONENT_FORMAT_VERSIONS.join(' ou ')}`);

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
    if (version !== 2) {
      for (const node of nodesOfTypes(input.template, 'template', ['repeat'])) {
        add(out, node.path, 'o nó repeat só existe na formatVersion 2');
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
  return { ok: true, component: input as ComponentFile };
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
