/**
 * Basic SVG shapes as path data (stage #2087, decision 5): `rect` (with `rx`/`ry`, clamped as in
 * SVG), `circle`, `ellipse`, `line`, `polyline` and `polygon`. The path follows the equivalent
 * paths of the SVG 2 specification ("Shapes", "Equivalent paths"), so the outline is the same.
 *
 * Pure functions, no DOM. Attributes arrive through a getter, and an attribute that is missing,
 * not a number or in a unit other than px is a result that names it (never a throw).
 */

/** The geometry attributes each shape reads (the converter allows these and nothing else). */
export const SHAPE_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
  polygon: ['points'],
};

export type ShapeResult =
  | { readonly ok: true; readonly d: string }
  | {
      readonly ok: false;
      /** The attribute that is missing or wrong. */
      readonly attribute: string;
      /** `true` when the value has a unit other than px (`em`, `%`, …). */
      readonly unit: boolean;
    };

export type AttributeGetter = (name: string) => string | undefined;

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const UNIT = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(?:[a-zA-Z]+|%)$/;

/**
 * A length in px: a number, with or without the `px` unit. `'unit'` is a number with another
 * unit (`1em`, `50%`) and `undefined` is anything else.
 */
export function parseLength(value: string): number | 'unit' | undefined {
  const text = value.trim();
  const bare = text.toLowerCase().endsWith('px') ? text.slice(0, -2) : text;
  if (NUMBER.test(bare)) {
    const n = Number(bare);
    return Number.isFinite(n) ? n : undefined;
  }
  return UNIT.test(text) ? 'unit' : undefined;
}

/** A number for path data: up to 6 decimals, no trailing zeros, never `-0` or an exponent. */
export function formatNumber(n: number): string {
  const rounded = Number(n.toFixed(6));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

const num = formatNumber;

class ShapeError {
  constructor(
    readonly attribute: string,
    readonly unit: boolean,
  ) {}
}

/** The attribute as a number; `fallback` when absent (`undefined` fallback: required). */
function length(get: AttributeGetter, name: string, fallback?: number): number {
  const value = get(name);
  if (value === undefined) {
    if (fallback === undefined) throw new ShapeError(name, false);
    return fallback;
  }
  const n = parseLength(value);
  if (typeof n !== 'number') throw new ShapeError(name, n === 'unit');
  return n;
}

/** A length that must be greater than 0 (a radius, a side). */
function positive(get: AttributeGetter, name: string, fallback?: number): number {
  const n = length(get, name, fallback);
  if (n <= 0) throw new ShapeError(name, false);
  return n;
}

/** A radius that may be absent (SVG 2 `auto`): `undefined` when missing, `auto` or empty. */
function optionalRadius(get: AttributeGetter, name: string): number | undefined {
  const value = get(name)?.trim();
  if (value === undefined || value === '' || value === 'auto') return undefined;
  const n = parseLength(value);
  if (typeof n !== 'number') throw new ShapeError(name, n === 'unit');
  if (n < 0) throw new ShapeError(name, false);
  return n;
}

/** The four quarter arcs of an ellipse, starting at the right (SVG 2 equivalent path). */
function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  const arc = (x: number, y: number): string =>
    `A${num(rx)} ${num(ry)} 0 0 1 ${num(x)} ${num(y)}`;
  return [
    `M${num(cx + rx)} ${num(cy)}`,
    arc(cx, cy + ry),
    arc(cx - rx, cy),
    arc(cx, cy - ry),
    arc(cx + rx, cy),
    'Z',
  ].join('');
}

