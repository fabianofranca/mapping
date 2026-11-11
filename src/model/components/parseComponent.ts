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
  IMAGE_FITS_V4,
  SCREEN_ANCHORS,
  STROKE_SIDES,
  type ComponentFile,
} from './componentFormat';
import { checkRemoteImageUrl } from '../remoteImages';
import { isValidFontFamily } from './fontFamily';
import {
  COMPARISON_OPS,
  NUMERIC_OPS,
  isNumericOp,
  referencedFields,
} from './expressions';
import { LAYOUT_JUSTIFIES } from './layoutValues';
import { TOKEN_NAME_PATTERN, isLiteralColor, type TokenKind } from './tokens';
import { isRecord } from '../isRecord';
import type { ModelMessageTemplateCode } from '../messages';
import { componentCodeForText } from '../messages/textLookup';

/**
 * Um problema do arquivo: caminho JSON (vazio = arquivo inteiro) e mensagem (pt-BR). `code` e
 * `params` são os do catálogo (`src/model/messages/`): a interface traduz por eles.
 */
export type ComponentIssue = {
  path: string;
  message: string;
  code?: ModelMessageTemplateCode;
  params?: Readonly<Record<string, string | number>>;
};

export type ComponentParseResult =
  | {
      ok: true;
      component: ComponentFile;
      warnings: ComponentIssue[];
      /** Cada `$token` do arquivo, para a biblioteca conferir contra os `tokens` da especialização. */
      tokenRefs: TokenRef[];
    }
  | { ok: false; issues: ComponentIssue[]; errors: string[] };

/** Um `{ "$token": … }` do arquivo: onde está, o nome e o tipo de valor que a posição espera. */
export type TokenRef = { path: string; name: string; kind: TokenKind };

type Rec = Record<string, unknown>;

/** O contexto de uma validação: os problemas e, quando pedido, onde `$token` coleta as referências. */
type Ctx = {
  readonly issues: ComponentIssue[];
  readonly refs: TokenRef[] | null;
};

type LiteralCheck = (value: unknown, path: string, out: Ctx) => void;

/**
 * Confere um literal (valor que não é expressão) e acrescenta os problemas a `out`.
 * `tokenKind` é o discriminante explícito do tipo de `$token` que a posição aceita; sem ele, a
 * posição não aceita token.
 */
type Check = LiteralCheck & { readonly tokenKind?: TokenKind };

/** Marca o `check` como aceitando `$token` do tipo `kind`. */
function tokenCheck(kind: TokenKind, check: LiteralCheck): Check {
  return Object.assign((v: unknown, p: string, out: Ctx) => check(v, p, out), {
    tokenKind: kind,
  });
}

const NODE_TYPES = [
  'frame',
  'rect',
  'ellipse',
  'text',
  'path',
  'slot',
  'repeat',
  'image',
  'icon',
] as const;
const NUMERIC_OP_NAMES = Object.keys(NUMERIC_OPS);
const EXPR_OPS: readonly string[] = [
  '$field',
  '$if',
  '$switch',
  '$concat',
  '$token',
  '$rows',
  '$size',
  '$provided',
  ...NUMERIC_OP_NAMES,
];
const CONDITION_OPS: readonly string[] = [
  '$field',
  '$eq',
  '$has',
  '$not',
  '$and',
  '$or',
  ...COMPARISON_OPS,
];
/** Operadores que só existem em condição (`$field` é ambíguo e fica como expressão). */
const DIRECT_CONDITION_OPS: readonly string[] = [
  '$eq',
  '$has',
  '$not',
  '$and',
  '$or',
  ...COMPARISON_OPS,
];
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const PERCENT_PATTERN = /^\d+(\.\d+)?%$/;

/** Máximo de sombras por nó (`shadow` como lista, v4). */
const MAX_SHADOWS = 4;

/** Chaves de estilo que o `repeat` não tem: o desenho é do `template` de cada linha. */
const REPEAT_REJECTED_KEYS = ['fill', 'stroke', 'shadow', 'cornerRadius'];

const BASE_KEYS = [
  'type',
  'name',
  'visible',
  'opacity',
  'rotation',
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

/** O problema com o código e os parâmetros que o catálogo acha pelo texto. */
function issueOf(path: string, message: string): ComponentIssue {
  const hit = componentCodeForText(message);
  if (hit === undefined) return { path, message };
  return hit.params === undefined
    ? { path, message, code: hit.code }
    : { path, message, code: hit.code, params: hit.params };
}

function addIssue(list: ComponentIssue[], path: string, message: string): void {
  list.push(issueOf(path, message));
}

function add(out: Ctx, path: string, message: string): void {
  addIssue(out.issues, path, message);
}

/** Acrescenta "chave desconhecida" para cada chave fora de `allowed`. */
function checkKeys(value: Rec, allowed: readonly string[], path: string, out: Ctx): void {
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

const checkNumber = tokenCheck('number', (v, p, out) => {
  if (!isFiniteNumber(v)) add(out, p, 'esperava número');
});

const checkNonNegative = tokenCheck('number', (v, p, out) => {
  if (!isFiniteNumber(v) || v < 0) add(out, p, 'esperava número maior ou igual a 0');
});

const checkUnit = tokenCheck('number', (v, p, out) => {
  if (!isFiniteNumber(v) || v < 0 || v > 1) add(out, p, 'esperava número entre 0 e 1');
});

const checkWeight = tokenCheck('number', (v, p, out) => {
  if (!isFiniteNumber(v) || v < 100 || v > 900)
    add(out, p, 'esperava peso entre 100 e 900');
});

const checkString: Check = (v, p, out) => {
  if (typeof v !== 'string') add(out, p, 'esperava texto');
};

/** `font.family` (e `family` de um trecho): texto; aceita `$token` de família. */
const checkFamily = tokenCheck('family', (v, p, out) => checkString(v, p, out));

const checkTextOrNumber: Check = (v, p, out) => {
  if (typeof v !== 'string' && !isFiniteNumber(v))
    add(out, p, 'esperava texto ou número');
};

const checkColor = tokenCheck('color', (v, p, out) => {
  if (typeof v !== 'string' || v.trim() === '')
    add(out, p, 'esperava cor (texto não vazio)');
});

function oneOf(options: readonly string[]): Check {
  return (v, p, out) => {
    if (typeof v !== 'string' || !options.includes(v))
      add(out, p, `esperava um de: ${options.join(', ')}`);
  };
}

/** Um `{ "$token": … }` solto (sem nenhuma outra expressão): para as posições que só aceitavam literal. */
function isTokenObject(value: unknown): value is Rec {
  return isRecord(value) && '$token' in value;
}

/** Confere um literal que na v4 também aceita `$token` (e só `$token`: nenhuma outra expressão). */
function checkLiteralOrToken(value: unknown, path: string, check: Check, out: Ctx): void {
  if (isTokenObject(value)) checkTokenExpr(value, path, check, out);
  else check(value, path, out);
}

const checkCornerRadius = tokenCheck('number', (v, p, out) => {
  const isRadius = (n: unknown): boolean =>
    (isFiniteNumber(n) && n >= 0) || isTokenObject(n);
  if (isFiniteNumber(v) && v >= 0) return;
  if (Array.isArray(v) && v.length === 4 && v.every(isRadius)) {
    v.forEach((item: unknown, i) => {
      if (isTokenObject(item)) checkTokenExpr(item, `${p}[${i}]`, checkNonNegative, out);
    });
    return;
  }
  add(out, p, 'esperava número maior ou igual a 0 ou lista de 4 números');
});

const checkFill = tokenCheck('color', (v, p, out) => {
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
    checkExpr(stop.color, join(sp, 'color'), checkColor, out);
  });
});

