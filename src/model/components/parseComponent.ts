/**
 * Component engine (Library stage): validation of the `mapping-component` file (`componentFormat.ts`).
 *
 * Hand-written narrowing over `unknown` (no zod). The format is strict: an unknown key
 * in a node or expression is a problem, so that typos show up. Each problem is
 * `"<path>: <message>"`, with the JSON path (`template.children[1].text`); problems at the
 * root use the key's name (`format`).
 */
import {
  COMPONENT_FORMAT,
  COMPONENT_FORMAT_VERSIONS,
  COMPONENT_FORMAT_VERSION_FIDELITY,
  DIRECTIONS,
  IMAGE_FITS_V4,
  SCREEN_ANCHORS,
  ANCHOR_ALIGNS,
  ANCHOR_SIDES,
  STROKE_SIDES,
  type ComponentFile,
} from './componentFormat';
import { checkRemoteImageUrl } from '../remoteImages';
import { isValidFontFamily } from './fontFamily';
import {
  ANCHOR_FIELDS,
  COMPARISON_OPS,
  NUMERIC_OPS,
  isAnchorFieldName,
  isNumericOp,
  referencedFields,
} from './expressions';
import {
  LAYOUT_JUSTIFIES,
  LAYOUT_WRAPS,
  NONE_ALIGNS,
  NONE_JUSTIFIES,
  isIntrinsicSize,
} from './layoutValues';
import { TOKEN_NAME_PATTERN, isLiteralColor, type TokenKind } from './tokens';
import { isRecord } from '../isRecord';
import { expandVariables, variableSyntaxPaths } from './variables';
import type { ModelMessageTemplateCode } from '../messages';
import { componentCodeForText } from '../messages/textLookup';

/**
 * A problem in the file: JSON path (empty = whole file) and message (default text). `code` and
 * `params` are those of the catalog (`src/model/messages/`): the interface translates through them.
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
      /** Each `$token` in the file, for the library to check against the specialization's `tokens`. */
      tokenRefs: TokenRef[];
      /**
       * Maps a path of the component as read (with the `$var`s substituted) to that of the written
       * file, with the `$var(<name>)` of the place of use; the identity when the file has no variables.
       */
      rewrite: (path: string) => string;
    }
  | { ok: false; issues: ComponentIssue[]; errors: string[] };

/** A `{ "$token": … }` in the file: where it is, the name and the kind of value the position expects. */
export type TokenRef = { path: string; name: string; kind: TokenKind };

type Rec = Record<string, unknown>;

/** The context of a validation: the problems and, when requested, where `$token` collects the references. */
type Ctx = {
  readonly issues: ComponentIssue[];
  readonly refs: TokenRef[] | null;
};

type LiteralCheck = (value: unknown, path: string, out: Ctx) => void;

/**
 * Checks a literal (a value that is not an expression) and appends the problems to `out`.
 * `tokenKind` is the explicit discriminant of the kind of `$token` the position accepts; without
 * it, the position does not accept a token.
 */
type Check = LiteralCheck & { readonly tokenKind?: TokenKind };

/** Marks the `check` as accepting a `$token` of kind `kind`. */
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
  '$lines',
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
  '$direction',
  ...COMPARISON_OPS,
];
/** Operators that only exist in a condition (`$field` is ambiguous and stays an expression). */
const DIRECT_CONDITION_OPS: readonly string[] = [
  '$eq',
  '$has',
  '$not',
  '$and',
  '$or',
  '$direction',
  ...COMPARISON_OPS,
];
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const PERCENT_PATTERN = /^\d+(\.\d+)?%$/;

/** Maximum number of shadows per node (`shadow` as a list, v4). */
const MAX_SHADOWS = 4;

/** Style keys the `repeat` does not have: the drawing belongs to each row's `template`. */
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
  'span',
  'weight',
  'direction',
];

/** An object with some `$…` operator: an expression, not a literal. */
function isExprObject(value: unknown): value is Rec {
  return isRecord(value) && Object.keys(value).some((k) => k.startsWith('$'));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function join(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

/** The problem with the code and parameters that the catalog finds by the text. */
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

/** Adds "unknown key" for each key outside `allowed`. */
function checkKeys(value: Rec, allowed: readonly string[], path: string, out: Ctx): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) add(out, join(path, key), `unknown key: ${key}`);
  }
}

// ---------------------------------------------------------------------------------------
// Literals
// ---------------------------------------------------------------------------------------

const checkBoolean: Check = (v, p, out) => {
  if (typeof v !== 'boolean') add(out, p, 'expected a boolean');
};

const checkNumber = tokenCheck('number', (v, p, out) => {
  if (!isFiniteNumber(v)) add(out, p, 'expected a number');
});

const checkNonNegative = tokenCheck('number', (v, p, out) => {
  if (!isFiniteNumber(v) || v < 0)
    add(out, p, 'expected a number greater than or equal to 0');
});

const checkUnit = tokenCheck('number', (v, p, out) => {
  if (!isFiniteNumber(v) || v < 0 || v > 1)
    add(out, p, 'expected a number between 0 and 1');
});

const checkWeight = tokenCheck('number', (v, p, out) => {
  if (!isFiniteNumber(v) || v < 100 || v > 900)
    add(out, p, 'expected a weight between 100 and 900');
});

const checkString: Check = (v, p, out) => {
  if (typeof v !== 'string') add(out, p, 'expected text');
};

/** `font.family` (and a run's `family`): text; accepts a family `$token`. */
const checkFamily = tokenCheck('family', (v, p, out) => checkString(v, p, out));

const checkTextOrNumber: Check = (v, p, out) => {
  if (typeof v !== 'string' && !isFiniteNumber(v))
    add(out, p, 'expected text or a number');
};

const checkColor = tokenCheck('color', (v, p, out) => {
  if (typeof v !== 'string' || v.trim() === '')
    add(out, p, 'expected a color (non-empty text)');
});

function oneOf(options: readonly string[]): Check {
  return (v, p, out) => {
    if (typeof v !== 'string' || !options.includes(v))
      add(out, p, `expected one of: ${options.join(', ')}`);
  };
}

/** A bare `{ "$token": … }` (with no other expression): for the positions that only accepted a literal. */
function isTokenObject(value: unknown): value is Rec {
  return isRecord(value) && '$token' in value;
}

/** Checks a literal that in v4 also accepts `$token` (and only `$token`: no other expression). */
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
  add(out, p, 'expected a number greater than or equal to 0 or a list of 4 numbers');
});

const checkFill = tokenCheck('color', (v, p, out) => {
  if (typeof v === 'string') return checkColor(v, p, out);
  if (!isRecord(v)) return add(out, p, 'expected a color or gradient');
  checkKeys(v, ['type', 'angle', 'stops'], p, out);
  if (v.type !== 'linear') add(out, join(p, 'type'), 'expected "linear"');
  if (!isFiniteNumber(v.angle)) add(out, join(p, 'angle'), 'expected a number');
  const stops = join(p, 'stops');
  if (!Array.isArray(v.stops)) return add(out, stops, 'expected a list of stops');
  if (v.stops.length < 2) add(out, stops, 'expected at least 2 stops');
  v.stops.forEach((stop: unknown, i) => {
    const sp = `${stops}[${i}]`;
    if (!isRecord(stop)) return add(out, sp, 'expected an object');
    checkKeys(stop, ['offset', 'color'], sp, out);
    checkUnit(stop.offset, join(sp, 'offset'), out);
    checkExpr(stop.color, join(sp, 'color'), checkColor, out);
  });
});

// ---------------------------------------------------------------------------------------
// Conditions and expressions
// ---------------------------------------------------------------------------------------

function checkCondition(value: unknown, path: string, out: Ctx): void {
  if (!isRecord(value)) return add(out, path, 'expected a condition (object)');
  const ops = Object.keys(value).filter((k) => CONDITION_OPS.includes(k));
  if (ops.length !== 1) {
    if (ops.length === 0) {
      add(out, path, `condition without an operator (${CONDITION_OPS.join(', ')})`);
    } else {
      add(out, path, `condition with more than one operator: ${ops.join(', ')}`);
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
        add(out, at, 'expected a field key (non-empty text)');
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
          'expected a list [field, value] with a text field and a text or number value',
        );
      return;
    case '$not':
      return checkCondition(operand, at, out);
    case '$direction':
      return oneOf(DIRECTIONS)(operand, at, out);
    case '$gt':
    case '$gte':
    case '$lt':
    case '$lte':
      return checkOperands(operand, at, { min: 2, max: 2 }, out);
    case '$and':
    case '$or':
      if (!Array.isArray(operand)) return add(out, at, 'expected a list of conditions');
      operand.forEach((c: unknown, i) => checkCondition(c, `${at}[${i}]`, out));
  }
}

const checkOperand = tokenCheck('number', (v, p, out) => {
  if (!isFiniteNumber(v)) add(out, p, 'must be a number');
});

