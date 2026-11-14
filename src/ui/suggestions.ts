// Suggestions in the text field (stage Suggestions in the text field, decision 3): pure functions,
// with no DOM, to find the word under the cursor, filter the list and replace only that word.

/** A list item: the text that goes into the field and, optionally, a secondary text (SG2). */
export interface SuggestionItem {
  readonly label: string;
  readonly detail?: string;
  /** Identifies a `linkedRef` target; only items with an `id` are returned on confirm. */
  readonly id?: string;
}

/** Item as the format delivers it (plain text) or already with a secondary text. */
export type SuggestionInput = string | SuggestionItem;

/** The word before the cursor: where it starts and its text. */
export interface WordAtCursor {
  readonly start: number;
  readonly text: string;
}

// Letters (Unicode), digits, `_` and `.`.
const WORD_CHAR = /[\p{L}\p{N}_.]/u;

export function toItems(list: readonly SuggestionInput[]): SuggestionItem[] {
  return list.map((entry) => (typeof entry === 'string' ? { label: entry } : entry));
}

/**
 * The sequence of letters, digits, `_` and `.` immediately before the cursor. A cursor outside the
 * text is clamped to it; with no word, returns `{ start: cursor, text: '' }`.
 */
export function wordAtCursor(text: string, cursor: number): WordAtCursor {
  const end = Math.max(0, Math.min(cursor, text.length));
  // Walks by code points, so as not to split a surrogate pair.
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
 * Filters case-insensitively: those that start with the word come before those that only contain
 * it, and the original order holds within each group. An empty word returns everything. With no
 * match, empty. On the automatic opening while typing, if the only match is identical to the word
 * (same case), there is nothing to complete and the list is empty (closed); the explicit opening
 * (`keepExact`: ↓, Ctrl+Space, click) keeps that item.
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
 * Replaces only the word before the cursor with the suggestion; the cursor stays right after it.
 * What comes after the cursor does not change.
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
 * The label appears in `text` as a word: with no word character (letter, digit, `_` or `.`)
 * glued to it, on the left or on the right. Case counts; an empty label never appears.
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
 * `linkedRef` targets first, then the fixed suggestions; a fixed one whose text equals that of a
 * target is discarded (the target wins).
 */
export function mergeLinkedItems(
  targets: readonly SuggestionItem[],
  fixed: readonly SuggestionInput[],
): SuggestionItem[] {
  const taken = new Set(targets.map((item) => item.label));
  return [...targets, ...toItems(fixed).filter((item) => !taken.has(item.label))];
}