// ---------------------------------------------------------------------------------------
// Condições e expressões
// ---------------------------------------------------------------------------------------

function checkCondition(value: unknown, path: string, out: Ctx): void {
  if (!isRecord(value)) return add(out, path, 'esperava condição (objeto)');
  const ops = Object.keys(value).filter((k) => CONDITION_OPS.includes(k));
  if (ops.length !== 1) {
    if (ops.length === 0) {
      add(out, path, `condição sem operador (${CONDITION_OPS.join(', ')})`);
    } else {
      add(out, path, `condição com mais de um operador: ${ops.join(', ')}`);
    }
    return;
  }
  const op = ops[0] as string;
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
    case '$gt':
    case '$gte':
    case '$lt':
    case '$lte':
      return checkOperands(operand, at, { min: 2, max: 2 }, out);
    case '$and':
    case '$or':
      if (!Array.isArray(operand)) return add(out, at, 'esperava lista de condições');
      operand.forEach((c: unknown, i) => checkCondition(c, `${at}[${i}]`, out));
  }
}

const checkOperand = tokenCheck('number', (v, p, out) => {
  if (!isFiniteNumber(v)) add(out, p, 'precisa ser número');
});

/** Os operandos de uma operação numérica ou comparação: a aridade e cada `Expr<number>`. */
function checkOperands(
  operand: unknown,
  at: string,
  arity: { readonly min: number; readonly max: number | null },
  out: Ctx,
): void {
  if (arity.max === 1) {
    if (Array.isArray(operand)) return add(out, at, 'precisa de 1 operando');
    return checkExpr(operand, at, checkOperand, out);
  }
  if (!Array.isArray(operand)) return add(out, at, 'esperava lista de operandos');
  if (arity.max === arity.min && operand.length !== arity.min)
    return add(out, at, `precisa de ${arity.min} operandos`);
  if (operand.length < arity.min)
    return add(out, at, `precisa de ${arity.min} ou mais operandos`);
  operand.forEach((item: unknown, i) =>
    checkExpr(item, `${at}[${i}]`, checkOperand, out),
  );
}

/** `$add`, `$mul`, `$sin`…: só onde se espera número (ou como parte de um `$concat`). */
function checkNumericExpr(
  op: string,
  value: Rec,
  path: string,
  check: Check,
  out: Ctx,
): void {
  checkKeys(value, [op], path, out);
  if (check.tokenKind !== 'number' && !acceptsAnyValue(check))
    return add(out, path, `${op} só vale onde se espera número`);
  checkOperands(value[op], join(path, op), NUMERIC_OPS[op] as never, out);
}

/** `$rows` e `$size` (v4): números, então só onde se espera número (ou como parte de um `$concat`). */
function checkCountExpr(
  op: '$rows' | '$size',
  value: Rec,
  path: string,
  check: Check,
  out: Ctx,
): void {
  checkKeys(value, [op], path, out);
  if (check.tokenKind !== 'number' && !acceptsAnyValue(check))
    return add(out, path, `${op} só vale onde se espera número`);
  const at = join(path, op);
  if (op === '$rows') return checkFieldKey(value.$rows, at, out);
  if (value.$size !== 'width' && value.$size !== 'height')
    add(out, at, 'esperava "width" ou "height"');
}

function checkFieldKey(value: unknown, path: string, out: Ctx): void {
  if (typeof value !== 'string' || value === '')
    add(out, path, 'esperava chave de campo (texto não vazio)');
}

function checkTokenExpr(value: Rec, path: string, check: Check, out: Ctx): void {
  checkKeys(value, ['$token', 'alpha', 'over'], path, out);
  const at = join(path, '$token');
  const kind = check.tokenKind;
  if (kind === undefined)
    add(out, path, '$token só vale onde se espera cor, número ou família de fonte');
  const name = value.$token;
  if (typeof name !== 'string' || !TOKEN_NAME_PATTERN.test(name))
    add(out, at, 'esperava nome de token ([a-z0-9][a-z0-9-]*)');
  else if (kind !== undefined) out.refs?.push({ path, name, kind });
  if ('alpha' in value) checkTokenAlpha(value.alpha, path, kind, out);
  if ('over' in value) checkTokenOver(value.over, path, kind, out);
}

