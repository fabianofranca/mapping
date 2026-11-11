import type { TextMeasurer } from '../../src/model/components/instantiate';
import type { RunLayout, RunPiece } from '../../src/model/components/richText';
import type { SceneTextRun, TextNode } from '../../src/model/components/scene';
import { capHeightOf, fontExtents, textPolygons, type Polygon } from './glyphs';
import {
  blockTop,
  type CapMetrics,
  breakLines,
  customLines,
  paragraphEnds,
  lineHeightOf,
  lineLeft,
  richShift,
} from './textBars';
import { textWidth, type FontBook } from './textMeasurer';

// Disposição do texto de uma cena com fonte real: os contornos dos glifos de cada linha e trecho
// (e o fundo dos chips), medidos com a mesma fonte que os desenha.

// ---------------------------------------------------------------------------------------
// Glifos
// ---------------------------------------------------------------------------------------

/** Contornos pintados na cor do trecho (`undefined` = a cor do texto do nó). */
export interface InkGlyphs {
  readonly polygons: Polygon[];
  readonly color?: string;
}

/** Fundo de uma caixa em linha (chip), no espaço local do nó. */
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
}

const rectPolygon = (x: number, y: number, w: number, h: number): Polygon => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

/** As medidas verticais da fonte do nó (a base do `cap-middle`), lidas da mesma fonte que desenha. */
function capMetricsOf(book: FontBook, spec: FontSpec): CapMetrics {
  const face = book.fontFor(spec.family, spec.weight, spec.italic);
  return { ...fontExtents(face, spec.size), capHeight: capHeightOf(face, spec.size) };
}

/** Contornos de uma linha de texto cujo topo está em `top` e altura `lineHeight`, mais a decoração. */
function lineInk(
  book: FontBook,
  text: string,
  spec: FontSpec,
  x: number,
  top: number,
  lineHeight: number,
  decoration: 'underline' | 'line-through' | undefined,
): Polygon[] {
  const face = book.fontFor(spec.family, spec.weight, spec.italic);
  const { ascent, descent } = fontExtents(face, spec.size);
  const baseline = top + (lineHeight - (ascent + descent)) / 2 + ascent;
  const polygons = textPolygons(face, text, x, baseline, spec);
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
 * Linha justificada (como o Konva): o espaço que falta até a largura do nó se reparte igualmente
 * entre os espaços da linha; as palavras ficam no tamanho delas.
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
  const face = book.fontFor(spec.family, spec.weight, spec.italic);
  const { ascent, descent } = fontExtents(face, spec.size);
  const baseline = top + (lineHeight - (ascent + descent)) / 2 + ascent;
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
  };
  const widthOf = (text: string) => textWidth(book, text, spec);
  const lines =
    customLines(node, measure, { ...spec, lineHeight }) ?? breakLines(node, widthOf);
  const top = blockTop(
    node,
    lines.length,
    lineHeight,
    node.style.verticalAlign === 'cap-middle' ? capMetricsOf(book, spec) : undefined,
  );
  const polygons: Polygon[] = [];
  const ends =
    style.align === 'justify'
      ? paragraphEnds(
          node,
          lines,
          customLines(node, measure, { ...spec, lineHeight }),
          widthOf,
        )
      : [];
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
    const width = Math.min(widthOf(line), node.width || Infinity);
    polygons.push(
      ...lineInk(
        book,
        line,
        spec,
        lineLeft(node, width),
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
  };
  const shift = richShift(
    node,
    layout,
    node.style.verticalAlign === 'cap-middle' ? capMetricsOf(book, base) : undefined,
  );
  const out: TextInk = { glyphs: [], boxes: [] };
  for (const line of layout.lines) {
    for (const piece of line.pieces) {
      const run = runs[piece.run];
      if (run === undefined) continue;
      pieceInk(book, piece, run, line.y + (line.height - piece.height) / 2 + shift, out);
    }
  }
  return out;
}

/** Os glifos (e os fundos de chip) do texto no espaço local do nó, medidos e desenhados com a mesma fonte. */
export function textInk(node: TextNode, measure: TextMeasurer, book: FontBook): TextInk {
  return node.runLayout && node.runs
    ? richInk(node, node.runLayout, book)
    : plainInk(node, measure, book);
}
