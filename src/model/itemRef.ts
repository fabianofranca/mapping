import { fail } from './errors';
import type { Project } from './types';

// Referência copiável de um item do projeto (etapa 3a): `mapping://<projeto>/<m|i|a>/<código>`,
// só a URL (projeto codificado). A app copia, o agente (MCP) cola. Funções puras, sem DOM nem Node.
// Não confundir com `refs.ts`, que trata das referências fortes entre anotações.

/**
 * `m` = marcação (e seta: os ids das setas e os das marcações dividem o espaço, ME4), `i` =
 * container, `a` = anotação.
 */
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
  if (kind === 'm') return [...p.markings, ...p.arrows].map((item) => item.id);
  const items = kind === 'i' ? p.containers : p.annotations;
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
 * Código curto de cada id de uma lista, numa passada (O(n log n)): os 8 primeiros
 * caracteres do id normalizado; se outro id da lista começar igual, 12, depois 16 e assim
 * por diante, até ficar único. Serve a qualquer conjunto de ids (itens do projeto, propostas).
 */
export function shortCodesFor(ids: readonly string[]): ReadonlyMap<string, string> {
  const entries = ids
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
  return codes;
}

/**
 * Código curto de todos os itens de um tipo (`shortCodesFor` sobre os ids do tipo).
 * Memoizado por projeto.
 */
export function shortCodes(p: Project, kind: ItemKind): ReadonlyMap<string, string> {
  const slot = cache.get(p) ?? {};
  cache.set(p, slot);
  const cached = slot[kind];
  if (cached) return cached;
  const codes = shortCodesFor(idsOf(p, kind));
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

/**
 * Nome da imagem que o MCP usa nos rótulos legíveis (`imageLabel`, `resolve`): o nome dado
 * ou, sem nome, o nome do arquivo sem a pasta (`images/cadastro.webp` → `cadastro.webp`). Container sem arquivo sem nome: `null` (quem chama
 * decide o texto, a app pela tradução e o MCP em português).
 */
export function refImageLabel(image: {
  readonly name: string | null;
  readonly file: string | null;
}): string | null {
  if (image.name !== null) return image.name;
  return image.file === null ? null : image.file.slice(image.file.lastIndexOf('/') + 1);
}

export interface FormatRefArgs {
  /** Nome da pasta do projeto. */
  readonly project: string;
  readonly kind: ItemKind;
  /** Resultado de `shortCode`. */
  readonly code: string;
}

/**
 * Segmento de URL só com o conjunto *unreserved* da RFC 3986 (`A-Z a-z 0-9 - . _ ~`): todo o
 * resto vira `%XX` maiúsculo (UTF-8). É o `encodeURIComponent` com `! ' ( ) *` também
 * codificados (`(` e `)` quebram link markdown).
 */
export function encodeRefSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** `mapping://<projeto>/<m|i|a>/<código>`: só a URL, com o projeto codificado. */
export function formatRef({ project, kind, code }: FormatRefArgs): string {
  return `${REF_SCHEME}${encodeRefSegment(project)}/${kind}/${code}`;
}

export interface ParsedRef {
  /** Nome da pasta do projeto; `null` quando a referência não o traz. */
  readonly project: string | null;
  /** `null` quando só veio um código ou id: vale para qualquer tipo. */
  readonly kind: ItemKind | null;
  /** Código curto ou id completo, normalizado (sem hífens, minúsculo). */
  readonly code: string;
}

/** Decodifica o segmento; `null` se o `%` for inválido ou não der UTF-8. */
function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

const CODE = /^[0-9a-zA-Z_-]+$/;
const FULL_REF =
  /^mapping:\/\/((?:[A-Za-z0-9\-._~]|%[0-9A-Fa-f]{2})+)\/([mia])\/([0-9a-zA-Z_-]+)$/;
const SHORT_REF = /^([mia])\/([0-9a-zA-Z_-]+)$/;

/**
 * Interpreta o que o usuário ou o agente colou. Aceita:
 * - a URL estrita `mapping://projeto/m/3f2a9c1e` (projeto codificado, nada depois do código);
 * - `m/3f2a9c1e`, com o projeto informado à parte;
 * - só o código ou o id completo (com ou sem hífens).
 * Devolve `null` se o texto não tiver nenhum desses formatos.
 */
export function parseRef(text: string): ParsedRef | null {
  const input = text.trim();
  const full = FULL_REF.exec(input);
  if (full) {
    const project = decodeSegment(full[1]!);
    if (project === null) return null;
    return { project, kind: full[2] as ItemKind, code: normalizeId(full[3]!) };
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