/**
 * `over` de um `$token` (v4): só em posição de cor; o nome de um token de cor (coletado como
 * referência de cor, para a biblioteca recusar o nome desconhecido) ou uma cor literal.
 */
function checkTokenOver(
  over: unknown,
  path: string,
  kind: TokenKind | undefined,
  out: Ctx,
): void {
  if (kind === undefined) return;
  if (kind !== 'color')
    return add(out, join(path, '$token'), 'over só vale em $token de cor');
  const at = join(path, 'over');
  if (typeof over !== 'string') return add(out, at, 'esperava nome de token ou cor');
  if (isLiteralColor(over)) return;
  if (!TOKEN_NAME_PATTERN.test(over))
    return add(out, at, 'esperava nome de token ([a-z0-9][a-z0-9-]*) ou cor');
  out.refs?.push({ path: at, name: over, kind: 'color' });
}

/** `alpha` de um `$token`: só em posição de cor; número de 0 a 1, literal ou `$token` de número. */
function checkTokenAlpha(
  alpha: unknown,
  path: string,
  kind: TokenKind | undefined,
  out: Ctx,
): void {
  if (kind === undefined) return;
  if (kind !== 'color')
    return add(out, join(path, '$token'), 'alpha só vale em $token de cor');
  checkLiteralOrToken(alpha, join(path, 'alpha'), checkUnit, out);
}

/** Uma posição que aceita texto ou número (o texto de um nó, o valor de um `provide`): operações numéricas valem nela. */
function acceptsAnyValue(check: Check): boolean {
  return check === checkTextOrNumber || check === checkProvided;
}

/** O valor de um `provide`: texto ou número, ou uma expressão (`$token` de cor entre elas). */
const checkProvided: Check = Object.assign(
  (v: unknown, p: string, out: Ctx) => checkTextOrNumber(v, p, out),
  { tokenKind: 'color' as TokenKind },
);

/** `provide` do slot (v4): nome → valor, o nome não vazio. */
function checkProvide(value: unknown, path: string, out: Ctx): void {
  if (!isRecord(value)) return add(out, path, 'esperava objeto');
  for (const [name, expr] of Object.entries(value)) {
    if (name.trim() === '') add(out, path, 'nome vazio');
    else checkExpr(expr, join(path, name), checkProvided, out);
  }
}

