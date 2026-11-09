/**
 * Minúsculas e sem acentos: o critério de busca do modelo (o mesmo de `src/utils/search.ts`, que
 * o modelo não importa). Os acentos saem pela propriedade Unicode de marca combinante.
 */
export function fold(text: string): string {
  return text.normalize('NFD').replaceAll(/\p{M}/gu, '').toLowerCase();
}
