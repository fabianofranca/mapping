import { templateMessage } from '../messages';
import type { ModelMessage } from '../modelMessage';
import {
  ICON_NAME_PATTERN,
  type IconCap,
  type IconDef,
  type IconFillRule,
  type IconJoin,
  type IconPath,
} from './icons';
import { SHAPE_ATTRIBUTES, isBasicShape, parseLength, shapePath } from './svgShapes';
import { parseXml, type XmlElement } from './svgXml';

/**
 * SVG file → icon entry of the library's icon set (stage #2087, decisions 5 to 7).
 *
 * `svgToIcon(text, options)` reads the SVG with `svgXml.ts`, turns the basic shapes into path data
 * with `svgShapes.ts`, resolves the presentation properties (as attributes or inside `style`,
 * inherited from `g` and `svg`) into `fill`, `fillRule`, `stroke`, `width`, `cap` and `join`, and
 * applies the color rule (a single color follows the `icon` node; several are kept as written).
 *
 * What it does not support is an error that names it (`unsupported in SVG: <element>
 * <attribute>`), never a silent loss: `transform`, gradients and `url(#…)` paints, `mask`,
 * `filter`, any clip other than the full-`viewBox` one that Figma wraps its icons in, `use`, `text`,
 * `image`, opacity below 1, `stroke-dasharray`, a `viewBox` with an origin other than `0 0`, and
 * units other than px.
 *
 * Pure functions, no DOM: it runs in Node (the `import_icons` tool) and in the browser.
 */

export type SvgColors = 'auto' | 'keep';

export interface SvgIconOptions {
  /** The icon name; wins over the one that comes from `file`. */
  readonly name?: string;
  /** The file name (`Check Circle_Fill.svg`): the name comes from it (`iconNameFromFile`). */
  readonly file?: string;
  /** `auto` (default): one color follows the `icon` node. `keep`: the literal colors stay. */
  readonly colors?: SvgColors;
  /** Sets `mirror` on the icon (it flips horizontally in `rtl`). */
  readonly mirror?: boolean;
  /** The icons file's `viewBox`: the icon omits its own when it is the same. */
  readonly defaultViewBox?: readonly [number, number];
}

export type SvgIconResult =
  | {
      readonly ok: true;
      /** The name, when the options gave `name` or `file`. */
      readonly name?: string;
      readonly icon: IconDef;
      /** The box of the SVG (the icon's `viewBox`, written or omitted by `defaultViewBox`). */
      readonly viewBox: readonly [number, number];
    }
  | { readonly ok: false; readonly problems: readonly ModelMessage[] };

/**
 * The icon name from a file name (decision 7): lowercase, every character outside `[a-z0-9-_]`
 * becomes `-`, repeated `-` collapse and the edges are trimmed. The result can still be invalid
 * (empty, or starting with `_`): `svgToIcon` reports it.
 */
