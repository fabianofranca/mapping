/**
 * Lowercase and accent-free: the model's search criterion (the same as `src/utils/search.ts`, which
 * the model does not import). Accents are removed through the Unicode combining-mark property.
 */
export function fold(text: string): string {
  return text.normalize('NFD').replaceAll(/\p{M}/gu, '').toLowerCase();
}
