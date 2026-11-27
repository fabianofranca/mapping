import { templateMessage } from '../messages';
import type { IconGradient, IconGradientStop } from './icons';
import {
  invalidValue,
  Problems,
  unsupportedAttribute,
  unsupportedElement,
} from './svgProblems';
import { parseLength, parseNumber } from './svgShapes';
import {
  applyToPoint,
  IDENTITY,
  invertLinear,
  parseTransform,
  type Matrix,
  type Point,
} from './svgTransform';
import { styleDeclarations, type XmlElement } from './svgXml';

/**
 * SVG `linearGradient` / `radialGradient` → the icon gradient `fill` (stage #2847, decisions 2 to
 * 5 and 7): the stops, the points of a linear one and the center and radius of a circle, in
 * `userSpaceOnUse` with `gradientTransform` applied. `svgIcon.ts` finds the definition a
 * `fill="url(#id)"` points at and calls `convertGradient`.
 *
 * Whatever the file format cannot say is an error that names it, never a silent loss: `href`, a
 * `spreadMethod` other than `pad`, a focal point, an elliptical radial gradient. `objectBoundingBox`
 * (and an absent `gradientUnits`) is refused until the box is supported (phase SG2).
 *
 * Pure functions, no DOM.
 */

export type GradientPaint =
  | { readonly kind: 'gradient'; readonly gradient: IconGradient }
  | { readonly kind: 'color'; readonly value: string }
  | { readonly kind: 'none' };

export interface GradientEnv {
  /** The `viewBox` size: what a percentage is of. */
  readonly box: readonly [number, number];
  /** Where the problems go (the conversion adds none when it succeeds). */
  readonly problems: Problems;
  /** `svgIcon.ts`'s color parser: `#rrggbb`, `#rrggbbaa` or `undefined`. */
  readonly normalizeColor: (text: string) => string | undefined;
}

const GRADIENTS: ReadonlySet<string> = new Set(['linearGradient', 'radialGradient']);

export const isGradientElement = (name: string): boolean => GRADIENTS.has(name);

/** Rounded as the file writes numbers (`formatNumber`: up to 6 decimals). */
const round = (n: number): number => Number(n.toFixed(6)) + 0;

/** A number or a percentage; `percent` is what 100% is. `undefined` for anything else. */
function parseCoordinate(text: string, percent: number): number | undefined {
  const value = text.trim();
  if (value.endsWith('%')) {
    const n = parseNumber(value.slice(0, -1));
    return n === undefined ? undefined : (n * percent) / 100;
  }
  const length = parseLength(value);
  return typeof length === 'number' ? length : undefined;
}

// ---------------------------------------------------------------------------------------------
// Stops

/** A fraction from a number or a percentage, clamped to 0..1. */
function parseFraction(text: string): number | undefined {
  const n = parseCoordinate(text, 1);
  return n === undefined ? undefined : Math.min(1, Math.max(0, n));
}

/** The color of a `stop` with its opacity multiplied into the alpha (`#rrggbb` when it is 1). */
function withOpacity(color: string, opacity: number): string {
  const alpha = color.length === 9 ? parseInt(color.slice(7), 16) : 255;
  const byte = Math.round(alpha * opacity);
  return byte === 255
    ? color.slice(0, 7)
    : color.slice(0, 7) + byte.toString(16).padStart(2, '0');
}

const STOP_ATTRIBUTES = ['offset', 'stop-color', 'stop-opacity', 'style', 'id', 'class'];
const STOP_PROPERTIES = ['stop-color', 'stop-opacity'];

