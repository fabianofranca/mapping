import { fail } from './errors';
import type { Project } from './types';

// Referência copiável de um item do projeto (etapa 3a): `mapping://<projeto>/<m|i|a>/<código>
// (<caminho legível>)`. A app copia, o agente (MCP) cola. Funções puras, sem DOM nem Node.
// Não confundir com `refs.ts`, que trata das referências fortes entre anotações.

/** `m` = marcação, `i` = imagem, `a` = anotação. */
export type ItemKind = 'm' | 'i' | 'a';

export const ITEM_KINDS: readonly ItemKind[] = ['m', 'i', 'a'];

/** Esquema das referências copiáveis. */
export const REF_SCHEME = 'mapping://';

/** Tamanho inicial do código; cresce de 4 em 4 caracteres se houver colisão. */
export const SHORT_CODE_LENGTH = 8;
const SHORT_CODE_STEP = 4;

/** Id sem hífens e em minúsculas: a forma em que o código é cortado e comparado. */
export function normalizeId(id: string): string {
  return id.replaceAll('-', '').toLowerCase();
}

function idsOf(p: Project, kind: ItemKind): readonly string[] {
  const items = kind === 'm' ? p.markings : kind === 'i' ? p.images : p.annotations;
  return items.map((item) => item.id);
}

function commonPrefix(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let n = 0;
  while (n < max && a[n] === b[n]) n++;
  return n;
}

const cache = new WeakMap<
  Project,
  Partial<Record<ItemKind, ReadonlyMap<string, string>>>
>();

/**
 * Código curto de todos os itens de um tipo, numa passada (O(n log n)): os 8
 * primeiros caracteres do id normalizado; se outro item do mesmo tipo começar
 * igual, 12, depois 16 e assim por diante, até ficar único. Memoizado por projeto.
 */
export function shortCodes(p: Project, kind: ItemKind): ReadonlyMap<string, string> {
  const slot = cache.get(p) ?? {};
  cache.set(p, slot);
  const cached = slot[kind];
  if (cached) return cached;

  const entries = idsOf(p, kind)
    .map((id) => ({ id, norm: normalizeId(id) }))
    .sort((a, b) => (a.norm < b.norm ? -1 : a.norm > b.norm ? 1 : 0));
  const codes = new Map<string, string>();
  entries.forEach((entry, index) => {
    // Em ordem alfabética, o maior prefixo em comum de um item é com um vizinho.
    const shared = Math.max(
      index > 0 ? commonPrefix(entry.norm, entries[index - 1]!.norm) : 0,
      index < entries.length - 1 ? commonPrefix(entry.norm, entries[index + 1]!.norm) : 0,
    );
    let length = SHORT_CODE_LENGTH;
    while (length <= shared) length += SHORT_CODE_STEP;
    codes.set(entry.id, entry.norm.slice(0, length));
  });
  slot[kind] = codes;
  return codes;
}

/** Código curto do item `id`, único entre os itens do mesmo tipo. Falha com `not-found` se o id não existir. */
export function shortCode(p: Project, kind: ItemKind, id: string): string {
  return shortCodes(p, kind).get(id) ?? fail('not-found', id);
}

/**
 * Ids que o código designa: o id cujo normalizado é exatamente o código (vence,
 * para ids curtos que são prefixo de outros) ou, na falta dele, todos os que
 * começam com o código. `kind: null` procura nos três tipos.
 */
export function matchShortCode(
  p: Project,
  kind: ItemKind | null,
  code: string,
): readonly { readonly kind: ItemKind; readonly id: string }[] {
  const wanted = normalizeId(code);
  if (wanted === '') return [];
  const found: { kind: ItemKind; id: string }[] = [];
  for (const k of kind ? [kind] : ITEM_KINDS) {
    const ids = idsOf(p, k).filter((id) => normalizeId(id).startsWith(wanted));
    const exact = ids.filter((id) => normalizeId(id) === wanted);
    for (const id of exact.length > 0 ? exact : ids) found.push({ kind: k, id });
  }
  return found;
}

export interface FormatRefArgs {
  /** Nome da pasta do projeto. */
  readonly project: string;
  readonly kind: ItemKind;
  /** Resultado de `shortCode`. */
  readonly code: string;
  /** Caminho legível (ex: `Lateral › Porta dianteira`), só para quem lê; o MCP o ignora. */
  readonly label?: string;
}

/** `mapping://<projeto>/<m|i|a>/<código>` e, com `label`, ` (<caminho legível>)`. */
export function formatRef({ project, kind, code, label }: FormatRefArgs): string {
  const ref = `${REF_SCHEME}${encodeURIComponent(project)}/${kind}/${code}`;
  const readable = label?.replace(/\s+/g, ' ').trim();
  return readable ? `${ref} (${readable})` : ref;
}

export interface ParsedRef {
  /** Nome da pasta do projeto; `null` quando a referência não o traz. */
  readonly project: string | null;
  /** `null` quando só veio um código ou id: vale para qualquer tipo. */
  readonly kind: ItemKind | null;
  /** Código curto ou id completo, normalizado (sem hífens, minúsculo). */
  readonly code: string;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

const CODE = /^[0-9a-zA-Z-]+$/;
const FULL_REF = /^mapping:\/\/([^/\s]+)\/([mia])\/([0-9a-zA-Z-]+)(?:\s+\([\s\S]*\))?$/;
const SHORT_REF = /^([mia])\/([0-9a-zA-Z-]+)$/;

/**
 * Interpreta o que o usuário ou o agente colou. Aceita:
 * - a referência completa `mapping://projeto/m/3f2a9c1e (caminho)`;
 * - `m/3f2a9c1e`, com o projeto informado à parte;
 * - só o código ou o id completo (com ou sem hífens).
 * Devolve `null` se o texto não tiver nenhum desses formatos.
 */
export function parseRef(text: string): ParsedRef | null {
  const input = text.trim();
  const full = FULL_REF.exec(input);
  if (full) {
    return {
      project: decodeSegment(full[1]!),
      kind: full[2] as ItemKind,
      code: normalizeId(full[3]!),
    };
  }
  const short = SHORT_REF.exec(input);
  if (short) {
    return { project: null, kind: short[1] as ItemKind, code: normalizeId(short[2]!) };
  }
  if (CODE.test(input) && normalizeId(input) !== '') {
    return { project: null, kind: null, code: normalizeId(input) };
  }
  return null;
}
