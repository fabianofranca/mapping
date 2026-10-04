/** Minúsculas e sem acentos: "acao" encontra "ação". */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replaceAll(/[̀-ͯ]/g, '').toLowerCase();
}

/** `true` se `text` tem todas as palavras de `query` (consulta vazia casa com tudo). */
export function matchesSearch(text: string, query: string): boolean {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeSearch(text);
  return words.every((w) => haystack.includes(w));
}