/** Confere uma expressão: operador (`$field`, `$if`…) ou o literal conferido por `check`. */
function checkExpr(value: unknown, path: string, check: Check, out: Ctx): void {
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
  const op = ops[0] as string;
  const at = join(path, op);
  if (isNumericOp(op)) return checkNumericExpr(op, value, path, check, out);
  if (op === '$rows' || op === '$size')
    return checkCountExpr(op, value, path, check, out);
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
    case '$token':
      return checkTokenExpr(value, path, check, out);
    case '$provided':
      // Só desenho: o que muda a geometria (tamanho, espaço, texto) não herda.
      if (check.tokenKind !== 'color')
        return add(out, path, '$provided só vale onde se espera cor');
      checkKeys(value, ['$provided', 'default'], path, out);
      if (typeof value.$provided !== 'string' || value.$provided.trim() === '')
        add(out, at, 'esperava nome da cor oferecida (texto não vazio)');
      if ('default' in value) checkExpr(value.default, join(path, 'default'), check, out);
      return;
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
function checkBoolExpr(value: unknown, path: string, out: Ctx): void {
  if (isRecord(value) && Object.keys(value).some((k) => DIRECT_CONDITION_OPS.includes(k)))
    return checkCondition(value, path, out);
  checkExpr(value, path, checkBoolean, out);
}

const checkSize = tokenCheck('number', (value, path, out) => {
  if (isFiniteNumber(value) && value >= 0) return;
  if (value === 'fill' || value === 'hug') return;
  if (typeof value === 'string' && PERCENT_PATTERN.test(value)) return;
  add(out, path, 'esperava número maior ou igual a 0, "fill", "hug" ou "<número>%"');
});

/** Como `checkSize`, mas sem `hug`: o nó `image` não depende da imagem baixada. */
const checkSizeNoHug = tokenCheck('number', (v, p, out) => {
  if (v === 'hug')
    add(out, p, 'o nó image não aceita hug: a arrumação não depende da imagem baixada');
  else checkSize(v, p, out);
});

const SIZE_LIMIT_AXES = [
  ['minWidth', 'maxWidth'],
  ['minHeight', 'maxHeight'],
] as const;

/** `width`/`height` (literal ou expressão), `min*`/`max*` e a ordem entre `min` e `max`. */
function checkNodeSizes(value: Rec, path: string, nodeType: string, out: Ctx): void {
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

function checkAnchors(value: unknown, path: string, out: Ctx): void {
  if (!isRecord(value)) return add(out, path, 'esperava objeto');
  checkKeys(value, ['left', 'right', 'top', 'bottom', 'centerX', 'centerY'], path, out);
  for (const key of ['left', 'right', 'top', 'bottom']) {
    if (key in value) checkExpr(value[key], join(path, key), checkNumber, out);
  }
  for (const key of ['centerX', 'centerY']) {
    if (key in value) checkBoolExpr(value[key], join(path, key), out);
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

/** `stroke.dash`: lista de números ≥ 0, cada item literal ou `$token` de número. */
const checkDash: Check = (v, p, out) => {
  if (!Array.isArray(v)) return add(out, p, 'esperava lista de números');
  v.forEach((n: unknown, i) =>
    checkLiteralOrToken(n, `${p}[${i}]`, checkNonNegative, out),
  );
};

/** As chaves da v4 do traço (`cap`, `join`, `sides`, `offset`); `sides` só em `frame` e `rect`, `offset` também em `ellipse`. */
function checkStrokeV4(
  value: Rec,
  path: string,
  nodeType: string | undefined,
  out: Ctx,
): void {
  if ('cap' in value)
    checkExpr(value.cap, join(path, 'cap'), oneOf(['butt', 'round', 'square']), out);
  if ('join' in value)
    checkExpr(value.join, join(path, 'join'), oneOf(['miter', 'round', 'bevel']), out);
  if ('scale' in value) checkBoolean(value.scale, join(path, 'scale'), out);
  if ('offset' in value) checkOffset(value.offset, join(path, 'offset'), nodeType, out);
  if (!('sides' in value)) return;
  const at = join(path, 'sides');
  if (nodeType !== undefined && nodeType !== 'frame' && nodeType !== 'rect')
    add(out, at, `só vale em frame e rect (este é ${nodeType})`);
  else checkExpr(value.sides, at, checkSides, out);
}

/** `stroke.offset`: px ≥ 0 (literal ou `$token` de número), só em `frame`, `rect` e `ellipse`. */
function checkOffset(
  value: unknown,
  path: string,
  nodeType: string | undefined,
  out: Ctx,
): void {
  if (nodeType !== undefined && !['frame', 'rect', 'ellipse'].includes(nodeType))
    add(out, path, `só vale em frame, rect e ellipse (este é ${nodeType})`);
  else checkLiteralOrToken(value, path, checkNonNegative, out);
}

function checkStroke(value: unknown, path: string, out: Ctx, nodeType?: string): void {
  if (!isRecord(value)) return add(out, path, 'esperava objeto');
  checkKeys(
    value,
    ['color', 'width', 'align', 'dash', 'cap', 'join', 'sides', 'scale', 'offset', 'gap'],
    path,
    out,
  );
  if (!('color' in value)) add(out, join(path, 'color'), 'campo obrigatório');
  else checkExpr(value.color, join(path, 'color'), checkColor, out);
  if ('width' in value)
    checkExpr(value.width, join(path, 'width'), checkNonNegative, out);
  if ('align' in value)
    oneOf(['inside', 'center', 'outside'])(value.align, join(path, 'align'), out);
  if ('dash' in value) checkExpr(value.dash, join(path, 'dash'), checkDash, out);
  checkStrokeV4(value, path, nodeType, out);
  if ('gap' in value) checkGap(value, join(path, 'gap'), nodeType, out);
}

/** `stroke.gap`: `{ node, padding? }`, só em `frame` e `rect` e nunca junto com `sides`. */
function checkGap(
  stroke: Rec,
  path: string,
  nodeType: string | undefined,
  out: Ctx,
): void {
  const value = stroke.gap;
  if (nodeType !== undefined && nodeType !== 'frame' && nodeType !== 'rect')
    return add(out, path, `só vale em frame e rect (este é ${nodeType})`);
  if (!isRecord(value)) return add(out, path, 'esperava objeto');
  checkKeys(value, ['node', 'padding'], path, out);
  if ('sides' in stroke) add(out, path, 'gap não vale com sides');
  if (!('node' in value)) add(out, join(path, 'node'), 'campo obrigatório');
  else checkString(value.node, join(path, 'node'), out);
  if ('padding' in value)
    checkExpr(value.padding, join(path, 'padding'), checkNumber, out);
}

/** Uma sombra (objeto): `color`, `x`, `y`, `blur` e `spread`. */
function checkShadowItem(value: unknown, path: string, out: Ctx): void {
  if (!isRecord(value)) return add(out, path, 'esperava objeto');
  checkKeys(value, ['color', 'x', 'y', 'blur', 'spread'], path, out);
  if (!('color' in value)) add(out, join(path, 'color'), 'campo obrigatório');
  else checkExpr(value.color, join(path, 'color'), checkColor, out);
  if ('x' in value) checkLiteralOrToken(value.x, join(path, 'x'), checkNumber, out);
  if ('y' in value) checkLiteralOrToken(value.y, join(path, 'y'), checkNumber, out);
  if ('blur' in value)
    checkLiteralOrToken(value.blur, join(path, 'blur'), checkNonNegative, out);
  if ('spread' in value)
    checkLiteralOrToken(value.spread, join(path, 'spread'), checkNumber, out);
}

/** `shadow`: uma sombra ou, na v4, uma lista de 1 a 4 (a versão é conferida à parte). */
function checkShadow(value: unknown, path: string, out: Ctx): void {
  if (!Array.isArray(value)) return checkShadowItem(value, path, out);
  if (value.length < 1 || value.length > MAX_SHADOWS)
    return add(out, path, `esperava de 1 a ${MAX_SHADOWS} sombras`);
  value.forEach((item: unknown, i) => checkShadowItem(item, `${path}[${i}]`, out));
}

/** `font.maxLines`: inteiro maior ou igual a 1. */
const checkPositiveInteger = tokenCheck('number', (v, p, out) => {
  if (!Number.isInteger(v) || (v as number) < 1)
    add(out, p, 'esperava inteiro maior ou igual a 1');
});

function checkFont(value: unknown, path: string, out: Ctx): void {
  if (!isRecord(value)) return add(out, path, 'esperava objeto');
  const specs: Record<string, Check> = {
    family: checkFamily,
    size: checkNumber,
    weight: checkWeight,
    italic: checkBoolean,
    lineHeight: checkNumber,
    letterSpacing: checkNumber,
    align: oneOf(['left', 'center', 'right', 'justify']),
    verticalAlign: oneOf(['top', 'middle', 'bottom', 'cap-middle']),
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

const checkPadding = tokenCheck('number', (value, path, out) => {
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
});

const checkLayoutType: Check = (v, p, out) => {
  if (v !== 'none' && v !== 'row' && v !== 'column')
    add(out, p, 'esperava "none", "row" ou "column"');
};

/** As chaves de um layout `row`/`column` (ou de `type` por expressão), na v4 também por expressão. */
function checkLayoutFlow(value: Rec, path: string, out: Ctx): void {
  checkKeys(value, ['type', 'gap', 'padding', 'align', 'justify', 'reverse'], path, out);
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
    checkExpr(value.justify, join(path, 'justify'), oneOf(LAYOUT_JUSTIFIES), out);
  if ('reverse' in value) checkBoolExpr(value.reverse, join(path, 'reverse'), out);
}

function checkLayout(value: unknown, path: string, out: Ctx): void {
  if (!isRecord(value)) return add(out, path, 'esperava objeto');
  if (value.type === 'none') return checkKeys(value, ['type'], path, out);
  const at = join(path, 'type');
  if (isExprObject(value.type)) checkExpr(value.type, at, checkLayoutType, out);
  else if (value.type !== 'row' && value.type !== 'column')
    return add(out, at, 'esperava "none", "row" ou "column"');
  checkLayoutFlow(value, path, out);
}

function checkViewBox(value: unknown, path: string, out: Ctx): void {
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
const checkRunPadding = tokenCheck('number', (v, p, out) => {
  const ok = (n: unknown): boolean => isFiniteNumber(n) && n >= 0;
  if (ok(v)) return;
  if (Array.isArray(v) && v.length === 2 && v.every(ok)) return;
  add(
    out,
    p,
    'esperava número ou lista [vertical, horizontal] de números (maiores ou iguais a 0)',
  );
});

/** Um trecho de `runs`: `text` obrigatório e o estilo, cada chave com literal ou expressão. */
function checkRun(value: unknown, path: string, out: Ctx): void {
  if (!isRecord(value)) return add(out, path, 'esperava objeto (trecho)');
  checkKeys(value, RUN_KEYS, path, out);
  if (!('text' in value)) add(out, join(path, 'text'), 'campo obrigatório');
  const specs: Record<string, Check> = {
    text: checkTextOrNumber,
    weight: checkWeight,
    color: checkColor,
    decoration: oneOf(['none', 'underline', 'line-through']),
    family: checkFamily,
    size: checkNumber,
    background: checkColor,
    radius: checkNonNegative,
    padding: checkRunPadding,
  };
  for (const [key, check] of Object.entries(specs))
    if (key in value) checkExpr(value[key], join(path, key), check, out);
  if ('italic' in value) checkBoolExpr(value.italic, join(path, 'italic'), out);
}

function checkRuns(value: unknown, path: string, out: Ctx): void {
  if (!Array.isArray(value) || value.length === 0)
    return add(out, path, 'esperava lista não vazia de trechos');
  value.forEach((run: unknown, i) => checkRun(run, `${path}[${i}]`, out));
}

/** Nó `text`: `text` ou `runs` (um dos dois), mais `font` e `color`. */
function checkTextNode(value: Rec, path: string, out: Ctx): void {
  const hasText = 'text' in value;
  const hasRuns = 'runs' in value;
  if (hasText && hasRuns) add(out, path, 'text e runs juntos: use um ou outro');
  else if (!hasText && !hasRuns) add(out, join(path, 'text'), 'campo obrigatório');
  if (hasText) checkExpr(value.text, join(path, 'text'), checkTextOrNumber, out);
  if (hasRuns) checkRuns(value.runs, join(path, 'runs'), out);
  if ('font' in value) checkFont(value.font, join(path, 'font'), out);
  if ('color' in value) checkExpr(value.color, join(path, 'color'), checkColor, out);
}

function checkNode(value: unknown, path: string, out: Ctx): void {
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
    slot: ['label', 'layout', 'provide'],
    repeat: ['field', 'count', 'direction', 'gap', 'distribute', 'template'],
    image: ['src', 'fit'],
    icon: ['name', 'color', 'strokeWidth'],
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

  if ('name' in value && type !== 'icon')
    checkString(value.name, join(path, 'name'), out);
  if ('visible' in value) checkBoolExpr(value.visible, join(path, 'visible'), out);
  if ('opacity' in value) checkExpr(value.opacity, join(path, 'opacity'), checkUnit, out);
  if ('rotation' in value)
    checkExpr(value.rotation, join(path, 'rotation'), checkNumber, out);
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
      if ('provide' in value) checkProvide(value.provide, join(path, 'provide'), out);
      return;
    case 'repeat':
      checkRepeat(value, path, out);
      return;
    case 'image':
      checkImage(value, path, out);
      return;
    case 'icon':
      checkIconNode(value, path, out);
      return;
  }
}

/** `icon` (formatVersion 4): `name` obrigatório (texto ou expressão), `color` e `strokeWidth`. */
function checkIconNode(value: Rec, path: string, out: Ctx): void {
  if (!('name' in value)) add(out, join(path, 'name'), 'campo obrigatório');
  else checkExpr(value.name, join(path, 'name'), checkString, out);
  if ('color' in value) checkExpr(value.color, join(path, 'color'), checkColor, out);
  if ('strokeWidth' in value)
    checkExpr(value.strokeWidth, join(path, 'strokeWidth'), checkNonNegative, out);
}

/**
 * `image` (formatVersion 3): `src` obrigatório e restrito (URL `https://` literal ou exatamente
 * `{ "$field": "<campo>" }`), `fit` e nenhum `hug` (conferido em `checkNodeSizes`: a arrumação não
 * depende da imagem baixada).
 * O host local não é erro de formato aqui: a política da app decide em tempo de execução.
 */
function checkImage(value: Rec, path: string, out: Ctx): void {
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
    oneOf(['cover', 'contain', 'fill', ...IMAGE_FITS_V4])(
      value.fit,
      join(path, 'fit'),
      out,
    );
}

const checkRepeatCount = tokenCheck('number', (v, p, out) => {
  if (!isFiniteNumber(v) || v < 0 || !Number.isInteger(v))
    add(out, p, 'esperava inteiro maior ou igual a 0');
});

/** `repeat`: exatamente um de `field` (as linhas de uma `table`) e `count` (uma contagem, v4). */
function checkRepeatSource(value: Rec, path: string, out: Ctx): void {
  const hasField = value.field !== undefined;
  const hasCount = value.count !== undefined;
  if (hasField && hasCount) add(out, path, 'use count ou field, não os dois');
  else if (!hasField && !hasCount) add(out, join(path, 'field'), 'campo obrigatório');
  if (hasField) checkFieldKey(value.field, join(path, 'field'), out);
  if (hasCount) checkExpr(value.count, join(path, 'count'), checkRepeatCount, out);
}

/** `repeat`: o campo `table`, a direção, o espaço e o `template` (um quadro, sem `repeat` nem `slot`). */
function checkRepeat(value: Rec, path: string, out: Ctx): void {
  checkRepeatSource(value, path, out);
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
  for (const nested of forbiddenInRepeat(template, at)) {
    add(out, nested.path, `${nested.type} não é permitido dentro de um repeat`);
  }
}

/**
 * Os `repeat` e `slot` do template de uma linha, sem entrar no `template` de um `repeat`
 * aninhado: o `checkRepeat` dele já reporta o que há lá dentro (uma vez só).
 */
function forbiddenInRepeat(
  node: unknown,
  path: string,
  found: { path: string; type: string }[] = [],
): { path: string; type: string }[] {
  if (!isRecord(node)) return found;
  if (node.type === 'repeat' || node.type === 'slot')
    found.push({ path: join(path, 'type'), type: node.type });
  if (node.type !== 'repeat' && Array.isArray(node.children))
    node.children.forEach((child: unknown, i) =>
      forbiddenInRepeat(child, `${join(path, 'children')}[${i}]`, found),
    );
  return found;
}

/** O erro de toda chave, nó ou expressão que só existe na formatVersion 4. */
const V4_ONLY_MESSAGE = 'só é permitido com formatVersion 4';

/** Caminhos (cadeias de chaves) das chaves que só existem na formatVersion 4, em qualquer nó. */
const V4_NODE_KEYS: readonly (readonly string[])[] = [
  ['stroke', 'cap'],
  ['stroke', 'join'],
  ['stroke', 'sides'],
  ['stroke', 'scale'],
  ['stroke', 'offset'],
  ['stroke', 'gap'],
  ['shadow', 'spread'],
  ['layout', 'reverse'],
  ['minWidth'],
  ['maxWidth'],
  ['minHeight'],
  ['maxHeight'],
  ['distribute'],
  ['count'],
  ['font', 'wrap'],
  ['font', 'ellipsis'],
  ['font', 'maxLines'],
  ['runs'],
  ['rotation'],
  ['provide'],
];

/** Chaves que valem em qualquer versão como literal, mas só com expressão na formatVersion 4. */
const V4_EXPR_KEYS: readonly (readonly string[])[] = [
  ['stroke', 'dash'],
  ['width'],
  ['height'],
  ['layout', 'type'],
  ['layout', 'align'],
  ['layout', 'justify'],
  ['anchors', 'left'],
  ['anchors', 'right'],
  ['anchors', 'top'],
  ['anchors', 'bottom'],
  ['anchors', 'centerX'],
  ['anchors', 'centerY'],
];

/** Valores literais que só existem na formatVersion 4: a cadeia da chave e o valor. */
const V4_LITERAL_VALUES: readonly (readonly [readonly string[], string])[] = [
  [['font', 'verticalAlign'], 'cap-middle'],
  [['font', 'align'], 'justify'],
  ...IMAGE_FITS_V4.map((fit): readonly [readonly string[], string] => [['fit'], fit]),
  [['layout', 'justify'], 'space-around'],
  [['layout', 'justify'], 'space-evenly'],
];

/** `shadow` como lista (v4) numa versão anterior à 4: `só é permitido com formatVersion 4`, no caminho de `shadow`. */
function shadowListVersionIssues(version: unknown, template: unknown): ComponentIssue[] {
  const out: ComponentIssue[] = [];
  if (typeof version === 'number' && version >= COMPONENT_FORMAT_VERSION_FIDELITY)
    return out;
  const walk = (node: unknown, at: string): void => {
    if (!isRecord(node)) return;
    if (Array.isArray(node.shadow)) addIssue(out, join(at, 'shadow'), V4_ONLY_MESSAGE);
    if (Array.isArray(node.children))
      node.children.forEach((c: unknown, i) => walk(c, `${join(at, 'children')}[${i}]`));
    if (node.type === 'repeat') walk(node.template, join(at, 'template'));
  };
  walk(template, 'template');
  return out;
}

/** O nome que o desenho dá ao nó (`name`, ou o tipo; num ícone, o nome do ícone literal). */
function templateNodeName(node: Rec): string | undefined {
  const type = typeof node.type === 'string' ? node.type : undefined;
  if (type === 'icon') return typeof node.name === 'string' ? node.name : 'icon';
  if (typeof node.name === 'string') return node.name;
  return type;
}

/**
 * Os nomes dos nós do template (pelos `children`; com `viaRepeat`, também pelo `template` dos
 * `repeat`).
 */
function templateNames(
  node: unknown,
  viaRepeat = true,
  names: Set<string> = new Set(),
): Set<string> {
  if (!isRecord(node)) return names;
  const own = templateNodeName(node);
  if (own !== undefined) names.add(own);
  if (Array.isArray(node.children))
    node.children.forEach((c) => templateNames(c, viaRepeat, names));
  if (viaRepeat && node.type === 'repeat') templateNames(node.template, viaRepeat, names);
  return names;
}

/** Por que o `stroke.gap.node` de `node` não abre vão (o vão só se abre num nó fora de `repeat` e que não é o próprio). */
function gapNodeProblem(
  node: Rec,
  target: string,
  inRepeat: boolean,
  known: { all: Set<string>; direct: Set<string> },
): string | undefined {
  if (!known.all.has(target)) return `nó não encontrado: ${target}`;
  if (inRepeat) return 'stroke.gap não pode ser usado dentro de um repeat';
  if (templateNodeName(node) === target)
    return `stroke.gap.node não pode citar o próprio nó: ${target}`;
  if (!known.direct.has(target))
    return `stroke.gap.node não pode citar um nó dentro de um repeat: ${target}`;
  return undefined;
}

/**
 * `stroke.gap.node` precisa citar o nome de outro nó do template, fora de `repeat` (`nó não
 * encontrado: <nome>`); dentro de um `repeat` ou citando o próprio nó o vão não abriria.
 */
function checkGapNodes(template: unknown, out: Ctx): void {
  const known = { all: templateNames(template), direct: templateNames(template, false) };
  const walk = (node: unknown, at: string, inRepeat: boolean): void => {
    if (!isRecord(node)) return;
    const gap = isRecord(node.stroke) ? node.stroke.gap : undefined;
    if (isRecord(gap) && typeof gap.node === 'string') {
      const problem = gapNodeProblem(node, gap.node, inRepeat, known);
      if (problem !== undefined) add(out, join(at, 'stroke.gap.node'), problem);
    }
    if (Array.isArray(node.children))
      node.children.forEach((c: unknown, i) =>
        walk(c, `${join(at, 'children')}[${i}]`, inRepeat),
      );
    if (node.type === 'repeat') walk(node.template, join(at, 'template'), true);
  };
  walk(template, 'template', false);
}

/** `$token` em qualquer ponto do template, numa versão anterior à 4: `só é permitido com formatVersion 4`. */
function tokenVersionIssues(version: unknown, template: unknown): ComponentIssue[] {
  const out: ComponentIssue[] = [];
  if (typeof version === 'number' && version >= COMPONENT_FORMAT_VERSION_FIDELITY)
    return out;
  const walk = (node: unknown, at: string): void => {
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${at}[${i}]`));
    if (!isRecord(node)) return;
    if ('$token' in node) addIssue(out, at, V4_ONLY_MESSAGE);
    for (const [key, value] of Object.entries(node)) walk(value, join(at, key));
  };
  walk(template, 'template');
  return out;
}

/** As chaves de expressão novas da v4 (operações, comparações, `$rows` e `$size`). */
function isV4OnlyOp(key: string): boolean {
  return (
    isNumericOp(key) ||
    key === '$rows' ||
    key === '$size' ||
    key === '$provided' ||
    (COMPARISON_OPS as readonly string[]).includes(key)
  );
}

/** Operação numérica ou comparação (`$mul`, `$gt`…) numa versão anterior à 4: `só é permitido com formatVersion 4`, no caminho da chave. */
function numericVersionIssues(version: unknown, template: unknown): ComponentIssue[] {
  const out: ComponentIssue[] = [];
  if (typeof version === 'number' && version >= COMPONENT_FORMAT_VERSION_FIDELITY)
    return out;
  const walk = (node: unknown, at: string): void => {
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${at}[${i}]`));
    if (!isRecord(node)) return;
    for (const [key, value] of Object.entries(node)) {
      const here = join(at, key);
      if (isV4OnlyOp(key)) addIssue(out, here, V4_ONLY_MESSAGE);
      walk(value, here);
    }
  };
  walk(template, 'template');
  return out;
}

/** A chave cita `$index` (`$field`, `$has`, `$switch` ou o primeiro item de `$eq`)? Devolve o sufixo do caminho. */
function indexCitation(key: string, value: unknown): string | undefined {
  if ((key === '$field' || key === '$has' || key === '$switch') && value === '$index')
    return '';
  if (key === '$eq' && Array.isArray(value) && value[0] === '$index') return '[0]';
  return undefined;
}

/**
 * `$index` (o índice da linha de um `repeat`): antes da 4 `só é permitido com formatVersion 4`; na 4,
 * só vale dentro do `template` de um `repeat`. O caminho é o da chave que o cita.
 */
function indexIssues(version: unknown, template: unknown): ComponentIssue[] {
  const out: ComponentIssue[] = [];
  const v4 = typeof version === 'number' && version >= COMPONENT_FORMAT_VERSION_FIDELITY;
  const flag = (at: string, inRepeat: boolean): void => {
    if (!v4) addIssue(out, at, V4_ONLY_MESSAGE);
    else if (!inRepeat) addIssue(out, at, '$index só vale dentro de um repeat');
  };
  const walk = (node: unknown, at: string, inRepeat: boolean): void => {
    if (Array.isArray(node))
      return node.forEach((n, i) => walk(n, `${at}[${i}]`, inRepeat));
    if (!isRecord(node)) return;
    for (const [key, value] of Object.entries(node)) {
      const here = join(at, key);
      const cited = indexCitation(key, value);
      if (cited !== undefined) flag(`${here}${cited}`, inRepeat);
      walk(value, here, inRepeat || (node.type === 'repeat' && key === 'template'));
    }
  };
  walk(template, 'template', false);
  return out;
}

/** O nó `icon` numa versão anterior à 4: `só é permitido com formatVersion 4`, no caminho do `type`. */
function iconVersionIssues(version: unknown, template: unknown): ComponentIssue[] {
  if (typeof version === 'number' && version >= COMPONENT_FORMAT_VERSION_FIDELITY)
    return [];
  return nodesOfTypes(template, 'template', ['icon']).map((node) =>
    issueOf(node.path, V4_ONLY_MESSAGE),
  );
}

/**
 * A regra genérica da v4: para cada nó da árvore (`children` e `template` do repeat) que traz uma
 * das chaves de `keys` (cadeias como `['stroke', 'cap']`), numa versão anterior à 4, devolve
 * `só é permitido com formatVersion 4` no caminho da chave. As fases seguintes só acrescentam
 * cadeias a `V4_NODE_KEYS`. As cadeias de `exprKeys` só contam quando o valor é uma expressão
 * (objeto com operador `$…`): o literal continua valendo em todas as versões. `literals` são
 * valores literais novos de uma chave que já existia (`font.verticalAlign: "cap-middle"`); o mesmo
 * valor vindo de expressão não tem caso especial (fica fora do conjunto da versão no desenho).
 */
export function v4OnlyKeyIssues(
  version: unknown,
  node: unknown,
  path: string,
  keys: readonly (readonly string[])[],
  exprKeys: readonly (readonly string[])[] = [],
  literals: readonly (readonly [readonly string[], string])[] = [],
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
        addIssue(out, [at, ...chain].filter((x) => x !== '').join('.'), V4_ONLY_MESSAGE);
    };
    keys.forEach((chain) => flag(chain, false));
    exprKeys.forEach((chain) => flag(chain, true));
    for (const [chain, value] of literals) {
      let cursor: unknown = n;
      for (const key of chain) cursor = isRecord(cursor) ? cursor[key] : undefined;
      if (cursor === value)
        addIssue(out, [at, ...chain].filter((x) => x !== '').join('.'), V4_ONLY_MESSAGE);
    }
    if (Array.isArray(n.children))
      n.children.forEach((c: unknown, i) => walk(c, `${join(at, 'children')}[${i}]`));
    if (n.type === 'repeat') walk(n.template, join(at, 'template'));
  };
  walk(node, path);
  return out;
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
  out: Ctx,
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
  'screen',
  'preview',
  'template',
];

/** `sizing`: `{ width?, height? }`, cada eixo px (≥ 0), `"fill"` ou `"hug"`. */
function checkSizing(value: unknown, path: string, out: Ctx): void {
  if (!isRecord(value)) return add(out, path, 'esperava objeto { width?, height? }');
  checkKeys(value, ['width', 'height'], path, out);
  for (const key of ['width', 'height']) {
    if (!(key in value)) continue;
    const v = value[key];
    if (v === 'fill' || v === 'hug' || (isFiniteNumber(v) && v >= 0)) continue;
    add(out, join(path, key), 'esperava número maior ou igual a 0, "fill" ou "hug"');
  }
}

/** `screen` (só v4, só na raiz): objeto com `anchor` opcional, de `SCREEN_ANCHORS`. */
function checkScreen(value: unknown, path: string, out: Ctx): void {
  if (!isRecord(value)) return add(out, path, 'esperava objeto');
  checkKeys(value, ['anchor'], path, out);
  if ('anchor' in value) oneOf(SCREEN_ANCHORS)(value.anchor, join(path, 'anchor'), out);
}

/** Todos os problemas do arquivo, com caminho e mensagem separados; lista vazia = válido. */
function collectIssues(input: unknown, refs: TokenRef[] | null): ComponentIssue[] {
  const issues: ComponentIssue[] = [];
  const out: Ctx = { issues, refs };
  if (!isRecord(input)) {
    add(out, 'componente', 'esperava objeto');
    return issues;
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

  if ('screen' in input) {
    checkScreen(input.screen, 'screen', out);
    if (typeof version === 'number' && version < COMPONENT_FORMAT_VERSION_FIDELITY)
      add(out, 'screen', V4_ONLY_MESSAGE);
  }

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
    if (
      typeof version === 'number' &&
      version >= COMPONENT_FORMAT_VERSION_FIDELITY &&
      isRecord(input.template) &&
      'rotation' in input.template
    )
      add(out, 'template.rotation', 'não vale na raiz');
    checkNode(input.template, 'template', out);
    checkGapNodes(input.template, out);
    if (version === 1) {
      for (const node of nodesOfTypes(input.template, 'template', ['repeat'])) {
        add(out, node.path, 'o nó repeat só existe na formatVersion 2');
      }
    }
    issues.push(
      ...v4OnlyKeyIssues(
        version,
        input.template,
        'template',
        V4_NODE_KEYS,
        V4_EXPR_KEYS,
        V4_LITERAL_VALUES,
      ),
    );
    issues.push(...shadowListVersionIssues(version, input.template));
    issues.push(...tokenVersionIssues(version, input.template));
    issues.push(...numericVersionIssues(version, input.template));
    issues.push(...indexIssues(version, input.template));
    if (version === 1 || version === 2) {
      for (const node of nodesOfTypes(input.template, 'template', ['image'])) {
        add(out, node.path, 'o nó image só existe na formatVersion 3');
      }
    }
    issues.push(...iconVersionIssues(version, input.template));
  }
  return issues;
}

/** Linhas do `preview` de um campo `table`: objetos com valores texto, número ou null. */
function checkPreviewRows(rows: unknown[], path: string, out: Ctx): void {
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
  return collectIssues(input, null).map(formatIssue);
}

/** Os problemas do arquivo e os `$token` que ele cita (a coleta é local a esta chamada). */
function collectWithRefs(input: unknown): { issues: ComponentIssue[]; refs: TokenRef[] } {
  const refs: TokenRef[] = [];
  return { issues: collectIssues(input, refs), refs };
}

/** Valida um JSON já lido (não lança). */
export function parseComponent(input: unknown): ComponentParseResult {
  const { issues, refs } = collectWithRefs(input);
  if (issues.length > 0) return { ok: false, issues, errors: issues.map(formatIssue) };
  const component = input as ComponentFile;
  return {
    ok: true,
    component,
    warnings: collectWarnings(component.template, 'template'),
    tokenRefs: refs,
  };
}

/** Aviso de um `family` literal (no `font` do nó ou num trecho) que o CSS não aceita. */
function familyWarning(holder: unknown, path: string): ComponentIssue[] {
  const family = isRecord(holder) ? holder.family : undefined;
  if (typeof family !== 'string' || isValidFontFamily(family)) return [];
  return [
    issueOf(
      join(path, 'family'),
      `família de fonte inválida para o CSS (${JSON.stringify(family)}): o texto cai em sans-serif`,
    ),
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
    const issues: ComponentIssue[] = [
      {
        path: '',
        message: `JSON inválido: ${message}`,
        code: 'library.invalidJson',
        params: { detail: message },
      },
    ];
    return { ok: false, issues, errors: issues.map(formatIssue) };
  }
  return parseComponent(json);
}

/** Chaves de campo citadas em qualquer ponto do template, ordenadas e sem repetição. */
export function collectFieldKeys(component: ComponentFile): string[] {
  return [...referencedFields(component.template)].sort();
}
