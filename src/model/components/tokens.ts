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

const COLOR_VALUE =
  /^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(rgb|hsl)a?\(.*\)|none|transparent)$/i;

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

/** Um `{ "$token": … }`, com o `alpha` opcional (a opacidade de uma cor; v4). */
type TokenRef = { $token: string; alpha?: unknown };

function isTokenRef(value: unknown): value is TokenRef {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.includes('$token') && keys.every((k) => k === '$token' || k === 'alpha');
}

interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const HEX_COLOR = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIONAL_COLOR = /^(rgb|hsl)a?\(([^)]*)\)$/i;

function parseHex(text: string): Rgba | undefined {
  const match = HEX_COLOR.exec(text);
  if (!match) return undefined;
  const digits =
    (match[1] ?? '').length <= 4
      ? [...(match[1] ?? '')].map((c) => c + c).join('')
      : (match[1] ?? '');
  const byte = (i: number): number => parseInt(digits.slice(i * 2, i * 2 + 2), 16);
  return {
    r: byte(0),
    g: byte(1),
    b: byte(2),
    a: digits.length === 8 ? byte(3) / 255 : 1,
  };
}

/** Converte `hsl(h, s, l)` (h em graus, s e l de 0 a 1) em RGB (0 a 255). */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const k = (n: number): number => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number =>
    Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return [f(0), f(8), f(4)];
}

const NUMBER_PART = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)';
const WITH_PERCENT = new RegExp(`^(${NUMBER_PART})(%?)$`);
const WITH_ANGLE_UNIT = new RegExp(`^(${NUMBER_PART})(deg|grad|rad|turn)?$`);
const DEGREES_PER_UNIT: Readonly<Record<string, number>> = {
  deg: 1,
  grad: 0.9,
  rad: 180 / Math.PI,
  turn: 360,
};

/** Um argumento numérico de cor; `50%` vale `percentOf × 0,5`. */
function colorNumber(text: string, percentOf: number): number | undefined {
  const match = WITH_PERCENT.exec(text);
  if (!match) return undefined;
  const n = parseFloat(match[1] ?? '');
  return match[2] === '%' ? (n / 100) * percentOf : n;
}

/** O matiz de um `hsl()` em graus (aceita `deg`, `grad`, `rad` e `turn`). */
function hueDegrees(text: string): number | undefined {
  const match = WITH_ANGLE_UNIT.exec(text);
  if (!match) return undefined;
  return parseFloat(match[1] ?? '') * (DEGREES_PER_UNIT[match[2] ?? 'deg'] ?? 1);
}

/** Os argumentos de `rgb()`/`hsl()` separados (vírgula, espaço ou barra); 3 ou 4, senão nenhum. */
function functionalParts(args: string): string[] | undefined {
  const parts = args.split(/[\s,/]+/).filter((p) => p !== '');
  return parts.length === 3 || parts.length === 4 ? parts : undefined;
}

function hslArgs(parts: readonly string[], a: number): Rgba | undefined {
  const [h, sat, light] = [
    hueDegrees(parts[0] ?? ''),
    colorNumber(parts[1] ?? '', 100),
    colorNumber(parts[2] ?? '', 100),
  ];
  if (h === undefined || sat === undefined || light === undefined) return undefined;
  const [r, g, b] = hslToRgb(h, sat / 100, light / 100);
  return { r, g, b, a };
}

function rgbArgs(parts: readonly string[], a: number): Rgba | undefined {
  const [r, g, b] = parts.slice(0, 3).map((p) => colorNumber(p, 255));
  return r === undefined || g === undefined || b === undefined
    ? undefined
    : { r, g, b, a };
}

/** `rgb`/`rgba` ou `hsl`/`hsla` com os argumentos já separados; nenhum se algum não for número. */
function functionalToRgba(fn: string, parts: readonly string[]): Rgba | undefined {
  const a = parts[3] === undefined ? 1 : colorNumber(parts[3], 1);
  if (a === undefined) return undefined;
  return fn.toLowerCase() === 'hsl' ? hslArgs(parts, a) : rgbArgs(parts, a);
}

function parseFunctional(text: string): Rgba | undefined {
  const match = FUNCTIONAL_COLOR.exec(text);
  const parts = match ? functionalParts(match[2] ?? '') : undefined;
  return match && parts ? functionalToRgba(match[1] ?? '', parts) : undefined;
}

const toByte = (n: number): string =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');

/**
 * A cor com o alfa multiplicado por `alpha` (0 a 1), em `#rrggbbaa`. `none`, `transparent` e o
 * que não for uma cor que se entenda ficam como estão.
 */
function withAlpha(color: string, alpha: number): string {
  const text = color.trim();
  const rgba = parseHex(text) ?? parseFunctional(text);
  if (!rgba) return color;
  return `#${toByte(rgba.r)}${toByte(rgba.g)}${toByte(rgba.b)}${toByte(rgba.a * alpha * 255)}`;
}

/** O `alpha` do `$token` como número de 0 a 1 (literal ou `$token` de número); nenhum se faltar ou não valer. */
function alphaOf(ref: TokenRef, tokens: ResolvedTokens): number | undefined {
  const raw = isTokenRef(ref.alpha) ? tokens[ref.alpha.$token] : ref.alpha;
  return typeof raw === 'number' && Number.isFinite(raw)
    ? Math.min(1, Math.max(0, raw))
    : undefined;
}

/** O valor do `$token` na tabela (com o `alpha` aplicado, se houver), ou nenhum se o nome não existe. */
function resolveRef(ref: TokenRef, tokens: ResolvedTokens): TokenValue | undefined {
  const resolved = tokens[ref.$token];
  if (resolved === undefined || ref.alpha === undefined || typeof resolved !== 'string')
    return resolved;
  const alpha = alphaOf(ref, tokens);
  return alpha === undefined ? resolved : withAlpha(resolved, alpha);
}

function substitute(node: unknown, tokens: ResolvedTokens): unknown {
  if (Array.isArray(node)) {
    // Um item de lista (`cornerRadius`, `dash`) não some: o `$token` sem valor fica como está.
    return node.map((item) =>
      isTokenRef(item) ? (resolveRef(item, tokens) ?? item) : substitute(item, tokens),
    );
  }
  if (typeof node !== 'object' || node === null) return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (isTokenRef(value)) {
      const resolved = resolveRef(value, tokens);
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