/** The `stop-color` and `stop-opacity` of a stop: attributes, then `style` (which wins). */
function stopProperties(stop: XmlElement, env: GradientEnv): Map<string, string> {
  const values = new Map<string, string>();
  for (const [name, value] of stop.attributes) {
    if (STOP_PROPERTIES.includes(name)) values.set(name, value);
    else if (!STOP_ATTRIBUTES.includes(name) && !isXmlns(name))
      env.problems.add(unsupportedAttribute('stop', name));
  }
  for (const [name, value] of styleDeclarations(stop.attributes.get('style') ?? '')) {
    if (STOP_PROPERTIES.includes(name)) values.set(name, value);
    else env.problems.add(unsupportedAttribute('stop', name));
  }
  return values;
}

const isXmlns = (name: string): boolean => name === 'xmlns' || name.startsWith('xmlns:');

function stopColor(text: string | undefined, env: GradientEnv): string {
  if (text === undefined) return '#000000';
  if (text.trim().toLowerCase() === 'currentcolor') {
    env.problems.add(unsupportedAttribute('stop', 'stop-color'));
    return '#000000';
  }
  const color = env.normalizeColor(text);
  if (color === undefined) env.problems.add(invalidValue('stop', 'stop-color', text));
  return color ?? '#000000';
}

function stopOpacity(text: string | undefined, env: GradientEnv): number {
  if (text === undefined) return 1;
  const opacity = parseFraction(text);
  if (opacity === undefined) env.problems.add(invalidValue('stop', 'stop-opacity', text));
  return opacity ?? 1;
}

/** One stop: the offset never goes below `previous` (as SVG does). */
function readStop(
  stop: XmlElement,
  previous: number,
  env: GradientEnv,
): IconGradientStop {
  const values = stopProperties(stop, env);
  const written = stop.attributes.get('offset');
  const parsed = written === undefined ? 0 : parseFraction(written);
  if (parsed === undefined)
    env.problems.add(invalidValue('stop', 'offset', written ?? ''));
  const color = stopColor(values.get('stop-color'), env);
  const opacity = stopOpacity(values.get('stop-opacity'), env);
  return {
    offset: round(Math.max(parsed ?? 0, previous)),
    color: withOpacity(color, opacity),
  };
}

/** The stops of the gradient, in order; a child that is not a `stop` is named. */
function readStops(gradient: XmlElement, env: GradientEnv): IconGradientStop[] {
  const stops: IconGradientStop[] = [];
  for (const child of gradient.children) {
    if (child.name === 'stop')
      stops.push(readStop(child, stops.at(-1)?.offset ?? 0, env));
    else env.problems.add(unsupportedElement(child.name));
  }
  return stops;
}

// ---------------------------------------------------------------------------------------------
// The attributes both gradients share

/** Reports the attributes of the gradient that are not `own` or one the conversion reads. */
function checkAttributes(
  gradient: XmlElement,
  own: readonly string[],
  env: GradientEnv,
): void {
  for (const [name, value] of gradient.attributes) {
    if (name === 'href' || name === 'xlink:href')
      env.problems.add(unsupportedAttribute(gradient.name, 'href'));
    else if (name === 'spreadMethod' && value.trim() !== 'pad')
      env.problems.add(unsupportedAttribute(gradient.name, name));
    else if (!isKnown(name, own))
      env.problems.add(unsupportedAttribute(gradient.name, name));
  }
  if (gradient.attributes.get('gradientUnits')?.trim() !== 'userSpaceOnUse')
    env.problems.add(unsupportedAttribute(gradient.name, 'gradientUnits'));
}

const COMMON = ['id', 'class', 'gradientUnits', 'gradientTransform', 'spreadMethod'];

const isKnown = (name: string, own: readonly string[]): boolean =>
  COMMON.includes(name) || own.includes(name) || isXmlns(name);

/** `gradientTransform` as a matrix with an invertible linear part; `undefined` after reporting it. */
function transformOf(gradient: XmlElement, env: GradientEnv): Matrix | undefined {
  const text = gradient.attributes.get('gradientTransform');
  if (text === undefined) return IDENTITY;
  const matrix = parseTransform(text);
  if (matrix !== undefined && invertLinear(matrix) !== undefined) return matrix;
  env.problems.add(invalidValue(gradient.name, 'gradientTransform', text));
  return undefined;
}