/** The operands of a numeric operation or comparison: the arity and each `Expr<number>`. */
function checkOperands(
  operand: unknown,
  at: string,
  arity: { readonly min: number; readonly max: number | null },
  out: Ctx,
): void {
  if (arity.max === 1) {
    if (Array.isArray(operand)) return add(out, at, 'needs 1 operand');
    return checkExpr(operand, at, checkOperand, out);
  }
  if (!Array.isArray(operand)) return add(out, at, 'expected a list of operands');
  if (arity.max === arity.min && operand.length !== arity.min)
    return add(out, at, `needs ${arity.min} operands`);
  if (operand.length < arity.min)
    return add(out, at, `needs ${arity.min} or more operands`);
  operand.forEach((item: unknown, i) =>
    checkExpr(item, `${at}[${i}]`, checkOperand, out),
  );
}

/** `$add`, `$mul`, `$sin`…: only where a number is expected (or as part of a `$concat`). */
function checkNumericExpr(
  op: string,
  value: Rec,
  path: string,
  check: Check,
  out: Ctx,
): void {
  checkKeys(value, [op], path, out);
  if (check.tokenKind !== 'number' && !acceptsAnyValue(check))
    return add(out, path, `${op} is only valid where a number is expected`);
  checkOperands(value[op], join(path, op), NUMERIC_OPS[op] as never, out);
}

/** `$rows`, `$size` and `$lines` (v4): numbers, so only where a number is expected (or as part of a `$concat`). */
function checkCountExpr(
  op: '$rows' | '$size' | '$lines',
  value: Rec,
  path: string,
  check: Check,
  out: Ctx,
): void {
  checkKeys(value, [op], path, out);
  if (check.tokenKind !== 'number' && !acceptsAnyValue(check))
    return add(out, path, `${op} is only valid where a number is expected`);
  const at = join(path, op);
  if (op === '$rows') return checkFieldKey(value.$rows, at, out);
  if (op === '$lines') {
    if (typeof value.$lines !== 'string' || value.$lines.trim() === '')
      add(out, at, 'expected the name of a text node (non-empty text)');
    return;
  }
  if (value.$size !== 'width' && value.$size !== 'height')
    add(out, at, 'expected "width" or "height"');
}

function checkFieldKey(value: unknown, path: string, out: Ctx): void {
  if (typeof value !== 'string' || value === '')
    add(out, path, 'expected a field key (non-empty text)');
}

function checkTokenExpr(value: Rec, path: string, check: Check, out: Ctx): void {
  checkKeys(value, ['$token', 'alpha', 'over'], path, out);
  const at = join(path, '$token');
  const kind = check.tokenKind;
  if (kind === undefined)
    add(
      out,
      path,
      '$token is only valid where a color, a number or a font family is expected',
    );
  const name = value.$token;
  if (typeof name !== 'string' || !TOKEN_NAME_PATTERN.test(name))
    add(out, at, 'expected a token name ([a-z0-9][a-z0-9-]*)');
  else if (kind !== undefined) out.refs?.push({ path, name, kind });
  if ('alpha' in value) checkTokenAlpha(value.alpha, path, kind, out);
  if ('over' in value) checkTokenOver(value.over, path, kind, out);
}

/**
 * `over` of a `$token` (v4): only in a color position; the name of a color token (collected as
 * a color reference, so the library rejects the unknown name) or a literal color.
 */
function checkTokenOver(
  over: unknown,
  path: string,
  kind: TokenKind | undefined,
  out: Ctx,
): void {
  if (kind === undefined) return;
  if (kind !== 'color')
    return add(out, join(path, '$token'), 'over is only valid in a color $token');
  const at = join(path, 'over');
  if (typeof over !== 'string') return add(out, at, 'expected a token name or a color');
  if (isLiteralColor(over)) return;
  if (!TOKEN_NAME_PATTERN.test(over))
    return add(out, at, 'expected a token name ([a-z0-9][a-z0-9-]*) or a color');
  out.refs?.push({ path: at, name: over, kind: 'color' });
}

/** `alpha` of a `$token`: only in a color position; a number from 0 to 1, literal or a number `$token`. */
function checkTokenAlpha(
  alpha: unknown,
  path: string,
  kind: TokenKind | undefined,
  out: Ctx,
): void {
  if (kind === undefined) return;
  if (kind !== 'color')
    return add(out, join(path, '$token'), 'alpha is only valid on a color $token');
  checkLiteralOrToken(alpha, join(path, 'alpha'), checkUnit, out);
}

/** A position that accepts text or a number (a node's text, a `provide`'s value): numeric operations are valid in it. */
function acceptsAnyValue(check: Check): boolean {
  return (
    check === checkTextOrNumber || check === checkProvided || check === checkSizingAxis
  );
}

/** The value of a `provide`: text or a number, or an expression (a color `$token` among them). */
const checkProvided: Check = Object.assign(
  (v: unknown, p: string, out: Ctx) => checkTextOrNumber(v, p, out),
  { tokenKind: 'color' as TokenKind },
);

/** The slot's `provide` (v4): name → value, the name non-empty. */
function checkProvide(value: unknown, path: string, out: Ctx): void {
  if (!isRecord(value)) return add(out, path, 'expected an object');
  for (const [name, expr] of Object.entries(value)) {
    if (name.trim() === '') add(out, path, 'empty name');
    else checkExpr(expr, join(path, name), checkProvided, out);
  }
}

/** Checks an expression: an operator (`$field`, `$if`…) or the literal checked by `check`. */
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
    add(out, path, `expression with more than one operator: ${ops.join(', ')}`);
    return;
  }
  const op = ops[0] as string;
  const at = join(path, op);
  if (isNumericOp(op)) return checkNumericExpr(op, value, path, check, out);
  if (op === '$rows' || op === '$size' || op === '$lines')
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
      if (!('then' in value)) add(out, join(path, 'then'), 'required field');
      else checkExpr(value.then, join(path, 'then'), check, out);
      if ('else' in value) checkExpr(value.else, join(path, 'else'), check, out);
      return;
    case '$switch': {
      checkKeys(value, ['$switch', 'cases', 'default'], path, out);
      checkFieldKey(value.$switch, at, out);
      const cases = join(path, 'cases');
      if (!isRecord(value.cases)) add(out, cases, 'expected an object of cases');
      else
        for (const [key, c] of Object.entries(value.cases))
          checkExpr(c, join(cases, key), check, out);
      if ('default' in value) checkExpr(value.default, join(path, 'default'), check, out);
      return;
    }
    case '$token':
      return checkTokenExpr(value, path, check, out);
    case '$provided':
      // Drawing only: what changes the geometry (size, spacing, text) is not inherited.
      if (check.tokenKind !== 'color')
        return add(out, path, '$provided is only valid where a color is expected');
      checkKeys(value, ['$provided', 'default'], path, out);
      if (typeof value.$provided !== 'string' || value.$provided.trim() === '')
        add(out, at, 'expected the name of the provided color (non-empty text)');
      if ('default' in value) checkExpr(value.default, join(path, 'default'), check, out);
      return;
    case '$concat':
      checkKeys(value, ['$concat'], path, out);
      if (!Array.isArray(value.$concat)) return add(out, at, 'expected a list of parts');
      value.$concat.forEach((part: unknown, i) =>
        checkExpr(part, `${at}[${i}]`, checkTextOrNumber, out),
      );
  }
}

// ---------------------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------------------

/** `BoolExpr`: a direct condition (`$has`, `$not`…) or a boolean expression (`$field`, `$if`…). */
function checkBoolExpr(value: unknown, path: string, out: Ctx): void {
  if (isRecord(value) && Object.keys(value).some((k) => DIRECT_CONDITION_OPS.includes(k)))
    return checkCondition(value, path, out);
  checkExpr(value, path, checkBoolean, out);
}

/** `min-content`/`max-content` are valid values here; the version (only 4) is checked by `V4_LITERAL_VALUES`. */
const checkSize = tokenCheck('number', (value, path, out) => {
  if (isFiniteNumber(value) && value >= 0) return;
  if (value === 'fill' || value === 'hug' || isIntrinsicSize(value)) return;
  if (typeof value === 'string' && PERCENT_PATTERN.test(value)) return;
  add(
    out,
    path,
    'expected a number greater than or equal to 0, "fill", "hug", "min-content", "max-content" or "<number>%"',
  );
});

/** Like `checkSize`, but without `hug` or the intrinsic measure: the `image` node does not depend on the downloaded image. */
const checkSizeNoHug = tokenCheck('number', (v, p, out) => {
  if (v === 'hug')
    add(
      out,
      p,
      'the image node does not accept hug: the layout does not depend on the downloaded image',
    );
  else if (isIntrinsicSize(v))
    add(
      out,
      p,
      'the image node does not accept min-content or max-content: the layout does not depend on the downloaded image',
    );
  else checkSize(v, p, out);
});

const SIZE_LIMIT_AXES = [
  ['minWidth', 'maxWidth'],
  ['minHeight', 'maxHeight'],
] as const;

/** `width`/`height` (literal or expression), `min*`/`max*` and the order between `min` and `max`. */
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
      add(out, join(path, min), `cannot be greater than ${max}`);
  }
}

