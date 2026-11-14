/** Lowercase and without accents: "cafe" finds "café". */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replaceAll(/[̀-ͯ]/g, '').toLowerCase();
}

/** `true` if `text` has all the words of `query` (an empty query matches everything). */
export function matchesSearch(text: string, query: string): boolean {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeSearch(text);
  return words.every((w) => haystack.includes(w));
}
