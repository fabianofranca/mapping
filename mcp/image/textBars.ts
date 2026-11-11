import {
  capMetricsFallback,
  capMiddleShift,
  lineBaseline,
  type CapMetrics,
} from '../../src/model/components/baseline';
import type { TextMeasurer } from '../../src/model/components/instantiate';
import type { RunLayout, RunPiece } from '../../src/model/components/richText';
import type { SceneTextRun, TextNode } from '../../src/model/components/scene';
import {
  WRAP_SLACK,
  cutLineLeft,
  cutsText,
  konvaLineHeight,
  visibleLineCount,
} from '../../src/model/components/textWrap';
import type { PixelRect } from './raster';

// Barras do texto de uma cena no servidor (o desenho simplificado, sem fonte): uma por linha medida.

/** Altura da barra de texto em relação à altura da linha. */
const BAR_RATIO = 0.6;

/** Quebra por palavras no `node.width` (o padrão, sem `wrap`/`ellipsis`/`maxLines`). */
export function breakLines(node: TextNode, widthOf: (text: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of node.text.split('\n')) {
    const words = paragraph.split(' ').filter((word) => word !== '');
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line === '' ? word : `${line} ${word}`;
      if (line !== '' && node.width > 0 && widthOf(candidate) > node.width + WRAP_SLACK) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * O `maxLines` que o medidor recebe: o do estilo e, com `ellipsis` numa caixa com altura, o menor
 * deste com as linhas que cabem (decisão 31 da #898): o corte pela altura vale como um `maxLines`
 * igual a elas, e a última linha desenhada termina em `…`, como o Konva faz.
 */
function ellipsisMaxLines(node: TextNode): number | undefined {
  const { style } = node;
  if (!style.ellipsis || !(node.height > 0)) return style.maxLines;
  const fit = visibleLineCount(
    Number.POSITIVE_INFINITY,
    node.height,
    konvaLineHeight(lineHeightOf(style), style.fontSize),
  );
  return style.maxLines === undefined ? fit : Math.min(style.maxLines, fit);
}

/**
 * Com `wrap`, `ellipsis` ou `maxLines`, as linhas vêm do medidor (que já corta e põe o `…`);
 * `undefined` = quebra de sempre.
 */
export function customLines(
  node: TextNode,
  measure: TextMeasurer,
  font: Parameters<TextMeasurer>[1],
): string[] | undefined {
  const { style } = node;
  if (
    style.wrap === undefined &&
    style.ellipsis === undefined &&
    style.maxLines === undefined
  )
    return undefined;
  const maxLines = ellipsisMaxLines(node);
  const lines = measure(
    node.text,
    {
      ...font,
      ...(style.wrap ? { wrap: style.wrap } : {}),
      ...(style.ellipsis ? { ellipsis: true } : {}),
      ...(maxLines !== undefined ? { maxLines } : {}),
    },
    node.width > 0 ? node.width : undefined,
  ).lines;
  return lines === undefined ? undefined : [...lines];
}

/** Uma barra do texto; `color` só no texto rico, onde cada barra tem a sua. */
export interface TextBar extends PixelRect {
  readonly color?: string;
}

/**
 * Deslocamento vertical do texto rico na caixa do nó (`verticalAlign`). No `cap-middle` vale o
 * `capHeight` da fonte base do nó (`metrics`) e as linhas de base da primeira e da última linha.
 */
export function richShift(
  node: TextNode,
  layout: RunLayout,
  metrics: CapMetrics = capMetricsFallback(node.style.fontSize),
): number {
  if (node.height <= 0) return 0;
  if (node.style.verticalAlign === 'cap-middle') {
    const first = layout.lines[0];
    const last = layout.lines[layout.lines.length - 1];
    return first && last
      ? capMiddleShift({
          boxHeight: node.height,
          capHeight: metrics.capHeight,
          firstBaseline: lineBaseline(first.y, first.height, metrics),
          lastBaseline: lineBaseline(last.y, last.height, metrics),
        })
      : 0;
  }
  const free = node.height - layout.height;
  if (node.style.verticalAlign === 'middle') return free / 2;
  return node.style.verticalAlign === 'bottom' ? free : 0;
}

/** O fundo (se for chip) e a barra do texto de um pedaço, com o topo do pedaço em `top`. */
function pieceBars(piece: RunPiece, run: SceneTextRun, top: number): TextBar[] {
  const [padV, padH] = piece.chip ? (run.padding ?? [0, 0]) : [0, 0];
  const textHeight = piece.height - 2 * (padV ?? 0);
  const barHeight = textHeight * BAR_RATIO;
  const text: TextBar = {
    x: piece.x + (padH ?? 0),
    y: top + (padV ?? 0) + (textHeight - barHeight) / 2,
    width: piece.width - 2 * (padH ?? 0),
    height: barHeight,
    color: run.color,
  };
  if (!piece.chip || run.background === undefined) return [text];
  const box = { x: piece.x, y: top, width: piece.width, height: piece.height };
  return [{ ...box, color: run.background }, text];
}

/**
 * Barras do texto rico (`runLayout`): para cada pedaço, o fundo do chip (a caixa inteira, na cor do
 * `background`) e uma barra do texto na cor do trecho, com o `verticalAlign` do nó aplicado.
 */
function richBars(
  node: TextNode,
  layout: RunLayout,
  runs: readonly SceneTextRun[],
): TextBar[] {
  const shift = richShift(node, layout);
  return layout.lines.flatMap((line) =>
    line.pieces.flatMap((piece) => {
      const run = runs[piece.run];
      const top = line.y + (line.height - piece.height) / 2 + shift;
      return run ? pieceBars(piece, run, top) : [];
    }),
  );
}

type LineStyle = TextNode['style'];

/** Altura da linha do nó: a do estilo ou 1,2 vez o corpo. */
export const lineHeightOf = (style: LineStyle): number =>
  style.lineHeight ?? style.fontSize * 1.2;

/**
 * Topo do bloco de `count` linhas no nó, pelo `verticalAlign`. No `cap-middle`, `metrics` são as da
 * fonte do nó (sem elas, as proporções de reserva das barras).
 */
export function blockTop(
  node: TextNode,
  count: number,
  lineHeight: number,
  metrics: CapMetrics = capMetricsFallback(node.style.fontSize),
): number {
  const total = count * lineHeight;
  const { verticalAlign } = node.style;
  if (verticalAlign === 'cap-middle')
    return capMiddleShift({
      boxHeight: node.height,
      capHeight: metrics.capHeight,
      firstBaseline: lineBaseline(0, lineHeight, metrics),
      lastBaseline: lineBaseline((count - 1) * lineHeight, lineHeight, metrics),
    });
  if (verticalAlign === 'middle') return (node.height - total) / 2;
  return verticalAlign === 'bottom' ? node.height - total : 0;
}

const wordCount = (text: string): number =>
  text.split(' ').filter((w) => w !== '').length;

/**
 * Parágrafos das linhas do medidor (`wrap: none`, `…`, `maxLines`): uma linha fecha o parágrafo
 * quando as palavras dela completam as do `\\n` corrente; a última linha sempre fecha.
 */
function customEnds(node: TextNode, lines: readonly string[]): boolean[] {
  if (node.style.wrap === 'none') return lines.map(() => true);
  const counts = node.text.split('\n').map(wordCount);
  let paragraph = 0;
  let left = counts[0] ?? 0;
  return lines.map((line, i) => {
    left -= wordCount(line);
    if (i === lines.length - 1) return true;
    if (left > 0) return false;
    paragraph += 1;
    left = counts[paragraph] ?? 0;
    return true;
  });
}

/**
 * Para cada linha, se ela fecha um parágrafo (a última linha de cada `\n`, que o `justify` deixa à
 * esquerda, como o Konva). As linhas do medidor (`wrap: none`, `…`, `maxLines`) fecham o texto
 * inteiro: com `wrap: none` cada linha é um parágrafo; nos outros casos só a última fecha.
 */
export function paragraphEnds(
  node: TextNode,
  lines: readonly string[],
  custom: readonly string[] | undefined,
  widthOf: (text: string) => number,
): boolean[] {
  if (custom !== undefined) return customEnds(node, lines);
  const ends: boolean[] = [];
  for (const paragraph of node.text.split('\n')) {
    const count = breakLines({ ...node, text: paragraph }, widthOf).length;
    for (let i = 0; i < count; i++) ends.push(i === count - 1);
  }
  return ends;
}

/**
 * As linhas que o texto simples desenha, já cortadas pela altura da caixa (decisão 31 da #898: só as
 * que o Konva guarda), e quais delas fecham um parágrafo (só com `justify`).
 */
export function plainLines(
  node: TextNode,
  measure: TextMeasurer,
  widthOf: (text: string) => number,
): { lines: string[]; ends: boolean[] } {
  const { style } = node;
  const lineHeight = lineHeightOf(style);
  const font = {
    family: style.fontFamily,
    size: style.fontSize,
    weight: style.fontWeight,
    italic: style.italic,
    lineHeight,
    letterSpacing: style.letterSpacing ?? 0,
  };
  const custom = customLines(node, measure, font);
  const all = custom ?? breakLines(node, widthOf);
  const count = visibleLineCount(
    all.length,
    node.height,
    konvaLineHeight(lineHeight, style.fontSize),
  );
  const lines = all.slice(0, count);
  if (style.align !== 'justify') return { lines, ends: [] };
  const ends = paragraphEnds(node, all, custom, widthOf).slice(0, count);
  // Como o Konva: a última linha guardada fecha o parágrafo, mesmo cortada no meio dele.
  if (count < all.length && count > 0) ends[count - 1] = true;
  return { lines, ends };
}

/**
 * Posição horizontal de uma linha de largura `width` no nó, pelo `align`. No texto cortado
 * (`cutsText`), `width` é a da linha inteira e `blockWidth`, a da mais larga: as linhas se alinham
 * pelo bloco (`cutLineLeft`, decisão 30).
 */
export function lineLeft(node: TextNode, width: number, blockWidth = width): number {
  const { align } = node.style;
  if (cutsText(node)) return cutLineLeft(align, node.width, blockWidth, width);
  const clamped = Math.min(width, node.width || Infinity);
  if (align === 'center') return (node.width - clamped) / 2;
  return align === 'right' ? node.width - clamped : 0;
}

/** Barras do texto no espaço local do nó: uma por linha medida (uma por pedaço, no texto rico). */
export function textBars(node: TextNode, measure: TextMeasurer): TextBar[] {
  if (node.runLayout && node.runs) return richBars(node, node.runLayout, node.runs);
  const { style } = node;
  const lineHeight = lineHeightOf(style);
  const widthOf = (text: string) =>
    measure(text, {
      family: style.fontFamily,
      size: style.fontSize,
      weight: style.fontWeight,
      italic: style.italic,
      lineHeight,
      letterSpacing: style.letterSpacing ?? 0,
    }).width;
  const { lines, ends } = plainLines(node, measure, widthOf);
  const top = blockTop(node, lines.length, lineHeight);
  const barHeight = lineHeight * BAR_RATIO;
  const block = Math.max(0, ...lines.map(widthOf));
  const bars: TextBar[] = [];
  lines.forEach((line, i) => {
    if (line === '') return;
    // Como o Konva: só se estica uma linha que tem espaço (a palavra sozinha fica no tamanho dela).
    const justified =
      style.align === 'justify' &&
      ends[i] === false &&
      node.width > 0 &&
      line.includes(' ');
    const lineWidth = widthOf(line);
    const width = justified ? node.width : Math.min(lineWidth, node.width || Infinity);
    bars.push({
      x: justified ? 0 : lineLeft(node, lineWidth, block),
      y: top + i * lineHeight + (lineHeight - barHeight) / 2,
      width,
      height: barHeight,
    });
  });
  return bars;
}
