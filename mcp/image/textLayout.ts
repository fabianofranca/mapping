import { lineBaseline, type CapMetrics } from '../../src/model/components/baseline';
import type { TextMeasurer } from '../../src/model/components/instantiate';
import type { RunLayout, RunPiece } from '../../src/model/components/richText';
import type { SceneTextRun, TextNode } from '../../src/model/components/scene';
import {
  capHeightOf,
  fontExtents,
  layingFace,
  textPolygons,
  textWidth,
  type Polygon,
} from './glyphs';
import { blockTop, lineHeightOf, lineLeft, plainLines, richShift } from './textBars';
import type { FontBook } from './textMeasurer';

// Layout of a scene's text with a real font: the glyph outlines of each line and run
// (and the chips' background), measured with the same font that draws them.

// ---------------------------------------------------------------------------------------
// Glifos
// ---------------------------------------------------------------------------------------

/** Outlines painted in the run's color (`undefined` = the node's text color). */
export interface InkGlyphs {
  readonly polygons: Polygon[];
  readonly color?: string;
}

/** Background of an inline box (chip), in the node's local space. */
export interface InkBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly color: string;
}

export interface TextInk {
  readonly glyphs: InkGlyphs[];
  readonly boxes: InkBox[];
}

interface FontSpec {
  readonly family: string;
  readonly size: number;
  readonly weight: number;
  readonly italic: boolean;
  readonly letterSpacing: number;
  /** The node's base direction (absent = `ltr`), for plain lines, justified words and rich-text pieces alike. */
  readonly direction?: 'rtl';
}

const rectPolygon = (x: number, y: number, w: number, h: number): Polygon => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

/**
 * The vertical metrics of the node's font (the base of `cap-middle`), read from the face that lays the node's `text`
 * out (the library font's, or the embedded one when its shaping throws).
 */
function capMetricsOf(book: FontBook, spec: FontSpec, text: string): CapMetrics {
  const face = layingFace(book, text, spec);
  return { ...fontExtents(face, spec.size), capHeight: capHeightOf(face, spec.size) };
}

/** `cap-middle` and `baselinePadding.top` read the metrics of the font that draws. */
const needsMetrics = (node: TextNode): boolean =>
  node.style.verticalAlign === 'cap-middle' || node.style.baselineTop !== undefined;

/** Outlines of a line of text whose top is at `top` and height `lineHeight`, plus the decoration. */
function lineInk(
  book: FontBook,
  text: string,
  spec: FontSpec,
  x: number,
  top: number,
  lineHeight: number,
  decoration: 'underline' | 'line-through' | undefined,
): Polygon[] {
  // The baseline is computed inside the guarded layout, from the face that lays the text out.
  const { polygons, baseline } = textPolygons(
    book.fontFor(spec.family, spec.weight, spec.italic),
    () => book.embeddedFor(spec.family, spec.weight),
    text,
    x,
    (face) => lineBaseline(top, lineHeight, fontExtents(face, spec.size)),
    spec,
    book.synthesis(spec.family, spec.weight, spec.italic),
  );
  if (decoration === undefined) return polygons;
  return [
    ...polygons,
    decorationBar(decoration, spec, x, baseline, textWidth(book, text, spec)),
  ];
}

function decorationBar(
  decoration: 'underline' | 'line-through',
  spec: FontSpec,
  x: number,
  baseline: number,
  width: number,
): Polygon {
  const thickness = Math.max(1, spec.size / 14);
  const y =
    decoration === 'underline' ? baseline + spec.size * 0.12 : baseline - spec.size * 0.3;
  return rectPolygon(x, y, width, thickness);
}

/**
 * Justified line (like Konva): the space left up to the node's width is split equally
 * among the line's spaces; the words keep their size.
 */
function justifiedInk(
  book: FontBook,
  line: string,
  spec: FontSpec,
  nodeWidth: number,
  top: number,
  lineHeight: number,
  decoration: 'underline' | 'line-through' | undefined,
): Polygon[] {
  const words = line.split(' ');
  const spaceWidth = textWidth(book, ' ', spec);
  const extra = (nodeWidth - textWidth(book, line, spec)) / (words.length - 1);
  const polygons: Polygon[] = [];
  let x = 0;
  for (const word of words) {
    if (word !== '')
      polygons.push(...lineInk(book, word, spec, x, top, lineHeight, undefined));
    x += textWidth(book, word, spec) + spaceWidth + extra;
  }
  if (decoration === undefined) return polygons;
  // The decoration belongs to the line: its baseline comes from the face that lays the whole line out.
  const baseline = lineBaseline(
    top,
    lineHeight,
    fontExtents(layingFace(book, line, spec), spec.size),
  );
  return [...polygons, decorationBar(decoration, spec, 0, baseline, nodeWidth)];
}

