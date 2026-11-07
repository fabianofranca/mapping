/**
 * Tokens de design do componente (formato 4, etapa "componentes fiéis", CF5): `{ "$token": "<nome>" }`
 * lê um valor nomeado da especialização (`tokens` da `formatVersion` 15), por modo (`light`/`dark`…).
 * Funções puras, sem DOM: o modo e a fonte do hospedeiro chegam de fora, já resolvidos em texto.
 *
 * `resolveTokens` monta a tabela plana (nome → valor) de um modo; `applyTokens` troca cada
 * `{ "$token": … }` do componente pelo valor, antes de o motor começar, e por isso o token vale em
 * qualquer lugar onde a expressão vale (inclusive como resultado de `$switch` e `$if`).
 */
import type { ComponentFile } from './componentFormat';

/** Valor de um token: cor ou família (texto) ou número. */
export type TokenValue = string | number;

/** `tokens` da especialização (o espelho do zod de `spec.ts`). */
export interface SpecTokens {
  readonly modes: readonly string[];
  /** Valor simples (vale em todos os modos) ou um valor por modo. */
  readonly values: Readonly<
    Record<string, TokenValue | Readonly<Record<string, TokenValue>>>
  >;
}

/** Os tokens de um modo: nome → valor. */
export type ResolvedTokens = Readonly<Record<string, TokenValue>>;

/** As fontes do hospedeiro (a pilha `--font-sans`/`--font-mono` do tema, ou o que a página tiver). */
export interface HostFonts {
  readonly sans?: string;
  readonly mono?: string;
}

/** Tipo de valor que a posição do `$token` espera (e que o valor do token tem). */
export type TokenKind = 'color' | 'number' | 'family';

export const FONT_SANS_TOKEN = 'font-sans';
export const FONT_MONO_TOKEN = 'font-mono';
/** Nomes embutidos: existem em toda biblioteca, com o valor do hospedeiro. */
export const BUILTIN_TOKENS: readonly string[] = [FONT_SANS_TOKEN, FONT_MONO_TOKEN];
/** Padrão do nome de um token. */
export const TOKEN_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Família quando o hospedeiro não informa nenhuma. */
const DEFAULT_SANS = 'sans-serif';
const DEFAULT_MONO = 'monospace';

const COLOR_VALUE = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\(.*\)|none|transparent)$/i;

/** O tipo de um valor de token: número, cor (`#…`, `rgb()`, `hsl()`, `none`) ou família. */
export function tokenKind(value: TokenValue): TokenKind {
  if (typeof value === 'number') return 'number';
  return COLOR_VALUE.test(value.trim()) ? 'color' : 'family';
}

/**
 * A tabela do `mode` (ou do primeiro modo, se `mode` não foi declarado ou não veio), sem aviso.
 * `font-sans` e `font-mono` valem o que o hospedeiro deu; a especialização pode redefini-los.
 */
export function resolveTokens(
  tokens: SpecTokens | undefined,
  host: HostFonts,
  mode?: string,
): ResolvedTokens {
  const out: Record<string, TokenValue> = {
    [FONT_SANS_TOKEN]: host.sans ?? DEFAULT_SANS,
    [FONT_MONO_TOKEN]: host.mono ?? DEFAULT_MONO,
  };
  if (tokens === undefined) return out;
  const chosen =
    mode !== undefined && tokens.modes.includes(mode) ? mode : (tokens.modes[0] ?? '');
  for (const [name, value] of Object.entries(tokens.values)) {
    const resolved = typeof value === 'object' ? value[chosen] : value;
    if (resolved !== undefined) out[name] = resolved;
  }
  return out;
}

function isTokenRef(value: unknown): value is { $token: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === '$token';
}

function substitute(node: unknown, tokens: ResolvedTokens): unknown {
  if (Array.isArray(node)) return node.map((item) => substitute(item, tokens));
  if (typeof node !== 'object' || node === null) return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (isTokenRef(value)) {
      const resolved = tokens[value.$token];
      if (resolved !== undefined) out[key] = resolved;
    } else {
      out[key] = substitute(value, tokens);
    }
  }
  return out;
}

function hasTokenRef(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasTokenRef);
  if (typeof node !== 'object' || node === null) return false;
  if (isTokenRef(node)) return true;
  return Object.values(node).some(hasTokenRef);
}

const cache = new WeakMap<ComponentFile, WeakMap<ResolvedTokens, ComponentFile>>();

/**
 * O componente com cada `{ "$token": … }` trocado pelo valor da tabela (um token que a tabela
 * não tem some do nó, e o nó cai no padrão: a validação da biblioteca o recusa antes). Sem
 * nenhum `$token` devolve o próprio componente; o resultado é guardado por componente e tabela.
 */
export function applyTokens(
  component: ComponentFile,
  tokens: ResolvedTokens,
): ComponentFile {
  const byTokens = cache.get(component) ?? new WeakMap<ResolvedTokens, ComponentFile>();
  cache.set(component, byTokens);
  const hit = byTokens.get(tokens);
  if (hit !== undefined) return hit;
  const result = hasTokenRef(component.template)
    ? {
        ...component,
        template: substitute(component.template, tokens) as ComponentFile['template'],
      }
    : component;
  byTokens.set(tokens, result);
  return result;
}

/** A família padrão do texto: o `font-sans` da tabela. */
export function defaultFontFamily(tokens: ResolvedTokens | undefined): string {
  const sans = tokens?.[FONT_SANS_TOKEN];
  return typeof sans === 'string' ? sans : DEFAULT_SANS;
}

/** Nome do tipo de valor, para as mensagens. */
export const TOKEN_KIND_NAMES: Readonly<Record<TokenKind, string>> = {
  color: 'cor',
  number: 'número',
  family: 'família de fonte',
};

/** Nome → tipo de cada token da especialização, mais os embutidos (`font-sans`, `font-mono`). */
export function knownTokenKinds(tokens: SpecTokens | undefined): Map<string, TokenKind> {
  const out = new Map<string, TokenKind>(
    BUILTIN_TOKENS.map((name) => [name, 'family' as const]),
  );
  for (const [name, value] of Object.entries(tokens?.values ?? {})) {
    const sample = typeof value === 'object' ? Object.values(value)[0] : value;
    if (sample !== undefined) out.set(name, tokenKind(sample));
  }
  return out;
}