export function iconNameFromFile(file: string): string {
  const base = file.slice(Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\')) + 1);
  const dashed = base
    .replace(/\.svg$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-');
  let start = 0;
  let end = dashed.length;
  while (start < end && dashed[start] === '-') start++;
  while (end > start && dashed[end - 1] === '-') end--;
  return dashed.slice(start, end);
}

// ---------------------------------------------------------------------------------------------
// Problems

class Problems {
  private readonly byText = new Map<string, ModelMessage>();

  add(message: ModelMessage): void {
    if (!this.byText.has(message.text)) this.byText.set(message.text, message);
  }

  get size(): number {
    return this.byText.size;
  }

  list(): ModelMessage[] {
    return [...this.byText.values()];
  }
}

const unsupportedElement = (element: string): ModelMessage =>
  templateMessage('svgIcon.unsupportedElement', { element });
const unsupportedAttribute = (element: string, attribute: string): ModelMessage =>
  templateMessage('svgIcon.unsupportedAttribute', { element, attribute });
const invalidValue = (element: string, attribute: string, value: string): ModelMessage =>
  templateMessage('svgIcon.invalidValue', { element, attribute, value });

// ---------------------------------------------------------------------------------------------
// Colors and paints

type Paint =
  | { readonly kind: 'none' }
  | { readonly kind: 'current' }
  | { readonly kind: 'color'; readonly value: string };

const NONE: Paint = { kind: 'none' };
const BLACK: Paint = { kind: 'color', value: '#000000' };

/** The basic CSS colors by name (what the editors that export SVG write). */
const NAMED_COLORS: Readonly<Record<string, string>> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  lime: '#00ff00',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  aqua: '#00ffff',
  magenta: '#ff00ff',
  fuchsia: '#ff00ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  maroon: '#800000',
  olive: '#808000',
  green: '#008000',
  teal: '#008080',
  navy: '#000080',
  purple: '#800080',
  orange: '#ffa500',
  transparent: '#00000000',
};

const hex2 = (n: number): string => n.toString(16).padStart(2, '0');

/** `#rrggbb`, or `#rrggbbaa` when the alpha is not full. */
function hexColor(r: number, g: number, b: number, a: number): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${a < 255 ? hex2(a) : ''}`;
}

function shortHex(digits: string): string {
  const full = digits.length <= 4 ? [...digits].map((c) => c + c).join('') : digits;
  return full.length === 8 && full.endsWith('ff') ? full.slice(0, 6) : full;
}

const CHANNEL = /^[+-]?(?:\d+\.?\d*|\.\d+)%?$/;

/** A channel of `rgb()` (0 to 255, or a percentage) or the alpha (0 to 1, or a percentage), as 0 to 255. */
function channel(text: string, scale: number): number | undefined {
  if (!CHANNEL.test(text)) return undefined;
  const percent = text.endsWith('%');
  const n = Number(percent ? text.slice(0, -1) : text);
  // A percentage is n/100 of 255, computed that way so that 50% is 127.5 (not 127.49999).
  const value = percent ? (n * 255) / 100 : n * scale;
  return Math.round(Math.min(255, Math.max(0, value)));
}

function rgbColor(inner: string): string | undefined {
  const parts = inner
    .trim()
    .split(/[\s,/]+/)
    .filter((p) => p !== '');
  if (parts.length !== 3 && parts.length !== 4) return undefined;
  const [r, g, b] = parts.slice(0, 3).map((p) => channel(p, 1));
  const a = parts[3] === undefined ? 255 : channel(parts[3], 255);
  if (r === undefined || g === undefined || b === undefined || a === undefined)
    return undefined;
  return hexColor(r, g, b, a);
}

/** `#rrggbb` or `#rrggbbaa` (lowercase) from a hex color, `rgb()`/`rgba()` or a basic name. */
export function normalizeColor(value: string): string | undefined {
  const text = value.trim().toLowerCase();
  const digits = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text)?.[1];
  if (digits !== undefined) return `#${shortHex(digits)}`;
  const inner = /^rgba?\(([^)]*)\)$/.exec(text)?.[1];
  if (inner !== undefined) return rgbColor(inner);
  return Object.hasOwn(NAMED_COLORS, text) ? NAMED_COLORS[text] : undefined;
}

function parsePaint(value: string): Paint | undefined {
  const text = value.trim().toLowerCase();
  if (text === 'none') return NONE;
  if (text === 'currentcolor') return { kind: 'current' };
  const color = normalizeColor(text);
  return color === undefined ? undefined : { kind: 'color', value: color };
}

// ---------------------------------------------------------------------------------------------
// Presentation properties

interface Style {
  readonly fill: Paint;
  readonly fillRule: IconFillRule;
  readonly stroke: Paint;
  readonly width: number;
  readonly cap: IconCap;
  readonly join: IconJoin;
}

/** The SVG defaults: black fill, no stroke, width 1, butt caps and miter joins. */
const DEFAULT_STYLE: Style = {
  fill: BLACK,
  fillRule: 'nonzero',
  stroke: NONE,
  width: 1,
  cap: 'butt',
  join: 'miter',
};

/** A property handler: the style with the value applied, or `undefined` if the value is not supported. */
type Handler = (style: Style, value: string) => Style | undefined;

const oneOf = <T extends string>(value: string, allowed: readonly T[]): T | undefined =>
  allowed.find((item) => item === value.trim());

/** `opacity`, `fill-opacity` and `stroke-opacity` only accept 1: below it the icon would change. */
const fullOpacity: Handler = (style, value) =>
  Number(value.trim()) === 1 ? style : undefined;

