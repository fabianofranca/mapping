import type { TextMeasurer } from '../../src/model/components/instantiate';
import type { RunLayout, RunPiece } from '../../src/model/components/richText';
import type { SceneTextRun, TextNode } from '../../src/model/components/scene';
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
      if (line !== '' && node.width > 0 && widthOf(candidate) > node.width + 1e-6) {
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

/** Deslocamento vertical do texto rico na caixa do nó (`verticalAlign`). */
export function richShift(node: TextNode, contentHeight: number): number {
  if (node.height <= 0) return 0;
  const free = node.height - contentHeight;
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
  const shift = richShift(node, layout.height);
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

/** Topo do bloco de `count` linhas no nó, pelo `verticalAlign`. */
export function blockTop(node: TextNode, count: number, lineHeight: number): number {
  const total = count * lineHeight;
  const { verticalAlign } = node.style;
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
