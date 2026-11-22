import type { MeasureFont } from '../../src/model/components/instantiate';
import type { Point } from '../../src/model/components/scene';
import { guardedLayout, guardedLayoutWith } from './fontSubstitutions';
import type { Face, PathCommand } from './harfbuzz';
import type { FontBook } from './textMeasurer';

// Glyph outlines and text widths over a HarfBuzz `Face`, as polygons for the rasterizer to fill. Only types come
// from `./harfbuzz` and `./textMeasurer`, so the scene rasterizer (which the e2e specs bundle for Chromium) pulls in
// no HarfBuzz runtime.

export type Polygon = readonly Point[];

const CURVE_STEPS = 8;
/** Slant of the synthetic italic (the embedded font has no italic): ~11.3°. */
const ITALIC_SLANT = 0.2;

function cubic(p0: Point, c1: Point, c2: Point, p1: Point, out: Point[]): void {
  for (let i = 1; i <= CURVE_STEPS; i++) {
    const t = i / CURVE_STEPS;
    const u = 1 - t;
    out.push({
      x:
        u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
      y:
        u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
    });
  }
}

function quad(p0: Point, c: Point, p1: Point, out: Point[]): void {
  for (let i = 1; i <= CURVE_STEPS; i++) {
    const t = i / CURVE_STEPS;
    const u = 1 - t;
    out.push({
      x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
      y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
    });
  }
}

/** A point of the command (`x`/`y`, `x1`/`y1` or `x2`/`y2`), or `from` if missing. */
function point(cmd: PathCommand, n: '' | '1' | '2', from: Point): Point {
  const x = n === '' ? cmd.x : n === '1' ? cmd.x1 : cmd.x2;
  const y = n === '' ? cmd.y : n === '1' ? cmd.y1 : cmd.y2;
  return { x: x ?? from.x, y: y ?? from.y };
}

/** Step of a path command: returns the new current point. */
function step(cmd: PathCommand, from: Point, out: Point[]): Point {
  const to = point(cmd, '', from);
  if (cmd.type === 'C')
    cubic(from, point(cmd, '1', from), point(cmd, '2', from), to, out);
  else if (cmd.type === 'Q') quad(from, point(cmd, '1', from), to, out);
  else out.push(to);
  return to;
}

/** The closed outlines of a glyph path (curves become segments). */
export function pathPolygons(commands: readonly PathCommand[]): Polygon[] {
  const polygons: Point[][] = [];
  let current: Point[] = [];
  let at: Point = { x: 0, y: 0 };
  const close = () => {
    if (current.length > 2) polygons.push(current);
    current = [];
  };
  for (const cmd of commands) {
    if (cmd.type === 'M') {
      close();
      at = { x: cmd.x ?? 0, y: cmd.y ?? 0 };
      current = [at];
    } else if (cmd.type === 'Z') {
      close();
    } else {
      at = step(cmd, at, current);
    }
  }
  close();
  return polygons;
}

/** Slants the polygons around the baseline (synthetic italic). */
export function slant(polygons: readonly Polygon[], baseline: number): Polygon[] {
  return polygons.map((poly) =>
    poly.map((p) => ({ x: p.x + (baseline - p.y) * ITALIC_SLANT, y: p.y })),
  );
}

export interface GlyphStyle {
  readonly size: number;
  readonly letterSpacing: number;
  readonly italic: boolean;
  /** CSS weight, for a variable font's `wght` axis (default 400). */
  readonly weight?: number;
  /** The node's base direction (absent = `ltr`): the runs of the line are reordered by it (stage #2448). */
  readonly direction?: 'rtl';
}

/** The outlines of the text laid out by `face` (shaped as a whole; with letter spacing, without the optional ligatures and contextual alternates). */
function laidOut(
  face: Face,
  text: string,
  x: number,
  baseline: number,
  style: GlyphStyle,
) {
  return pathPolygons(
    face.path(text, x, baseline, style.size, {
      letterSpacing: style.letterSpacing,
      weight: style.weight,
      direction: style.direction,
    }),
  );
}

/** The outlines of a text and the baseline they were laid out on. */
export interface TextOutline {
  readonly polygons: Polygon[];
  readonly baseline: number;
}

/**
 * Outlines of the text with the baseline origin at (`x`, `baselineOf(face)`). A shaping that throws is laid out with
 * the embedded `fallback` font, and the baseline is asked of that font: the metrics and the glyphs come from the same
 * face (stage #2267, decision 2).
 */
export function textPolygons(
  face: Face,
  fallback: () => Face,
  text: string,
  x: number,
  baselineOf: (face: Face) => number,
  style: GlyphStyle,
): TextOutline {
  const { value } = guardedLayoutWith(face, fallback, (f) => {
    const baseline = baselineOf(f);
    const polygons = laidOut(f, text, x, baseline, style);
    return { polygons: style.italic ? slant(polygons, baseline) : polygons, baseline };
  });
  return value;
}

/** What lays a line out: the font, the letter spacing and the base direction. */
type LineFont = Pick<
  MeasureFont,
  'family' | 'size' | 'weight' | 'italic' | 'letterSpacing' | 'direction'
>;

/** Width of a one-line text with the font, the letter spacing and the direction. */
export function textWidth(book: FontBook, text: string, font: LineFont): number {
  const face = book.fontFor(font.family, font.weight, font.italic);
  const advance = guardedLayout(
    face,
    () => book.embeddedFor(font.family, font.weight),
    (f) =>
      f.advance(text, font.size, font.weight, font.letterSpacing !== 0, font.direction),
  );
  return Math.max(0, advance + font.letterSpacing * [...text].length);
}

/**
 * The face that lays the one-line `text` out: the font's own, or the embedded one when its shaping throws. What reads
 * the vertical metrics of a text asks this face, so they match the glyphs and the width.
 */
export function layingFace(book: FontBook, text: string, font: LineFont): Face {
  return guardedLayoutWith(
    book.fontFor(font.family, font.weight, font.italic),
    () => book.embeddedFor(font.family, font.weight),
    (f) =>
      f.advance(text, font.size, font.weight, font.letterSpacing !== 0, font.direction),
  ).face;
}

/**
 * Capital height at the given size (px, positive), for `cap-middle`. It is the only place that reads it:
 * `OS/2.sCapHeight`; without it, the top of the glyph box of `H`; without `H`, 0.7 of the body.
 */
export function capHeightOf(face: Face, size: number): number {
  return face.capHeight(size);
}

/** Ascent and descent of the font at the given size (px, both positive). */
export function fontExtents(
  face: Face,
  size: number,
): { ascent: number; descent: number } {
  const k = size / face.unitsPerEm;
  return { ascent: face.ascender * k, descent: -face.descender * k };
}