/** A coordinate attribute in user units; `fallback` (a percentage text) when absent. */
function coordinate(
  gradient: XmlElement,
  name: string,
  fallback: string,
  percent: number,
  env: GradientEnv,
): number {
  const text = gradient.attributes.get(name) ?? fallback;
  const value = parseCoordinate(text, percent);
  if (value === undefined) env.problems.add(invalidValue(gradient.name, name, text));
  return value ?? 0;
}

/** The paint of a gradient that has fewer than two stops or draws one color: `none`, or that color. */
function flat(stops: readonly IconGradientStop[]): GradientPaint {
  const last = stops.at(-1);
  return last === undefined ? { kind: 'none' } : { kind: 'color', value: last.color };
}

const gradientOf = (gradient: IconGradient): GradientPaint => ({
  kind: 'gradient',
  gradient,
});

// ---------------------------------------------------------------------------------------------
// Linear

const LINEAR_ATTRIBUTES = ['x1', 'y1', 'x2', 'y2'];

/**
 * The end point that keeps SVG's perpendicular isolines under any affine `matrix`: with `L` the
 * linear part and `d = P2 − P1`, `g = L⁻ᵀ·d` and `to = from + g·|d|²/|g|²` (decision 4).
 */
function linearPoints(matrix: Matrix, p1: Point, p2: Point): { from: Point; to: Point } {
  const [a, b, c, d] = matrix;
  const det = a * d - b * c;
  const [dx, dy] = [p2[0] - p1[0], p2[1] - p1[1]];
  const g: Point = [(d * dx - b * dy) / det, (a * dy - c * dx) / det];
  const scale = (dx * dx + dy * dy) / (g[0] * g[0] + g[1] * g[1]);
  const from = applyToPoint(matrix, p1);
  return { from, to: [from[0] + g[0] * scale, from[1] + g[1] * scale] };
}

function convertLinear(
  gradient: XmlElement,
  stops: IconGradientStop[],
  env: GradientEnv,
): GradientPaint | undefined {
  checkAttributes(gradient, LINEAR_ATTRIBUTES, env);
  const matrix = transformOf(gradient, env);
  const [w, h] = env.box;
  const p1: Point = [
    coordinate(gradient, 'x1', '0%', w, env),
    coordinate(gradient, 'y1', '0%', h, env),
  ];
  const p2: Point = [
    coordinate(gradient, 'x2', '100%', w, env),
    coordinate(gradient, 'y2', '0%', h, env),
  ];
  if (matrix === undefined) return undefined;
  if (stops.length < 2 || (p1[0] === p2[0] && p1[1] === p2[1])) return flat(stops);
  const { from, to } = linearPoints(matrix, p1, p2);
  return gradientOf({
    type: 'linear',
    from: [round(from[0]), round(from[1])],
    to: [round(to[0]), round(to[1])],
    stops,
  });
}

// ---------------------------------------------------------------------------------------------
// Radial

const RADIAL_ATTRIBUTES = ['cx', 'cy', 'r', 'fx', 'fy', 'fr'];
/** The tolerance of the circle test (decision 5): 0.1%. */
const CIRCLE_TOLERANCE = 0.001;

/** The lengths of the columns of the linear part when the transform is a circle's: else `undefined`. */
function circleScale(matrix: Matrix): number | undefined {
  const [a, b, c, d] = matrix;
  const u = Math.hypot(a, b);
  const v = Math.hypot(c, d);
  const equal = Math.abs(u - v) <= CIRCLE_TOLERANCE * Math.max(u, v);
  const square = Math.abs(a * c + b * d) <= CIRCLE_TOLERANCE * u * v;
  return equal && square ? (u + v) / 2 : undefined;
}

