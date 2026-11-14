/**
 * The text height with `maxLines`: the lines beyond the limit are cut, so the height is that
 * of `maxLines` lines. Without `maxLines` (or with text that fits in it), the natural one.
 */
export function textBoxLimits(
  naturalHeight: number,
  maxLines: number | undefined,
  lineHeight: number,
): { height: number; cut: boolean } {
  if (maxLines === undefined) return { height: naturalHeight, cut: false };
  const limit = maxLines * lineHeight;
  return naturalHeight > limit + 1e-6
    ? { height: limit, cut: true }
    : { height: naturalHeight, cut: false };
}