function plainInk(node: TextNode, measure: TextMeasurer, book: FontBook): TextInk {
  const { style } = node;
  const lineHeight = lineHeightOf(style);
  const spec: FontSpec = {
    family: style.fontFamily,
    size: style.fontSize,
    weight: style.fontWeight,
    italic: style.italic,
    letterSpacing: style.letterSpacing ?? 0,
    ...(style.direction ? { direction: style.direction } : {}),
  };
  const widthOf = (text: string) => textWidth(book, text, spec);
  // Only the lines that fit the box's height (decision 31); `cap-middle` centers by them.
  const { lines, ends } = plainLines(node, measure, widthOf);
  const top = blockTop(
    node,
    lines.length,
    lineHeight,
    needsMetrics(node) ? capMetricsOf(book, spec, node.text) : undefined,
  );
  const widths = lines.map(widthOf);
  const block = widths.reduce((max, w) => Math.max(max, w), 0);
  const polygons: Polygon[] = [];
  lines.forEach((line, i) => {
    if (line === '') return;
    if (ends[i] === false && node.width > 0 && line.includes(' ')) {
      polygons.push(
        ...justifiedInk(
          book,
          line,
          spec,
          node.width,
          top + i * lineHeight,
          lineHeight,
          style.decoration,
        ),
      );
      return;
    }
    polygons.push(
      ...lineInk(
        book,
        line,
        spec,
        lineLeft(node, widths[i] ?? 0, block),
        top + i * lineHeight,
        lineHeight,
        style.decoration,
      ),
    );
  });
  return { glyphs: [{ polygons }], boxes: [] };
}

function pieceInk(
  book: FontBook,
  piece: RunPiece,
  run: SceneTextRun,
  top: number,
  out: TextInk,
  direction: 'rtl' | undefined,
): void {
  const [padV, padH] = piece.chip ? (run.padding ?? [0, 0]) : [0, 0];
  if (piece.chip && run.background !== undefined) {
    out.boxes.push({
      x: piece.x,
      y: top,
      width: piece.width,
      height: piece.height,
      radius: run.radius ?? 0,
      color: run.background,
    });
  }
  const spec: FontSpec = {
    family: run.fontFamily,
    size: run.fontSize,
    weight: run.fontWeight,
    italic: run.italic,
    letterSpacing: 0,
    ...(direction ? { direction } : {}),
  };
  out.glyphs.push({
    polygons: lineInk(
      book,
      piece.text,
      spec,
      piece.x + (padH ?? 0),
      top + (padV ?? 0),
      piece.height - 2 * (padV ?? 0),
      run.decoration,
    ),
    color: run.color,
  });
}

function richInk(node: TextNode, layout: RunLayout, book: FontBook): TextInk {
  const runs = node.runs ?? [];
  const base: FontSpec = {
    family: node.style.fontFamily,
    size: node.style.fontSize,
    weight: node.style.fontWeight,
    italic: node.style.italic,
    letterSpacing: 0,
    ...(node.style.direction ? { direction: node.style.direction } : {}),
  };
  const shift = richShift(
    node,
    layout,
    needsMetrics(node) ? capMetricsOf(book, base, node.text) : undefined,
  );
  const out: TextInk = { glyphs: [], boxes: [] };
  for (const line of layout.lines) {
    for (const piece of line.pieces) {
      const run = runs[piece.run];
      if (run === undefined) continue;
      const top = line.y + (line.height - piece.height) / 2 + shift;
      pieceInk(book, piece, run, top, out, node.style.direction);
    }
  }
  return out;
}

/** The glyphs (and the chip backgrounds) of the text in the node's local space, measured and drawn with the same font. */
export function textInk(node: TextNode, measure: TextMeasurer, book: FontBook): TextInk {
  return node.runLayout && node.runs
    ? richInk(node, node.runLayout, book)
    : plainInk(node, measure, book);
}