function checkAnchors(value: unknown, path: string, out: Ctx): void {
  if (!isRecord(value)) return add(out, path, 'expected an object');
  checkKeys(
    value,
    ['left', 'right', 'start', 'end', 'top', 'bottom', 'centerX', 'centerY'],
    path,
    out,
  );
  for (const key of ['left', 'right', 'start', 'end', 'top', 'bottom']) {
    if (key in value) checkExpr(value[key], join(path, key), checkNumber, out);
  }
  if ('start' in value && 'left' in value)
    add(out, join(path, 'start'), 'does not combine with left');
  if ('end' in value && 'right' in value)
    add(out, join(path, 'end'), 'does not combine with right');
  for (const key of ['centerX', 'centerY']) {
    if (key in value) checkBoolExpr(value[key], join(path, key), out);
  }
}

/** `stroke.sides`: a non-empty list of sides, without repetition. */
const checkSides: Check = (v, p, out) => {
  if (!Array.isArray(v)) return add(out, p, 'expected a list of sides');
  if (v.length === 0) return add(out, p, 'expected at least one side');
  const seen = new Set<unknown>();
  v.forEach((side: unknown, i) => {
    const at = `${p}[${i}]`;
    oneOf(STROKE_SIDES)(side, at, out);
    if (seen.has(side)) add(out, at, `repeated side: ${String(side)}`);
    seen.add(side);
  });
};

/** `stroke.dash`: a list of numbers ≥ 0, each item a literal or a number `$token`. */
const checkDash: Check = (v, p, out) => {
  if (!Array.isArray(v)) return add(out, p, 'expected a list of numbers');
  v.forEach((n: unknown, i) =>
    checkLiteralOrToken(n, `${p}[${i}]`, checkNonNegative, out),
  );
};

/** The v4 keys of the stroke (`cap`, `join`, `sides`, `offset`); `sides` only in `frame` and `rect`, `offset` also in `ellipse`. */
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
    add(out, at, `only valid in frame and rect (this is ${nodeType})`);
  else checkExpr(value.sides, at, checkSides, out);
}

/** `stroke.offset`: px ≥ 0 (literal or a number `$token`), only in `frame`, `rect` and `ellipse`. */
function checkOffset(
  value: unknown,
  path: string,
  nodeType: string | undefined,
  out: Ctx,
): void {
  if (nodeType !== undefined && !['frame', 'rect', 'ellipse'].includes(nodeType))
    add(out, path, `only valid in frame, rect and ellipse (this is ${nodeType})`);
  else checkLiteralOrToken(value, path, checkNonNegative, out);
}

function checkStroke(value: unknown, path: string, out: Ctx, nodeType?: string): void {
  if (!isRecord(value)) return add(out, path, 'expected an object');
  checkKeys(
    value,
    ['color', 'width', 'align', 'dash', 'cap', 'join', 'sides', 'scale', 'offset', 'gap'],
    path,
    out,
  );
  if (!('color' in value)) add(out, join(path, 'color'), 'required field');
  else checkExpr(value.color, join(path, 'color'), checkColor, out);
  if ('width' in value)
    checkExpr(value.width, join(path, 'width'), checkNonNegative, out);
  if ('align' in value)
    oneOf(['inside', 'center', 'outside'])(value.align, join(path, 'align'), out);
  if ('dash' in value) checkExpr(value.dash, join(path, 'dash'), checkDash, out);
  checkStrokeV4(value, path, nodeType, out);
  if ('gap' in value) checkGap(value, join(path, 'gap'), nodeType, out);
}

/** `stroke.gap`: `{ node, padding? }`, only in `frame` and `rect` and never together with `sides`. */
function checkGap(
  stroke: Rec,
  path: string,
  nodeType: string | undefined,
  out: Ctx,
): void {
  const value = stroke.gap;
  if (nodeType !== undefined && nodeType !== 'frame' && nodeType !== 'rect')
    return add(out, path, `only valid in frame and rect (this is ${nodeType})`);
  if (!isRecord(value)) return add(out, path, 'expected an object');
  checkKeys(value, ['node', 'padding'], path, out);
  if ('sides' in stroke) add(out, path, 'gap is not valid with sides');
  if (!('node' in value)) add(out, join(path, 'node'), 'required field');
  else checkString(value.node, join(path, 'node'), out);
  if ('padding' in value)
    checkExpr(value.padding, join(path, 'padding'), checkNumber, out);
}

/** A shadow (object): `color`, `x`, `y`, `blur` and `spread`. */
function checkShadowItem(value: unknown, path: string, out: Ctx): void {
  if (!isRecord(value)) return add(out, path, 'expected an object');
  checkKeys(value, ['color', 'x', 'y', 'blur', 'spread'], path, out);
  if (!('color' in value)) add(out, join(path, 'color'), 'required field');
  else checkExpr(value.color, join(path, 'color'), checkColor, out);
  if ('x' in value) checkLiteralOrToken(value.x, join(path, 'x'), checkNumber, out);
  if ('y' in value) checkLiteralOrToken(value.y, join(path, 'y'), checkNumber, out);
  if ('blur' in value)
    checkLiteralOrToken(value.blur, join(path, 'blur'), checkNonNegative, out);
  if ('spread' in value)
    checkLiteralOrToken(value.spread, join(path, 'spread'), checkNumber, out);
}

/** `shadow`: one shadow or, in v4, a list of 1 to 4 (the version is checked separately). */
function checkShadow(value: unknown, path: string, out: Ctx): void {
  if (!Array.isArray(value)) return checkShadowItem(value, path, out);
  if (value.length < 1 || value.length > MAX_SHADOWS)
    return add(out, path, `expected 1 to ${MAX_SHADOWS} shadows`);
  value.forEach((item: unknown, i) => checkShadowItem(item, `${path}[${i}]`, out));
}

/** `font.maxLines`: an integer greater than or equal to 1. */
const checkPositiveInteger = tokenCheck('number', (v, p, out) => {
  if (!Number.isInteger(v) || (v as number) < 1)
    add(out, p, 'expected an integer greater than or equal to 1');
});

function checkFont(value: unknown, path: string, out: Ctx): void {
  if (!isRecord(value)) return add(out, path, 'expected an object');
  const specs: Record<string, Check> = {
    family: checkFamily,
    size: checkNumber,
    weight: checkWeight,
    italic: checkBoolean,
    lineHeight: checkNumber,
    letterSpacing: checkNumber,
    align: oneOf(['left', 'center', 'right', 'justify', 'start', 'end']),
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
    'expected a number, a list of 2 or a list of 4 numbers (greater than or equal to 0)',
  );
});

const LAYOUT_TYPE_EXPECTED = 'expected "none", "row", "column" or "grid"';

const checkLayoutType: Check = (v, p, out) => {
  if (v !== 'none' && v !== 'row' && v !== 'column' && v !== 'grid')
    add(out, p, LAYOUT_TYPE_EXPECTED);
};

/** The four line-wrapping keys (v4), in the `layout` of a frame or slot and in the `repeat` itself. */
const WRAP_KEYS = ['wrap', 'lineGap', 'maxPerLine', 'maxLines'];

/** The four grid tracks (v4): exactly one is valid in a literal `grid` layout. */
const GRID_TRACK_KEYS = ['columns', 'minColumnWidth', 'rows', 'minRowHeight'];

/** What line wrapping has and the grid does not (`lineGap` is valid in the grid, without `wrap`). */
const GRID_REJECTED_WRAP_KEYS = WRAP_KEYS.filter((key) => key !== 'lineGap');

const GRID_TRACKS_MESSAGE =
  'layout: give exactly one of columns, minColumnWidth, rows and minRowHeight';

/** `minColumnWidth`/`minRowHeight`: a number greater than 0. */
const checkPositiveNumber = tokenCheck('number', (v, p, out) => {
  if (!isFiniteNumber(v) || v <= 0) add(out, p, 'expected a number greater than 0');
});

/** `wrap` (`none`, `wrap` or `wrap-reverse`), `lineGap`, `maxPerLine` and `maxLines`; the last three are only valid with `wrap`. */
function checkWrapKeys(value: Rec, path: string, out: Ctx): void {
  if ('wrap' in value)
    checkExpr(value.wrap, join(path, 'wrap'), oneOf(LAYOUT_WRAPS), out);
  const wrapped = 'wrap' in value && value.wrap !== 'none';
  const checks: Record<string, Check> = {
    lineGap: checkNonNegative,
    maxPerLine: checkPositiveInteger,
    maxLines: checkPositiveInteger,
  };
  for (const [key, check] of Object.entries(checks)) {
    if (!(key in value)) continue;
    checkExpr(value[key], join(path, key), check, out);
    if (!wrapped) add(out, join(path, key), 'only valid with wrap');
  }
}

/** The keys of a `row`/`column` layout (or of `type` by expression), in v4 also by expression. */
function checkLayoutFlow(value: Rec, path: string, out: Ctx): void {
  checkKeys(
    value,
    [
      'type',
      'gap',
      'padding',
      'align',
      'justify',
      'reverse',
      ...WRAP_KEYS,
      ...GRID_TRACK_KEYS,
    ],
    path,
    out,
  );
  checkWrapKeys(value, path, out);
  if (isExprObject(value.type)) checkTrackKeys(value, path, out);
  else
    for (const key of GRID_TRACK_KEYS)
      if (key in value) add(out, join(path, key), 'only valid in a grid layout');
  if ('gap' in value) checkExpr(value.gap, join(path, 'gap'), checkNonNegative, out);
  if ('padding' in value)
    checkExpr(value.padding, join(path, 'padding'), checkPadding, out);
  if ('align' in value)
    checkExpr(
      value.align,
      join(path, 'align'),
      oneOf(['start', 'center', 'end', 'stretch', 'baseline']),
      out,
    );
  if ('justify' in value)
    checkExpr(value.justify, join(path, 'justify'), oneOf(LAYOUT_JUSTIFIES), out);
  if ('reverse' in value) checkBoolExpr(value.reverse, join(path, 'reverse'), out);
}