const PROPERTIES: Readonly<Record<string, Handler>> = {
  fill(style, value) {
    const fill = parsePaint(value);
    return fill === undefined ? undefined : { ...style, fill };
  },
  stroke(style, value) {
    const stroke = parsePaint(value);
    return stroke === undefined ? undefined : { ...style, stroke };
  },
  'fill-rule'(style, value) {
    const fillRule = oneOf(value, ['nonzero', 'evenodd'] as const);
    return fillRule === undefined ? undefined : { ...style, fillRule };
  },
  'stroke-width'(style, value) {
    const width = parseLength(value);
    return typeof width === 'number' && width >= 0 ? { ...style, width } : undefined;
  },
  'stroke-linecap'(style, value) {
    const cap = oneOf(value, ['butt', 'round', 'square'] as const);
    return cap === undefined ? undefined : { ...style, cap };
  },
  'stroke-linejoin'(style, value) {
    const join = oneOf(value, ['miter', 'round', 'bevel'] as const);
    return join === undefined ? undefined : { ...style, join };
  },
  opacity: fullOpacity,
  'fill-opacity': fullOpacity,
  'stroke-opacity': fullOpacity,
  'stroke-dasharray': (style, value) => (value.trim() === 'none' ? style : undefined),
};

/** Properties that change nothing in the converted icon (silently ignored, decision 5). */
const SILENT_PROPERTIES: ReadonlySet<string> = new Set([
  'clip-rule',
  'stroke-miterlimit',
]);
/** Attributes that identify or describe the file and never change the drawing. */
const SILENT_ATTRIBUTES: ReadonlySet<string> = new Set(['id', 'class', 'version']);
/** Elements dropped with everything inside them. */
const SILENT_ELEMENTS: ReadonlySet<string> = new Set(['title', 'desc', 'metadata']);

const isXmlns = (name: string): boolean => name === 'xmlns' || name.startsWith('xmlns:');

/** The `name: value` declarations of a `style` attribute (an invalid one is dropped, as CSS does). */
function styleDeclarations(text: string): [string, string][] {
  const out: [string, string][] = [];
  for (const part of text.split(';')) {
    const colon = part.indexOf(':');
    if (colon > 0)
      out.push([part.slice(0, colon).trim().toLowerCase(), part.slice(colon + 1)]);
  }
  return out;
}

/**
 * The element's own declarations (`style` wins over the attribute) applied over the inherited
 * style. An unsupported property or value is reported and leaves the style as it was.
 */
function styleOf(element: XmlElement, inherited: Style, problems: Problems): Style {
  const declared = new Map<string, string>();
  for (const [name, value] of element.attributes)
    if (Object.hasOwn(PROPERTIES, name)) declared.set(name, value);
  const inline = element.attributes.get('style');
  for (const [name, value] of inline === undefined ? [] : styleDeclarations(inline)) {
    if (Object.hasOwn(PROPERTIES, name)) declared.set(name, value);
    else if (!SILENT_PROPERTIES.has(name))
      problems.add(unsupportedAttribute(element.name, name));
  }
  let style = inherited;
  for (const [name, value] of declared) {
    const next = (PROPERTIES[name] as Handler)(style, value);
    if (next === undefined) problems.add(unsupportedAttribute(element.name, name));
    else style = next;
  }
  return style;
}

/** Reports every attribute of the element that is not a property, silent or one of `own`. */
function checkAttributes(
  element: XmlElement,
  own: readonly string[],
  problems: Problems,
): void {
  for (const name of element.attributes.keys()) {
    const known =
      name === 'style' ||
      Object.hasOwn(PROPERTIES, name) ||
      SILENT_PROPERTIES.has(name) ||
      SILENT_ATTRIBUTES.has(name) ||
      isXmlns(name) ||
      own.includes(name);
    if (!known) problems.add(unsupportedAttribute(element.name, name));
  }
}

// ---------------------------------------------------------------------------------------------
// The box

type Box = readonly [number, number];

/** The `viewBox`: four numbers, origin `0 0`, positive size. */
function viewBoxOf(value: string, problems: Problems): Box | undefined {
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map(parseLength);
  if (parts.length !== 4 || !parts.every((n) => typeof n === 'number')) {
    problems.add(invalidValue('svg', 'viewBox', value));
    return undefined;
  }
  const [x, y, w, h] = parts as number[];
  if (x !== 0 || y !== 0) {
    problems.add(templateMessage('svgIcon.viewBoxOrigin', { value: value.trim() }));
    return undefined;
  }
  if ((w as number) <= 0 || (h as number) <= 0) {
    problems.add(invalidValue('svg', 'viewBox', value));
    return undefined;
  }
  return [w as number, h as number];
}

/** One numeric side of the root without a `viewBox` (px only). */
function sideOf(root: XmlElement, name: string, problems: Problems): number | undefined {
  const value = root.attributes.get(name);
  if (value === undefined) return undefined;
  const n = parseLength(value);
  if (n === 'unit') problems.add(unsupportedAttribute('svg', name));
  else if (n === undefined || n <= 0) problems.add(invalidValue('svg', name, value));
  return typeof n === 'number' && n > 0 ? n : undefined;
}

