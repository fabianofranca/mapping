/**
 * A altura do texto com `maxLines`: as linhas além do limite são cortadas, então a altura é a
 * de `maxLines` linhas. Sem `maxLines` (ou com texto que cabe nele), a natural.
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
