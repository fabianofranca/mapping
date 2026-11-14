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

// Text bars of a scene on the server (the simplified drawing, without a font): one per measured line.

/** Height of the text bar relative to the line height. */
const BAR_RATIO = 0.6;

/** Breaks by words at `node.width` (the default, without `wrap`/`ellipsis`/`maxLines`). */
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
 * The `maxLines` the measurer receives: the style's and, with `ellipsis` in a box with a height, the smaller
 * of this and the lines that fit (decision 31 of #898): the cut by height counts as a `maxLines`
 * equal to them, and the last line drawn ends in `…`, as Konva does.
 */
function ellipsisMaxLines(node: TextNode): number | undefined {
  const { style } = node;
  if (!style.ellipsis || !(node.height > 0)) return style.maxLines;
  const fit = visibleLineCount(
    Number.POSITIVE_INFINITY,
    node.height,
    konvaLineHeight(lineHeightOf(style), style.fontSize),
  );
  // Meaningless line height (0): nothing fits by itself, the style's `maxLines` applies.
  if (!Number.isFinite(fit)) return style.maxLines;
  return style.maxLines === undefined ? fit : Math.min(style.maxLines, fit);
}

/**
 * With `wrap`, `ellipsis` or `maxLines`, the lines come from the measurer (which already cuts and adds the `…`);
 * `undefined` = the usual breaking.
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

/** A text bar; `color` only in rich text, where each bar has its own. */
export interface TextBar extends PixelRect {
  readonly color?: string;
}

/**
 * Vertical shift of rich text in the node's box (`verticalAlign`). In `cap-middle` the node's
 * base font `capHeight` (`metrics`) and the baselines of the first and last line apply.
 */
export function richShift(
  node: TextNode,
  layout: RunLayout,
  metrics: CapMetrics = capMetricsFallback(node.style.fontSize),
): number {
  const first0 = layout.lines[0];
  if (node.style.baselineTop !== undefined)
    return first0
      ? node.style.baselineTop - lineBaseline(first0.y, first0.height, metrics)
      : 0;
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

/** The background (if it is a chip) and the text bar of a run, with the run's top at `top`. */
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
 * Bars of rich text (`runLayout`): for each run, the chip's background (the whole box, in the
 * `background` color) and a text bar in the run's color, with the node's `verticalAlign` applied.
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

/** The node's line height: the style's or 1.2 times the body. */
export const lineHeightOf = (style: LineStyle): number =>
  style.lineHeight ?? style.fontSize * 1.2;

/**
 * Top of the block of `count` lines in the node, by `verticalAlign`. In `cap-middle`, `metrics` are those of the
 * node's font (without them, the bars' fallback proportions).
 */
export function blockTop(
  node: TextNode,
  count: number,
  lineHeight: number,
  metrics: CapMetrics = capMetricsFallback(node.style.fontSize),
): number {
  const total = count * lineHeight;
  const { verticalAlign, baselineTop } = node.style;
  if (baselineTop !== undefined)
    return baselineTop - lineBaseline(0, lineHeight, metrics);
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
 * Paragraphs of the measurer's lines (`wrap: none`, `…`, `maxLines`): a line closes the paragraph
 * when its words complete those of the current `\\n`; the last line always closes.
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
 * For each line, whether it closes a paragraph (the last line of each `\n`, which `justify` leaves at the
 * left, like Konva). The measurer's lines (`wrap: none`, `…`, `maxLines`) close the whole
 * text: with `wrap: none` each line is a paragraph; in the other cases only the last one closes.
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

/** The node's font for the measurer (the same for the breaking and for each line's width). */
export function measureFontOf(style: TextNode['style']): Parameters<TextMeasurer>[1] {
  return {
    family: style.fontFamily,
    size: style.fontSize,
    weight: style.fontWeight,
    italic: style.italic,
    lineHeight: lineHeightOf(style),
    letterSpacing: style.letterSpacing ?? 0,
  };
}

/**
 * The lines that plain text draws, already cut by the box's height (decision 31 of #898: only those
 * Konva keeps), and which of them close a paragraph (only with `justify`).
 */
export function plainLines(
  node: TextNode,
  measure: TextMeasurer,
  widthOf: (text: string) => number,
): { lines: string[]; ends: boolean[] } {
  const { style } = node;
  const lineHeight = lineHeightOf(style);
  const custom = customLines(node, measure, measureFontOf(style));
  const all = custom ?? breakLines(node, widthOf);
  const count = visibleLineCount(
    all.length,
    node.height,
    konvaLineHeight(lineHeight, style.fontSize),
  );
  const lines = all.slice(0, count);
  if (style.align !== 'justify') return { lines, ends: [] };
  const ends = paragraphEnds(node, all, custom, widthOf).slice(0, count);
  // Like Konva: the last kept line closes the paragraph, even if cut in the middle of it.
  if (count < all.length && count > 0) ends[count - 1] = true;
  return { lines, ends };
}

/**
 * Horizontal position of a line of width `width` in the node, by `align`. In cut text
 * (`cutsText`), `width` is that of the whole line and `blockWidth` that of the widest: the lines align
 * by the block (`cutLineLeft`, decision 30).
 *
 * `align` is already physical (the engine resolved `start`/`end` by direction), so `rtl` text lands on the
 * right side without reading `style.direction`. Known limit: the glyphs come out in the text's order, without
 * bidi (neither reordering nor contextual Arabic shaping); only Konva (the browser) does the bidi.
 */
export function lineLeft(node: TextNode, width: number, blockWidth = width): number {
  const { align } = node.style;
  if (cutsText(node)) return cutLineLeft(align, node.width, blockWidth, width);
  const clamped = Math.min(width, node.width || Infinity);
  if (align === 'center') return (node.width - clamped) / 2;
  return align === 'right' ? node.width - clamped : 0;
}

/** Text bars in the node's local space: one per measured line (one per run, in rich text). */
export function textBars(node: TextNode, measure: TextMeasurer): TextBar[] {
  if (node.runLayout && node.runs) return richBars(node, node.runLayout, node.runs);
  const { style } = node;
  const lineHeight = lineHeightOf(style);
  const font = measureFontOf(style);
  const widthOf = (text: string) => measure(text, font).width;
  const { lines, ends } = plainLines(node, measure, widthOf);
  const top = blockTop(node, lines.length, lineHeight);
  const barHeight = lineHeight * BAR_RATIO;
  const widths = lines.map(widthOf);
  const block = widths.reduce((max, w) => Math.max(max, w), 0);
  const bars: TextBar[] = [];
  lines.forEach((line, i) => {
    if (line === '') return;
    // Like Konva: only a line that has a space is stretched (a lone word keeps its size).
    const justified =
      style.align === 'justify' &&
      ends[i] === false &&
      node.width > 0 &&
      line.includes(' ');
    const lineWidth = widths[i] ?? 0;
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
