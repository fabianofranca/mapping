import { REF_SCHEME, encodeRefSegment, normalizeId, shortCodesFor } from './itemRef';
import type { ItemKind } from './itemRef';
import { fail } from './errors';
import type { Project } from './types';

// Gramática completa da referência `mapping://` (etapa dos comentários, decisão 27):
//
//   mapping://<projeto>/<m|i|a|p|l|c>/<código>             item, proposta, camada, conversa
//   mapping://<projeto>/a/<código>/f/<campo>               campo tipado (a key, codificada)
//   mapping://<projeto>/a/<código>/e/<código>              par da anotação livre
//   mapping://<projeto>/a/<código>/f/<campo>/r/<código>    linha de table
//
// As letras e os segmentos vêm depois do código, nunca como sufixo. A leitura é estrita:
// qualquer sufixo extra, `?`, `#`, espaço no meio, segmento vazio ou letra desconhecida dá
// `null`. `parseRef`/`ParsedRef` (m|i|a) em `itemRef.ts` seguem como estavam; esta é a API
// adicional. Os links dos documentos da biblioteca (`mapping://<typeId>` e
// `mapping://<specId>/<typeId>`) têm no máximo dois segmentos e a nova gramática exige o
// segundo ser uma letra e ter um código depois: nunca se confundem.

/** Letras de referência: as de `ItemKind` mais proposta (`p`), camada (`l`) e conversa (`c`). */
export type AnyRefKind = ItemKind | 'p' | 'l' | 'c';

export const ANY_REF_KINDS: readonly AnyRefKind[] = ['m', 'i', 'a', 'p', 'l', 'c'];

export interface ItemAnyRef {
  readonly type: 'item';
  readonly kind: AnyRefKind;
  /**
   * `m`, `i`, `a`: normalizado (sem hífens, minúsculo), como em `parseRef`. `p`, `l`, `c`:
   * como veio (ids de proposta têm ponto e sublinhado); quem compara usa `normalizeId`.
   */
  readonly code: string;
}

export interface FieldAnyRef {
  readonly type: 'field';
  /** Código da anotação (normalizado). */
  readonly annotation: string;
  /** A key do campo, já decodificada. */
  readonly key: string;
}

export interface EntryAnyRef {
  readonly type: 'entry';
  readonly annotation: string;
  /** Código do par entre os pares da anotação (como veio). */
  readonly entry: string;
}

export interface RowAnyRef {
  readonly type: 'row';
  readonly annotation: string;
  readonly key: string;
  /** Código da linha entre as linhas da table (como veio). */
  readonly row: string;
}

/** Sub-referência: uma parte de uma anotação. */
export type SubRef = FieldAnyRef | EntryAnyRef | RowAnyRef;

export type AnyRef = ItemAnyRef | SubRef;

export interface ParsedAnyRef {
  /** Nome da pasta do projeto, decodificado; `null` nas formas curtas. */
  readonly project: string | null;
  readonly ref: AnyRef;
}

/** `mapping://<projeto>/…` a partir de uma referência de qualquer forma. */
export function formatAnyRef(project: string, ref: AnyRef): string {
  const base = `${REF_SCHEME}${encodeRefSegment(project)}`;
  if (ref.type === 'item') return `${base}/${ref.kind}/${ref.code}`;
  return `${base}/${subPath(ref)}`;
}

/** `mapping://<projeto>/a/<código>/f/<campo>[/r/<código>]` ou `…/e/<código>`. */
export function formatSubRef(project: string, ref: SubRef): string {
  return formatAnyRef(project, ref);
}

function subPath(ref: SubRef): string {
  if (ref.type === 'entry') return `a/${ref.annotation}/e/${ref.entry}`;
  const field = `a/${ref.annotation}/f/${encodeRefSegment(ref.key)}`;
  return ref.type === 'field' ? field : `${field}/r/${ref.row}`;
}

const SEGMENT = /^(?:[A-Za-z0-9\-._~]|%[0-9A-Fa-f]{2})+$/;
/** Código de m, i e a (e o da anotação nas sub-referências): como em `parseRef`. */
const CODE_ITEM = /^[0-9a-zA-Z-]+$/;
/** Código de p, l, c, e, r: aceita ponto e sublinhado. */
const CODE_WIDE = /^[0-9a-zA-Z._-]+$/;