/** A `none` layout: only `type`, `align` and `justify` (start, center, end or stretch; v4). */
function checkNoneLayout(value: Rec, path: string, out: Ctx): void {
  checkKeys(value, ['type', 'align', 'justify'], path, out);
  if ('align' in value)
    checkExpr(value.align, join(path, 'align'), oneOf(NONE_ALIGNS), out);
  if ('justify' in value)
    checkExpr(value.justify, join(path, 'justify'), oneOf(NONE_JUSTIFIES), out);
}

/** The values of the track keys present: `columns`/`rows` integers, `min*` numbers greater than 0. */
function checkTrackKeys(value: Rec, path: string, out: Ctx): void {
  for (const key of GRID_TRACK_KEYS) {
    if (!(key in value)) continue;
    const integer = key === 'columns' || key === 'rows';
    checkExpr(
      value[key],
      join(path, key),
      integer ? checkPositiveInteger : checkPositiveNumber,
      out,
    );
  }
}

/**
 * Exactly one track key; or several, when all are expressions and of the same orientation
 * (`columns` with `minColumnWidth`, or `rows` with `minRowHeight`): a field chooses which one has
 * a value, `columns` for the `Fixed` and `minColumnWidth` for the `Adaptive`.
 */
function trackKeysAreValid(value: Rec): boolean {
  const keys = GRID_TRACK_KEYS.filter((key) => key in value);
  if (keys.length === 1) return true;
  const sameOrientation =
    keys.every((key) => key === 'columns' || key === 'minColumnWidth') ||
    keys.every((key) => key === 'rows' || key === 'minRowHeight');
  return keys.length > 1 && sameOrientation && keys.every((k) => isExprObject(value[k]));
}

/** A literal `grid` layout: one track, `gap`, `lineGap`, `padding`, `reverse` and `align`/`justify` in the cell. */
function checkGridLayout(value: Rec, path: string, out: Ctx): void {
  checkKeys(
    value,
    [
      'type',
      'gap',
      'padding',
      'align',
      'justify',
      'reverse',
      'lineGap',
      ...GRID_TRACK_KEYS,
      ...GRID_REJECTED_WRAP_KEYS,
    ],
    path,
    out,
  );
  for (const key of GRID_REJECTED_WRAP_KEYS)
    if (key in value) add(out, join(path, key), 'not valid in a grid layout');
  if (!trackKeysAreValid(value)) add(out, path, GRID_TRACKS_MESSAGE);
  checkTrackKeys(value, path, out);
  for (const key of ['gap', 'lineGap'])
    if (key in value) checkExpr(value[key], join(path, key), checkNonNegative, out);
  if ('padding' in value)
    checkExpr(value.padding, join(path, 'padding'), checkPadding, out);
  if ('align' in value)
    checkExpr(value.align, join(path, 'align'), oneOf(NONE_ALIGNS), out);
  if ('justify' in value)
    checkExpr(value.justify, join(path, 'justify'), oneOf(NONE_JUSTIFIES), out);
  if ('reverse' in value) checkBoolExpr(value.reverse, join(path, 'reverse'), out);
}

function checkLayout(value: unknown, path: string, out: Ctx): void {
  if (!isRecord(value)) return add(out, path, 'expected an object');
  if (value.type === 'none') return checkNoneLayout(value, path, out);
  if (value.type === 'grid') return checkGridLayout(value, path, out);
  if (value.type === 'column' && value.align === 'baseline')
    add(out, join(path, 'align'), 'baseline is only valid in row');
  const at = join(path, 'type');
  if (isExprObject(value.type)) checkExpr(value.type, at, checkLayoutType, out);
  else if (value.type !== 'row' && value.type !== 'column')
    return add(out, at, LAYOUT_TYPE_EXPECTED);
  checkLayoutFlow(value, path, out);
}

function checkViewBox(value: unknown, path: string, out: Ctx): void {
  const ok = (n: unknown): boolean => isFiniteNumber(n) && n > 0;
  if (!Array.isArray(value) || value.length !== 2 || !value.every(ok))
    add(out, path, 'expected [width, height] with positive numbers');
}

/** Keys of a rich-text run (`runs[i]`). */
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

/** `runs[i].padding`: a number (both axes) or `[vertical, horizontal]`, non-negative. */
const checkRunPadding = tokenCheck('number', (v, p, out) => {
  const ok = (n: unknown): boolean => isFiniteNumber(n) && n >= 0;
  if (ok(v)) return;
  if (Array.isArray(v) && v.length === 2 && v.every(ok)) return;
  add(
    out,
    p,
    'expected a number or a list [vertical, horizontal] of numbers (greater than or equal to 0)',
  );
});

/** A `runs` run: `text` required and the style, each key with a literal or expression. */
function checkRun(value: unknown, path: string, out: Ctx): void {
  if (!isRecord(value)) return add(out, path, 'expected an object (run)');
  checkKeys(value, RUN_KEYS, path, out);
  if (!('text' in value)) add(out, join(path, 'text'), 'required field');
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
    return add(out, path, 'expected a non-empty list of runs');
  value.forEach((run: unknown, i) => checkRun(run, `${path}[${i}]`, out));
}

/** `text` node: `text` or `runs` (one of the two), plus `font` and `color`. */
function checkTextNode(value: Rec, path: string, out: Ctx): void {
  const hasText = 'text' in value;
  const hasRuns = 'runs' in value;
  if (hasText && hasRuns) add(out, path, 'text and runs together: use one or the other');
  else if (!hasText && !hasRuns) add(out, join(path, 'text'), 'required field');
  if (hasText) checkExpr(value.text, join(path, 'text'), checkTextOrNumber, out);
  if (hasRuns) checkRuns(value.runs, join(path, 'runs'), out);
  if ('font' in value) checkFont(value.font, join(path, 'font'), out);
  if ('color' in value) checkExpr(value.color, join(path, 'color'), checkColor, out);
  if ('baselinePadding' in value)
    checkBaselinePadding(value, join(path, 'baselinePadding'), out);
}

/** `baselinePadding`: `top` and `bottom` in px ≥ 0; `top` does not combine with a literal `font.verticalAlign`. */
function checkBaselinePadding(node: Rec, path: string, out: Ctx): void {
  const value = node.baselinePadding;
  if (!isRecord(value)) return add(out, path, 'expected an object');
  checkKeys(value, ['top', 'bottom'], path, out);
  for (const key of ['top', 'bottom'])
    if (key in value) checkExpr(value[key], join(path, key), checkNonNegative, out);
  const align = isRecord(node.font) ? node.font.verticalAlign : undefined;
  if ('top' in value && typeof align === 'string')
    add(out, join(path, 'top'), 'does not combine with verticalAlign');
}

/** Which frame contains the node: decides where `span` and `weight` are valid. */
type ParentKind = 'none' | 'row' | 'column' | 'grid' | 'unknown';

/** The layout type of a frame as a parent: absent is `none`; an expression or invalid layout, `unknown`. */
function layoutParent(layout: unknown): ParentKind {
  if (layout === undefined) return 'none';
  const type = isRecord(layout) ? layout.type : undefined;
  if (type === 'none' || type === 'row' || type === 'column' || type === 'grid')
    return type;
  return 'unknown';
}

/** The parent of a `repeat`'s `template`: its `layout` or, without it, the `direction` (default column). */
function repeatParent(repeat: Rec): ParentKind {
  if ('layout' in repeat) return layoutParent(repeat.layout);
  return repeat.direction === 'row' ? 'row' : 'column';
}

/** Only the frame and the slot (and the `repeat`, in v4) carry `layout`. */
function acceptsLayout(type: string): boolean {
  return type === 'slot' || type === 'repeat';
}

const WEIGHT_MESSAGE =
  'weight: only valid on a fill child on the main axis of a row or column';

/** The literal `weight` is valid: `row`/`column` parent (or uncertain) and a `fill` child on the main axis. */
function weightApplies(value: Rec, type: string, parent: ParentKind): boolean {
  if (parent === 'unknown') return true;
  if (parent !== 'row' && parent !== 'column') return false;
  const size = value[parent === 'row' ? 'width' : 'height'];
  if (size === undefined) return type !== 'text';
  return size === 'fill' || isExprObject(size);
}

/** `span` (integer >= 1) and `weight` (number > 0), literal or expression; the literal is only valid where it has an effect. */
function checkSpanWeight(
  value: Rec,
  path: string,
  type: string,
  parent: ParentKind,
  out: Ctx,
): void {
  if ('span' in value) {
    const at = join(path, 'span');
    checkExpr(value.span, at, checkPositiveInteger, out);
    if (!isExprObject(value.span) && parent !== 'grid' && parent !== 'unknown')
      add(out, at, 'span: only valid on a child of a grid layout');
  }
  if ('weight' in value) {
    const at = join(path, 'weight');
    checkExpr(value.weight, at, checkPositiveNumber, out);
    if (!isExprObject(value.weight) && !weightApplies(value, type, parent))
      add(out, at, WEIGHT_MESSAGE);
  }
}

