// Sugestões no campo de texto (etapa Sugestões no campo de texto, decisão 3): funções puras,
// sem DOM, para achar a palavra sob o cursor, filtrar a lista e trocar só essa palavra.

/** Um item da lista: o texto que entra no campo e, opcional, um texto secundário (SG2). */
export interface SuggestionItem {
  readonly label: string;
  readonly detail?: string;
  /** Identifica um alvo de `linkedRef`; só os itens com `id` são devolvidos ao confirmar. */
  readonly id?: string;
}

/** Item como o formato entrega (texto simples) ou já com texto secundário. */
export type SuggestionInput = string | SuggestionItem;

/** A palavra antes do cursor: onde começa e o texto. */
export interface WordAtCursor {
  readonly start: number;
  readonly text: string;
}

// Letras (Unicode), dígitos, `_` e `.`.
const WORD_CHAR = /[\p{L}\p{N}_.]/u;

export function toItems(list: readonly SuggestionInput[]): SuggestionItem[] {
  return list.map((entry) => (typeof entry === 'string' ? { label: entry } : entry));
}

/**
 * A sequência de letras, dígitos, `_` e `.` imediatamente antes do cursor. Cursor fora do
 * texto é limitado a ele; sem palavra, devolve `{ start: cursor, text: '' }`.
 */
export function wordAtCursor(text: string, cursor: number): WordAtCursor {
  const end = Math.max(0, Math.min(cursor, text.length));
  // Percorre por pontos de código, para não partir um par substituto.
  const chars = [...text.slice(0, end)];
  let count = 0;
  for (let i = chars.length - 1; i >= 0; i--) {
    if (!WORD_CHAR.test(chars[i] ?? '')) break;
    count++;
  }
  const word = chars.slice(chars.length - count).join('');
  return { start: end - word.length, text: word };
}

/**
 * Filtra sem diferenciar maiúsculas: quem começa com a palavra vem antes de quem só a contém,
 * e a ordem original vale dentro de cada grupo. Palavra vazia devolve tudo. Sem
 * correspondência, vazio. Na abertura automática ao digitar, se a única correspondência é idêntica à palavra (mesmas
 * maiúsculas), não há o que completar e a lista fica vazia (fechada); a abertura explícita
 * (`keepExact`: ↓, Ctrl+Espaço, clique) mantém esse item.
 */
export function filterSuggestions(
  items: readonly SuggestionItem[],
  word: string,
  keepExact = false,
): SuggestionItem[] {
  if (word === '') return [...items];
  const needle = word.toLowerCase();
  const starts: SuggestionItem[] = [];
  const contains: SuggestionItem[] = [];
  for (const item of items) {
    const at = item.label.toLowerCase().indexOf(needle);
    if (at === 0) starts.push(item);
    else if (at > 0) contains.push(item);
  }
  const found = [...starts, ...contains];
  if (!keepExact && found.length === 1 && found[0]?.label === word) return [];
  return found;
}

/**
 * Troca só a palavra antes do cursor pela sugestão; o cursor fica logo depois dela. O que vem
 * depois do cursor não muda.
 */
export function replaceWord(
  text: string,
  cursor: number,
  suggestion: string,
): { readonly text: string; readonly cursor: number } {
  const end = Math.max(0, Math.min(cursor, text.length));
  const { start } = wordAtCursor(text, end);
  return {
    text: text.slice(0, start) + suggestion + text.slice(end),
    cursor: start + suggestion.length,
  };
}

/**
 * O rótulo aparece em `text` como palavra: sem caractere de palavra (letra, dígito, `_` ou `.`)
 * colado a ele, à esquerda ou à direita. Maiúsculas contam; rótulo vazio nunca aparece.
 */
export function containsWord(text: string, label: string): boolean {
  if (label === '') return false;
  let from = 0;
  for (;;) {
    const at = text.indexOf(label, from);
    if (at < 0) return false;
    const before = [...text.slice(0, at)].pop() ?? '';
    const after = [...text.slice(at + label.length)][0] ?? '';
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return true;
    from = at + 1;
  }
}

/**
 * Alvos do `linkedRef` primeiro, depois as sugestões fixas; a fixa cujo texto é igual ao de um
 * alvo é descartada (o alvo vence).
 */
export function mergeLinkedItems(
  targets: readonly SuggestionItem[],
  fixed: readonly SuggestionInput[],
): SuggestionItem[] {
  const taken = new Set(targets.map((item) => item.label));
  return [...targets, ...toItems(fixed).filter((item) => !taken.has(item.label))];
}