/** The `viewBox`; without one, the numeric `width` and `height` of the root are the box. */
function boxOf(root: XmlElement, problems: Problems): Box | undefined {
  const viewBox = root.attributes.get('viewBox');
  if (viewBox !== undefined) return viewBoxOf(viewBox, problems);
  const w = sideOf(root, 'width', problems);
  const h = sideOf(root, 'height', problems);
  if (w !== undefined && h !== undefined) return [w, h];
  if (
    root.attributes.get('width') === undefined ||
    root.attributes.get('height') === undefined
  )
    problems.add(templateMessage('svgIcon.noSize'));
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Figma's wrapper: a `clip-path` on a `g` whose `<clipPath>` is a `rect` covering the `viewBox`

const CLIP_RECT_ATTRIBUTES = ['x', 'y', 'width', 'height', 'fill', 'id'];

function coversBox(rect: XmlElement, box: Box): boolean {
  const at = (name: string, fallback: number): number | undefined => {
    const value = rect.attributes.get(name);
    const n = value === undefined ? fallback : parseLength(value);
    return typeof n === 'number' ? n : undefined;
  };
  return (
    rect.name === 'rect' &&
    [...rect.attributes.keys()].every((name) => CLIP_RECT_ATTRIBUTES.includes(name)) &&
    at('x', 0) === 0 &&
    at('y', 0) === 0 &&
    at('width', NaN) === box[0] &&
    at('height', NaN) === box[1]
  );
}

function isFullClip(clip: XmlElement, box: Box): boolean {
  const [rect] = clip.children;
  return (
    clip.children.length === 1 &&
    rect !== undefined &&
    rect.children.length === 0 &&
    [...clip.attributes.keys()].every((name) => name === 'id') &&
    coversBox(rect, box)
  );
}

/** The ids of the `<clipPath>`s of the file that are the full-`viewBox` clip. */
function fullClipIds(
  element: XmlElement,
  box: Box,
  ids = new Set<string>(),
): Set<string> {
  const id = element.attributes.get('id');
  if (element.name === 'clipPath' && id !== undefined && isFullClip(element, box))
    ids.add(id);
  for (const child of element.children) fullClipIds(child, box, ids);
  return ids;
}

const CLIP_REFERENCE = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)$/;

// ---------------------------------------------------------------------------------------------
// The walk

interface Shape {
  readonly d: string;
  readonly style: Style;
}

interface Walk {
  readonly box: Box;
  readonly clips: ReadonlySet<string>;
  readonly shapes: Shape[];
  readonly problems: Problems;
}

/** `<defs>` only holds the full-`viewBox` clips; anything else in it is named. */
function visitDefs(walk: Walk, defs: XmlElement): void {
  checkAttributes(defs, [], walk.problems);
  for (const child of defs.children)
    if (child.name !== 'clipPath') walk.problems.add(unsupportedElement(child.name));
    else if (!isFullClip(child, walk.box))
      walk.problems.add(unsupportedElement('clipPath'));
}

function visitGroup(walk: Walk, group: XmlElement, inherited: Style): void {
  checkAttributes(group, ['clip-path'], walk.problems);
  const clip = group.attributes.get('clip-path');
  if (clip !== undefined) {
    const id = CLIP_REFERENCE.exec(clip.trim())?.[1];
    if (id === undefined || !walk.clips.has(id))
      walk.problems.add(unsupportedAttribute('g', 'clip-path'));
  }
  visitChildren(walk, group, styleOf(group, inherited, walk.problems));
}

/** The path data of a `path` or of a basic shape; `undefined` after reporting what is wrong. */
function dataOf(walk: Walk, element: XmlElement): string | undefined {
  if (element.name === 'path') {
    const d = element.attributes.get('d');
    if (d === undefined || d.trim() === '')
      walk.problems.add(invalidValue('path', 'd', d ?? ''));
    return d === undefined || d.trim() === '' ? undefined : d;
  }
  const result = shapePath(element.name, (name) => element.attributes.get(name));
  if (result === undefined || result.ok) return result?.d;
  const { attribute, unit } = result;
  walk.problems.add(
    unit
      ? unsupportedAttribute(element.name, attribute)
      : invalidValue(element.name, attribute, element.attributes.get(attribute) ?? ''),
  );
  return undefined;
}

