import { formatCitation } from './citations';
import { parseAnyRef, type ParsedAnyRef } from './refGrammar';

// Conversation composer document (Comments stage, decision 30): text and chips. A chip is
// the citation `[label](mapping://…)` drawn as a pill; the saved text is plain markdown.
// Here, the pure conversions between the document and the markdown, and pasting. All without DOM.

export type ComposerPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'chip'; readonly label: string; readonly url: string };

export type ComposerDoc = readonly ComposerPart[];

/** Label saved for a chip without a name (`[](url)` is not a link in markdown). */
const DEFAULT_EMPTY_LABEL = '·';

/** Joins neighboring texts and discards empty texts; chips stay as they are. */
export function normalizeDoc(doc: ComposerDoc): ComposerPart[] {
  const out: ComposerPart[] = [];
  for (const part of doc) {
    if (part.type === 'chip') {
      out.push(part);
      continue;
    }
    if (part.text === '') continue;
    const last = out[out.length - 1];
    if (last?.type === 'text')
      out[out.length - 1] = { type: 'text', text: last.text + part.text };
    else out.push(part);
  }
  return out;
}

/**
 * The document's markdown: the raw text and, for each chip, `formatCitation(label, url)`, with no
 * extra space. A chip with an empty label saves `emptyLabel`.
 */
export function composerToMarkdown(
  doc: ComposerDoc,
  emptyLabel: string = DEFAULT_EMPTY_LABEL,
): string {
  return doc
    .map((part) =>
      part.type === 'text'
        ? part.text
        : formatCitation(part.label === '' ? emptyLabel : part.label, part.url),
    )
    .join('');
}

// ------------------------------------------------------------------ reading the link

/**
 * `[label](mapping://…)` at the exact position (sticky regex). The label only has `\[`, `\]` and `\\`
 * as escapes (what `escapeCitationLabel` saves), no loose bracket and no line break; the
 * destination has no spaces or parentheses. Everything else does not match and stays text.
 */
const LINK_SOURCE = String.raw`\[((?:[^\[\]\\\n]|\\[\[\]\\*_\`])+)\]\((mapping:\/\/[^\s()]*)\)`;
const LINK_AT = new RegExp(LINK_SOURCE, 'y');

/** Raw `mapping://` URL: runs up to a space, parenthesis, bracket, quote or greater/less-than sign. */
const RAW_SOURCE = String.raw`mapping:\/\/[^\s()<>\[\]"]+`;
const PASTE_SCAN = new RegExp(`${LINK_SOURCE}|${RAW_SOURCE}`, 'g');

/** Sentence punctuation and emphasis/code markers that pasting may have left stuck at the end. */
const TRAILING_PUNCTUATION = /[.,;:!?*_`~]+$/;

function unescapeLabel(raw: string): string {
  return raw.replace(/\\([[\]\\*_`])/g, '$1');
}

interface LinkMatch {
  readonly end: number;
  readonly label: string;
  readonly url: string;
}

function linkAt(text: string, index: number): LinkMatch | null {
  LINK_AT.lastIndex = index;
  const m = LINK_AT.exec(text);
  if (!m) return null;
  return { end: index + m[0].length, label: unescapeLabel(m[1]!), url: m[2]! };
}

/** End of the literal span that starts at `index` (a backslash escape or code), or `index`. */
function literalEnd(text: string, index: number): number {
  const char = text[index];
  if (char === '\\') return Math.min(index + 2, text.length);
  if (char !== '`') return index;
  let run = index;
  while (text[run] === '`') run++;
  const size = run - index;
  const closing = new RegExp(`(?<!\`)\`{${size}}(?!\`)`, 'g');
  closing.lastIndex = run;
  const found = closing.exec(text);
  return found ? found.index + size : run;
}

/**
 * The reverse path, to reopen a draft with chips: each `[label](mapping://…)` whose URL
 * satisfies the strict grammar becomes a chip; the rest stays text, as it was (plain markdown,
 * external and library links, broken link, inline and block code). It holds
 * `composerToMarkdown(markdownToComposer(s)) === s` for any `s`.
 */
export function markdownToComposer(text: string): ComposerPart[] {
  const parts: ComposerPart[] = [];
  let plain = '';
  let index = 0;
  while (index < text.length) {
    const literal = literalEnd(text, index);
    const link = literal === index && text[index] === '[' ? linkAt(text, index) : null;
    if (link && parseAnyRef(link.url)) {
      parts.push(
        { type: 'text', text: plain },
        { type: 'chip', label: link.label, url: link.url },
      );
      plain = '';
      index = link.end;
      continue;
    }
    const next = literal > index ? literal : index + 1;
    plain += text.slice(index, next);
    index = next;
  }
  parts.push({ type: 'text', text: plain });
  return normalizeDoc(parts);
}

// ------------------------------------------------------------------ pasting

/** What pasting knows about a target: the live label and the URL to save (of the current project). */
export interface PastedChip {
  readonly label: string;
  readonly url: string;
}

export type PasteResolver = (ref: ParsedAnyRef) => PastedChip | null;

function resolveUrl(url: string, resolves: PasteResolver): PastedChip | null {
  const parsed = parseAnyRef(url);
  return parsed && resolves(parsed);
}

/** The raw URL, with a second attempt without the sentence's final punctuation. */
function resolveRaw(
  raw: string,
  resolves: PasteResolver,
): { chip: PastedChip; rest: string } | null {
  const direct = resolveUrl(raw, resolves);
  if (direct) return { chip: direct, rest: '' };
  const trimmed = raw.replace(TRAILING_PUNCTUATION, '');
  if (trimmed === raw) return null;
  const chip = resolveUrl(trimmed, resolves);
  return chip && { chip, rest: raw.slice(trimmed.length) };
}

function chipPart(chip: PastedChip): ComposerPart {
  return { type: 'chip', label: chip.label, url: chip.url };
}

/**
 * Pasting enters as plain text (decision 30). Each raw `mapping://…` URL, or markdown link
 * `[x](mapping://…)` pasted whole, that the grammar reads AND that `resolves` recognizes becomes a
 * chip with the live label from `resolves`; one that does not resolve stays text, as it came.
 */
export function pasteToParts(pasted: string, resolves: PasteResolver): ComposerPart[] {
  const parts: ComposerPart[] = [];
  let cursor = 0;
  for (const match of pasted.matchAll(PASTE_SCAN)) {
    const start = match.index;
    const url = match[2] ?? match[0];
    const resolved = match[2] === undefined ? resolveRaw(url, resolves) : null;
    const chip = match[2] === undefined ? resolved?.chip : resolveUrl(url, resolves);
    if (!chip) continue;
    parts.push({ type: 'text', text: pasted.slice(cursor, start) }, chipPart(chip));
    cursor = start + match[0].length - (resolved?.rest.length ?? 0);
  }
  parts.push({ type: 'text', text: pasted.slice(cursor) });
  return normalizeDoc(parts);
}