/** `fx`, `fy` and `fr`: only the center and radius 0 are accepted (a focal point is out). */
function checkFocus(
  gradient: XmlElement,
  center: Point,
  size: { readonly box: readonly [number, number]; readonly r: number },
  env: GradientEnv,
): void {
  const at = (name: string, fallback: number, percent: number): number | undefined => {
    const text = gradient.attributes.get(name);
    return text === undefined ? fallback : parseCoordinate(text, percent);
  };
  if (at('fx', center[0], size.box[0]) !== center[0])
    env.problems.add(unsupportedAttribute(gradient.name, 'fx'));
  if (at('fy', center[1], size.box[1]) !== center[1])
    env.problems.add(unsupportedAttribute(gradient.name, 'fy'));
  if (at('fr', 0, size.r) !== 0)
    env.problems.add(unsupportedAttribute(gradient.name, 'fr'));
}

/** Fractions of the `viewBox`; the file only accepts a center from 0 to 1. */
function centerOf(
  matrix: Matrix,
  at: Point,
  box: readonly [number, number],
): Point | undefined {
  const [x, y] = applyToPoint(matrix, at);
  const center: Point = [round(x / box[0]), round(y / box[1])];
  return center.every((n) => n >= 0 && n <= 1) ? center : undefined;
}

function convertRadial(
  gradient: XmlElement,
  stops: IconGradientStop[],
  env: GradientEnv,
): GradientPaint | undefined {
  checkAttributes(gradient, RADIAL_ATTRIBUTES, env);
  const matrix = transformOf(gradient, env);
  const [w, h] = env.box;
  const measure = Math.sqrt((w * w + h * h) / 2);
  const center: Point = [
    coordinate(gradient, 'cx', '50%', w, env),
    coordinate(gradient, 'cy', '50%', h, env),
  ];
  const r = coordinate(gradient, 'r', '50%', measure, env);
  checkFocus(gradient, center, { box: env.box, r: measure }, env);
  if (r < 0)
    env.problems.add(
      invalidValue(gradient.name, 'r', gradient.attributes.get('r') ?? ''),
    );
  if (matrix === undefined || r < 0) return undefined;
  if (stops.length < 2 || r === 0) return flat(stops);
  return radialPaint(gradient, { matrix, center, r, stops }, env);
}

interface RadialParts {
  readonly matrix: Matrix;
  readonly center: Point;
  readonly r: number;
  readonly stops: IconGradientStop[];
}

/** The circle: its center in fractions and its radius in `viewBox` units, or the error that names the ellipse. */
function radialPaint(
  gradient: XmlElement,
  { matrix, center, r, stops }: RadialParts,
  env: GradientEnv,
): GradientPaint | undefined {
  const scale = circleScale(matrix);
  if (scale === undefined) {
    const id = gradient.attributes.get('id') ?? '';
    env.problems.add(templateMessage('svgIcon.radialElliptical', { id }));
    return undefined;
  }
  const placed = centerOf(matrix, center, env.box);
  if (placed === undefined) {
    env.problems.add(unsupportedAttribute(gradient.name, 'cx'));
    return undefined;
  }
  return gradientOf({ type: 'radial', center: placed, radius: round(r * scale), stops });
}

// ---------------------------------------------------------------------------------------------
// The entry

/**
 * The paint of a `linearGradient` or `radialGradient` definition: a gradient, the literal color it
 * reduces to (one stop, `P1 = P2`, `r = 0`) or `none` (no stop). `undefined` after reporting what
 * the file format cannot say, in `env.problems`.
 */
export function convertGradient(
  gradient: XmlElement,
  env: GradientEnv,
): GradientPaint | undefined {
  const own = new Problems();
  const local: GradientEnv = { ...env, problems: own };
  const stops = readStops(gradient, local);
  const paint =
    gradient.name === 'linearGradient'
      ? convertLinear(gradient, stops, local)
      : convertRadial(gradient, stops, local);
  for (const message of own.list()) env.problems.add(message);
  return own.size === 0 ? paint : undefined;
}