function visitShape(walk: Walk, element: XmlElement, inherited: Style): void {
  checkAttributes(
    element,
    element.name === 'path' ? ['d'] : (SHAPE_ATTRIBUTES[element.name] ?? []),
    walk.problems,
  );
  const style = styleOf(element, inherited, walk.problems);
  const d = dataOf(walk, element);
  // A line has no area, so its fill is nothing (and does not count as the default black).
  if (d !== undefined)
    walk.shapes.push({
      d,
      style: element.name === 'line' ? { ...style, fill: NONE } : style,
    });
}

function visit(walk: Walk, element: XmlElement, inherited: Style): void {
  if (SILENT_ELEMENTS.has(element.name)) return;
  if (element.name === 'defs') visitDefs(walk, element);
  else if (element.name === 'g') visitGroup(walk, element, inherited);
  else if (element.name === 'path' || isBasicShape(element.name))
    visitShape(walk, element, inherited);
  else walk.problems.add(unsupportedElement(element.name));
}

function visitChildren(walk: Walk, parent: XmlElement, style: Style): void {
  for (const child of parent.children) visit(walk, child, style);
}

// ---------------------------------------------------------------------------------------------
// The entry

/**
 * Decision 6: the distinct literal colors over fill and stroke. With one (and not `keep`) every
 * paint that has it follows the `icon` node; with several each path keeps its own color.
 * `currentColor` is always the node's color and `none` is `false`.
 */
function paintResolver(
  shapes: readonly Shape[],
  colors: SvgColors,
): (paint: Paint) => boolean | string {
  const literals = new Set<string>();
  for (const { style } of shapes)
    for (const paint of [style.fill, style.stroke])
      if (paint.kind === 'color') literals.add(paint.value);
  const single = colors !== 'keep' && literals.size === 1;
  return (paint) => {
    if (paint.kind === 'none') return false;
    return paint.kind === 'current' || single ? true : paint.value;
  };
}

function iconPath(
  { d, style }: Shape,
  paint: (paint: Paint) => boolean | string,
): IconPath {
  return {
    d,
    fill: paint(style.fill),
    ...(style.stroke.kind === 'none'
      ? {}
      : {
          stroke: paint(style.stroke),
          width: style.width,
          ...(style.cap === 'butt' ? {} : { cap: style.cap }),
          ...(style.join === 'miter' ? {} : { join: style.join }),
        }),
    ...(style.fillRule === 'evenodd' ? { fillRule: 'evenodd' as const } : {}),
  };
}

function nameOf(options: SvgIconOptions, problems: Problems): string | undefined {
  const name =
    options.name ??
    (options.file === undefined ? undefined : iconNameFromFile(options.file));
  if (name !== undefined && !ICON_NAME_PATTERN.test(name))
    problems.add(templateMessage('svgIcon.nameInvalid', { name }));
  return name;
}

const failed = (problems: Problems): SvgIconResult => ({
  ok: false,
  problems: problems.list(),
});

/** Converts the text of an SVG file into an icon entry; never throws. */
export function svgToIcon(text: string, options: SvgIconOptions = {}): SvgIconResult {
  const parsed = parseXml(text);
  if (!parsed.ok) return { ok: false, problems: [parsed.error] };
  const { root } = parsed;
  const problems = new Problems();
  const name = nameOf(options, problems);
  if (root.name !== 'svg') {
    problems.add(templateMessage('svgIcon.notSvg', { element: root.name }));
    return failed(problems);
  }
  const box = boxOf(root, problems);
  checkAttributes(root, ['width', 'height', 'viewBox'], problems);
  if (box === undefined) return failed(problems);
  const walk: Walk = { box, clips: fullClipIds(root, box), shapes: [], problems };
  visitChildren(walk, root, styleOf(root, DEFAULT_STYLE, problems));
  if (problems.size === 0 && walk.shapes.length === 0)
    problems.add(templateMessage('svgIcon.noShape'));
  if (problems.size > 0) return failed(problems);
  const paint = paintResolver(walk.shapes, options.colors ?? 'auto');
  const sameBox =
    options.defaultViewBox?.[0] === box[0] && options.defaultViewBox[1] === box[1];
  const icon: IconDef = {
    ...(sameBox ? {} : { viewBox: box }),
    ...(options.mirror === true ? { mirror: true } : {}),
    paths: walk.shapes.map((shape) => iconPath(shape, paint)),
  };
  return { ok: true, ...(name === undefined ? {} : { name }), icon, viewBox: box };
}
