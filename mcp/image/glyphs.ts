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
/** Slant of the synthetic italic of the embedded fonts (they have no italic): ~11.3°. */
export const EMBEDDED_SLANT = 0.2;
/** Slant of the synthetic italic of a library face that is not italic: Chromium's skew, 0.25 (stage #2448). */
export const LIBRARY_SLANT = 0.25;

/** What the drawing adds to a face (stage #2448): synthetic bold and the slant (0 = none). */
export interface Synthesis {
  readonly bold: boolean;
  readonly slant: number;
}

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
export function slant(
  polygons: readonly Polygon[],
  baseline: number,
  by: number = EMBEDDED_SLANT,
): Polygon[] {
  return polygons.map((poly) =>
    poly.map((p) => ({ x: p.x + (baseline - p.y) * by, y: p.y })),
  );
}

/** Skia's fake-bold ratio: 1/24 up to 9 px, 1/32 from 36 px, linear in between. */
function boldRatio(size: number): number {
  if (size <= 9) return 1 / 24;
  if (size >= 36) return 1 / 32;
  return 1 / 24 + ((size - 9) / 27) * (1 / 32 - 1 / 24);
}

/** The sign of the sum of the signed areas of the contours: the orientation of the font's outlines. */
function orientation(polygons: readonly Polygon[]): number {
  let area = 0;
  for (const poly of polygons)
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length]!;
      area += p.x * q.y - q.x * p.y;
    });
  return area < 0 ? -1 : 1;
}

/** Miter limit of the fake bold's joins: beyond it the corner is beveled. */
const MITER_LIMIT = 4;

function embolden1(poly: Polygon, d: number, sign: number): Point[] {
  const pts = poly.filter((p, i) => {
    const q = poly[(i + 1) % poly.length]!;
    return p.x !== q.x || p.y !== q.y;
  });
  const n = pts.length;
  if (n < 3) return [...pts];
  // The outward normal of each edge `i` (from point `i` to `i + 1`).
  const normals = pts.map((p, i) => {
    const q = pts[(i + 1) % n]!;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy);
    return { x: (sign * dy) / len, y: (-sign * dx) / len };
  });
  const out: Point[] = [];
  pts.forEach((p, i) => {
    const a = normals[(i + n - 1) % n]!;
    const b = normals[i]!;
    const dot = a.x * b.x + a.y * b.y;
    // miter length / stroke width = 1 / cos(turn / 2), with cos² = (1 + dot) / 2
    if (1 + dot > 2 / (MITER_LIMIT * MITER_LIMIT)) {
      const k = d / (1 + dot);
      out.push({ x: p.x + (a.x + b.x) * k, y: p.y + (a.y + b.y) * k });
    } else {
      out.push({ x: p.x + a.x * d, y: p.y + a.y * d });
      out.push({ x: p.x + b.x * d, y: p.y + b.y * d });
    }
  });
  return out;
}

/**
 * Synthetic bold (stage #2448, decision 12): each contour moves outward by `size × ratio / 2` (Skia's fake bold) with
 * miter joins up to a limit of 4 and a bevel beyond it. "Outward" follows the orientation of the text's contours.
 */
export function embolden(polygons: readonly Polygon[], size: number): Polygon[] {
  const d = (size * boldRatio(size)) / 2;
  const sign = orientation(polygons);
  return polygons.map((poly) => embolden1(poly, d, sign));
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
  synthesis: Synthesis = { bold: false, slant: style.italic ? EMBEDDED_SLANT : 0 },
): TextOutline {
  const { value } = guardedLayoutWith(face, fallback, (f) => {
    const baseline = baselineOf(f);
    // The fallback face is an embedded one: it never gets synthetic bold, and leans like the embedded fonts.
    const syn =
      f === face ? synthesis : { bold: false, slant: style.italic ? EMBEDDED_SLANT : 0 };
    const laid = laidOut(f, text, x, baseline, style);
    const bold = syn.bold ? embolden(laid, style.size) : laid;
    return {
      polygons: syn.slant !== 0 ? slant(bold, baseline, syn.slant) : bold,
      baseline,
    };
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
