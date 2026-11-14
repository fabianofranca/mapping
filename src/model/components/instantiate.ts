/**
 * Component engine (Library stage): instantiates a component (`mapping-component`) in a box and
 * produces the scene tree that the Konva renderer already draws (`src/model/components/scene.ts`).
 *
 * Steps: (1) evaluates the expressions against the field values; (2) computes the size of each
 * node (px, %, `fill`, `hug`); (3) positions the children according to the parent's `layout`;
 * (4) builds the scene nodes. Pure functions, no DOM: the text is measured by an injected
 * `TextMeasurer`.
 *
 * Size rules (documented here for the tests and for whoever writes templates):
 * - Default for omitted `width`/`height`: `'hug'` for text, `'fill'` for everything else, on
 *   both axes. In a `none` parent, a child without a size and without anchors fills the whole parent.
 * - `width`/`height` accept an expression; the evaluated value must be a finite number ≥ 0, a
 *   purely numeric text (`"120"`), `fill`, `hug` or `"N%"`. Any other value falls back to the
 *   type's default, with the warning `invalid value in width: <value>` (or `height`). The same
 *   holds for `layout.type`, `layout.align` and `layout.justify` (defaults `none`, `start`,
 *   `start`).
 * - Fixed px; `"N%"` is a fraction of the parent's content area; `'hug'` comes from the content
 *   (measured text, a frame that wraps its children, path = `viewBox`, rectangle/ellipse/slot = 0;
 *   `image` does not accept `hug`).
 * - `'fill'` on the main axis of `row`/`column` divides what is left among the `fill`s; on the
 *   cross axis and in `none` it is the whole content area (minus the anchors, if any).
 * - `minWidth`/`maxWidth`/`minHeight`/`maxHeight` (px, accept an expression; a non-finite or
 *   negative value = absent) apply to any node, after the child's size is resolved (px, `%`,
 *   `hug`, `fill`). The `fill`s on the main axis divide what is left like flexbox: one that hits
 *   the `min` or the `max` freezes and the difference is split among the other `fill`s. `min` >
 *   `max` takes the `min`. A `hug` text cut by `maxWidth` measures its height by wrapping at the
 *   cut width. The root's limits only apply in `measureComponent` on a `hug` axis (with a given
 *   box the root fills the box); the instance's `minSize` (`layout.ts`) is applied after them.
 * - A `hug` frame, measured in two passes (flexbox shrink-to-fit): first the content is measured
 *   within the available limit (the parent's content, or the limit the parent itself received;
 *   the root uses its `max`): a `fill` child on the cross axis (or in `none`) contributes the
 *   smaller of the limit and what it would hug inside itself (text wrapped at the limit, a frame
 *   measured with the limit, path = `viewBox`, the rest 0) and `"N%"` with the limit × N / 100;
 *   with no known limit they are 0. Then the result becomes the frame's size and `fill`/`%` are
 *   resolved against it (the text is measured at that width). Only `fill` on the main axis of a
 *   `hug` warns ("fill inside hug becomes 0"), because there the result really is 0. Text measured
 *   with maximum width 0 warns `text measured with width 0: <name>`. `hug` text does not wrap.
 * - Anchors (`none` parent): `left`+`right` (or `top`+`bottom`) stretch the child between them,
 *   even if it has a fixed size (like Figma's constraints).
 * - `lineHeight` is handed to the `TextMeasurer` already in px.
 * - A `slot` node with `options.slotContent` (size of the already arranged children plus the
 *   slot's padding, coming from `layout.ts`): `hug` takes the axis's `slotContent`; `fill` (or
 *   anchors on both sides) with the parent being measured (`hug`) also does, without the "fill
 *   inside hug" warning. With the parent already measured, `fill` divides what is left, which is
 *   then the `slotContent` itself. Without `slotContent` nothing changes (the slot is 0 when
 *   measuring). `measureComponent` measures only the root's plan.
 */
import type {
  Anchors,
  BoolExpr,
  Color,
  ComponentFile,
  Direction,
  Expr,
  FieldValues,
  FillSpec,
  FontSpec,
  FrameTemplate,
  LayoutSpec,
  GradientSpec,
  IconTemplate,
  LayoutAlign,
  LayoutJustify,
  LayoutWrap,
  ImageTemplate,
  IntrinsicSize,
  PathTemplate,
  ShadowSpec,
  SizeSpec,
  StrokeSide,
  StrokeSpec,
  TemplateNode,
  TextRunTemplate,
  TextTemplate,
} from './componentFormat';
import type { Box } from './box';
import { STROKE_SIDES } from './componentFormat';
import { clipBoxOf } from './clipBox';
import { DEFAULT_ICON_VIEWBOX, resolveIcon, type IconPath, type IconSet } from './icons';
import {
  evaluate,
  evaluateBoolean,
  evaluateText,
  DIRECTION_FIELD,
  linesCitations,
  linesKey,
  linesNodeName,
  providedKey,
  referencedFields,
  sizeKey,
  toNumber,
  type ProvidedValues,
} from './expressions';
import {
  LAYOUT_ALIGNS,
  LAYOUT_JUSTIFIES,
  LAYOUT_TYPES,
  NONE_ALIGNS,
  NONE_JUSTIFIES,
  LAYOUT_WRAPS,
  allowedValue,
  describeValue,
  isIntrinsicSize,
  justifySpacing,
  mirrorMain,
  parseSizeSpec,
} from './layoutValues';
import { providingSlot } from './provided';
import { anchorFieldValues, type InstanceAnchor } from './anchor';
import { ownDirection, resolveDirections } from './direction';
import { createMessageSet, textsOf, type Params } from '../messages/collector';
import type { ModelMessageTemplateCode } from '../messages';
import type { ModelMessage } from '../modelMessage';
import { expandRepeats } from './repeat';
import { applyGaps } from './strokeGaps';
import { approximateExtents, lineBaseline, type CapMetrics } from './baseline';
import { withMeasureMemo } from './measureCache';
import { WRAP_SLACK } from './textWrap';
import {
  applyTokens,
  defaultFontFamily,
  resolveTokens,
  type ResolvedTokens,
} from './tokens';
import {
  alignInCell,
  placeCells,
  spanExtent,
  trackCount,
  trackOffset,
  trackSize,
  type GridCell,
} from './gridLayout';
import {
  TRACK_KEYS,
  lineExtents,
  maxCellOf,
  isTrackAbsent,
  numericValue,
  validTrack,
  type GridTracks,
} from './gridPlan';
import { breakLines, stackLines } from './wrapLines';
import {
  layoutRuns,
  measureRichText,
  minContentRuns,
  type RichBase,
  type RichRun,
  type RunLayout,
  dropLastChar,
} from './richText';
import {
  type CornerRadius,
  type FrameNode,
  type Matrix,
  type Paint,
  type PathNode,
  type SceneNode,
  type SceneTextRun,
  type Shadow,
  type Stroke,
  type TextNode,
  type TextStyle,
  baseNode,
  translate,
} from './scene';

const STROKE_CAPS = ['butt', 'round', 'square'] as const;
const STROKE_JOINS = ['miter', 'round', 'bevel'] as const;

export type { Box };

export interface TextMetrics {
  readonly width: number;
  readonly height: number;
  /** The lines as they will be drawn (already with the `…`), when the measurer can tell them. */
  readonly lines?: readonly string[];
  /**
   * Baseline of the first and last line, in px from the top of the text box (with the text at
   * the top), and the number of measured lines. A measurer without a font may not report them:
   * the engine then uses the approximate computation (decision 2 of #898).
   */
  readonly firstBaseline?: number;
  readonly lastBaseline?: number;
  readonly lineCount?: number;
}

/** The font handed to the measurer: sizes already in px; `wrap`/`ellipsis`/`maxLines` only in v4. */
export interface MeasureFont {
  family: string;
  size: number;
  weight: number;
  italic: boolean;
  lineHeight: number;
  letterSpacing: number;
  /** `none` = one line per paragraph (absent = `word`). */
  wrap?: 'word' | 'none';
  /** Text that does not fit (in the width with `wrap: none`, or beyond `maxLines`) ends in `…`. */
  ellipsis?: boolean;
  /** Integer ≥ 1; the lines beyond it are cut. */
  maxLines?: number;
  /** `rtl` when the text reads right to left (absent = `ltr`); the measurer passes it on to the probe. */
  direction?: 'rtl';
}

/** Measures a text with the given font (optional maximum width, for line wrapping). */
export type TextMeasurer = (
  text: string,
  font: MeasureFont,
  maxWidth?: number,
) => TextMetrics;

export interface InstantiateOptions {
  readonly measure: TextMeasurer;
  /** Prefix of the node ids (e.g. the instance id). */
  readonly idPrefix?: string;
  /**
   * Size of the slot content (arranged children plus the slot's padding), to measure a
   * component whose size depends on its children (`hug`). See the comment at the top of the file.
   */
  readonly slotContent?: { readonly width: number; readonly height: number };
  /**
   * Tokens of the drawing mode, already resolved (`resolveTokens`); `font-sans` is the text's
   * default font. Absent = the component's (`resolvedTokens`, set by the catalog) or the built-in ones.
   */
  readonly tokens?: ResolvedTokens;
  /**
   * Icon set (`icons` of the specialization) read by the `icon` node. Absent = the component's
   * (`resolvedIcons`, set by the catalog); with none, every icon is unknown.
   */
  readonly icons?: IconSet;
  /**
   * Inherited color (v4): what the ancestors' slots offer, already resolved, by name; the
   * template's `$provided` reads it (with `default` when missing). Absent = no ancestor offers anything.
   */
  readonly provided?: ProvidedValues;
  /**
   * Reading direction of the instance (v4; default `ltr`): in `rtl` the rows, the grids, the
   * `start`/`end` positions and the default `font.align` mirror, and the `mirror` nodes flip. The
   * final position stays physical (x from the left): see "Reading direction" in `docs/COMPONENT-FORMAT.md`.
   */
  readonly direction?: Direction;
  /**
   * The marking's anchor (v4), already in component units and relative to the instance box (see
   * `anchorValues`, in `componentValues.ts`): it is what the template reads through `$anchor.side`,
   * `$anchor.x`, `$anchor.y`, `$anchor.width` and `$anchor.height`. Absent = no anchor (the five stay empty).
   */
  readonly anchor?: InstanceAnchor;
}

export interface Instantiated {
  readonly root: FrameNode;
  /**
   * The component's first baseline (px from the top of the box), that of the first text that
   * has one (`baselinePadding.top` included); absent = the component has no text. It is what the
   * parent slot's `align: "baseline"` reads.
   */
  readonly firstBaseline?: number;
  /**
   * What the component's `slot` offers to its children (`provide`), resolved with the fields,
   * the tokens and the mode of this instance; a value that produces nothing is left out. Absent =
   * offers nothing.
   */
  readonly provides?: ProvidedValues;
  readonly warnings: readonly string[];
  /** The same warnings with code and parameters (the interface translates them): `warnings` = their texts. */
  readonly messages: readonly ModelMessage[];
  /**
   * How much is missing (px) in each "does not fit" warning (`content larger than the box: …`,
   * `text larger than the box: …`), by the warning's message; the largest, if the same warning
   * repeats. Absent = empty.
   */
  readonly shortfalls?: Readonly<Record<string, number>>;
  /**
   * The warnings (among `warnings`) that are "does not fit", in creation order (`warnShort`):
   * this is how, and not by the message text, that the drawing recognizes the overflow. Absent =
   * empty.
   */
  readonly overflowWarnings?: readonly string[];
}

// ---------------------------------------------------------------------------------------
// Approximate measurer
// ---------------------------------------------------------------------------------------

/**
 * Wraps a paragraph by words (a word wider than the width stays alone on its line). The app's
 * drawing uses it so Konva wraps where the model wraps (`wordSafeText`).
 */