function rectPath(get: AttributeGetter): string {
  const x = length(get, 'x', 0);
  const y = length(get, 'y', 0);
  const w = positive(get, 'width');
  const h = positive(get, 'height');
  const rxGiven = optionalRadius(get, 'rx');
  const ryGiven = optionalRadius(get, 'ry');
  // One radius given is both; neither is a square corner; each is clamped to half the side.
  const rx = Math.min(rxGiven ?? ryGiven ?? 0, w / 2);
  const ry = Math.min(ryGiven ?? rxGiven ?? 0, h / 2);
  const right = x + w;
  const bottom = y + h;
  if (rx === 0 || ry === 0)
    return `M${num(x)} ${num(y)}H${num(right)}V${num(bottom)}H${num(x)}Z`;
  const arc = (px: number, py: number): string =>
    `A${num(rx)} ${num(ry)} 0 0 1 ${num(px)} ${num(py)}`;
  return [
    `M${num(x + rx)} ${num(y)}`,
    `H${num(right - rx)}`,
    arc(right, y + ry),
    `V${num(bottom - ry)}`,
    arc(right - rx, bottom),
    `H${num(x + rx)}`,
    arc(x, bottom - ry),
    `V${num(y + ry)}`,
    arc(x + rx, y),
    'Z',
  ].join('');
}

function circlePath(get: AttributeGetter): string {
  const r = positive(get, 'r');
  return ellipsePath(length(get, 'cx', 0), length(get, 'cy', 0), r, r);
}

function ellipseShapePath(get: AttributeGetter): string {
  const rx = optionalRadius(get, 'rx');
  const ry = optionalRadius(get, 'ry');
  if (rx === undefined && ry === undefined) throw new ShapeError('rx', false);
  const a = rx ?? (ry as number);
  const b = ry ?? (rx as number);
  if (a <= 0 || b <= 0)
    throw new ShapeError(rx === undefined || rx <= 0 ? 'rx' : 'ry', false);
  return ellipsePath(length(get, 'cx', 0), length(get, 'cy', 0), a, b);
}

function linePath(get: AttributeGetter): string {
  const x1 = length(get, 'x1', 0);
  const y1 = length(get, 'y1', 0);
  return `M${num(x1)} ${num(y1)}L${num(length(get, 'x2', 0))} ${num(length(get, 'y2', 0))}`;
}

const NUMBERS = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;

/** The `points` list (SVG number list); `undefined` when it is not pairs of numbers or has fewer than two points. */
function pointList(points: string | undefined): number[] | undefined {
  if (points === undefined) return undefined;
  const leftover = points.replace(NUMBERS, '').replace(/[\s,]/g, '');
  const numbers = (points.match(NUMBERS) ?? []).map(Number);
  const ok = leftover === '' && numbers.length >= 4 && numbers.length % 2 === 0;
  return ok && numbers.every(Number.isFinite) ? numbers : undefined;
}

function polyPath(get: AttributeGetter, close: boolean): string {
  const numbers = pointList(get('points'));
  if (numbers === undefined) throw new ShapeError('points', false);
  let d = '';
  for (let i = 0; i < numbers.length; i += 2)
    d += `${i === 0 ? 'M' : 'L'}${num(numbers[i] as number)} ${num(numbers[i + 1] as number)}`;
  return close ? `${d}Z` : d;
}

const BUILDERS: Readonly<Record<string, (get: AttributeGetter) => string>> = {
  rect: rectPath,
  circle: circlePath,
  ellipse: ellipseShapePath,
  line: linePath,
  polyline: (get) => polyPath(get, false),
  polygon: (get) => polyPath(get, true),
};

/** Whether the element is one of the basic shapes of this module. */
export const isBasicShape = (element: string): boolean =>
  Object.hasOwn(BUILDERS, element);

/** The path data of a basic shape; `undefined` for an element that is not one. Never throws. */
export function shapePath(
  element: string,
  get: AttributeGetter,
): ShapeResult | undefined {
  if (!isBasicShape(element)) return undefined;
  try {
    return { ok: true, d: (BUILDERS[element] as (get: AttributeGetter) => string)(get) };
  } catch (error) {
    if (error instanceof ShapeError)
      return { ok: false, attribute: error.attribute, unit: error.unit };
    throw error;
  }
}
