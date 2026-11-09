import type { TextMeasurer } from '../../src/model/components/instantiate';
import type { RunLayout, RunPiece } from '../../src/model/components/richText';
import type { SceneTextRun, TextNode } from '../../src/model/components/scene';
import { WRAP_SLACK } from '../../src/model/components/textWrap';
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
  const lines = measure(
    node.text,
    {
      ...font,
      ...(style.wrap ? { wrap: style.wrap } : {}),
      ...(style.ellipsis ? { ellipsis: true } : {}),
      ...(style.maxLines !== undefined ? { maxLines: style.maxLines } : {}),
    },
    node.width > 0 ? node.width : undefined,
  ).lines;
  return lines === undefined ? undefined : [...lines];
}

/** Uma barra do texto; `color` só no texto rico, onde cada barra tem a sua. */
export interface TextBar extends PixelRect {
  readonly color?: string;
}

/** Medidas verticais da fonte do nó, para o `cap-middle` (px no tamanho do nó). */
export interface CapMetrics {
  readonly ascent: number;
  readonly descent: number;
  readonly capHeight: number;
}

/** Sem fonte (as barras), as proporções usuais: ascendente 0,8, descendente 0,2, maiúscula 0,7 do corpo. */
export const capMetricsFallback = (size: number): CapMetrics => ({
  ascent: 0.8 * size,
  descent: 0.2 * size,
  capHeight: 0.7 * size,
});

/**
 * `cap-middle` (decisão 3 da #896): quanto descer o texto, posto no topo, para o bloco do topo da
 * maiúscula da primeira linha à linha de base da última ficar no centro da caixa. A linha de base
 * de uma linha de altura `height` que começa em `top` é `top + height / 2 + (ascent − descent) / 2`
 * (a mesma da app e do desenho dos glifos).
 */
export function capMiddleShift(input: {
  readonly boxHeight: number;
  readonly metrics: CapMetrics;
  /** Topo e altura da primeira e da última linha, com o texto no topo. */
  readonly first: { readonly y: number; readonly height: number };
  readonly last: { readonly y: number; readonly height: number };
}): number {
  const { boxHeight, metrics, first, last } = input;
  if (boxHeight <= 0) return 0;
  const baseline = (line: { y: number; height: number }) =>
    line.y + line.height / 2 + (metrics.ascent - metrics.descent) / 2;
  const block = baseline(last) - baseline(first) + metrics.capHeight;
  return (boxHeight - block) / 2 + metrics.capHeight - baseline(first);
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
      ? capMiddleShift({ boxHeight: node.height, metrics, first, last })
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
      metrics,
      first: { y: 0, height: lineHeight },
      last: { y: (count - 1) * lineHeight, height: lineHeight },
    });
  if (verticalAlign === 'middle') return (node.height - total) / 2;
  return verticalAlign === 'bottom' ? node.height - total : 0;
}

/** Posição horizontal de uma linha de largura `width` no nó, pelo `align`. */
export function lineLeft(node: TextNode, width: number): number {
  const { align } = node.style;
  if (align === 'center') return (node.width - width) / 2;
  return align === 'right' ? node.width - width : 0;
}

/** Barras do texto no espaço local do nó: uma por linha medida (uma por pedaço, no texto rico). */
export function textBars(node: TextNode, measure: TextMeasurer): TextBar[] {
  if (node.runLayout && node.runs) return richBars(node, node.runLayout, node.runs);
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
  const widthOf = (text: string) => measure(text, font).width;
  const lines = customLines(node, measure, font) ?? breakLines(node, widthOf);
  const top = blockTop(node, lines.length, lineHeight);
  const barHeight = lineHeight * BAR_RATIO;
  const bars: TextBar[] = [];
  lines.forEach((line, i) => {
    if (line === '') return;
    const justified = style.align === 'justify' && i < lines.length - 1;
    const width = justified
      ? node.width
      : Math.min(widthOf(line), node.width || Infinity);
    bars.push({
      x: lineLeft(node, width),
      y: top + i * lineHeight + (lineHeight - barHeight) / 2,
      width,
      height: barHeight,
    });
  });
  return bars;
}
