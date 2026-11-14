/**
 * Single computation of the baseline and of `cap-middle` (decision 28 of #898). The app (Konva)
 * and the MCP PNG (glyphs and bars) read these functions; each brings only the measures of the
 * font it draws. Pure, no browser: the model knows no font, whoever measures passes it in.
 */

/** Vertical measures of the node's font, in px at the node's size. */
export interface CapMetrics {
  readonly ascent: number;
  readonly descent: number;
  /** Height of the capital letter. */
  readonly capHeight: number;
}

/** Without a font measure, the ascent is this fraction of the body size. */
export const ASCENT_RATIO = 0.8;
/** Without a font measure, the descent is this fraction of the body size. */
export const DESCENT_RATIO = 0.2;
/** Without the measure of the `H`, the capital height is this fraction of the body size. */
export const CAP_HEIGHT_RATIO = 0.7;

/**
 * The approximate measurer (Node and drawing proof) has no font: the ascent is this fraction of
 * the body size (gives 15 at the Roboto 14/20 baseline, like Compose).
 */
export const APPROX_ASCENT_RATIO = 0.93;
/** The descent of the approximate measurer, as a fraction of the body size. */
export const APPROX_DESCENT_RATIO = 0.24;

/** Ascent and descent of the approximate measurer for the body size `size`. */
export const approximateExtents = (
  size: number,
): Pick<CapMetrics, 'ascent' | 'descent'> => ({
  ascent: APPROX_ASCENT_RATIO * size,
  descent: APPROX_DESCENT_RATIO * size,
});

/** The fallback for when there is no font measure: the usual proportions of the body size `size`. */
export const capMetricsFallback = (size: number): CapMetrics => ({
  ascent: ASCENT_RATIO * size,
  descent: DESCENT_RATIO * size,
  capHeight: CAP_HEIGHT_RATIO * size,
});

/**
 * The baseline of a line of height `lineHeight` starting at `top`: the center of the line
 * plus half the difference between ascent and descent (the same as Konva's and the glyph
 * drawing's).
 */
export function lineBaseline(
  top: number,
  lineHeight: number,
  metrics: Pick<CapMetrics, 'ascent' | 'descent'>,
): number {
  return top + lineHeight / 2 + (metrics.ascent - metrics.descent) / 2;
}

/**
 * `cap-middle`: how far to shift the text, placed at the top, so that the block from the top of
 * the first line's capital to the last line's baseline ends up at the center of the box. 0 with
 * `boxHeight ≤ 0`.
 */
export function capMiddleShift(input: {
  readonly boxHeight: number;
  readonly capHeight: number;
  readonly firstBaseline: number;
  readonly lastBaseline: number;
}): number {
  const { boxHeight, capHeight, firstBaseline, lastBaseline } = input;
  if (boxHeight <= 0) return 0;
  const block = lastBaseline - firstBaseline + capHeight;
  return (boxHeight - block) / 2 + capHeight - firstBaseline;
}