function checkNode(
  value: unknown,
  path: string,
  out: Ctx,
  parent: ParentKind = 'none',
): void {
  if (!isRecord(value)) return add(out, path, 'expected an object (node)');
  const type = value.type;
  if (typeof type !== 'string' || !(NODE_TYPES as readonly string[]).includes(type)) {
    add(
      out,
      join(path, 'type'),
      `unknown node type: ${JSON.stringify(type)} (expected ${NODE_TYPES.join(', ')})`,
    );
    return;
  }

  const extra: Record<string, readonly string[]> = {
    frame: ['clip', 'layout', 'children'],
    rect: [],
    ellipse: [],
    text: ['text', 'runs', 'font', 'color', 'baselinePadding'],
    path: ['d', 'viewBox', 'fillRule', 'mirror'],
    slot: ['label', 'layout', 'clip', 'provide'],
    repeat: [
      'field',
      'count',
      'layout',
      'direction',
      'gap',
      'distribute',
      'wrap',
      'lineGap',
      'maxPerLine',
      'maxLines',
      'template',
    ],
    image: ['src', 'fit'],
    icon: ['name', 'color', 'strokeWidth', 'mirror'],
  };
  // children/layout on a node that is not a frame have their own message, instead of "unknown key"
  for (const key of ['children', 'layout']) {
    if (acceptsLayout(type) && key === 'layout') continue;
    if (type !== 'frame' && key in value)
      add(
        out,
        join(path, key),
        `only nodes of type frame accept ${key} (this is ${type})`,
      );
  }
  for (const key of Object.keys(value)) {
    if (acceptsLayout(type) && key === 'layout') continue;
    if (type !== 'frame' && (key === 'children' || key === 'layout')) continue;
    if (type === 'repeat' && REPEAT_REJECTED_KEYS.includes(key)) {
      add(
        out,
        join(path, key),
        `not valid in a repeat; the drawing belongs to the template (${key})`,
      );
      continue;
    }
    if (!BASE_KEYS.includes(key) && !extra[type]?.includes(key))
      add(out, join(path, key), `unknown key: ${key}`);
  }

  if ('name' in value && type !== 'icon')
    checkString(value.name, join(path, 'name'), out);
  if ('visible' in value) checkBoolExpr(value.visible, join(path, 'visible'), out);
  if ('opacity' in value) checkExpr(value.opacity, join(path, 'opacity'), checkUnit, out);
  if ('direction' in value && type !== 'repeat')
    oneOf(DIRECTIONS)(value.direction, join(path, 'direction'), out);
  if ('rotation' in value)
    checkExpr(value.rotation, join(path, 'rotation'), checkNumber, out);
  checkNodeSizes(value, path, type, out);
  checkSpanWeight(value, path, type, parent, out);
  if ('anchors' in value) checkAnchors(value.anchors, join(path, 'anchors'), out);
  if ('fill' in value) checkExpr(value.fill, join(path, 'fill'), checkFill, out);
  if ('stroke' in value) checkStroke(value.stroke, join(path, 'stroke'), out, type);
  if ('shadow' in value) checkShadow(value.shadow, join(path, 'shadow'), out);
  if ('cornerRadius' in value)
    checkExpr(value.cornerRadius, join(path, 'cornerRadius'), checkCornerRadius, out);

  switch (type) {
    case 'frame': {
      if ('clip' in value) checkBoolExpr(value.clip, join(path, 'clip'), out);
      if ('layout' in value) checkLayout(value.layout, join(path, 'layout'), out);
      if ('children' in value) {
        const children = join(path, 'children');
        if (!Array.isArray(value.children))
          add(out, children, 'expected a list of nodes');
        else
          value.children.forEach((c: unknown, i) =>
            checkNode(c, `${children}[${i}]`, out, layoutParent(value.layout)),
          );
      }
      return;
    }
    case 'text':
      checkTextNode(value, path, out);
      return;
    case 'path':
      if (!('d' in value)) add(out, join(path, 'd'), 'required field');
      else checkExpr(value.d, join(path, 'd'), checkString, out);
      if (!('viewBox' in value)) add(out, join(path, 'viewBox'), 'required field');
      else checkViewBox(value.viewBox, join(path, 'viewBox'), out);
      if ('fillRule' in value)
        oneOf(['nonzero', 'evenodd'])(value.fillRule, join(path, 'fillRule'), out);
      if ('mirror' in value) checkBoolExpr(value.mirror, join(path, 'mirror'), out);
      return;
    case 'slot':
      if ('label' in value) checkExpr(value.label, join(path, 'label'), checkString, out);
      if ('layout' in value) checkLayout(value.layout, join(path, 'layout'), out);
      if ('clip' in value) checkBoolExpr(value.clip, join(path, 'clip'), out);
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

/** `icon` (formatVersion 4): `name` required (text or expression), `color` and `strokeWidth`. */
function checkIconNode(value: Rec, path: string, out: Ctx): void {
  if (!('name' in value)) add(out, join(path, 'name'), 'required field');
  else checkExpr(value.name, join(path, 'name'), checkString, out);
  if ('color' in value) checkExpr(value.color, join(path, 'color'), checkColor, out);
  if ('strokeWidth' in value)
    checkExpr(value.strokeWidth, join(path, 'strokeWidth'), checkNonNegative, out);
  if ('mirror' in value) checkBoolExpr(value.mirror, join(path, 'mirror'), out);
}

/**
 * `image` (formatVersion 3): `src` required and restricted (a literal `https://` URL or exactly
 * `{ "$field": "<field>" }`), `fit` and no `hug` (checked in `checkNodeSizes`: the layout does
 * not depend on the downloaded image).
 * A local host is not a format error here: the app's policy decides at run time.
 */
function checkImage(value: Rec, path: string, out: Ctx): void {
  const at = join(path, 'src');
  if (!('src' in value)) add(out, at, 'required field');
  else {
    const src = value.src;
    if (typeof src === 'string') {
      const check = checkRemoteImageUrl(src, {
        allowHttp: false,
        allowLocalNetwork: true,
      });
      if (!check.ok) add(out, at, `expected an absolute https:// URL (${check.reason})`);
    } else if (isRecord(src) && Object.keys(src).length === 1 && '$field' in src) {
      checkFieldKey(src.$field, join(at, '$field'), out);
    } else {
      add(out, at, 'src only accepts literal text or { "$field": "<field>" }');
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
    add(out, p, 'expected an integer greater than or equal to 0');
});

/** `repeat`: exactly one of `field` (the rows of a `table`) and `count` (a count, v4). */
function checkRepeatSource(value: Rec, path: string, out: Ctx): void {
  const hasField = value.field !== undefined;
  const hasCount = value.count !== undefined;
  if (hasField && hasCount) add(out, path, 'use count or field, not both');
  else if (!hasField && !hasCount) add(out, join(path, 'field'), 'required field');
  if (hasField) checkFieldKey(value.field, join(path, 'field'), out);
  if (hasCount) checkExpr(value.count, join(path, 'count'), checkRepeatCount, out);
}

/** `repeat.layout` (v4): a complete layout; it does not combine with `direction` or `gap`, nor `distribute: "fill"` with a grid. */
function checkRepeatLayout(value: Rec, path: string, out: Ctx): void {
  checkLayout(value.layout, join(path, 'layout'), out);
  if ('direction' in value || 'gap' in value)
    add(out, path, 'repeat.layout: does not combine with direction or gap');
  if (value.distribute === 'fill' && layoutParent(value.layout) === 'grid')
    add(out, join(path, 'distribute'), 'distribute: not valid with a grid layout');
  for (const key of WRAP_KEYS)
    if (key in value)
      add(out, join(path, key), `repeat.layout: the key goes inside layout (${key})`);
  if (isRecord(value.layout) && value.layout.type === 'none')
    add(out, join(path, 'layout.type'), 'repeat.layout: use row, column or grid');
}

/** `repeat`: the `table` field, the direction, the spacing and the `template` (a frame, without `repeat` or `slot`). */
function checkRepeat(value: Rec, path: string, out: Ctx): void {
  checkRepeatSource(value, path, out);
  if ('direction' in value)
    oneOf(['column', 'row'])(value.direction, join(path, 'direction'), out);
  if ('gap' in value) checkExpr(value.gap, join(path, 'gap'), checkNonNegative, out);
  if ('distribute' in value)
    oneOf(['none', 'fill'])(value.distribute, join(path, 'distribute'), out);
  checkWrapKeys(value, path, out);
  if ('layout' in value) checkRepeatLayout(value, path, out);
  const at = join(path, 'template');
  if (!('template' in value)) return add(out, at, 'required field');
  const template = value.template;
  if (isRecord(template) && template.type !== 'frame') {
    add(out, join(at, 'type'), 'the template of a row must be of type "frame"');
  }
  checkNode(template, at, out, repeatParent(value));
  for (const nested of forbiddenInRepeat(template, at)) {
    add(out, nested.path, `${nested.type} is not allowed inside a repeat`);
  }
}

/**
 * The `repeat`s and `slot`s in a row's template, without entering the `template` of a nested
 * `repeat`: its own `checkRepeat` already reports what is inside (only once).
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

/** The error for every key, node or expression that only exists in formatVersion 4. */
const V4_ONLY_MESSAGE = 'only allowed with formatVersion 4';

/** Paths (chains of keys) of the keys that only exist in formatVersion 4, on any node. */
const V4_NODE_KEYS: readonly (readonly string[])[] = [
  ['stroke', 'cap'],
  ['stroke', 'join'],
  ['stroke', 'sides'],
  ['stroke', 'scale'],
  ['stroke', 'offset'],
  ['stroke', 'gap'],
  ['shadow', 'spread'],
  ['layout', 'reverse'],
  ...GRID_TRACK_KEYS.map((key): readonly string[] => ['layout', key]),
  ['span'],
  ['weight'],
  ['minWidth'],
  ['maxWidth'],
  ['minHeight'],
  ['maxHeight'],
  ['distribute'],
  ['count'],
  ['font', 'wrap'],
  ['font', 'ellipsis'],
  ['font', 'maxLines'],
  ['baselinePadding'],
  ...WRAP_KEYS.map((key): readonly string[] => ['layout', key]),
  ...WRAP_KEYS.map((key): readonly string[] => [key]),
  ['runs'],
  ['rotation'],
  ['provide'],
  ['mirror'],
  ['anchors', 'start'],
  ['anchors', 'end'],
];

/** Keys that are valid in any version as a literal, but only with an expression in formatVersion 4. */
const V4_EXPR_KEYS: readonly (readonly string[])[] = [
  ['clip'],
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

/** Literal values that only exist in formatVersion 4: the key's chain and the value. */
const V4_LITERAL_VALUES: readonly (readonly [readonly string[], string])[] = [
  [['font', 'verticalAlign'], 'cap-middle'],
  [['font', 'align'], 'justify'],
  [['font', 'align'], 'start'],
  [['font', 'align'], 'end'],
  ...IMAGE_FITS_V4.map((fit): readonly [readonly string[], string] => [['fit'], fit]),
  [['layout', 'justify'], 'space-around'],
  [['layout', 'justify'], 'space-evenly'],
  [['layout', 'align'], 'baseline'],
  [['layout', 'type'], 'grid'],
  [['width'], 'min-content'],
  [['width'], 'max-content'],
  [['height'], 'min-content'],
  [['height'], 'max-content'],
];

/**
 * `align`/`justify` in a `none` layout and a literal `clip` in a slot only exist in
 * formatVersion 4 (in `row`/`column`, `align` and `justify` are valid in every version; the
 * `clip` by expression already comes out of `V4_EXPR_KEYS`).
 */
function noneAlignVersionIssues(version: unknown, template: unknown): ComponentIssue[] {
  const out: ComponentIssue[] = [];
  if (typeof version === 'number' && version >= COMPONENT_FORMAT_VERSION_FIDELITY)
    return out;
  const walk = (node: unknown, at: string): void => {
    if (!isRecord(node)) return;
    noneAlignNodeIssues(node, at, out);
    if (Array.isArray(node.children))
      node.children.forEach((c: unknown, i) => walk(c, `${join(at, 'children')}[${i}]`));
    if (node.type === 'repeat') walk(node.template, join(at, 'template'));
  };
  walk(template, 'template');
  return out;
}

/** The v4 keys of a single node: `align`/`justify` of the `none` layout, the slot's literal `clip` and the `direction`. */
function noneAlignNodeIssues(node: Rec, at: string, out: ComponentIssue[]): void {
  const layout = node.layout;
  if (isRecord(layout) && layout.type === 'none')
    for (const key of ['align', 'justify'])
      if (key in layout) addIssue(out, join(at, `layout.${key}`), V4_ONLY_MESSAGE);
  v4NodeKeyIssues(node, at, out);
}

/** The other v4 keys on a node: the slot's literal `clip`, the `repeat`'s `layout` and the `direction`. */
function v4NodeKeyIssues(node: Rec, at: string, out: ComponentIssue[]): void {
  if (node.type === 'slot' && 'clip' in node && !isExprObject(node.clip))
    addIssue(out, join(at, 'clip'), V4_ONLY_MESSAGE);
  if (node.type === 'repeat' && 'layout' in node)
    addIssue(out, join(at, 'layout'), V4_ONLY_MESSAGE);
  // `direction` ltr/rtl is a v4 key; in the `repeat` the key is the stacking of the rows, in every version.
  if (node.type !== 'repeat' && 'direction' in node)
    addIssue(out, join(at, 'direction'), V4_ONLY_MESSAGE);
}

/** `shadow` as a list (v4) in a version before 4: `only allowed with formatVersion 4`, at the path of `shadow`. */
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

/** The name the drawing gives the node (`name`, or the type; for an icon, the literal icon's name). */
function templateNodeName(node: Rec): string | undefined {
  const type = typeof node.type === 'string' ? node.type : undefined;
  if (type === 'icon') return typeof node.name === 'string' ? node.name : 'icon';
  if (typeof node.name === 'string') return node.name;
  return type;
}

/**
 * The names of the template's nodes (through the `children`; with `viaRepeat`, also through the
 * `repeat`s' `template`).
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

/** Why the `stroke.gap.node` of `node` does not open a gap (the gap only opens on a node outside `repeat` that is not the node itself). */
function gapNodeProblem(
  node: Rec,
  target: string,
  inRepeat: boolean,
  known: { all: Set<string>; direct: Set<string> },
): string | undefined {
  if (!known.all.has(target)) return `node not found: ${target}`;
  if (inRepeat) return 'stroke.gap cannot be used inside a repeat';
  if (templateNodeName(node) === target)
    return `stroke.gap.node cannot name the node itself: ${target}`;
  if (!known.direct.has(target))
    return `stroke.gap.node cannot name a node inside a repeat: ${target}`;
  return undefined;
}

/**
 * `stroke.gap.node` must name another node of the template, outside `repeat` (`node not
 * found: <name>`); inside a `repeat` or naming the node itself the gap would not open.
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

/** `$token` anywhere in the template, in a version before 4: `only allowed with formatVersion 4`. */
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

/** The new v4 expression keys (operations, comparisons, `$rows` and `$size`). */
function isV4OnlyOp(key: string): boolean {
  return (
    isNumericOp(key) ||
    key === '$rows' ||
    key === '$size' ||
    key === '$lines' ||
    key === '$provided' ||
    key === '$direction' ||
    (COMPARISON_OPS as readonly string[]).includes(key)
  );
}

/** The name of a `text` node of the template; `undefined` if the node is not `text` or has no name. */
function textNodeName(node: Rec): string | undefined {
  return node.type === 'text' && typeof node.name === 'string' ? node.name : undefined;
}

/** Where we are in the template when scanning `$lines`: the `text` node containing the fragment and the surrounding `repeat`s (by path). */
interface LinesContext {
  readonly owner: string | undefined;
  readonly chain: readonly string[];
}

interface LinesScan {
  /** The `text` nodes by name: how many there are and inside which `repeat`s. */
  readonly texts: Map<string, { count: number; chain: readonly string[] }>;
  readonly citations: { name: string; at: string; context: LinesContext }[];
}

/** The context of the child `key` of `node` (a `repeat` opens a row in its `template`). */
function linesChild(node: Rec, at: string, key: string, ctx: LinesContext): LinesContext {
  const owner = textNodeName(node) ?? ctx.owner;
  const chain =
    node.type === 'repeat' && key === 'template' ? [...ctx.chain, at] : ctx.chain;
  return { owner, chain };
}

/** Registers a `text` node (how many there are with the name and inside which `repeat`s). */
function recordText(node: Rec, ctx: LinesContext, scan: LinesScan): void {
  const name = textNodeName(node);
  if (name === undefined) return;
  const known = scan.texts.get(name);
  scan.texts.set(name, {
    count: (known?.count ?? 0) + 1,
    chain: known?.chain ?? ctx.chain,
  });
}

function scanLines(tree: unknown, at: string, ctx: LinesContext, scan: LinesScan): void {
  if (Array.isArray(tree)) {
    tree.forEach((n, i) => scanLines(n, `${at}[${i}]`, ctx, scan));
    return;
  }
  if (!isRecord(tree)) return;
  recordText(tree, ctx, scan);
  for (const [key, value] of Object.entries(tree)) {
    const here = join(at, key);
    const child = linesChild(tree, at, key, ctx);
    if (key === '$lines' && typeof value === 'string' && value !== '')
      scan.citations.push({ name: value, at: here, context: child });
    scanLines(value, here, child, scan);
  }
}

/**
 * `$lines` (v4): the name must be that of a `text` node of the template, unique (`text node "x"
 * does not exist`, `more than one text node "x"`), and the node itself cannot depend on its own
 * lines. A node inside a `repeat` can only be cited from inside the same `repeat` (the node on
 * the same row counts): from outside, the expansion would not know which row (`text node "x" is
 * inside a repeat`).
 */
function linesIssues(template: unknown): ComponentIssue[] {
  const out: ComponentIssue[] = [];
  const scan: LinesScan = { texts: new Map(), citations: [] };
  scanLines(template, 'template', { owner: undefined, chain: [] }, scan);
  for (const { name, at, context } of scan.citations) {
    const found = scan.texts.get(name);
    if (found === undefined) addIssue(out, at, `text node "${name}" does not exist`);
    else if (found.count > 1) addIssue(out, at, `more than one text node "${name}"`);
    else if (context.owner === name)
      addIssue(out, at, 'the node cannot depend on its own lines');
    else if (!found.chain.every((repeat, i) => context.chain[i] === repeat))
      addIssue(out, at, `text node "${name}" is inside a repeat`);
  }
  return out;
}

/** Numeric operation or comparison (`$mul`, `$gt`…) in a version before 4: `only allowed with formatVersion 4`, at the key's path. */
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

/** Does the key cite a field (`$field`, `$has`, `$switch` or the first item of `$eq`)? The name and the path suffix. */
function citedField(
  key: string,
  value: unknown,
): { readonly name: string; readonly suffix: string } | undefined {
  if (
    (key === '$field' || key === '$has' || key === '$switch') &&
    typeof value === 'string'
  )
    return { name: value, suffix: '' };
  if (key === '$eq' && Array.isArray(value) && typeof value[0] === 'string')
    return { name: value[0], suffix: '[0]' };
  return undefined;
}

/** Does the key cite `$index`? Returns the path suffix. */
function indexCitation(key: string, value: unknown): string | undefined {
  const cited = citedField(key, value);
  return cited?.name === '$index' ? cited.suffix : undefined;
}

/**
 * `$index` (the row index of a `repeat`): before 4 `only allowed with formatVersion 4`; in 4,
 * it is only valid inside a `repeat`'s `template`. The path is that of the key that cites it.
 */
function indexIssues(version: unknown, template: unknown): ComponentIssue[] {
  const out: ComponentIssue[] = [];
  const v4 = typeof version === 'number' && version >= COMPONENT_FORMAT_VERSION_FIDELITY;
  const flag = (at: string, inRepeat: boolean): void => {
    if (!v4) addIssue(out, at, V4_ONLY_MESSAGE);
    else if (!inRepeat) addIssue(out, at, '$index is only valid inside a repeat');
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

/**
 * `$anchor.*` (the anchor's pseudo-fields): before 4 `only allowed with formatVersion 4`; in 4,
 * only the five names in `ANCHOR_FIELDS` are valid (another is `field does not exist:
 * $anchor.foo`). The path is that of the key that cites it.
 */
function anchorFieldIssues(version: unknown, template: unknown): ComponentIssue[] {
  const out: ComponentIssue[] = [];
  const v4 = typeof version === 'number' && version >= COMPONENT_FORMAT_VERSION_FIDELITY;
  const walk = (node: unknown, at: string): void => {
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${at}[${i}]`));
    if (!isRecord(node)) return;
    for (const [key, value] of Object.entries(node)) {
      const here = join(at, key);
      const cited = citedField(key, value);
      if (cited !== undefined && isAnchorFieldName(cited.name)) {
        const where = `${here}${cited.suffix}`;
        if (!v4) addIssue(out, where, V4_ONLY_MESSAGE);
        else if (!(ANCHOR_FIELDS as readonly string[]).includes(cited.name))
          addIssue(out, where, `field does not exist: ${cited.name}`);
      }
      walk(value, here);
    }
  };
  walk(template, 'template');
  return out;
}

/** The `icon` node in a version before 4: `only allowed with formatVersion 4`, at the `type`'s path. */
function iconVersionIssues(version: unknown, template: unknown): ComponentIssue[] {
  if (typeof version === 'number' && version >= COMPONENT_FORMAT_VERSION_FIDELITY)
    return [];
  return nodesOfTypes(template, 'template', ['icon']).map((node) =>
    issueOf(node.path, V4_ONLY_MESSAGE),
  );
}

/**
 * The generic v4 rule: for each node of the tree (`children` and the repeat's `template`) that
 * carries one of the `keys` (chains such as `['stroke', 'cap']`), in a version before 4, it
 * returns `only allowed with formatVersion 4` at the key's path. The following phases only add
 * chains to `V4_NODE_KEYS`. The `exprKeys` chains only count when the value is an expression
 * (an object with a `$…` operator): the literal stays valid in every version. `literals` are
 * new literal values of a key that already existed (`font.verticalAlign: "cap-middle"`); the
 * same value coming from an expression has no special case (it falls outside the version's set
 * in the drawing).
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

/** Paths of the nodes of the given types in the tree (through the frames' `children` and the repeats' `template`). */
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
// File
// ---------------------------------------------------------------------------------------

/** `{ width, height }` with positive numbers; returns the pair when valid. */
function checkDimensions(
  value: unknown,
  path: string,
  out: Ctx,
): { width: number; height: number } | null {
  if (!isRecord(value)) {
    add(out, path, 'expected an object { width, height }');
    return null;
  }
  checkKeys(value, ['width', 'height'], path, out);
  let valid = true;
  for (const key of ['width', 'height']) {
    const v = value[key];
    if (!isFiniteNumber(v) || v <= 0) {
      add(out, join(path, key), 'expected a positive number');
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
  'anchor',
  'preview',
  'template',
];

/** An axis of the already evaluated `sizing`: px (≥ 0), `"fill"`, `"hug"`, `"min-content"` or `"max-content"`. */
const checkSizingAxis: Check = (value, path, out) => {
  if (isFiniteNumber(value) && value >= 0) return;
  if (value === 'fill' || value === 'hug' || isIntrinsicSize(value)) return;
  add(
    out,
    path,
    'expected a number greater than or equal to 0, "fill", "hug", "min-content" or "max-content"',
  );
};

/** The `sizing` is evaluated before measuring: `$size` and `$lines` do not exist yet. */
const SIZING_FORBIDDEN: Readonly<Record<string, string>> = {
  $size: '$size is not valid in sizing',
  $lines: '$lines is not valid in sizing',
};

function sizingForbiddenOps(value: unknown, path: string, out: Ctx): void {
  const found = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!isRecord(node)) return;
    for (const [key, v] of Object.entries(node)) {
      if (Object.hasOwn(SIZING_FORBIDDEN, key)) found.add(key);
      walk(v);
    }
  };
  walk(value);
  for (const [op, message] of Object.entries(SIZING_FORBIDDEN))
    if (found.has(op)) add(out, path, message);
}

/**
 * `sizing`: `{ width?, height? }`, each axis px (≥ 0), `"fill"` or `"hug"`; in v4, also an
 * expression that yields one of them (evaluated with the instance's values).
 */
function checkSizing(value: unknown, path: string, v4: boolean, out: Ctx): void {
  if (!isRecord(value)) return add(out, path, 'expected an object { width?, height? }');
  checkKeys(value, ['width', 'height'], path, out);
  for (const key of ['width', 'height']) {
    if (!(key in value)) continue;
    const at = join(path, key);
    const axis = value[key];
    if (!v4 && (isExprObject(axis) || isIntrinsicSize(axis)))
      add(out, at, V4_ONLY_MESSAGE);
    else {
      checkExpr(axis, at, checkSizingAxis, out);
      if (isExprObject(axis)) sizingForbiddenOps(axis, at, out);
    }
  }
}

/** `screen` (v4 only, root only): an object with an optional `anchor`, from `SCREEN_ANCHORS`. */
function checkScreen(value: unknown, path: string, out: Ctx): void {
  if (!isRecord(value)) return add(out, path, 'expected an object');
  checkKeys(value, ['anchor'], path, out);
  if ('anchor' in value) oneOf(SCREEN_ANCHORS)(value.anchor, join(path, 'anchor'), out);
}

/** `anchor` (v4 only, root only): `side`, `align` and `offset { main, cross }`, all optional. */
function checkAnchor(value: unknown, path: string, out: Ctx): void {
  if (!isRecord(value)) return add(out, path, 'expected an object');
  checkKeys(value, ['side', 'align', 'offset'], path, out);
  if ('side' in value) oneOf(ANCHOR_SIDES)(value.side, join(path, 'side'), out);
  if ('align' in value) oneOf(ANCHOR_ALIGNS)(value.align, join(path, 'align'), out);
  if (!('offset' in value)) return;
  const at = join(path, 'offset');
  const offset = value.offset;
  if (!isRecord(offset)) return add(out, at, 'expected an object');
  checkKeys(offset, ['main', 'cross'], at, out);
  for (const axis of ['main', 'cross'])
    if (axis in offset && !isFiniteNumber(offset[axis]))
      add(out, join(at, axis), 'expected a number');
}

/** The file's problems and the `template` without `let` or `$var` (what the engine reads). */
interface Analysis {
  readonly issues: ComponentIssue[];
  readonly value: unknown;
  readonly rewrite: (path: string) => string;
}

const IDENTITY = (path: string): string => path;

/** The paths of a list of problems and references are replaced by those of the written file. */
function remapPaths(
  issues: ComponentIssue[],
  refs: TokenRef[] | null,
  rewrite: (path: string) => string,
): void {
  for (const issue of issues) issue.path = rewrite(issue.path);
  refs?.forEach((ref) => (ref.path = rewrite(ref.path)));
}

/**
 * Expands the variables (`let`/`$var`, v4) and checks the file. The expansion's problems
 * (undefined variable, cycle, name, ceiling) prevent checking the `template`; those of the rest
 * of the file go on. The problems' paths are those of the written file, with `$var(<name>)` in
 * the place of use.
 */
function analyze(input: unknown, refs: TokenRef[] | null): Analysis {
  if (!isRecord(input) || !('template' in input))
    return { issues: collectIssues(input, refs, input), value: input, rewrite: IDENTITY };
  const expansion = expandVariables(input.template);
  const failed = expansion.issues.length > 0;
  const checked = collectIssues(
    input,
    refs,
    failed ? undefined : expansion.value,
    !failed,
  );
  remapPaths(checked, refs, expansion.rewrite);
  const issues = [...checked, ...versionIssuesOfVariables(input)];
  for (const issue of expansion.issues)
    addIssue(issues, expansion.rewrite(issue.path), issue.message);
  const seen = new Set<string>();
  const unique = issues.filter((i) => {
    const key = `${i.path}\u0000${i.message}`;
    return !seen.has(key) && seen.add(key) !== undefined;
  });
  const same = failed || expansion.value === input.template;
  return {
    issues: unique,
    value: same ? input : { ...input, template: expansion.value },
    rewrite: expansion.rewrite,
  };
}

/** `let` and `$var` in a `formatVersion` before 4: `only allowed with formatVersion 4`. */
function versionIssuesOfVariables(input: Rec): ComponentIssue[] {
  const version = input.formatVersion;
  if (typeof version === 'number' && version >= COMPONENT_FORMAT_VERSION_FIDELITY)
    return [];
  return variableSyntaxPaths(input.template).map((at) => issueOf(at, V4_ONLY_MESSAGE));
}

/**
 * All the file's problems, with path and message separate; an empty list = valid.
 * `template` is the root's, already without `let` or `$var`; with `inspectTemplate` false the
 * template is not checked (the expansion failed).
 */
function collectIssues(
  input: unknown,
  refs: TokenRef[] | null,
  template: unknown,
  inspectTemplate = true,
): ComponentIssue[] {
  const issues: ComponentIssue[] = [];
  const out: Ctx = { issues, refs };
  if (!isRecord(input)) {
    add(out, 'component', 'expected an object');
    return issues;
  }
  checkKeys(input, ROOT_KEYS, '', out);

  if (input.format !== COMPONENT_FORMAT)
    add(out, 'format', `expected "${COMPONENT_FORMAT}"`);
  const version = input.formatVersion;
  if (!(COMPONENT_FORMAT_VERSIONS as readonly unknown[]).includes(version))
    add(
      out,
      'formatVersion',
      `expected ${COMPONENT_FORMAT_VERSIONS.slice(0, -1).join(', ')} or ${COMPONENT_FORMAT_VERSIONS.at(-1)}`,
    );

  if (typeof input.id !== 'string' || !ID_PATTERN.test(input.id))
    add(out, 'id', 'expected text matching ^[a-z0-9][a-z0-9-_]*$');
  if (typeof input.name !== 'string' || input.name.trim() === '')
    add(out, 'name', 'expected non-empty text');
  if ('description' in input) checkString(input.description, 'description', out);

  let size: { width: number; height: number } | null = null;
  if (!('size' in input)) add(out, 'size', 'required field');
  else size = checkDimensions(input.size, 'size', out);

  if ('minSize' in input) {
    const min = checkDimensions(input.minSize, 'minSize', out);
    if (min && size && (min.width > size.width || min.height > size.height))
      add(out, 'minSize', 'cannot be greater than size');
  }

  if ('sizing' in input)
    checkSizing(
      input.sizing,
      'sizing',
      typeof version === 'number' && version >= COMPONENT_FORMAT_VERSION_FIDELITY,
      out,
    );

  if ('screen' in input) {
    checkScreen(input.screen, 'screen', out);
    if (typeof version === 'number' && version < COMPONENT_FORMAT_VERSION_FIDELITY)
      add(out, 'screen', V4_ONLY_MESSAGE);
  }

  if ('anchor' in input) {
    checkAnchor(input.anchor, 'anchor', out);
    if (typeof version === 'number' && version < COMPONENT_FORMAT_VERSION_FIDELITY)
      add(out, 'anchor', V4_ONLY_MESSAGE);
  }

  if ('preview' in input) {
    if (!isRecord(input.preview)) add(out, 'preview', 'expected an object');
    else
      for (const [key, v] of Object.entries(input.preview)) {
        if (Array.isArray(v)) checkPreviewRows(v, join('preview', key), out);
        else if (v !== null && typeof v !== 'string' && !isFiniteNumber(v))
          add(
            out,
            join('preview', key),
            'expected text, a number or null (or a list of rows, in a table field)',
          );
      }
  }

  if (!('template' in input)) {
    add(out, 'template', 'required field');
  } else if (inspectTemplate) {
    const type = isRecord(template) ? template.type : undefined;
    if (type !== 'frame' && (NODE_TYPES as readonly unknown[]).includes(type))
      add(out, 'template.type', 'the root of the template must be of type "frame"');
    if (
      typeof version === 'number' &&
      version >= COMPONENT_FORMAT_VERSION_FIDELITY &&
      isRecord(template) &&
      'rotation' in template
    )
      add(out, 'template.rotation', 'not valid on the root');
    checkNode(template, 'template', out);
    checkGapNodes(template, out);
    if (version === 1) {
      for (const node of nodesOfTypes(template, 'template', ['repeat'])) {
        add(out, node.path, 'the repeat node only exists in formatVersion 2');
      }
    }
    issues.push(
      ...v4OnlyKeyIssues(
        version,
        template,
        'template',
        V4_NODE_KEYS,
        V4_EXPR_KEYS,
        V4_LITERAL_VALUES,
      ),
    );
    issues.push(...shadowListVersionIssues(version, template));
    issues.push(...noneAlignVersionIssues(version, template));
    issues.push(...tokenVersionIssues(version, template));
    issues.push(...numericVersionIssues(version, template));
    issues.push(...linesIssues(template));
    issues.push(...indexIssues(version, template));
    issues.push(...anchorFieldIssues(version, template));
    if (version === 1 || version === 2) {
      for (const node of nodesOfTypes(template, 'template', ['image'])) {
        add(out, node.path, 'the image node only exists in formatVersion 3');
      }
    }
    issues.push(...iconVersionIssues(version, template));
  }
  return issues;
}

/** Rows of a `table` field's `preview`: objects with text, number or null values. */
function checkPreviewRows(rows: unknown[], path: string, out: Ctx): void {
  rows.forEach((row, i) => {
    const at = `${path}[${i}]`;
    if (!isRecord(row)) return add(out, at, 'expected an object (a row)');
    for (const [column, v] of Object.entries(row)) {
      if (v !== null && typeof v !== 'string' && !isFiniteNumber(v))
        add(out, join(at, column), 'expected text, a number or null');
    }
  });
}

function formatIssue(issue: ComponentIssue): string {
  return issue.path ? `${issue.path}: ${issue.message}` : issue.message;
}

/** All the file's problems, each one `"<path>: <message>"`; an empty list = valid. */
export function validateComponent(input: unknown): string[] {
  return analyze(input, null).issues.map(formatIssue);
}

/** Validates an already parsed JSON (does not throw). */
export function parseComponent(input: unknown): ComponentParseResult {
  const refs: TokenRef[] = [];
  const { issues, value, rewrite } = analyze(input, refs);
  if (issues.length > 0) return { ok: false, issues, errors: issues.map(formatIssue) };
  const component = value as ComponentFile;
  const warnings = collectWarnings(component.template, 'template');
  for (const warning of warnings) warning.path = rewrite(warning.path);
  return { ok: true, component, warnings, tokenRefs: refs, rewrite };
}

/** Warning for a literal `family` (in the node's `font` or in a run) that CSS does not accept. */
function familyWarning(holder: unknown, path: string): ComponentIssue[] {
  const family = isRecord(holder) ? holder.family : undefined;
  if (typeof family !== 'string' || isValidFontFamily(family)) return [];
  return [
    issueOf(
      join(path, 'family'),
      `font family not valid for CSS (${JSON.stringify(family)}): the text falls back to sans-serif`,
    ),
  ];
}

/**
 * Warnings (not errors): today, a literal `font.family` (or `runs[i].family`) that CSS does not
 * accept (the drawing falls back to `sans-serif`). Expressions are not checked here.
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

/** Reads the JSON text of a component file (invalid JSON becomes an issue with an empty path). */
export function parseComponentText(text: string): ComponentParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const issues: ComponentIssue[] = [
      {
        path: '',
        message: `invalid JSON: ${message}`,
        code: 'library.invalidJson',
        params: { detail: message },
      },
    ];
    return { ok: false, issues, errors: issues.map(formatIssue) };
  }
  return parseComponent(json);
}

/** Field keys cited anywhere in the template, sorted and without repetition. */
export function collectFieldKeys(component: ComponentFile): string[] {
  return [...referencedFields(component.template)].sort();
}