function decodeSegment(segment: string): string | null {
  if (!SEGMENT.test(segment)) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function itemRef(letter: string, code: string): ItemAnyRef | null {
  if (letter === 'm' || letter === 'i' || letter === 'a') {
    if (!CODE_ITEM.test(code)) return null;
    const norm = normalizeId(code);
    return norm === '' ? null : { type: 'item', kind: letter, code: norm };
  }
  if (letter === 'p' || letter === 'l' || letter === 'c') {
    return CODE_WIDE.test(code) ? { type: 'item', kind: letter, code } : null;
  }
  return null;
}

function annotationCode(code: string): string | null {
  if (!CODE_ITEM.test(code)) return null;
  const norm = normalizeId(code);
  return norm === '' ? null : norm;
}

function entryRef(annotation: string, segs: readonly string[]): SubRef | null {
  const entry = segs[3]!;
  return segs.length === 4 && CODE_WIDE.test(entry)
    ? { type: 'entry', annotation, entry }
    : null;
}

function fieldRef(annotation: string, segs: readonly string[]): SubRef | null {
  const key = decodeSegment(segs[3]!);
  if (key === null) return null;
  if (segs.length === 4) return { type: 'field', annotation, key };
  const row = segs[5]!;
  return segs[4] === 'r' && CODE_WIDE.test(row)
    ? { type: 'row', annotation, key, row }
    : null;
}

function subRef(segs: readonly string[]): SubRef | null {
  const annotation = annotationCode(segs[1]!);
  if (segs[0] !== 'a' || annotation === null) return null;
  if (segs[2] === 'e') return entryRef(annotation, segs);
  return segs[2] === 'f' ? fieldRef(annotation, segs) : null;
}

function parseTail(segs: readonly string[]): AnyRef | null {
  if (segs.length === 2) return itemRef(segs[0]!, segs[1]!);
  if (segs.length === 4 || segs.length === 6) return subRef(segs);
  return null;
}

/**
 * Interpreta a referência em qualquer forma: a URL completa (`mapping://projeto/…`) ou a
 * curta (`a/<código>/f/<campo>`, `c/<código>`…), esta com `project: null`. O `<campo>` é
 * decodificado (`%` inválido dá `null`). Não aceita código solto (isso é do `parseRef`).
 */
export function parseAnyRef(text: string): ParsedAnyRef | null {
  const input = text.trim();
  if (input.startsWith(REF_SCHEME)) {
    const segs = input.slice(REF_SCHEME.length).split('/');
    const project = decodeSegment(segs[0]!);
    if (project === null) return null;
    const ref = parseTail(segs.slice(1));
    return ref && { project, ref };
  }
  const ref = parseTail(input.split('/'));
  return ref && { project: null, ref };
}

// ------------------------------------------------------------ camada e conversa

const layerCache = new WeakMap<Project, ReadonlyMap<string, string>>();

/** Código curto de cada camada do projeto, único entre elas (memoizado por projeto). */
export function layerShortCodes(p: Project): ReadonlyMap<string, string> {
  const cached = layerCache.get(p);
  if (cached) return cached;
  const codes = shortCodesFor(p.layers.map((layer) => layer.id));
  layerCache.set(p, codes);
  return codes;
}

/** Código curto da camada `id`. Falha com `not-found` se ela não existir. */
export function layerShortCode(p: Project, id: string): string {
  return layerShortCodes(p).get(id) ?? fail('not-found', id);
}

/**
 * Ids de camada que o código designa: o id cujo normalizado é exatamente o código (vence)
 * ou, na falta dele, todos os que começam com o código.
 */
export function matchLayerCode(p: Project, code: string): readonly string[] {
  const wanted = normalizeId(code);
  if (wanted === '') return [];
  const ids = p.layers
    .map((l) => l.id)
    .filter((id) => normalizeId(id).startsWith(wanted));
  const exact = ids.filter((id) => normalizeId(id) === wanted);
  return exact.length > 0 ? exact : ids;
}

/** Código curto de cada conversa, único entre as do projeto (abertas e resolvidas). */
export function threadShortCodes(ids: readonly string[]): ReadonlyMap<string, string> {
  return shortCodesFor(ids);
}
