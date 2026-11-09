import { formatCitation } from './citations';
import { parseAnyRef, type ParsedAnyRef } from './refGrammar';

// Documento do compositor de conversas (etapa Comentários, decisão 30): texto e chips. O chip é
// a citação `[rótulo](mapping://…)` desenhada como pílula; o texto gravado é o markdown comum.
// Aqui, as conversões puras entre o documento e o markdown, e a colagem. Tudo sem DOM.

export type ComposerPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'chip'; readonly label: string; readonly url: string };

export type ComposerDoc = readonly ComposerPart[];

/** Rótulo gravado para um chip sem nome (`[](url)` não é link em markdown). */
const DEFAULT_EMPTY_LABEL = '·';

/** Junta textos vizinhos e descarta os textos vazios; os chips ficam como estão. */
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
 * O markdown do documento: o texto cru e, para cada chip, `formatCitation(rótulo, url)`, sem
 * espaço extra. Chip de rótulo vazio grava `emptyLabel`.
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

// ------------------------------------------------------------------ leitura do link

/**
 * `[rótulo](mapping://…)` na posição exata (regex pegajosa). O rótulo só tem `\[`, `\]` e `\\`
 * como escapes (o que `escapeCitationLabel` grava), nenhum colchete solto e nenhuma quebra de
 * linha; o destino não tem espaço nem parênteses. Tudo o mais não casa e fica texto.
 */
const LINK_SOURCE = String.raw`\[((?:[^\[\]\\\n]|\\[\[\]\\*_\`])+)\]\((mapping:\/\/[^\s()]*)\)`;
const LINK_AT = new RegExp(LINK_SOURCE, 'y');

/** URL `mapping://` crua: vai até espaço, parêntese, colchete, aspas ou sinal de maior/menor. */
const RAW_SOURCE = String.raw`mapping:\/\/[^\s()<>\[\]"]+`;
const PASTE_SCAN = new RegExp(`${LINK_SOURCE}|${RAW_SOURCE}`, 'g');

/** Pontuação da frase e marcadores de ênfase/código que a colagem pode ter deixado colados no fim. */
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

/** Fim do trecho literal que começa em `index` (escape de uma barra ou código), ou `index`. */
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
 * O caminho inverso, para reabrir um rascunho com chips: cada `[rótulo](mapping://…)` cuja URL
 * fecha a gramática estrita vira chip; o resto fica texto, como estava (markdown comum, links
 * externos e de biblioteca, link quebrado, código em linha e em bloco). Vale
 * `composerToMarkdown(markdownToComposer(s)) === s` para qualquer `s`.
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

// ------------------------------------------------------------------ colar

/** O que a colagem sabe de um alvo: o rótulo vivo e a URL a gravar (do projeto de agora). */
export interface PastedChip {
  readonly label: string;
  readonly url: string;
}

export type PasteResolver = (ref: ParsedAnyRef) => PastedChip | null;

function resolveUrl(url: string, resolves: PasteResolver): PastedChip | null {
  const parsed = parseAnyRef(url);
  return parsed && resolves(parsed);
}

/** A URL crua, com uma segunda tentativa sem a pontuação final da frase. */
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
 * Colar entra como texto puro (decisão 30). Cada URL `mapping://…` crua, ou link markdown
 * `[x](mapping://…)` colado inteiro, que a gramática lê E que `resolves` reconhece vira chip com
 * o rótulo vivo de `resolves`; a que não resolve fica texto, como veio.
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
