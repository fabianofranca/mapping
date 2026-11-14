/**
 * Line-wrap slack (FX4, decision 20 of #896): a line only wraps when it exceeds the box width
 * by more than 0.5 px. The sum of the word widths and the width measured from the DOM differ
 * at the floating-point tip; without the slack the last word fell to the next line by a
 * fraction of a pixel. It is the only constant: the model (`measureLines`), the measurer and the
 * Konva drawing (app) and the MCP server drawing all read this one.
 */
export const WRAP_SLACK = 0.5;

/** Vertical reach (px) of the horizontal clip of a cut text: well beyond any text. */
export const CUT_REACH = 10000;

/**
 * `wrap: none` without `ellipsis` in a fixed-width box (FX4, decision 19): the line is clipped by
 * pixel at the text box (a letter that overflows is cut in half). The app and the MCP PNG read this.
 */
export function cutsText(node: {
  readonly width: number;
  readonly style: { readonly wrap?: string; readonly ellipsis?: boolean };
}): boolean {
  return node.style.wrap === 'none' && node.style.ellipsis !== true && node.width > 0;
}

/**
 * Where the line of width `lineWidth` of the cut text starts (`cutsText`, decision 30 of #898):
 * the lines align with each other by the widest one (the block, of width `blockWidth`) and the
 * block aligns in the box of width `boxWidth` by `align`; a block wider than the box starts at
 * the left edge. `justify` counts as `left`. It is what Konva's `Text` does without `width`; the
 * app and the MCP PNG read this.
 */
export function cutLineLeft(
  align: 'left' | 'center' | 'right' | 'justify',
  boxWidth: number,
  blockWidth: number,
  lineWidth: number,
): number {
  const blockLeft =
    blockWidth >= boxWidth
      ? 0
      : align === 'center'
        ? (boxWidth - blockWidth) / 2
        : align === 'right'
          ? boxWidth - blockWidth
          : 0;
  const inBlock =
    align === 'center'
      ? (blockWidth - lineWidth) / 2
      : align === 'right'
        ? blockWidth - lineWidth
        : 0;
  return blockLeft + inBlock;
}

/** The line height as Konva computes it: `lineHeight / fontSize × fontSize` (the same arithmetic). */
export const konvaLineHeight = (lineHeight: number, fontSize: number): number =>
  (lineHeight / fontSize) * fontSize;

/**
 * How many of the `total` lines fit in a box of height `boxHeight` (decision 31 of #898): the
 * loop of Konva 10.7.1's `_setTextData`. The first line always stays, and each following one
 * while `(k + 1) × lineHeight ≤ boxHeight`, adding `lineHeight` line by line. Without a height
 * (`boxHeight ≤ 0`), all of them. With infinite `total`, returns how many lines fit. Pass the
 * `lineHeight` through `konvaLineHeight` to match Konva.
 */
export function visibleLineCount(
  total: number,
  boxHeight: number,
  lineHeight: number,
): number {
  if (!(boxHeight > 0) || !(lineHeight > 0)) return total;
  let used = 0;
  let count = 0;
  while (count < total) {
    count += 1;
    used += lineHeight;
    if (used + lineHeight > boxHeight) break;
  }
  return count;
}