export function wrapWords(
  paragraph: string,
  widthOf: (text: string) => number,
  maxWidth: number,
): string[] {
  const words = paragraph.split(' ').filter((word) => word !== '');
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0] ?? '';
  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`;
    if (widthOf(candidate) > maxWidth + WRAP_SLACK) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  lines.push(current);
  return lines;
}

/** Removes letters from the end until `line` + `…` fits in `maxWidth` (at least the `…` always remains). */
function withEllipsis(
  line: string,
  widthOf: (text: string) => number,
  maxWidth: number | undefined,
): string {
  let kept = line;
  while (
    maxWidth !== undefined &&
    kept.length > 0 &&
    widthOf(`${kept}…`) > maxWidth + WRAP_SLACK
  )
    kept = dropLastChar(kept).trimEnd();
  return `${kept}…`;
}

/** Applies `maxLines` and `ellipsis` to the already wrapped lines. */
function clipLines(
  lines: readonly string[],
  font: MeasureFont,
  widthOf: (text: string) => number,
  maxWidth: number | undefined,
): string[] {
  const limit = font.maxLines;
  const cut = limit !== undefined && lines.length > limit;
  const kept = cut ? lines.slice(0, limit) : [...lines];
  if (font.ellipsis !== true) return kept;
  const last = kept.length - 1;
  return kept.map((line, i) => {
    const tooWide = maxWidth !== undefined && widthOf(line) > maxWidth + WRAP_SLACK;
    return (cut && i === last) || tooWide ? withEllipsis(line, widthOf, maxWidth) : line;
  });
}

/**
 * Wraps, cuts and measures a text with any width function (`widthOf`): `maxWidth` wraps by
 * words (a word wider than the width stays alone on its line), `wrap: none` is one line per
 * paragraph, `maxLines` cuts and `ellipsis` adds the `…`. It is the basis of the approximate
 * measurer and of the MCP server's real-font measurer.
 */
export function measureLines(
  text: string,
  font: MeasureFont,
  maxWidth: number | undefined,
  widthOf: (value: string) => number,
  extents: Pick<CapMetrics, 'ascent' | 'descent'> = approximateExtents(font.size),
): TextMetrics {
  const breaks = maxWidth !== undefined && font.wrap !== 'none';
  const raw = text
    .split('\n')
    .flatMap((paragraph) =>
      breaks ? wrapWords(paragraph, widthOf, maxWidth) : [paragraph],
    );
  const lines = clipLines(raw, font, widthOf, maxWidth);
  const widest = lines.reduce((max, line) => Math.max(max, widthOf(line)), 0);
  const count = Math.max(1, lines.length);
  return {
    width: widest,
    height: count * font.lineHeight,
    lines,
    ...lineBaselines(font.lineHeight, count, extents),
  };
}

/** `firstBaseline`, `lastBaseline` and `lineCount` of `count` lines of height `lineHeight`. */
export function lineBaselines(
  lineHeight: number,
  count: number,
  extents: Pick<CapMetrics, 'ascent' | 'descent'>,
): Pick<TextMetrics, 'firstBaseline' | 'lastBaseline' | 'lineCount'> {
  return {
    firstBaseline: lineBaseline(0, lineHeight, extents),
    lastBaseline: lineBaseline((count - 1) * lineHeight, lineHeight, extents),
    lineCount: count,
  };
}

/**
 * Approximate measurer without a canvas (tests and Node without a font): width ≈ 0.55 · size per
 * character (0.6 if the weight is ≥ 600) plus the letter spacing; height = lines × line height.
 */
export const approximateMeasurer: TextMeasurer = (text, font, maxWidth) => {
  const charWidth = font.size * (font.weight >= 600 ? 0.6 : 0.55) + font.letterSpacing;
  return measureLines(text, font, maxWidth, (value) =>
    Math.max(0, value.length * charWidth),
  );
};

// ---------------------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------------------

export interface Padding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** Number → all sides; `[v, h]`; `[top, right, bottom, left]`. */
export function normalizePadding(
  padding: number | readonly number[] | undefined,
): Padding {
  if (padding === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof padding === 'number')
    return { top: padding, right: padding, bottom: padding, left: padding };
  if (padding.length === 2) {
    const [v = 0, h = 0] = padding;
    return { top: v, right: h, bottom: v, left: h };
  }
  const [top = 0, right = 0, bottom = 0, left = 0] = padding;
  return { top, right, bottom, left };
}

type Axis = 'w' | 'h';

interface Kid {
  readonly node: TemplateNode;
  /** Index in the template (includes invisible children), for the id path. */
  readonly index: number;
}

interface FrameLayout {
  /** The frame's reading direction (the node's effective one): decides the `start`/`end` mirroring. */
  readonly dir: Direction;
  readonly kind: 'none' | 'row' | 'column' | 'grid';
  /** Main axis (`null` in `none` and `grid`). */
  readonly main: Axis | null;
  readonly gap: number;
  readonly pad: Padding;
  readonly align: LayoutAlign;
  readonly justify: LayoutJustify;
  /** Children in reverse order and `start` at the end (`layout.reverse`). */
  readonly reverse: boolean;
  /** Row wrapping (`layout.wrap`); `none` outside `row`/`column` and in formatVersion < 4. */
  readonly wrap: LayoutWrap;
  readonly lineGap: number;
  readonly maxPerLine?: number | undefined;
  readonly maxLines?: number | undefined;
  /** The grid tracks (`kind: 'grid'`); `lineGap` is the space between flow lines. */
  readonly grid?: GridTracks | undefined;
}

interface Placement {
  readonly kid: Kid;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Space of one axis when sizing the children: null `content` = the parent is being measured (hug). */
interface AxisSpace {
  /** The parent's content area, when already known. */
  readonly content: number | null;
  /** Limit available during measuring (null `content`); null = no known limit. */
  readonly bound: number | null;
}

/** Available limit per axis to measure a `hug` frame (null = unknown). */
interface Limits {
  readonly w: number | null;
  readonly h: number | null;
}

interface SizeLimit {
  readonly min: number;
  readonly max: number;
}

interface Plan {
  readonly w: number;
  readonly h: number;
  readonly placements: readonly Placement[];
}

const EPS = 0.001;
/** Tolerance (px) of the overflow that comes from text: the DOM and the canvas differ by fractions of a pixel. */
const TEXT_TOLERANCE = 1;
const FLEX_EPS = 1e-9;
const NO_SIZE_LIMIT: SizeLimit = { min: 0, max: Infinity };
const NO_LIMITS: Limits = { w: null, h: null };
const NONE_LAYOUT: FrameLayout = {
  dir: 'ltr',
  kind: 'none',
  main: null,
  gap: 0,
  pad: { top: 0, right: 0, bottom: 0, left: 0 },
  align: 'start',
  justify: 'start',
  reverse: false,
  wrap: 'none',
  lineGap: 0,
};

/** How far to move each child down so the baselines sit at the tallest one's (`align: "baseline"`). */
function baselineShifts(lines: readonly number[]): number[] {
  const above = Math.max(0, ...lines);
  return lines.map((line) => above - line);
}

function isNone(color: string): boolean {
  const c = color.trim().toLowerCase();
  return c === '' || c === 'none';
}

/** The limit only counts on a hug axis (`null`); with the size known there is nothing to limit. */
function effectiveBounds(w: number | null, h: number | null, limits: Limits): Limits {
  return { w: w === null ? limits.w : null, h: h === null ? limits.h : null };
}

function planKey(w: number | null, h: number | null, bounds: Limits): string {
  const part = (n: number | null) => n ?? 'n';
  return `${part(w)}x${part(h)}|${part(bounds.w)}x${part(bounds.h)}`;
}

function nodeName(node: TemplateNode): string {
  if (node.type === 'icon') return typeof node.name === 'string' ? node.name : 'icon';
  return node.name ?? node.type;
}

/** A node's anchors on one axis, already evaluated: absent (`undefined`) when the expression gives no value. */
interface ResolvedAnchors {
  start?: number;
  end?: number;
  center: boolean;
}

// ---------------------------------------------------------------------------------------
// Instantiation
// ---------------------------------------------------------------------------------------

/** The inherited values as reserved engine fields (`$provided:<name>`), where `$provided` reads them. */
function providedFields(
  provided: ProvidedValues | undefined,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(provided ?? {}))
    out[providedKey(name)] = value;
  return out;
}

/**
 * Builds a component's "engine" with its values: evaluation, sizes and frame plans.
 * `instantiate` and `measureComponent` share this closure (and the plan cache).
 * `linesSeed`: the number of lines that each `$lines` of the template is worth in this pass (the
 * first uses 1, the second what was measured in the first; see `withLinesPasses`).
 */
type OpenAxes = { readonly width: boolean; readonly height: boolean };

/** The values used to evaluate `min`/`max`: the `$size` of an open (`hug`) axis is infinite. */
function valuesForLimits(values: FieldValues, open: OpenAxes | undefined): FieldValues {
  if (open === undefined) return values;
  const next: Record<string, FieldValues[string]> = { ...values };
  if (open.width) next[sizeKey('width')] = Infinity;
  if (open.height) next[sizeKey('height')] = Infinity;
  return next;
}

function createEngine(
  original: ComponentFile,
  sourceValues: FieldValues,
  callerOptions: InstantiateOptions,
  instanceSize: { readonly width: number; readonly height: number },
  linesSeed?: ReadonlyMap<string, number>,
  openAxes?: OpenAxes,
) {
  // The measurer remembers each (text, font, limit) while the engine lasts (decision 19 of #1078);
  // the app's and the MCP's already memoize, and then it stays the same. Each `$lines` pass is an engine.
  const options: InstantiateOptions = {
    ...callerOptions,
    measure: withMeasureMemo(callerOptions.measure),
  };
  // `$token`s become the mode's value before anything else (also valid inside `repeat`).
  const tokens =
    options.tokens ?? original.resolvedTokens ?? resolveTokens(undefined, {});
  const source = applyTokens(original, tokens);
  // `repeat` becomes frames with each row's values before the engine starts.
  // `$size`: the instance size enters as two reserved values (no DOM), already at expansion,
  // so a `repeat`'s `count` can follow it too.
  const rootDirection: Direction = options.direction ?? 'ltr';
  const {
    component: expanded,
    values: expandedValues,
    messages: expansionMessages,
  } = expandRepeats(source, {
    ...sourceValues,
    [DIRECTION_FIELD]: rootDirection,
    ...anchorFieldValues(options.anchor),
    ...providedFields(options.provided),
    [sizeKey('width')]: instanceSize.width,
    [sizeKey('height')]: instanceSize.height,
  });
  // Each node's effective direction goes into the template (and the `$direction` condition becomes a literal).
  const directed = resolveDirections(expanded.template, rootDirection);
  const component =
    directed === expanded.template ? expanded : { ...expanded, template: directed };
  /** The node's effective direction: the one written by `resolveDirections`, or the instance's without it. */
  const dirOf = (node: TemplateNode): Direction => ownDirection(node) ?? rootDirection;
  // `$lines`: the number of lines of each cited node goes into the values (1 in the first pass).
  const citedLines = linesCitations(component.template);
  const values: FieldValues =
    citedLines.size === 0
      ? expandedValues
      : {
          ...expandedValues,
          ...Object.fromEntries(
            [...citedLines].map((key) => [linesKey(key), linesSeed?.get(key) ?? 1]),
          ),
        };
  /** The measured lines of each node cited by `$lines`, at its final size (the basis of the next pass). */
  const lineCounts = new Map<string, number>();
  const messageSet = createMessageSet(expansionMessages);
  const warn = (code: ModelMessageTemplateCode, params?: Params) =>
    messageSet.add(code, params);
  const shortfalls = new Map<string, number>();
  /** "Does not fit" warning: the usual message and how much is missing, for the drawing proof to tell. */
  const warnShort = (code: ModelMessageTemplateCode, name: string, missing: number) => {
    const { text } = warn(code, { name });
    shortfalls.set(text, Math.max(shortfalls.get(text) ?? 0, missing));
  };
  const prefix = options.idPrefix ?? 'c';

  for (const key of referencedFields(component.template))
    if (!(key in values)) warn('engine.fieldMissing', { key });

  // --- expression evaluation ------------------------------------------------------------

  const ev = <T>(expr: Expr<T> | undefined, fallback: T): T =>
    expr === undefined ? fallback : evaluate(expr, values, fallback);

  const num = (expr: Expr<number> | undefined, fallback: number): number => {
    const value = ev<unknown>(expr as Expr<unknown> | undefined, fallback);
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    return Number.isFinite(n) ? n : fallback;
  };

  const str = (expr: Expr<string> | undefined, fallback: string): string => {
    const value = ev<unknown>(expr as Expr<unknown> | undefined, fallback);
    return value === null || value === undefined ? fallback : String(value);
  };

  /** Boolean (`visible`, `italic`): a `$field` with "no" is false, via `evaluateBoolean`. */
  const bool = (expr: BoolExpr | undefined, fallback: boolean): boolean =>
    expr === undefined ? fallback : evaluateBoolean(expr, values, fallback);

  /** An anchor value: the number, or none (an expression without a value counts as an absent anchor). */
  const anchorNumber = (expr: Expr<number> | undefined): number | undefined =>
    expr === undefined
      ? undefined
      : toNumber(ev<unknown>(expr as Expr<unknown>, undefined));

  /** `centerX`/`centerY` of the anchor: literal `true` or a true expression. */
  const anchorCenter = (value: Anchors['centerX']): boolean =>
    value === true || (typeof value === 'object' && bool(value, false));

  /**
   * The node's anchors on the axis, as distance from the physical edges (`start` = left or top):
   * on the horizontal axis `anchors.start`/`end` are logical and become `left`/`right` by the
   * parent frame's direction `dir`; the physical `left`/`right` win over the logical one that
   * lands on the same side.
   */
  const anchorsOf = (node: TemplateNode, axis: Axis, dir: Direction): ResolvedAnchors => {
    const a: Anchors | undefined = node.anchors;
    if (!a) return { center: false };
    const rtl = dir === 'rtl';
    return axis === 'w'
      ? {
          start: anchorNumber(a.left) ?? anchorNumber(rtl ? a.end : a.start),
          end: anchorNumber(a.right) ?? anchorNumber(rtl ? a.start : a.end),
          center: anchorCenter(a.centerX),
        }
      : {
          start: anchorNumber(a.top),
          end: anchorNumber(a.bottom),
          center: anchorCenter(a.centerY),
        };
  };

  const oneOf = <T extends string>(
    expr: Expr<T> | undefined,
    allowed: readonly T[],
    fallback: T,
  ): T => {
    const value = ev<unknown>(expr as Expr<unknown> | undefined, fallback);
    return allowed.includes(value as T) ? (value as T) : fallback;
  };

  const isVisible = (node: TemplateNode) => bool(node.visible, true);

  // --- text -----------------------------------------------------------------------------

  /** The node's `wrap`, `ellipsis` and `maxLines`; only included when they differ from the default. */
  const textWrapping = (font: FontSpec): Partial<MeasureFont> => {
    const maxLines = Math.floor(num(font.maxLines, 0));
    return {
      ...(oneOf(font.wrap, ['word', 'none'], 'word') === 'none' ? { wrap: 'none' } : {}),
      ...(bool(font.ellipsis, false) ? { ellipsis: true } : {}),
      ...(maxLines >= 1 ? { maxLines } : {}),
    };
  };

  const textFont = (node: TextTemplate): MeasureFont => {
    const font: FontSpec = node.font ?? {};
    const size = Math.max(0, num(font.size, 14));
    const lh = num(font.lineHeight, 1.2);
    return {
      ...textWrapping(font),
      family: str(font.family, defaultFontFamily(tokens)),
      size,
      weight: num(font.weight, 400),
      italic: bool(font.italic, false),
      lineHeight: lh <= 3 ? lh * size : lh,
      letterSpacing: num(font.letterSpacing, 0),
      ...(dirOf(node) === 'rtl' ? { direction: 'rtl' as const } : {}),
    };
  };

  // --- rich text (runs) ------------------------------------------------------------------

  /** `[vertical, horizontal]` padding of a chip (number = both axes). */
  const runPadding = (run: TextRunTemplate): readonly [number, number] => {
    const value = ev<unknown>(run.padding as Expr<unknown> | undefined, 0);
    const clean = (n: unknown): number => (typeof n === 'number' && n > 0 ? n : 0);
    if (Array.isArray(value)) return [clean(value[0]), clean(value[1])];
    return [clean(value), clean(value)];
  };

  /** The resolved style of a run: what it declares over the node's `font` and `color`. */
  const resolveRun = (
    run: TextRunTemplate,
    node: TextTemplate,
    font: MeasureFont,
  ): SceneTextRun => {
    const decoration = oneOf(
      run.decoration ?? node.font?.decoration,
      ['none', 'underline', 'line-through'],
      'none',
    );
    const background = str(run.background, 'none');
    return {
      // A literal text counts as is, even whitespace only (the gap between runs); an empty field's falls back.
      text: typeof run.text === 'string' ? run.text : evaluateText(run.text, values, ''),
      fontFamily: str(run.family, font.family),
      fontSize: Math.max(0, num(run.size, font.size)),
      fontWeight: num(run.weight, font.weight),
      italic: bool(run.italic, font.italic),
      color: str(run.color, str(node.color, '#000000')),
      ...(decoration === 'none' ? {} : { decoration }),
      ...(isNone(background)
        ? {}
        : {
            background,
            radius: Math.max(0, num(run.radius, 0)),
            padding: runPadding(run),
          }),
    };
  };

  /** The node's runs, in the scene's form and the layout's (the same list, index by index). */
  const richRuns = (
    node: TextTemplate,
    font: MeasureFont,
  ): { scene: SceneTextRun[]; runs: RichRun[] } => {
    const scene = (node.runs ?? []).map((run) => resolveRun(run, node, font));
    const runs = scene.map((run): RichRun => ({
      text: run.text,
      font: {
        family: run.fontFamily,
        size: run.fontSize,
        weight: run.fontWeight,
        italic: run.italic,
        lineHeight: font.lineHeight,
        letterSpacing: font.letterSpacing,
      },
      ...(run.padding ? { chip: { padding: run.padding } } : {}),
    }));
    return { scene, runs };
  };

  /**
   * The text's physical `align`: `start` (v4's default) and `end` follow the node's effective
   * direction; outside the version's set, the default applies. `justify` only exists in v4 and
   * rich text does not use it.
   */
  const physicalAlign = (node: TextTemplate): 'left' | 'center' | 'right' | 'justify' => {
    const v4 = original.formatVersion >= 4;
    const value = oneOf<string>(
      node.font?.align as Expr<string> | undefined,
      v4
        ? ['left', 'center', 'right', 'justify', 'start', 'end']
        : ['left', 'center', 'right'],
      v4 ? 'start' : 'left',
    );
    const rtl = dirOf(node) === 'rtl';
    if (value === 'start') return rtl ? 'right' : 'left';
    if (value === 'end') return rtl ? 'left' : 'right';
    return value as 'left' | 'center' | 'right' | 'justify';
  };

  /** The rich text layout's `align` (without `justify`). */
  const richAlign = (align: string): 'left' | 'center' | 'right' =>
    align === 'center' || align === 'right' ? align : 'left';

  /** What belongs to the node (and not to the runs) in the rich text layout. */
  const richBase = (node: TextTemplate, font: MeasureFont): RichBase => ({
    size: font.size,
    lineHeight: font.lineHeight,
    // Rich text (with `runs`) does not justify yet: `justify` falls back to `left`.
    align: richAlign(physicalAlign(node)),
    ...(dirOf(node) === 'rtl' ? { direction: 'rtl' as const } : {}),
    ...(font.wrap === 'none' ? { wrap: 'none' as const } : {}),
    ...(font.ellipsis === true ? { ellipsis: true } : {}),
    ...(font.maxLines !== undefined ? { maxLines: font.maxLines } : {}),
  });

  /** The node's text without `runs`. */
  const plainText = (node: TextTemplate): string =>
    node.text === undefined ? '' : evaluateText(node.text, values, '');

  /**
   * `textMemo` (decision 19 of #1078): the measurement of each `text` node per limit (`maxWidth`).
   * The text, the font and the values do not change within the engine, so `isCutByMax`,
   * `textHeight`, `fillContribution`, the baselines and `textContent` read the same measurement
   * instead of repeating it.
   */
  const textMemo = new Map<TextTemplate, Map<string, TextMetrics>>();
  const remembered = (
    node: TextTemplate,
    maxWidth: number | undefined,
    measure: () => TextMetrics,
  ): TextMetrics => {
    let byWidth = textMemo.get(node);
    if (byWidth === undefined) {
      byWidth = new Map();
      textMemo.set(node, byWidth);
    }
    const key = maxWidth === undefined ? '' : String(maxWidth);
    let metrics = byWidth.get(key);
    if (metrics === undefined) {
      metrics = measure();
      byWidth.set(key, metrics);
    }
    return metrics;
  };

  const measureText = (node: TextTemplate, maxWidth?: number): TextMetrics => {
    if (maxWidth !== undefined && maxWidth <= EPS)
      warn('engine.textZeroWidth', { name: nodeName(node) });
    return remembered(node, maxWidth, () => {
      const font = textFont(node);
      if (node.runs === undefined)
        return options.measure(plainText(node), font, maxWidth);
      const rich = richRuns(node, font);
      return measureRichText(rich.runs, richBase(node, font), options.measure, maxWidth);
    });
  };

  // --- baseline (decisions 2 to 5 of #898) ----------------------------------------------

  interface TextBaselines {
    readonly height: number;
    readonly first: number;
    readonly last: number;
  }

  /** The node's `baselinePadding` (px ≥ 0 per side); absent = neither. */
  const baselinePaddingOf = (
    node: TextTemplate,
  ): { top?: number; bottom?: number } | undefined => {
    const spec = node.baselinePadding;
    if (spec === undefined) return undefined;
    return { top: limitValue(spec.top), bottom: limitValue(spec.bottom) };
  };

  /** The baselines of a single-line text or of rich text (that of the base font on each line). */
  const richBaselines = (node: TextTemplate, maxWidth?: number): TextBaselines => {
    const font = textFont(node);
    const rich = richRuns(node, font);
    const layout = layoutRuns(rich.runs, richBase(node, font), options.measure, maxWidth);
    const probe = options.measure('H', font);
    const extent =
      (probe.firstBaseline ??
        lineBaseline(0, font.lineHeight, approximateExtents(font.size))) -
      font.lineHeight / 2;
    const baseline = (line: { y: number; height: number }): number =>
      line.y + line.height / 2 + extent;
    const first = layout.lines[0];
    const last = layout.lines[layout.lines.length - 1];
    return {
      height: layout.height,
      first: first ? baseline(first) : extent + font.lineHeight / 2,
      last: last ? baseline(last) : extent + font.lineHeight / 2,
    };
  };

  /** Height and baselines (first and last) of the node's text, at the top of the box. */
  const baselinesOf = (node: TextTemplate, maxWidth?: number): TextBaselines => {
    if (node.runs !== undefined) return richBaselines(node, maxWidth);
    const font = textFont(node);
    const m = remembered(node, maxWidth, () =>
      options.measure(plainText(node), font, maxWidth),
    );
    const count = m.lineCount ?? Math.max(1, m.lines?.length ?? 1);
    const first =
      m.firstBaseline ?? lineBaseline(0, font.lineHeight, approximateExtents(font.size));
    return {
      height: m.height,
      first,
      last: m.lastBaseline ?? first + (count - 1) * font.lineHeight,
    };
  };

  /**
   * The height of the text in `hug` with `baselinePadding`: `max(top, first) + (last − first) +
   * max(bottom, height − last)`; without the side, the font's own distance applies.
   */
  const paddedTextHeight = (
    node: TextTemplate,
    height: number,
    wrap?: number,
  ): number => {
    const padding = baselinePaddingOf(node);
    if (padding === undefined) return height;
    const b = baselinesOf(node, wrap);
    const top = Math.max(padding.top ?? 0, b.first);
    const bottom = Math.max(padding.bottom ?? 0, b.height - b.last);
    return top + (b.last - b.first) + bottom;
  };

  /** Where the text's first baseline falls in a box of height `h` (width `w`). */
  const textBaselineIn = (node: TextTemplate, w: number, h: number): number => {
    const b = baselinesOf(node, w);
    const top = baselinePaddingOf(node)?.top;
    if (top !== undefined) return Math.max(top, b.first);
    const align = verticalAlignOf(node);
    if (align === 'top') return b.first;
    const free = h - b.height;
    return (align === 'bottom' ? free : free / 2) + b.first;
  };

  /** A node's first baseline in the `w` × `h` box; `undefined` = no baseline. */
  const kidBaseline = (node: TemplateNode, w: number, h: number): number | undefined => {
    if (node.type === 'text') return textBaselineIn(node, w, h);
    if (node.type !== 'frame') return undefined;
    for (const placed of planFrame(node, w, h).placements) {
      const inner = kidBaseline(placed.kid.node, placed.w, placed.h);
      if (inner !== undefined) return placed.y + inner;
    }
    return undefined;
  };

  /** Each child's baseline (the bottom of the box when it has none). */
  const kidBaselines = (
    kids: readonly Kid[],
    widths: readonly number[],
    heights: readonly number[],
  ): number[] =>
    kids.map((kid, i) => {
      const h = heights[i] ?? 0;
      return kidBaseline(kid.node, widths[i] ?? 0, h) ?? h;
    });

  /** The height of a `row` aligned by baseline: from the tallest top to the lowest bottom. */
  const baselineExtent = (
    kids: readonly Kid[],
    widths: readonly number[],
    heights: readonly number[],
  ): number => {
    const lines = kidBaselines(kids, widths, heights);
    const above = Math.max(0, ...lines);
    const below = Math.max(0, ...heights.map((h, i) => h - (lines[i] ?? h)));
    return above + below;
  };

  // --- checked values (size and layout) ---------------------------------------------------

  const invalidValue = (label: string, value: unknown) =>
    warn('engine.invalidValue', { label, value: describeValue(value) });

  /** Value of a closed set; no value = default; outside the set = default with a warning. */
  const checked = <T extends string>(
    expr: Expr<T> | undefined,
    allowed: readonly T[],
    fallback: T,
    label: string,
  ): T => {
    const value =
      expr === undefined ? undefined : ev<unknown>(expr as Expr<unknown>, undefined);
    if (value === undefined || value === null) return fallback;
    const valid = allowedValue(value, allowed);
    if (valid === undefined) invalidValue(label, value);
    return valid ?? fallback;
  };

  // --- sizes ------------------------------------------------------------------------------

  const sizeMemo = new Map<TemplateNode, Partial<Record<Axis, SizeSpec>>>();

  /** The size; `min-content`/`max-content` only exist in formatVersion 4 (before it, coming from an expression, they are an invalid value). */
  const parseVersionedSize = (value: unknown): SizeSpec | undefined => {
    const parsed = parseSizeSpec(value);
    return isIntrinsicSize(parsed) && original.formatVersion < 4 ? undefined : parsed;
  };

  const resolveSpec = (node: TemplateNode, axis: Axis): SizeSpec => {
    const fallback: SizeSpec = node.type === 'text' ? 'hug' : 'fill';
    const expr = axis === 'w' ? node.width : node.height;
    const value =
      expr === undefined ? undefined : ev<unknown>(expr as Expr<unknown>, undefined);
    if (value === undefined || value === null) return fallback;
    const spec = parseVersionedSize(value);
    if (spec === undefined) invalidValue(axis === 'w' ? 'width' : 'height', value);
    return spec ?? fallback;
  };

  const specOf = (node: TemplateNode, axis: Axis): SizeSpec => {
    let perNode = sizeMemo.get(node);
    if (!perNode) {
      perNode = {};
      sizeMemo.set(node, perNode);
    }
    return (perNode[axis] ??= resolveSpec(node, axis));
  };

  /**
   * Limit in px; non-finite or negative = absent. When measuring a `hug` axis, its `$size` is
   * infinite here: the type's size does not limit what is measured (a label's `maxWidth` of
   * `$size` − slack would stay at 2 lines).
   */
  const limitValues = valuesForLimits(values, openAxes);
  const limitValue = (expr: Expr<number> | undefined): number | undefined => {
    if (expr === undefined) return undefined;
    const raw = evaluate<unknown>(expr as Expr<unknown>, limitValues, Number.NaN);
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  const limitMemo = new Map<TemplateNode, Partial<Record<Axis, SizeLimit>>>();

  const limitOf = (node: TemplateNode, axis: Axis): SizeLimit => {
    let perNode = limitMemo.get(node);
    if (!perNode) {
      perNode = {};
      limitMemo.set(node, perNode);
    }
    return (perNode[axis] ??=
      axis === 'w'
        ? {
            min: limitValue(node.minWidth) ?? 0,
            max: limitValue(node.maxWidth) ?? Infinity,
          }
        : {
            min: limitValue(node.minHeight) ?? 0,
            max: limitValue(node.maxHeight) ?? Infinity,
          });
  };

  /** Applies `min`/`max`; `min` > `max` takes the `min`. */
  const clampTo = (limit: SizeLimit, size: number): number =>
    Math.max(limit.min, Math.min(size, limit.max));

  const clampSize = (node: TemplateNode, axis: Axis, size: number): number =>
    clampTo(limitOf(node, axis), size);

  /** `padding` (also from `$field`): numeric text becomes a number, anything else becomes 0, floor at 0. */
  const paddingOf = (expr: LayoutSpec['padding']): Padding => {
    const value: unknown = evaluate(expr, values, 0);
    const side = (v: unknown) => Math.max(0, num(v as Expr<number>, 0));
    return normalizePadding(Array.isArray(value) ? value.map(side) : side(value));
  };

  /** `baseline` only applies in `row` and in formatVersion 4; otherwise, coming from an expression, it is an invalid value. */
  const alignsFor = (kind: 'row' | 'column'): readonly LayoutAlign[] =>
    kind === 'row' && original.formatVersion >= 4
      ? LAYOUT_ALIGNS
      : LAYOUT_ALIGNS.filter((value) => value !== 'baseline');

  /** `maxPerLine`/`maxLines`: integer ≥ 1; any other value falls to "no limit" with the invalid-value warning. */
  const countOf = (expr: Expr<number> | undefined, label: string): number | undefined => {
    const value = ev<unknown>(expr as Expr<unknown> | undefined, undefined);
    if (value === undefined || value === null) return undefined;
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    if (Number.isInteger(n) && n >= 1) return n;
    invalidValue(label, value);
    return undefined;
  };

  /** The row wrapping of a `row`/`column` frame (v4); without `wrap` (or `none`) the other three keys do not apply. */
  const wrapOf = (
    spec: LayoutSpec,
  ): Pick<FrameLayout, 'wrap' | 'lineGap' | 'maxPerLine' | 'maxLines'> => {
    const none = { wrap: 'none', lineGap: 0 } as const;
    if (original.formatVersion < 4) return none;
    const wrap = checked(spec.wrap, LAYOUT_WRAPS, 'none', 'layout.wrap');
    if (wrap === 'none') return none;
    return {
      wrap,
      lineGap: Math.max(0, num(spec.lineGap, 0)),
      maxPerLine: countOf(spec.maxPerLine, 'layout.maxPerLine'),
      maxLines: countOf(spec.maxLines, 'layout.maxLines'),
    };
  };

  /** The `none` layout: `align` (vertical) and `justify` (horizontal) only apply in formatVersion 4. */
  const noneLayoutOf = (spec: LayoutSpec | undefined): FrameLayout => {
    if (!spec || original.formatVersion < 4) return NONE_LAYOUT;
    if (spec.align === undefined && spec.justify === undefined) return NONE_LAYOUT;
    return {
      ...NONE_LAYOUT,
      align: checked(spec.align, NONE_ALIGNS, 'start', 'layout.align'),
      justify: checked(spec.justify, NONE_JUSTIFIES, 'start', 'layout.justify'),
    };
  };

  /** A grid track: an invalid value falls to a single track (`columns: 1`, `rows: 1`) with the warning. */
  const trackOf = (entry: (typeof TRACK_KEYS)[number], value: unknown): GridTracks => {
    const valid = validTrack(entry.field, value);
    if (valid !== undefined)
      return entry.field === 'count'
        ? { count: valid, vertical: entry.vertical }
        : { min: valid, vertical: entry.vertical };
    invalidValue(`layout.${entry.key}`, value);
    return { count: 1, vertical: entry.vertical };
  };

  /**
   * The grid tracks: the first of the four keys that has a value (`columns` and `minColumnWidth`
   * by expression choose `Fixed` or `Adaptive` through a field); with no value in any, the first
   * present one (invalid: a single track, with the warning); no key = one column.
   */
  const gridTracksOf = (spec: LayoutSpec): GridTracks => {
    const present = TRACK_KEYS.filter((entry) => spec[entry.key] !== undefined).map(
      (entry) => ({
        entry,
        value: ev<unknown>(spec[entry.key] as Expr<unknown>, undefined),
      }),
    );
    const chosen = present.find((p) => !isTrackAbsent(p.value)) ?? present[0];
    return chosen ? trackOf(chosen.entry, chosen.value) : { count: 1, vertical: true };
  };

  /** The `grid` layout: `justify` is the tracks' axis and `align` the rows' (only the four values). */
  const gridLayoutOf = (spec: LayoutSpec): FrameLayout => ({
    dir: 'ltr',
    kind: 'grid',
    main: null,
    gap: Math.max(0, num(spec.gap, 0)),
    pad: paddingOf(spec.padding),
    align: checked(spec.align, NONE_ALIGNS, 'start', 'layout.align'),
    justify: checked(spec.justify, NONE_JUSTIFIES, 'start', 'layout.justify'),
    reverse: bool(spec.reverse, false),
    wrap: 'none',
    lineGap: Math.max(0, num(spec.lineGap, 0)),
    grid: gridTracksOf(spec),
  });

  /** The frame's layout without the direction (`dir` ltr); `layoutOf` puts the node's effective one. */
  const layoutBase = (frame: FrameTemplate): FrameLayout => {
    const spec = frame.layout;
    const kind = checked(spec?.type, LAYOUT_TYPES, 'none', 'layout.type');
    if (!spec || kind === 'none') return noneLayoutOf(spec);
    if (kind === 'grid') return gridLayoutOf(spec);
    return {
      dir: 'ltr',
      kind,
      main: kind === 'row' ? 'w' : 'h',
      gap: Math.max(0, num(spec.gap, 0)),
      pad: paddingOf(spec.padding),
      align: checked(spec.align, alignsFor(kind), 'start', 'layout.align'),
      justify: checked(spec.justify, LAYOUT_JUSTIFIES, 'start', 'layout.justify'),
      reverse: bool(spec.reverse, false),
      ...wrapOf(spec),
    };
  };

  const layoutOf = (frame: FrameTemplate): FrameLayout => {
    const layout = layoutBase(frame);
    const dir = dirOf(frame);
    return layout.dir === dir ? layout : { ...layout, dir };
  };

  const visibleKids = (frame: FrameTemplate): Kid[] =>
    (frame.children ?? [])
      .map((node, index) => ({ node, index }))
      .filter((kid) => isVisible(kid.node));

  const planCache = new Map<FrameTemplate, Map<string, Plan>>();

  /** Does the `hug` text have a `maxWidth` smaller than its natural width (will the width be cut)? */
  const isCutByMax = (node: TextTemplate): boolean => {
    const { max } = limitOf(node, 'w');
    return Number.isFinite(max) && measureText(node).width > max + EPS;
  };

  const textHeight = (node: TextTemplate, otherSize: number | undefined): number => {
    const spec = specOf(node, 'w');
    const hug = spec === 'hug' || spec === 'max-content';
    const wrap =
      hug && !(otherSize !== undefined && isCutByMax(node)) ? undefined : otherSize;
    return paddedTextHeight(node, measureText(node, wrap).height, wrap);
  };

  const frameHug = (
    node: FrameTemplate,
    axis: Axis,
    otherSize: number | undefined,
    bound: number | null,
  ): number =>
    axis === 'w'
      ? planFrame(node, null, null, { w: bound, h: null }).w
      : planFrame(node, otherSize ?? null, null, { w: null, h: bound }).h;

  /**
   * Size of a node's content on one axis (`otherSize`: the already resolved width, for the
   * height; `bound`: the available limit on the axis, to measure frames with `fill` children).
   */
  const hugSize = (
    node: TemplateNode,
    axis: Axis,
    otherSize: number | undefined,
    bound: number | null,
  ): number => {
    switch (node.type) {
      case 'text':
        return axis === 'w' ? measureText(node).width : textHeight(node, otherSize);
      case 'frame':
        return frameHug(node, axis, otherSize, bound);
      case 'path':
        return node.viewBox[axis === 'w' ? 0 : 1];
      case 'icon':
        return iconBox(node)[axis === 'w' ? 0 : 1];
      default:
        return 0;
    }
  };

  /** What a `fill` child asks of the parent being measured: what it would hug, up to the limit. */
  const fillContribution = (
    node: TemplateNode,
    axis: Axis,
    bound: number,
    otherSize: number | undefined,
  ): number => {
    const natural =
      node.type === 'text' && axis === 'w'
        ? measureText(node, bound).width
        : hugSize(node, axis, otherSize, bound);
    return Math.min(bound, Math.max(0, natural));
  };

  const hasAnchor = (anchors: ResolvedAnchors): boolean =>
    anchors.center || anchors.start !== undefined || anchors.end !== undefined;

  const isStretchAnchored = (anchors: ResolvedAnchors | undefined): boolean =>
    anchors !== undefined &&
    !anchors.center &&
    anchors.start !== undefined &&
    anchors.end !== undefined;

  /** Anchors on both sides stretch the child between them (with the parent already measured). */
  const anchoredSize = (
    anchors: ResolvedAnchors | undefined,
    content: number | null,
  ): number | undefined =>
    isStretchAnchored(anchors) && content !== null
      ? Math.max(0, content - (anchors?.start ?? 0) - (anchors?.end ?? 0))
      : undefined;

  /** A `slot` node with `slotContent`: the size of the arranged children (see the top of the file). */
  const slotSize = (
    node: TemplateNode,
    spec: SizeSpec,
    axis: Axis,
    content: number | null,
    anchors: ResolvedAnchors | undefined,
  ): number | undefined => {
    if (node.type !== 'slot' || !options.slotContent) return undefined;
    const inner = options.slotContent[axis === 'w' ? 'width' : 'height'];
    const takesContent =
      spec === 'hug' ||
      isIntrinsicSize(spec) ||
      (content === null && (spec === 'fill' || isStretchAnchored(anchors)));
    return takesContent ? Math.max(0, inner) : undefined;
  };

  /** The grid tracks' axis: the width in a vertical grid, the height in a horizontal one. */
  const trackAxisOf = (layout: FrameLayout): Axis =>
    layout.grid?.vertical === false ? 'h' : 'w';

  /** Does the `hug` child stretch on the axis? In `row`/`column`, on the cross one; in `none`, with no anchor on that axis. */
  const stretchesKid = (
    layout: FrameLayout,
    axis: Axis,
    anchors: ResolvedAnchors | undefined,
  ): boolean => {
    if (layout.kind === 'grid')
      return (axis === trackAxisOf(layout) ? layout.justify : layout.align) === 'stretch';
    if (layout.kind !== 'none') return layout.main !== axis && layout.align === 'stretch';
    const free = anchors === undefined || !hasAnchor(anchors);
    return free && (axis === 'h' ? layout.align : layout.justify) === 'stretch';
  };

  const hugKid = (
    node: TemplateNode,
    axis: Axis,
    space: AxisSpace,
    otherSize: number | undefined,
    layout: FrameLayout,
    anchors: ResolvedAnchors | undefined,
  ): number => {
    const stretched = stretchesKid(layout, axis, anchors);
    if (stretched && space.content !== null) return space.content;
    return Math.max(0, hugSize(node, axis, otherSize, space.content ?? space.bound));
  };

  const fillKid = (
    node: TemplateNode,
    axis: Axis,
    space: AxisSpace,
    otherSize: number | undefined,
    anchors: ResolvedAnchors | undefined,
  ): number => {
    const edge = (anchors?.start ?? 0) + (anchors?.end ?? 0);
    if (space.content !== null) return Math.max(0, space.content - edge);
    // Hug parent without a limit: the `fill` child (or one stretched by anchors) asks for what it would hug, not 0.
    if (space.bound === null) return Math.max(0, hugSize(node, axis, otherSize, null));
    return fillContribution(node, axis, Math.max(0, space.bound - edge), otherSize);
  };

  const percentKid = (spec: SizeSpec, space: AxisSpace): number => {
    const percent = parseFloat(String(spec));
    const base = space.content ?? space.bound;
    return base === null || !Number.isFinite(percent) ? 0 : (base * percent) / 100;
  };

  // --- intrinsic measure (`min-content` and `max-content`, decisions 17 and 18 of #1078) --------

  /**
   * The `min-content` of text without `runs`: the widest word, measured without `maxWidth` and
   * without the cut of `maxLines` and `ellipsis` (which only apply in the box). With `wrap: none`
   * the text does not wrap: it is the widest line. Repeated words come back from the measurer's
   * cache (`withMeasureMemo`).
   */
  const plainMinContent = (node: TextTemplate): number => {
    const styled = textFont(node);
    if (styled.wrap === 'none') return measureText(node).width;
    // The font without the box's cut (`maxLines`, `ellipsis`): each word is measured whole.
    const font: MeasureFont = { ...styled, maxLines: undefined, ellipsis: undefined };
    return plainText(node)
      .split(/[ \t\n]+/)
      .reduce(
        (widest, word) =>
          word === '' ? widest : Math.max(widest, options.measure(word, font).width),
        0,
      );
  };

  /** The text's intrinsic width: `max-content` the widest unwrapped line, `min-content` the widest word. */
  const textIntrinsic = (node: TextTemplate, mode: IntrinsicSize): number => {
    if (mode === 'max-content') return measureText(node).width;
    if (node.runs === undefined) return plainMinContent(node);
    const font = textFont(node);
    return minContentRuns(
      richRuns(node, font).runs,
      richBase(node, font),
      options.measure,
    );
  };

  /**
   * How much a child of `layout` contributes to the intrinsic width of the parent measured in
   * `mode`: the px, its own `min`/`max-content`, the parent's (`fill`, `hug`) or 0 (`%`), within
   * the child's limits; in `none`, plus the anchors (also the child stretched by them: as in
   * `hug`, without a measured parent it takes its natural size).
   */
  const kidIntrinsic = (kid: Kid, layout: FrameLayout, mode: IntrinsicSize): number => {
    const { node } = kid;
    const spec = specOf(node, 'w');
    const anchors = layout.kind === 'none' ? anchorsOf(node, 'w', layout.dir) : undefined;
    const natural = (): number => {
      if (typeof spec === 'number') return spec;
      if (spec === 'fill' || spec === 'hug') return intrinsicWidth(node, mode);
      return isIntrinsicSize(spec) ? intrinsicWidth(node, spec) : 0;
    };
    const size = clampSize(node, 'w', natural());
    if (anchors === undefined || anchors.center) return size;
    return (anchors.start ?? 0) + size + (anchors.end ?? 0);
  };

  /** The intrinsic width of a grid: `n` equal tracks of the largest cell, or the flow lines summed (horizontal grid). */
  const gridIntrinsic = (
    layout: FrameLayout,
    kids: readonly Kid[],
    mode: IntrinsicSize,
  ): number => {
    const ordered = layout.reverse ? [...kids].reverse() : kids;
    const parts = ordered.map((kid) => kidIntrinsic(kid, layout, mode));
    const tracks = layout.grid ?? { vertical: true };
    const spans = ordered.map((kid) => spanOf(kid.node));
    if (trackAxisOf(layout) === 'h') {
      // Horizontal grid: the width sums the flow lines (each has its own largest child).
      const placed = placeCells(spans, tracks.count ?? 1);
      const extents = lineExtents(placed.cells, placed.lines, parts);
      return stackLines(extents, layout.lineGap, false).total;
    }
    // Fixed columns: `columns`. Adaptive: a single one in `min-content`, all on one line in `max-content`.
    const count =
      tracks.count ??
      (mode === 'min-content' ? 1 : spans.reduce((sum, span) => sum + span, 0));
    const { cells } = placeCells(spans, count);
    const track = Math.max(
      maxCellOf(cells, parts, layout.gap),
      mode === 'min-content' ? (tracks.min ?? 0) : 0,
    );
    return Math.max(1, count) * track + layout.gap * Math.max(0, count - 1);
  };

  /** The intrinsic width of a frame, padding included (see "Sizing" in `docs/COMPONENT-FORMAT.md`). */
  const frameIntrinsic = (frame: FrameTemplate, mode: IntrinsicSize): number => {
    const layout = layoutOf(frame);
    const kids = visibleKids(frame);
    const padding = padAxis(layout, 'w');
    if (kids.length === 0) return padding;
    if (layout.kind === 'grid') return gridIntrinsic(layout, kids, mode) + padding;
    const parts = kids.map((kid) => kidIntrinsic(kid, layout, mode));
    // Only `row` sums; `row` with `wrap` sums in `max-content` (a single line) and takes the largest in `min-content`.
    const sums =
      layout.kind === 'row' && (layout.wrap === 'none' || mode === 'max-content');
    const total = sums
      ? parts.reduce((sum, part) => sum + part, 0) + layout.gap * (parts.length - 1)
      : maxOf(parts);
    return total + padding;
  };

  const intrinsicMemo = new Map<TemplateNode, Partial<Record<IntrinsicSize, number>>>();

  const computeIntrinsicWidth = (node: TemplateNode, mode: IntrinsicSize): number => {
    switch (node.type) {
      case 'text':
        return textIntrinsic(node, mode);
      case 'frame':
        return frameIntrinsic(node, mode);
      case 'slot':
        return Math.max(0, options.slotContent?.width ?? 0);
      case 'path':
        return node.viewBox[0];
      case 'icon':
        return iconBox(node)[0];
      default:
        return 0;
    }
  };

  /**
   * A node's width measured in `mode`, without a space limit (the node's own `min`/`max` is
   * applied by the parent). Remembered per node and mode (`intrinsicMemo`): the nested grid and
   * row do not re-measure the subtree on every pass.
   */
  const intrinsicWidth = (node: TemplateNode, mode: IntrinsicSize): number => {
    let perNode = intrinsicMemo.get(node);
    if (!perNode) {
      perNode = {};
      intrinsicMemo.set(node, perNode);
    }
    return (perNode[mode] ??= computeIntrinsicWidth(node, mode));
  };

  /** The size of a `min-content`/`max-content` child: the intrinsic width; the height is the `hug` one at the already resolved width. */
  const intrinsicKid = (
    node: TemplateNode,
    axis: Axis,
    mode: IntrinsicSize,
    otherSize: number | undefined,
    space: AxisSpace,
  ): number =>
    axis === 'w'
      ? intrinsicWidth(node, mode)
      : Math.max(0, hugSize(node, axis, otherSize, space.content ?? space.bound));

  const kidSize = (
    kid: Kid,
    axis: Axis,
    space: AxisSpace,
    otherSize: number | undefined,
    layout: FrameLayout,
  ): number | 'fill' => {
    const { node } = kid;
    const spec = specOf(node, axis);
    const anchors =
      layout.kind === 'none' ? anchorsOf(node, axis, layout.dir) : undefined;
    const early =
      anchoredSize(anchors, space.content) ??
      (typeof spec === 'number' ? spec : undefined) ??
      slotSize(node, spec, axis, space.content, anchors);
    if (early !== undefined) return early;
    if (isIntrinsicSize(spec)) return intrinsicKid(node, axis, spec, otherSize, space);
    if (spec === 'hug') return hugKid(node, axis, space, otherSize, layout, anchors);
    if (spec === 'fill')
      return layout.main === axis
        ? 'fill'
        : fillKid(node, axis, space, otherSize, anchors);
    return percentKid(spec, space);
  };

  /**
   * The weight of a `fill` child (`weight`, v4): a finite number > 0; absent counts as 1 and an
   * invalid one (coming from an expression) is ignored with the warning `invalid value in weight: <value>`.
   */
  const weightMemo = new Map<TemplateNode, number>();
  const weightOf = (node: TemplateNode): number => {
    const known = weightMemo.get(node);
    if (known !== undefined) return known;
    const value = ev<unknown>(node.weight as Expr<unknown> | undefined, undefined);
    const n = numericValue(value);
    const weight = Number.isFinite(n) && n > 0 ? n : 1;
    if (value !== undefined && value !== null && weight !== n)
      invalidValue('weight', value);
    weightMemo.set(node, weight);
    return weight;
  };

  /** The weights of the children that are `fill` (the rest count as 1, without evaluating `weight`). */
  const weightsFor = (
    kids: readonly Kid[],
    sizes: readonly (number | 'fill')[],
  ): number[] =>
    sizes.map((size, i) => (size === 'fill' && kids[i] ? weightOf(kids[i].node) : 1));

  /**
   * Splits `free` among the `fill`s (a `SizeLimit` and a weight each, default 1) like flexbox:
   * each gets the share of its weight, the total limit violation is computed; without a
   * violation, it is done; with a positive violation it freezes whoever hit the `min`, with a
   * negative one whoever hit the `max`, and repeats with the rest (the difference is
   * redistributed in proportion to the weights).
   */
  const distributeFill = (
    limits: readonly SizeLimit[],
    free: number,
    weights: readonly number[] = [],
  ): number[] => {
    const sizes = limits.map(() => 0);
    let active = limits.map((_, i) => i);
    let space = free;
    while (active.length > 0) {
      const total = active.reduce((sum, i) => sum + (weights[i] ?? 1), 0);
      const rows = active.map((i) => {
        const share = (space * (weights[i] ?? 1)) / total;
        return { i, share, size: clampTo(limits[i] ?? NO_SIZE_LIMIT, share) };
      });
      const violation = rows.reduce((sum, r) => sum + r.size - r.share, 0);
      const frozen = rows.filter((r) =>
        violation > 0 ? r.size > r.share : r.size < r.share,
      );
      if (Math.abs(violation) < FLEX_EPS || frozen.length === 0) {
        rows.forEach((r) => (sizes[r.i] = r.size));
        break;
      }
      for (const r of frozen) {
        sizes[r.i] = r.size;
        space -= r.size;
      }
      active = active.filter((i) => !frozen.some((r) => r.i === i));
    }
    return sizes;
  };

  /** Sizes on the main axis: fixed ones come ready and the `fill`s split what is left (by the weights). */
  const resolveMain = (
    frame: FrameTemplate,
    layout: FrameLayout,
    sizes: readonly (number | 'fill')[],
    limits: readonly SizeLimit[],
    content: number | null,
    tolerance: number,
    weights: readonly number[] = [],
  ): number[] => {
    const fills = sizes.filter((s) => s === 'fill').length;
    const fixed = sizes.reduce<number>((sum, s) => sum + (s === 'fill' ? 0 : s), 0);
    let free = 0;
    if (content === null) {
      if (fills > 0) warn('engine.fillInHug');
    } else {
      const remaining = content - fixed - layout.gap * Math.max(0, sizes.length - 1);
      if (remaining < -tolerance)
        warnShort('engine.contentTooBig', nodeName(frame), -remaining);
      free = Math.max(0, remaining);
    }
    const shares = distributeFill(
      limits.filter((_, i) => sizes[i] === 'fill'),
      free,
      weights.filter((_, i) => sizes[i] === 'fill'),
    );
    let next = 0;
    return sizes.map((s) => (s === 'fill' ? (shares[next++] ?? 0) : s));
  };

  /**
   * The extent of each child of a `none` frame on an axis: start anchor + size + end anchor
   * (only the size when centered by anchor or aligned by the frame); returns the largest.
   */
  const noneExtent = (
    kids: readonly Kid[],
    axis: Axis,
    sizes: readonly number[],
    dir: Direction,
  ): number =>
    kids.reduce((widest, kid, i) => {
      const a = anchorsOf(kid.node, axis, dir);
      const size = sizes[i] ?? 0;
      return Math.max(widest, a.center ? size : (a.start ?? 0) + size + (a.end ?? 0));
    }, -Infinity);

  /**
   * The `ellipsis` text that fits by shrinking (like the `min-width: 0` of a flex item with
   * `text-overflow`): on a line of known width that exceeds the box, it yields the excess in
   * proportion to its size and the `…` cuts the rest inside the box, instead of the line running
   * past the neighboring segment. Only `ellipsis` text shrinks; without it (or without an excess)
   * the sizes stay as they are.
   */
  const shrinkEllipsis = (
    kids: readonly Kid[],
    sizes: readonly (number | 'fill')[],
    layout: FrameLayout,
    content: number,
    tolerance: number,
  ): (number | 'fill')[] => {
    const shrinkable = kids.map(
      (kid, i) =>
        kid.node.type === 'text' &&
        typeof sizes[i] === 'number' &&
        textFont(kid.node as TextTemplate).ellipsis === true,
    );
    const total = sizes.reduce<number>((sum, s) => sum + (s === 'fill' ? 0 : s), 0);
    const excess = total + layout.gap * Math.max(0, sizes.length - 1) - content;
    const pool = sizes.reduce<number>(
      (sum, s, i) => sum + (shrinkable[i] === true ? (s as number) : 0),
      0,
    );
    if (excess <= tolerance || pool <= 0) return [...sizes];
    const cut = Math.min(excess, pool) / pool;
    return sizes.map((s, i) => (shrinkable[i] === true ? (s as number) * (1 - cut) : s));
  };

  /** Children's sizes on an axis; null `space.content` = the parent is being measured (hug). */
  const resolveAxis = (
    frame: FrameTemplate,
    layout: FrameLayout,
    kids: readonly Kid[],
    axis: Axis,
    space: AxisSpace,
    others: readonly number[] | null,
  ): number[] => {
    const limits = kids.map((kid) => limitOf(kid.node, axis));
    const sizes = kids.map((kid, i): number | 'fill' => {
      const size = kidSize(kid, axis, space, others?.[i], layout);
      return size === 'fill' ? size : clampTo(limits[i] ?? NO_SIZE_LIMIT, size);
    });
    const tolerance = kids.some((kid) => kid.node.type === 'text') ? TEXT_TOLERANCE : EPS;
    if (layout.main === axis) {
      const fitted =
        axis === 'w' && space.content !== null
          ? shrinkEllipsis(kids, sizes, layout, space.content, tolerance)
          : sizes;
      return resolveMain(
        frame,
        layout,
        fitted,
        limits,
        space.content,
        tolerance,
        weightsFor(kids, fitted),
      );
    }
    const numbers = sizes.map((s) => (s === 'fill' ? 0 : s));
    if (space.content !== null) {
      const content = space.content;
      const widest =
        layout.kind === 'none'
          ? noneExtent(kids, axis, numbers, layout.dir)
          : Math.max(...numbers);
      if (widest > content + tolerance)
        warnShort('engine.contentTooBig', nodeName(frame), widest - content);
    }
    return numbers;
  };

  /** The frame's size on an axis from the children (`hug`), with the padding. */
  const hugTotal = (
    layout: FrameLayout,
    kids: readonly Kid[],
    axis: Axis,
    sizes: readonly number[],
    padding: number,
  ): number => {
    if (sizes.length === 0) return padding;
    if (layout.kind === 'none') {
      let edge = 0;
      kids.forEach((kid, i) => {
        const a = anchorsOf(kid.node, axis, layout.dir);
        const size = sizes[i] ?? 0;
        edge = Math.max(edge, a.center ? size : (a.start ?? 0) + size + (a.end ?? 0));
      });
      return edge + padding;
    }
    if (layout.main === axis)
      return (
        sizes.reduce((sum, s) => sum + s, 0) + layout.gap * (sizes.length - 1) + padding
      );
    return Math.max(...sizes) + padding;
  };

  /** `start` and `end` swapped when the horizontal axis runs right to left. */
  const logicalSide = <T extends LayoutAlign | LayoutJustify>(
    value: T,
    flip: boolean,
  ): T => {
    if (!flip) return value;
    if (value === 'start') return 'end' as T;
    return value === 'end' ? ('start' as T) : value;
  };

  /** The position of a child without an anchor on the axis of a `none` frame (`start` and `stretch`: 0). */
  const alignFree = (
    align: LayoutAlign | LayoutJustify,
    content: number,
    size: number,
  ) => (align === 'center' ? (content - size) / 2 : align === 'end' ? content - size : 0);

  /** Position (relative to the parent) of each child on an axis. */
  const positionAxis = (
    layout: FrameLayout,
    kids: readonly Kid[],
    axis: Axis,
    sizes: readonly number[],
    total: number,
  ): number[] => {
    const startPad = axis === 'w' ? layout.pad.left : layout.pad.top;
    const endPad = axis === 'w' ? layout.pad.right : layout.pad.bottom;
    const content = total - startPad - endPad;
    // On the horizontal axis of an `rtl` frame, the alignment's `start`/`end` swap sides.
    const flipSide = axis === 'w' && layout.dir === 'rtl';
    if (layout.kind === 'none') {
      return kids.map((kid, i) => {
        const a = anchorsOf(kid.node, axis, layout.dir);
        const size = sizes[i] ?? 0;
        if (a.center) return (content - size) / 2;
        if (a.start !== undefined) return a.start;
        if (a.end !== undefined) return content - a.end - size;
        return alignFree(
          axis === 'h' ? layout.align : logicalSide(layout.justify, flipSide),
          content,
          size,
        );
      });
    }
    if (layout.main === axis) {
      const used =
        sizes.reduce((sum, s) => sum + s, 0) + layout.gap * Math.max(0, sizes.length - 1);
      const free = Math.max(0, content - used);
      const { offset, extra } = justifySpacing(layout.justify, free, sizes.length);
      let cursor = startPad + offset;
      return sizes.map((size) => {
        const position = cursor;
        cursor += size + layout.gap + extra;
        // `reverse` and the `rtl` direction (on the horizontal axis) both mirror; together they cancel out.
        return layout.reverse !== flipSide
          ? mirrorMain(position, size, startPad, content)
          : position;
      });
    }
    const align = logicalSide(layout.align, flipSide);
    return sizes.map((size) => {
      if (align === 'center') return startPad + (content - size) / 2;
      if (align === 'end') return startPad + content - size;
      return startPad;
    });
  };

  // --- row wrapping (`layout.wrap`) ---------------------------------------------------------

  /** The children of a frame with `wrap`, the main axis, the cross axis and the space on both. */
  interface WrapSpace {
    readonly frame: FrameTemplate;
    readonly layout: FrameLayout;
    readonly kids: readonly Kid[];
    readonly main: Axis;
    readonly cross: Axis;
    /** The main axis content area (null = `hug`: a single line). */
    readonly mainContent: number | null;
    /** The cross axis limit when the frame is measured (null = unknown). */
    readonly crossBound: number | null;
    /** The frame's known size per axis (null = `hug`). */
    readonly known: { readonly w: number | null; readonly h: number | null };
  }

  const maxOf = (values: readonly number[]): number =>
    values.reduce((m, v) => Math.max(m, v), 0);

  const padAxis = (layout: FrameLayout, axis: Axis): number =>
    axis === 'w'
      ? layout.pad.left + layout.pad.right
      : layout.pad.top + layout.pad.bottom;

  /** Children's sizes on the main axis before splitting the `fill`s (`'fill'` stays), in the order of `kids`. */
  const wrapMainSizes = (space: WrapSpace): (number | 'fill')[] => {
    const { frame, layout, kids, main, cross } = space;
    const crossSizes =
      main === 'h'
        ? resolveAxis(
            frame,
            layout,
            kids,
            cross,
            {
              content:
                space.known[cross] === null
                  ? null
                  : Math.max(0, (space.known[cross] ?? 0) - padAxis(layout, cross)),
              bound: space.crossBound,
            },
            null,
          )
        : null;
    return kids.map((kid, i) => {
      const size = kidSize(
        kid,
        main,
        { content: space.mainContent, bound: null },
        crossSizes?.[i],
        layout,
      );
      return size === 'fill' ? size : clampTo(limitOf(kid.node, main), size);
    });
  };

  /** Each child's basis for deciding the lines: the `fill` counts as what it would hug. */
  const wrapBases = (space: WrapSpace, sizes: readonly (number | 'fill')[]): number[] =>
    sizes.map((size, i) => {
      if (size !== 'fill') return size;
      const kid = space.kids[i] as Kid;
      const natural = hugSize(kid.node, space.main, undefined, space.mainContent);
      return clampTo(limitOf(kid.node, space.main), Math.max(0, natural));
    });

  /** An already resolved line: children, sizes and positions on both axes (relative to the frame). */
  interface WrappedLine {
    readonly kids: readonly Kid[];
    readonly main: readonly number[];
    readonly mainPos: readonly number[];
    readonly cross: readonly number[];
    /** The line's extent on the cross axis. */
    readonly extent: number;
    /** Each child's offset within the line, on the cross axis. */
    readonly offsets: readonly number[];
  }

  /** A child's offset within the line, on the cross axis (`center`/`end`; `start` and `stretch` 0). */
  const crossOffset = (align: LayoutAlign, size: number, extent: number): number => {
    if (align === 'center') return (extent - size) / 2;
    if (align === 'end') return extent - size;
    return 0;
  };

  /** The line with the cross-axis sizes and the offsets within it. */
  const crossOfLine = (
    space: WrapSpace,
    lineKids: readonly Kid[],
    mainSizes: readonly number[],
  ): Pick<WrappedLine, 'cross' | 'extent' | 'offsets'> => {
    const { frame, layout, cross } = space;
    const natural = resolveAxis(
      frame,
      layout,
      lineKids,
      cross,
      { content: null, bound: space.crossBound },
      mainSizes,
    );
    const baselined = layout.kind === 'row' && layout.align === 'baseline';
    const lines = baselined ? kidBaselines(lineKids, mainSizes, natural) : [];
    const extent = baselined
      ? baselineExtent(lineKids, mainSizes, natural)
      : maxOf(natural);
    const sizes = resolveAxis(
      frame,
      layout,
      lineKids,
      cross,
      { content: extent, bound: null },
      mainSizes,
    );
    const shifts = baselined ? baselineShifts(lines) : [];
    return {
      cross: sizes,
      extent,
      offsets: sizes.map((size, i) =>
        baselined ? (shifts[i] ?? 0) : crossOffset(layout.align, size, extent),
      ),
    };
  };

  /** The lines of the frame with `wrap`: wraps, divides each one's `fill`s, measures the cross axis and positions. */
  const wrapLines = (
    space: WrapSpace,
    mainTotal: (used: number) => number,
  ): { lines: WrappedLine[]; total: number } => {
    const { frame, layout, kids } = space;
    const sizes = wrapMainSizes(space);
    const bases = wrapBases(space, sizes);
    const broken = breakLines(bases, space.mainContent, {
      gap: layout.gap,
      maxPerLine: layout.maxPerLine,
      maxLines: layout.maxLines,
    });
    if (broken.dropped > 0)
      warn('engine.childrenOutsideMaxLines', {
        count: broken.dropped,
        name: nodeName(frame),
      });
    const tolerance = kids.some((kid) => kid.node.type === 'text') ? TEXT_TOLERANCE : EPS;
    const resolved = broken.lines.map((indices) => {
      const lineSizes = indices.map((i) =>
        sizes[i] === 'fill' && space.mainContent === null
          ? (bases[i] ?? 0)
          : (sizes[i] ?? 0),
      );
      return resolveMain(
        frame,
        layout,
        lineSizes,
        indices.map((i) => limitOf((kids[i] as Kid).node, space.main)),
        space.mainContent,
        tolerance,
        weightsFor(
          indices.map((i) => kids[i] as Kid),
          indices.map((i) => sizes[i] ?? 0),
        ),
      );
    });
    const usedOf = (line: readonly number[]) =>
      line.reduce((sum, v) => sum + v, 0) + layout.gap * Math.max(0, line.length - 1);
    const total = mainTotal(maxOf(resolved.map(usedOf)));
    const lines = broken.lines.map((indices, k): WrappedLine => {
      const lineKids = indices.map((i) => kids[i] as Kid);
      const main = resolved[k] ?? [];
      return {
        kids: lineKids,
        main,
        mainPos: positionAxis(layout, lineKids, space.main, main, total),
        ...crossOfLine(space, lineKids, main),
      };
    });
    return { lines, total };
  };

  /** The plan of a `row`/`column` frame with `wrap` (see `layout.wrap` in `docs/COMPONENT-FORMAT.md`). */
  const planWrapped = (
    frame: FrameTemplate,
    layout: FrameLayout,
    kids: readonly Kid[],
    w: number | null,
    h: number | null,
    bounds: Limits,
  ): Plan => {
    const row = layout.kind === 'row';
    const main: Axis = row ? 'w' : 'h';
    const cross: Axis = row ? 'h' : 'w';
    const known = { w, h };
    const mainKnown = known[main];
    const crossBound = bounds[cross];
    const space: WrapSpace = {
      frame,
      layout,
      kids,
      main,
      cross,
      mainContent:
        mainKnown === null ? null : Math.max(0, mainKnown - padAxis(layout, main)),
      crossBound:
        crossBound === null ? null : Math.max(0, crossBound - padAxis(layout, cross)),
      known,
    };
    const { lines, total: mainSize } = wrapLines(
      space,
      (used) => mainKnown ?? used + padAxis(layout, main),
    );
    const stacked = stackLines(
      lines.map((line) => line.extent),
      layout.lineGap,
      layout.wrap === 'wrap-reverse',
    );
    const crossStart = row ? layout.pad.top : layout.pad.left;
    const crossSize = known[cross] ?? stacked.total + padAxis(layout, cross);
    const placements = lines.flatMap((line, k) =>
      line.kids.map((kid, i): Placement => {
        const m = line.main[i] ?? 0;
        const c = line.cross[i] ?? 0;
        const mainPos = line.mainPos[i] ?? 0;
        const crossPos = crossStart + (stacked.tops[k] ?? 0) + (line.offsets[i] ?? 0);
        if (row) return { kid, x: mainPos, y: crossPos, w: m, h: c };
        // In `rtl` the columns stack from right to left (the `align` goes along).
        const x =
          layout.dir === 'rtl'
            ? mirrorMain(crossPos, c, layout.pad.left, crossSize - padAxis(layout, cross))
            : crossPos;
        return { kid, x, y: mainPos, w: c, h: m };
      }),
    );
    return row
      ? { w: mainSize, h: crossSize, placements }
      : { w: crossSize, h: mainSize, placements };
  };

  // --- grid (`layout.type: "grid"`) ---------------------------------------------------------

  /** The grid already placed: the children in placement order (`reverse` applied) and their cells. */
  interface GridSpace {
    readonly frame: FrameTemplate;
    readonly layout: FrameLayout;
    readonly kids: readonly Kid[];
    /** The tracks' axis (`w` in a vertical grid). */
    readonly t: Axis;
    readonly known: { readonly w: number | null; readonly h: number | null };
    readonly bounds: Limits;
    readonly count: number;
    readonly cells: readonly GridCell[];
    readonly lines: number;
  }

  /** A resolved grid axis: the frame's size, each child's and where it sits (relative to the frame). */
  interface GridAxis {
    readonly total: number;
    readonly sizes: readonly number[];
    readonly offsets: readonly number[];
  }

  /**
   * How many tracks the `hug` measurement of an adaptive grid (`minColumnWidth`/`minRowHeight`)
   * gave, per resulting size: the final pass, which already receives that size, repeats the
   * number instead of recomputing it from the shrunk size (which would give fewer tracks). Two
   * limits that give the same total with different counts keep the most recent one: with a `hug`
   * parent that measures the grid twice this gives the right drawing, in both orders. The
   * `max-content`/`min-content` parent resolves the width before measuring the grid, so it is
   * measured with a single limit (the parent's width) and the memo reads the input of that
   * measurement; this is proven in both orders in `tests/model/components/huggedCounts.test.ts`
   * (#1692, #1749).
   */
  const huggedCounts = new Map<FrameTemplate, Map<number, number>>();

  /**
   * The count remembered from the `hug` measurement for size `known`, only for a frame whose
   * tracks' axis is `hug`: in a `fill`, `%` or px frame the size comes from the parent and the
   * count comes from it (a total equal to another measurement's, with another limit, does not
   * lend its count).
   */
  const hugMemoOf = (
    frame: FrameTemplate,
    axis: Axis,
    known: number | null,
  ): number | undefined =>
    known !== null && specOf(frame, axis) === 'hug'
      ? huggedCounts.get(frame)?.get(known)
      : undefined;

  /** The axis content area when the frame has a known size (null = `hug`). */
  const gridContent = (space: GridSpace, axis: Axis): number | null => {
    const known = space.known[axis];
    return known === null ? null : Math.max(0, known - padAxis(space.layout, axis));
  };

  /** The axis's available limit in measuring (null = unknown). */
  const gridBound = (space: GridSpace, axis: Axis): number | null => {
    const bound = space.bounds[axis];
    return bound === null ? null : Math.max(0, bound - padAxis(space.layout, axis));
  };

  /**
   * The axis alignment within the cell: `justify` on the tracks' axis, `align` on the rows'. The
   * `stretch` is already in the child's size (the stretched `hug` takes the cell; the px stays as is).
   */
  const gridAlign = (space: GridSpace, axis: Axis): LayoutAlign | LayoutJustify => {
    const value = axis === space.t ? space.layout.justify : space.layout.align;
    return value === 'stretch' ? 'start' : value;
  };

  /** A child's `span`: integer ≥ 1; any other value (from an expression) counts as 1 with the warning. */
  const spanOf = (node: TemplateNode): number => {
    const value = ev<unknown>(node.span as Expr<unknown> | undefined, undefined);
    if (value === undefined || value === null) return 1;
    const n = numericValue(value);
    if (Number.isInteger(n) && n >= 1) return n;
    invalidValue('span', value);
    return 1;
  };

  /** The size of child `i` on the axis: `content` is the cell/line extent (null = measuring the natural one). */
  const gridKidSize = (
    space: GridSpace,
    i: number,
    axis: Axis,
    content: number | null,
    others: readonly number[] | null,
  ): number => {
    const kid = space.kids[i] as Kid;
    const bound = content === null ? gridBound(space, axis) : null;
    const size = kidSize(kid, axis, { content, bound }, others?.[i], space.layout);
    return clampSize(kid.node, axis, size === 'fill' ? 0 : size);
  };

  const gridTolerance = (space: GridSpace): number =>
    space.kids.some((kid) => kid.node.type === 'text') ? TEXT_TOLERANCE : EPS;

  /** The tracks' axis: equal tracks, cells of `span` tracks, the child aligned within the cell. */
  const solveTracks = (
    space: GridSpace,
    axis: Axis,
    others: readonly number[] | null,
  ): GridAxis => {
    const { layout, kids, cells, count } = space;
    const known = gridContent(space, axis);
    const track =
      known === null
        ? maxCellOf(
            cells,
            kids.map((_, i) => gridKidSize(space, i, axis, null, others)),
            layout.gap,
          )
        : trackSize(known, count, layout.gap);
    const total =
      space.known[axis] ??
      count * track + layout.gap * (count - 1) + padAxis(layout, axis);
    if (known === null && layout.grid?.min !== undefined)
      huggedCounts.set(
        space.frame,
        (huggedCounts.get(space.frame) ?? new Map()).set(total, count),
      );
    const extents = cells.map((cell) => spanExtent(track, cell.span, layout.gap));
    const sizes = kids.map((_, i) =>
      gridKidSize(space, i, axis, extents[i] ?? 0, others),
    );
    const excess = maxOf(sizes.map((size, i) => size - (extents[i] ?? 0)));
    if (known !== null && excess > gridTolerance(space))
      warnShort('engine.contentTooBig', nodeName(space.frame), excess);
    const start = axis === 'w' ? layout.pad.left : layout.pad.top;
    const align = gridAlign(space, axis);
    return {
      total,
      sizes,
      offsets: sizes.map(
        (size, i) =>
          start +
          trackOffset(cells[i]?.track ?? 0, track, layout.gap) +
          alignInCell(align, extents[i] ?? 0, size).pos,
      ),
    };
  };

  /** The flow lines' axis: each with the extent of its largest child, stacked with the `lineGap`. */
  const solveLines = (
    space: GridSpace,
    axis: Axis,
    others: readonly number[] | null,
  ): GridAxis => {
    const { layout, kids, cells } = space;
    const natural = kids.map((_, i) => gridKidSize(space, i, axis, null, others));
    const extents = lineExtents(cells, space.lines, natural);
    const stacked = stackLines(extents, layout.lineGap, false);
    const content = gridContent(space, axis);
    if (content !== null && stacked.total > content + gridTolerance(space))
      warnShort('engine.contentTooBig', nodeName(space.frame), stacked.total - content);
    const extentOf = (i: number): number => extents[cells[i]?.line ?? 0] ?? 0;
    const sizes = kids.map((_, i) => gridKidSize(space, i, axis, extentOf(i), others));
    const start = axis === 'w' ? layout.pad.left : layout.pad.top;
    const align = gridAlign(space, axis);
    return {
      total: space.known[axis] ?? stacked.total + padAxis(layout, axis),
      sizes,
      offsets: sizes.map(
        (size, i) =>
          start +
          (stacked.tops[cells[i]?.line ?? 0] ?? 0) +
          alignInCell(align, extentOf(i), size).pos,
      ),
    };
  };

  /** The plan of a `grid` frame (see `layout.type: "grid"` in `docs/COMPONENT-FORMAT.md`). */
  const planGrid = (
    frame: FrameTemplate,
    layout: FrameLayout,
    kids: readonly Kid[],
    w: number | null,
    h: number | null,
    bounds: Limits,
  ): Plan => {
    const ordered = layout.reverse ? [...kids].reverse() : kids;
    const t = trackAxisOf(layout);
    const draft: GridSpace = {
      frame,
      layout,
      kids: ordered,
      t,
      known: { w, h },
      bounds,
      count: 1,
      cells: [],
      lines: 0,
    };
    const tracks = layout.grid ?? { vertical: true };
    const count =
      hugMemoOf(frame, t, draft.known[t]) ??
      trackCount(tracks, gridContent(draft, t) ?? gridBound(draft, t), layout.gap);
    const placed = placeCells(
      ordered.map((kid) => spanOf(kid.node)),
      count,
    );
    const space: GridSpace = { ...draft, count, ...placed };
    const solve = (axis: Axis, others: readonly number[] | null): GridAxis =>
      axis === t ? solveTracks(space, axis, others) : solveLines(space, axis, others);
    const horizontal = solve('w', null);
    const vertical = solve('h', horizontal.sizes);
    // In `rtl` the tracks (or the flow lines) run from right to left.
    const xOf = (i: number): number => {
      const x = horizontal.offsets[i] ?? 0;
      return layout.dir === 'rtl'
        ? mirrorMain(
            x,
            horizontal.sizes[i] ?? 0,
            layout.pad.left,
            horizontal.total - padAxis(layout, 'w'),
          )
        : x;
    };
    const byKid = new Map(
      ordered.map((kid, i): [Kid, Placement] => [
        kid,
        {
          kid,
          x: xOf(i),
          y: vertical.offsets[i] ?? 0,
          w: horizontal.sizes[i] ?? 0,
          h: vertical.sizes[i] ?? 0,
        },
      ]),
    );
    return {
      w: horizontal.total,
      h: vertical.total,
      placements: kids.map((kid) => byKid.get(kid) as Placement),
    };
  };

  /** Stores the frame's plan under the cache key and returns it. */
  const remember = (frame: FrameTemplate, key: string, plan: Plan): Plan => {
    let perFrame = planCache.get(frame);
    if (!perFrame) {
      perFrame = new Map();
      planCache.set(frame, perFrame);
    }
    perFrame.set(key, plan);
    return plan;
  };

  /**
   * A frame's plan: `null` on an axis = `hug` (the frame hugs its children). `limits` is the
   * available limit per hug axis, so the `fill`/`%` children contribute in the measurement.
   */
  const planFrame = (
    frame: FrameTemplate,
    w: number | null,
    h: number | null,
    limits: Limits = NO_LIMITS,
  ): Plan => {
    const bounds = effectiveBounds(w, h, limits);
    const key = planKey(w, h, bounds);
    const cached = planCache.get(frame)?.get(key);
    if (cached) return cached;

    const layout = layoutOf(frame);
    const kids = visibleKids(frame);
    if (layout.kind === 'grid')
      return remember(frame, key, planGrid(frame, layout, kids, w, h, bounds));
    if (layout.wrap !== 'none')
      return remember(frame, key, planWrapped(frame, layout, kids, w, h, bounds));
    const padW = layout.pad.left + layout.pad.right;
    const padH = layout.pad.top + layout.pad.bottom;
    const baselined = layout.kind === 'row' && layout.align === 'baseline';

    const solve = (
      axis: Axis,
      known: number | null,
      others: readonly number[] | null,
    ): { total: number; sizes: number[] } => {
      const pad = axis === 'w' ? padW : padH;
      let total = known;
      if (total === null) {
        const limit = bounds[axis];
        const space: AxisSpace = {
          content: null,
          bound: limit === null ? null : Math.max(0, limit - pad),
        };
        const preliminary = resolveAxis(frame, layout, kids, axis, space, others);
        total =
          baselined && axis === 'h'
            ? baselineExtent(kids, others ?? [], preliminary) + pad
            : hugTotal(layout, kids, axis, preliminary, pad);
      }
      const space: AxisSpace = { content: Math.max(0, total - pad), bound: null };
      return { total, sizes: resolveAxis(frame, layout, kids, axis, space, others) };
    };

    const horizontal = solve('w', w, null);
    const vertical = solve('h', h, horizontal.sizes);
    const xs = positionAxis(layout, kids, 'w', horizontal.sizes, horizontal.total);
    const ys = positionAxis(layout, kids, 'h', vertical.sizes, vertical.total);
    if (baselined)
      baselineShifts(kidBaselines(kids, horizontal.sizes, vertical.sizes)).forEach(
        (offset, i) => (ys[i] = layout.pad.top + offset),
      );
    const plan: Plan = {
      w: horizontal.total,
      h: vertical.total,
      placements: kids.map((kid, i) => ({
        kid,
        x: xs[i] ?? 0,
        y: ys[i] ?? 0,
        w: horizontal.sizes[i] ?? 0,
        h: vertical.sizes[i] ?? 0,
      })),
    };
    return remember(frame, key, plan);
  };

  // --- style ----------------------------------------------------------------------------

  /**
   * Linear gradient by the SVG/Figma convention (not CSS's `linear-gradient`): the angle grows
   * clockwise with the y axis pointing down (0° = left→right, 90° = top→bottom); the line passes
   * through the center of the box, with a length that covers the corners.
   */
  const gradientPaint = (gradient: GradientSpec, w: number, h: number): Paint => {
    const rad = (gradient.angle * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const length = Math.abs(w * dx) + Math.abs(h * dy);
    const cx = w / 2;
    const cy = h / 2;
    return {
      type: 'linear',
      start: { x: cx - (dx * length) / 2, y: cy - (dy * length) / 2 },
      end: { x: cx + (dx * length) / 2, y: cy + (dy * length) / 2 },
      stops: gradient.stops.map((stop) => ({
        offset: stop.offset,
        color: ev<Color>(stop.color, 'none'),
      })),
    };
  };

  const fillsOf = (fill: Expr<FillSpec> | undefined, w: number, h: number): Paint[] => {
    const value = ev<FillSpec>(fill, 'none');
    if (typeof value === 'string')
      return isNone(value) ? [] : [{ type: 'solid', color: value }];
    if (typeof value === 'object' && value !== null && value.type === 'linear')
      return value.stops.length > 0 ? [gradientPaint(value, w, h)] : [];
    return [];
  };

  const strokeOf = (
    spec: StrokeSpec | undefined,
    defaultAlign: 'inside' | 'center',
    scale: number,
  ): Stroke | undefined => {
    if (!spec) return undefined;
    const color = str(spec.color, 'none');
    if (isNone(color)) return undefined;
    const width = Math.max(0, num(spec.width, 1));
    const dash = dashOf(spec.dash);
    const offset = offsetOf(spec.offset);
    return {
      paints: [{ type: 'solid', color }],
      width: width / scale,
      align: spec.align ?? defaultAlign,
      ...(dash ? { dash } : {}),
      ...(offset > 0 ? { offset: offset / scale } : {}),
      ...strokeStyleOf(spec),
    };
  };

  /** `stroke.dash` (list, or an expression returning the list): invalid = no dashing, with a warning. */
  const dashOf = (expr: StrokeSpec['dash']): readonly number[] | undefined => {
    if (expr === undefined) return undefined;
    const value = ev<unknown>(expr as Expr<unknown>, undefined);
    if (value === undefined || value === null) return undefined;
    const valid =
      Array.isArray(value) &&
      value.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0);
    if (!valid) invalidValue('stroke.dash', value);
    return valid ? (value as readonly number[]) : undefined;
  };

  /** `stroke.offset` in px: negative (coming from a token) falls to 0 with a warning. */
  const offsetOf = (expr: StrokeSpec['offset']): number => {
    if (expr === undefined) return 0;
    const value = num(expr as Expr<number>, 0);
    if (value < 0) invalidValue('stroke.offset', value);
    return Math.max(0, value);
  };

  /** `cap`, `join` and `sides` (format 4): only enter the scene when the key exists and is valid. */
  const strokeStyleOf = (
    spec: StrokeSpec,
  ): Pick<Stroke, 'cap' | 'join' | 'sides' | 'scale'> => {
    const cap = pick(spec.cap, STROKE_CAPS);
    const join = pick(spec.join, STROKE_JOINS);
    const sides = sidesOf(spec.sides);
    return {
      ...(cap ? { cap } : {}),
      ...(join ? { join } : {}),
      ...(sides ? { sides } : {}),
      ...(spec.scale === false ? { scale: false } : {}),
    };
  };

  const pick = <T extends string>(
    expr: Expr<T> | undefined,
    allowed: readonly T[],
  ): T | undefined => {
    if (expr === undefined) return undefined;
    const value = str(expr as Expr<string>, '');
    return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
  };

  const sidesOf = (
    expr: Expr<readonly StrokeSide[]> | undefined,
  ): StrokeSide[] | undefined => {
    if (expr === undefined) return undefined;
    const value = ev<unknown>(expr as Expr<unknown>, undefined);
    if (!Array.isArray(value)) return undefined;
    const sides = STROKE_SIDES.filter((side) => value.includes(side));
    // The four sides are the whole outline, with the corner radius: the scene does not carry `sides`.
    return sides.length > 0 && sides.length < STROKE_SIDES.length ? sides : undefined;
  };

  /** One shadow of the list (or the only one): color `none` gives no shadow; `spread` only enters when it is not 0. */
  const shadowOf = (shadow: ShadowSpec, scale: number): Shadow[] => {
    const color = str(shadow.color, 'none');
    if (isNone(color)) return [];
    const blur = num(shadow.blur as Expr<number> | undefined, 0);
    if (blur < 0) invalidValue('shadow.blur', blur);
    const spread = num(shadow.spread as Expr<number> | undefined, 0) / scale;
    return [
      {
        color,
        offset: {
          x: num(shadow.x as Expr<number> | undefined, 0) / scale,
          y: num(shadow.y as Expr<number> | undefined, 0) / scale,
        },
        blur: Math.max(0, blur) / scale,
        ...(spread !== 0 ? { spread } : {}),
      },
    ];
  };

  /** The node's shadows, in list order (the first stays on top). */
  const effectsOf = (node: TemplateNode, scale: number): Shadow[] => {
    const shadow = node.shadow;
    if (!shadow) return [];
    const list: readonly ShadowSpec[] = Array.isArray(shadow)
      ? (shadow as readonly ShadowSpec[])
      : [shadow as ShadowSpec];
    return list.flatMap((spec) => shadowOf(spec, scale));
  };

  // --- outline gap (`stroke.gap`) ------------------------------------------------------------

  /** The nodes that open a gap and the nodes built per template node: the gap is resolved at the end. */
  const gapNeeds: { id: string; name: string; padding: number }[] = [];
  const builtIds = new Map<TemplateNode, string>();

  const registerGap = (
    node: TemplateNode,
    id: string,
    stroke: Stroke | undefined,
  ): void => {
    const gap =
      node.type === 'frame' || node.type === 'rect' ? node.stroke?.gap : undefined;
    if (gap && stroke)
      gapNeeds.push({ id, name: gap.node, padding: num(gap.padding, 0) });
  };

  /** The first template node with that name (template order, depth-first). */
  const firstNamed = (node: TemplateNode, name: string): TemplateNode | undefined => {
    if (nodeName(node) === name) return node;
    if (node.type !== 'frame') return undefined;
    for (const child of node.children ?? []) {
      const found = firstNamed(child, name);
      if (found) return found;
    }
    return undefined;
  };

  const withGaps = (root: FrameNode): FrameNode =>
    applyGaps(
      root,
      gapNeeds.map((need) => {
        const target = firstNamed(component.template, need.name);
        return {
          id: need.id,
          target: target && builtIds.get(target),
          padding: need.padding,
        };
      }),
    );

  const radiusOf = (node: TemplateNode): CornerRadius => {
    const value = ev<unknown>(node.cornerRadius as Expr<unknown> | undefined, 0);
    if (Array.isArray(value) && value.length === 4) {
      const [a, b, c, d] = value.map((v) => Math.max(0, Number(v) || 0));
      return [a ?? 0, b ?? 0, c ?? 0, d ?? 0];
    }
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };

  // --- node assembly --------------------------------------------------------------------

  /** The evaluated `rotation` (degrees); with no value, 0 or non-finite, the node does not rotate. */
  const rotationOf = (node: TemplateNode): { rotation?: number } => {
    const degrees = num(node.rotation, 0);
    return degrees === 0 ? {} : { rotation: degrees };
  };

  const common = (
    node: TemplateNode,
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => ({
    ...baseNode({ id, name: nodeName(node) }),
    opacity: Math.min(1, Math.max(0, num(node.opacity, 1))),
    transform: translate(x, y),
    ...rotationOf(node),
    width: w,
    height: h,
    fills: fillsOf(node.fill, w, h),
    effects: effectsOf(node, 1),
  });

  const buildFrame = (
    frame: FrameTemplate,
    path: string,
    x: number,
    y: number,
    w: number,
    h: number,
    isRoot: boolean,
  ): FrameNode => {
    const plan = planFrame(frame, w, h);
    const stroke = strokeOf(frame.stroke, 'inside', 1);
    builtIds.set(frame, `${prefix}/${path}`);
    registerGap(frame, `${prefix}/${path}`, stroke);
    const children = plan.placements.map((p) =>
      buildNode(p.kid.node, `${path}.${p.kid.index}`, p.x, p.y, p.w, p.h),
    );
    const base = {
      ...common(frame, `${prefix}/${path}`, x, y, w, h),
      ...(stroke ? { stroke } : {}),
      type: 'frame' as const,
      clip: bool(frame.clip, isRoot),
      cornerRadius: radiusOf(frame),
      children,
    };
    const clipBox = base.clip ? clipBoxOf(base) : undefined;
    return clipBox ? { ...base, clipBox } : base;
  };

  const buildPath = (
    node: PathTemplate,
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): SceneNode => {
    const [vbW, vbH] = node.viewBox;
    const sx = vbW > 0 ? w / vbW : 1;
    const sy = vbH > 0 ? h / vbH : 1;
    if (Math.abs(sx - sy) > 1e-6 * Math.max(1, Math.abs(sx), Math.abs(sy))) {
      warn('engine.iconStretched');
    }
    const scale = (Math.abs(sx) + Math.abs(sy)) / 2 || 1;
    const stroke = strokeOf(node.stroke, 'center', scale);
    // `mirror` in `rtl`: flips horizontally inside the node's box (x + w is the right edge).
    const mirror = dirOf(node) === 'rtl' && bool(node.mirror, false);
    const transform: Matrix = mirror ? [-sx, 0, 0, sy, x + w, y] : [sx, 0, 0, sy, x, y];
    return {
      ...common(node, id, x, y, vbW, vbH),
      transform,
      effects: effectsOf(node, scale),
      ...(stroke ? { stroke } : {}),
      type: 'path',
      d: str(node.d, ''),
      fillRule: node.fillRule ?? 'nonzero',
    };
  };

  const icons = options.icons ?? original.resolvedIcons;

  /** The node's icon name, already evaluated. */
  const iconName = (node: IconTemplate): string => str(node.name, '');

  /** The `viewBox` box of the node's icon (the set's when the name is unknown); without warning. */
  const iconBox = (node: IconTemplate): readonly [number, number] =>
    resolveIcon(icons, iconName(node))?.viewBox ?? icons?.viewBox ?? DEFAULT_ICON_VIEWBOX;

  /** Stroke or fill color of a path: `true` and absent take the node's color. */
  const iconPaint = (
    value: boolean | string | undefined,
    nodeColor: string,
  ): string | undefined => {
    if (value === false) return undefined;
    return typeof value === 'string' ? value : nodeColor;
  };

  /** Path fill: explicit `fill`, otherwise the node's color, unless it only has a stroke. */
  const iconFills = (iconPath: IconPath, nodeColor: string): Paint[] => {
    const wanted = iconPath.fill ?? iconPath.stroke === undefined;
    const color = iconPaint(wanted, nodeColor);
    return color === undefined || isNone(color) ? [] : [{ type: 'solid', color }];
  };

  /** Path stroke (`stroke`), with the node's width when it overrides it. */
  const iconStroke = (
    iconPath: IconPath,
    nodeColor: string,
    strokeWidth: number | undefined,
  ): Stroke | undefined => {
    if (iconPath.stroke === undefined) return undefined;
    const color = iconPaint(iconPath.stroke, nodeColor);
    if (color === undefined || isNone(color)) return undefined;
    return {
      paints: [{ type: 'solid', color }],
      width: strokeWidth ?? iconPath.width ?? 1,
      align: 'center',
      ...(iconPath.cap ? { cap: iconPath.cap } : {}),
      ...(iconPath.join ? { join: iconPath.join } : {}),
    };
  };

  const iconPathNode = (
    iconPath: IconPath,
    id: string,
    box: readonly [number, number],
    nodeColor: string,
    strokeWidth: number | undefined,
  ): PathNode => {
    const stroke = iconStroke(iconPath, nodeColor, strokeWidth);
    return {
      ...baseNode({ id, name: 'icon-path' }),
      width: box[0],
      height: box[1],
      fills: iconFills(iconPath, nodeColor),
      ...(stroke ? { stroke } : {}),
      type: 'path',
      d: iconPath.d,
      fillRule: 'nonzero',
    };
  };

  /** The icon becomes a group with one path per stroke, scaled from the `viewBox` to the node's box. */
  const buildIcon = (
    node: IconTemplate,
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): SceneNode => {
    const name = iconName(node);
    const found = resolveIcon(icons, name);
    const base = { ...common(node, id, x, y, w, h), name: name || 'icon' };
    if (found === undefined) {
      warn('engine.iconUnknown', { name });
      return { ...base, type: 'unknown', sourceType: 'icon' };
    }
    const [vbW, vbH] = found.viewBox;
    const sx = vbW > 0 ? w / vbW : 1;
    const sy = vbH > 0 ? h / vbH : 1;
    if (Math.abs(sx - sy) > 1e-6 * Math.max(1, Math.abs(sx), Math.abs(sy)))
      warn('engine.iconStretched');
    const color = str(node.color, '#000000');
    const strokeWidth =
      node.strokeWidth === undefined ? undefined : Math.max(0, num(node.strokeWidth, 1));
    // The node's `mirror` (or, absent, the icon's in the set): in `rtl` the paths flip inside the box.
    const mirror = dirOf(node) === 'rtl' && bool(node.mirror, found.def.mirror === true);
    const matrix: Matrix = mirror ? [-sx, 0, 0, sy, w, 0] : [sx, 0, 0, sy, 0, 0];
    const children = found.def.paths.map((iconPath, i) => ({
      ...iconPathNode(iconPath, `${id}/${i}`, found.viewBox, color, strokeWidth),
      transform: matrix,
    }));
    return { ...base, type: 'group', children };
  };

  /** The `$lines` key that cites this node: the name, with the row scope when inside a `repeat`. */
  const linesKeyOf = (node: TextTemplate): string =>
    node.name === undefined
      ? ''
      : node.linesScope === undefined
        ? node.name
        : `${node.linesScope}:${node.name}`;
  const recordLines = (node: TextTemplate, count: number): void => {
    lineCounts.set(linesKeyOf(node), count);
  };
  const measuredLines = (m: TextMetrics): number =>
    m.lineCount ?? Math.max(1, m.lines?.length ?? 1);

  /** Is it worth checking whether the text exceeds the height? No, if `maxLines`/`ellipsis` cut it on purpose. */
  const checksOverflow = (font: MeasureFont, w: number): boolean =>
    font.maxLines === undefined && font.ellipsis !== true && w > EPS;

  /** Do the wrapped lines exceed the node's height with nothing cutting them (`maxLines`/`ellipsis`)? */
  const warnTextTooTall = (
    node: TextTemplate,
    height: (() => number) | number,
    font: MeasureFont,
    w: number,
    h: number,
  ): void => {
    if (!checksOverflow(font, w)) return;
    const measured = typeof height === 'number' ? height : height();
    if (measured > h + TEXT_TOLERANCE)
      warnShort('engine.textTooBig', nodeName(node), measured - h);
  };

  /**
   * The word wider than the box (decision 3 of #1631). Text only wraps between words, so the one
   * that does not fit stays alone on a line; with `wrap: none` the line is the whole paragraph.
   * Only the lines with a space wrapped by word (which already fit) and those that the
   * `wordSafeWidth` shortcut (letters × size plus spacing) proves fit are skipped, which only
   * holds for narrow letters (below U+2000: emoji and CJK can exceed 1em). The rest is measured
   * without a limit. It does not use `TextMetrics.width`, which the app's measurer clamps to the
   * limit. Returns the width of the widest, or 0.
   */
  const widestWord = (lines: readonly string[], font: MeasureFont, w: number): number => {
    const advance = font.size + font.letterSpacing;
    const free: MeasureFont = { ...font };
    delete free.maxLines;
    delete free.ellipsis;
    const spaced = font.wrap !== 'none';
    const fitsByAdvance = (line: string): boolean =>
      [...line].length * advance <= w &&
      ![...line].some((ch) => (ch.codePointAt(0) ?? 0) >= 0x2000);
    let widest = 0;
    for (const line of lines) {
      if ((spaced && line.includes(' ')) || fitsByAdvance(line)) continue;
      widest = Math.max(widest, options.measure(line, free).width);
    }
    return widest;
  };

  /** Does a word (or a chip) exceed the node's width with nothing cutting the text? */
  const warnTextTooWide = (
    node: TextTemplate,
    widest: (() => number) | number,
    font: MeasureFont,
    w: number,
  ): void => {
    if (!checksOverflow(font, w)) return;
    const measured = typeof widest === 'number' ? widest : widest();
    if (measured > w + TEXT_TOLERANCE)
      warnShort('engine.textTooBig', nodeName(node), measured - w);
  };

  /** The scene's text and, with `runs`, the resolved runs and their layout in the box. */
  const textContent = (
    node: TextTemplate,
    font: MeasureFont,
    w: number,
    h: number,
  ): { text: string; extra: { runs?: SceneTextRun[]; runLayout?: RunLayout } } => {
    const cited = citedLines.has(linesKeyOf(node));
    if (node.runs === undefined) {
      const text = plainText(node);
      const measured = () => remembered(node, w, () => options.measure(text, font, w));
      warnTextTooTall(node, () => measured().height, font, w, h);
      warnTextTooWide(node, () => widestWord(measured().lines ?? [], font, w), font, w);
      if (cited) recordLines(node, text === '' ? 0 : measuredLines(measured()));
      return { text, extra: {} };
    }
    const rich = richRuns(node, font);
    const runLayout = layoutRuns(rich.runs, richBase(node, font), options.measure, w);
    warnTextTooTall(node, runLayout.height, font, w, h);
    warnTextTooWide(node, runLayout.width, font, w);
    const text = rich.scene.map((run) => run.text).join('');
    if (cited) recordLines(node, text === '' ? 0 : runLayout.lines.length);
    return { text, extra: { runs: rich.scene, runLayout } };
  };

  /** The scene's `align`. Rich text (`runs`) does not justify: the scene says `left`, which is what was laid out. */
  const styleAlign = (node: TextTemplate): TextStyle['align'] => {
    const value = physicalAlign(node);
    return value === 'justify' && node.runs !== undefined ? 'left' : value;
  };

  const verticalAlignOf = (node: TextTemplate): TextStyle['verticalAlign'] =>
    oneOf(
      node.font?.verticalAlign,
      // `cap-middle` only exists in formatVersion 4; before it, coming from an expression, it is a value outside the set.
      original.formatVersion >= 4
        ? ['top', 'middle', 'bottom', 'cap-middle']
        : ['top', 'middle', 'bottom'],
      'top',
    );

  /** The node's `baselinePadding.top` in a box of width `w`: never less than the font's baseline. */
  const baselineTopOf = (node: TextTemplate, w: number): number | undefined => {
    const top = baselinePaddingOf(node)?.top;
    return top === undefined ? undefined : Math.max(top, baselinesOf(node, w).first);
  };

  /** The `style` keys that only enter when off the default: decoration, wrapping, ellipsis and line limit. */
  const textStyleExtras = (node: TextTemplate, font: MeasureFont): Partial<TextStyle> => {
    const font0: FontSpec = node.font ?? {};
    const decoration = oneOf(
      font0.decoration,
      ['none', 'underline', 'line-through'],
      'none',
    );
    return {
      ...(decoration === 'none' ? {} : { decoration }),
      ...(font.wrap === 'none' ? { wrap: 'none' as const } : {}),
      ...(font.ellipsis === true ? { ellipsis: true } : {}),
      ...(font.maxLines !== undefined ? { maxLines: font.maxLines } : {}),
    };
  };

  /** The scene `style` of a text node: the measured font, the effective direction and the baseline. */
  const textStyleOf = (
    node: TextTemplate,
    font: MeasureFont,
    baselineTop: number | undefined,
  ): TextStyle => ({
    fontFamily: font.family,
    fontSize: font.size,
    fontWeight: font.weight,
    italic: font.italic,
    lineHeight: font.lineHeight,
    letterSpacing: font.letterSpacing,
    // `justify` only exists in formatVersion 4; before it, coming from an expression, it is a value outside the set.
    align: styleAlign(node),
    ...(dirOf(node) === 'rtl' ? { direction: 'rtl' as const } : {}),
    // With `baselinePadding.top` the `verticalAlign` no longer applies (the first baseline rules).
    verticalAlign: baselineTop === undefined ? verticalAlignOf(node) : 'top',
    ...(baselineTop === undefined ? {} : { baselineTop }),
    ...textStyleExtras(node, font),
  });

  const buildText = (
    node: TextTemplate,
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): SceneNode => {
    const font = textFont(node);
    const style = textStyleOf(node, font, baselineTopOf(node, w));
    const { text, extra } = textContent(node, font, w, h);
    const color = str(node.color, '#000000');
    const stroke = strokeOf(node.stroke, 'inside', 1);
    const result: TextNode = {
      ...common(node, id, x, y, w, h),
      fills: isNone(color) ? [] : [{ type: 'solid', color }],
      ...(stroke ? { stroke } : {}),
      type: 'text',
      text,
      style,
      ...extra,
    };
    return result;
  };

  /**
   * `image` becomes a rectangle: the node's `fill` is the background and, on top, the `image`
   * paint with the URL (the literal, or the field's value if it is non-empty text). The model
   * does not download the image or apply the URL policy (whoever draws decides); the layout does
   * not depend on it.
   */
  const buildImage = (
    node: ImageTemplate,
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): SceneNode => {
    const raw = typeof node.src === 'string' ? node.src : ev<unknown>(node.src, '');
    const url = typeof raw === 'string' ? raw.trim() : '';
    const stroke = strokeOf(node.stroke, 'inside', 1);
    const base = common(node, id, x, y, w, h);
    return {
      ...base,
      fills: [
        ...base.fills,
        { type: 'image', fit: node.fit ?? 'cover', ...(url === '' ? {} : { url }) },
      ],
      ...(stroke ? { stroke } : {}),
      type: 'rect',
      cornerRadius: radiusOf(node),
    };
  };

  const buildNode = (
    node: TemplateNode,
    path: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): SceneNode => {
    const id = `${prefix}/${path}`;
    builtIds.set(node, id);
    switch (node.type) {
      case 'frame':
        return buildFrame(node, path, x, y, w, h, false);
      case 'path':
        return buildPath(node, id, x, y, w, h);
      case 'icon':
        return buildIcon(node, id, x, y, w, h);
      case 'text':
        return buildText(node, id, x, y, w, h);
      case 'slot': {
        const label = str(node.label, node.name ?? 'slot');
        return {
          ...common(node, id, x, y, w, h),
          name: label,
          type: 'unknown',
          sourceType: 'slot',
          ...(bool(node.clip, false) ? { clipChildren: true as const } : {}),
        };
      }
      case 'rect': {
        const stroke = strokeOf(node.stroke, 'inside', 1);
        registerGap(node, id, stroke);
        return {
          ...common(node, id, x, y, w, h),
          ...(stroke ? { stroke } : {}),
          type: 'rect',
          cornerRadius: radiusOf(node),
        };
      }
      case 'ellipse': {
        const stroke = strokeOf(node.stroke, 'inside', 1);
        return {
          ...common(node, id, x, y, w, h),
          ...(stroke ? { stroke } : {}),
          type: 'ellipse',
        };
      }
      case 'image':
        return buildImage(node, id, x, y, w, h);
      case 'repeat':
        // `expandRepeats` already replaced every `repeat` with a frame: it never gets here.
        throw new Error('repeat not expanded');
    }
  };

  /** What the slot offers to its children: each `provide` evaluated with this instance's values. */
  const provides = (): ProvidedValues | undefined => {
    const offered = providingSlot(component)?.provide;
    if (offered === undefined) return undefined;
    const out: Record<string, string | number> = {};
    for (const [name, expr] of Object.entries(offered)) {
      const value = ev<unknown>(expr as Expr<unknown>, undefined);
      if (typeof value === 'number' && Number.isFinite(value)) out[name] = value;
      else if (typeof value === 'string' && value.trim() !== '') out[name] = value;
    }
    return Object.keys(out).length === 0 ? undefined : out;
  };

  const buildRoot = (box: Box): FrameNode =>
    withGaps(
      buildFrame(component.template, 'root', box.x, box.y, box.width, box.height, true),
    );

  return {
    messages: messageSet.list,
    shortfalls,
    provides,
    planFrame,
    intrinsicWidth,
    buildRoot,
    /** The component's first baseline in box `box` (what the parent's `align: "baseline"` reads). */
    rootBaseline: (box: Box): number | undefined =>
      kidBaseline(component.template, box.width, box.height),
    template: component.template,
    limitOf,
    clampSize,
    citedLines,
    lineCounts,
    /** A node's line count changed between the two passes: the second's stays (decision 8). */
    warnLinesUnstable: (key: string) =>
      warn('engine.linesUnstable', { name: linesNodeName(key) }),
  };
}

type Engine = ReturnType<typeof createEngine>;

/**
 * Runs `run` in the engine and, if the template uses `$lines`, in two passes (decision 8 of
 * #898): the first with 1 line in each `$lines`, the second with the lines measured in the first.
 * `run` builds the nodes of a cited text (that is where the lines are measured, at the final
 * width). If the second measures another number on a cited node, the second's stays and the
 * engine warns `$lines unstable: <node>` (no third pass). Without `$lines`, a single pass.
 */
function withLinesPasses<R>(
  component: ComponentFile,
  values: FieldValues,
  options: InstantiateOptions,
  size: { readonly width: number; readonly height: number },
  run: (engine: Engine) => R,
  openAxes?: OpenAxes,
): { engine: Engine; result: R } {
  const first = createEngine(component, values, options, size, undefined, openAxes);
  if (first.citedLines.size === 0) return { engine: first, result: run(first) };
  run(first);
  const seed = new Map(
    [...first.citedLines].map((key) => [key, first.lineCounts.get(key) ?? 0]),
  );
  const second = createEngine(component, values, options, size, seed, openAxes);
  const result = run(second);
  for (const [key, count] of second.lineCounts)
    if (count !== (seed.get(key) ?? 0)) second.warnLinesUnstable(key);
  return { engine: second, result };
}

export function instantiate(
  component: ComponentFile,
  values: FieldValues,
  box: Box,
  options: InstantiateOptions,
): Instantiated {
  const { engine, result: root } = withLinesPasses(component, values, options, box, (e) =>
    e.buildRoot(box),
  );
  const provides = engine.provides();
  const messages = engine.messages();
  const firstBaseline = engine.rootBaseline(box);
  return {
    root,
    ...(firstBaseline === undefined ? {} : { firstBaseline }),
    ...(provides === undefined ? {} : { provides }),
    warnings: textsOf(messages),
    messages,
    shortfalls: Object.fromEntries(engine.shortfalls),
    overflowWarnings: [...engine.shortfalls.keys()],
  };
}

/**
 * Measures the component without building nodes: the template root's plan, with `null` = `hug`
 * on that axis (the frame hugs its children; with `slotContent`, the slot takes the children's size).
 */
export function measureComponent(
  component: ComponentFile,
  values: FieldValues,
  size: {
    readonly width: number | IntrinsicSize | null;
    readonly height: number | IntrinsicSize | null;
  },
  options: InstantiateOptions,
): {
  width: number;
  height: number;
  warnings: readonly string[];
  messages: readonly ModelMessage[];
} {
  // Only px is a given size; `null` (hug) and `min-content`/`max-content` (decision 17 of #1078) are measured.
  // The intrinsic height is the hug one: the height the content asks for at the already resolved width.
  const given = {
    width: typeof size.width === 'number' ? size.width : null,
    height: typeof size.height === 'number' ? size.height : null,
  };
  const start = {
    width: given.width ?? component.size.width,
    height: given.height ?? component.size.height,
  };
  // Hug axis: its `$size` does not limit the `min`/`max` by expression (infinite = absent).
  const open = { width: given.width === null, height: given.height === null };
  const plan = (engine: Engine): { width: number; height: number } => {
    const { template } = engine;
    // On a hug axis the root's `max` is the available limit; after the plan, the root's min/max
    // applies (width first: the height is measured already at the limited width).
    const finiteMax = (axis: Axis) => {
      const { max } = engine.limitOf(template, axis);
      return Number.isFinite(max) ? max : null;
    };
    const fixedWidth = isIntrinsicSize(size.width)
      ? engine.clampSize(template, 'w', engine.intrinsicWidth(template, size.width))
      : given.width;
    const limits: Limits = {
      w: fixedWidth === null ? finiteMax('w') : null,
      h: given.height === null ? finiteMax('h') : null,
    };
    const first = engine.planFrame(template, fixedWidth, given.height, limits);
    const width = fixedWidth ?? engine.clampSize(template, 'w', first.w);
    const planned =
      width === first.w ? first : engine.planFrame(template, width, given.height, limits);
    return { width, height: given.height ?? engine.clampSize(template, 'h', planned.h) };
  };
  // With `$lines`, the two passes also build the nodes (that is where each text's lines are measured).
  const { engine, result } = withLinesPasses(
    component,
    values,
    options,
    start,
    (e) => {
      const measured = plan(e);
      if (e.citedLines.size > 0) e.buildRoot({ x: 0, y: 0, ...measured });
      return measured;
    },
    open,
  );
  const { width, height } = result;
  const messages = engine.messages();
  return { width, height, warnings: textsOf(messages), messages };
}
