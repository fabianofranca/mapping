/**
 * Design tokens of the component (format 4, "faithful components" stage, CF5): `{ "$token": "<name>" }`
 * reads a named value from the specialization (`tokens` of `formatVersion` 15), per mode
 * (`light`/`dark`…). Pure functions, no DOM: the mode and the host font arrive from outside, already
 * resolved to text.
 *
 * `resolveTokens` builds the flat table (name → value) of a mode; `applyTokens` replaces each
 * `{ "$token": … }` of the component with the value, before the engine starts, and therefore the
 * token is valid anywhere an expression is valid (including as the result of `$switch` and `$if`).
 */
import type { ComponentFile } from './componentFormat';

/** Value of a token: color or family (text) or number. */
export type TokenValue = string | number;

/** The specialization's `tokens` (the mirror of the zod in `spec.ts`). */
export interface SpecTokens {
  readonly modes: readonly string[];
  /** Simple value (applies in every mode) or one value per mode. */
  readonly values: Readonly<
    Record<string, TokenValue | Readonly<Record<string, TokenValue>>>
  >;
}

/** The tokens of a mode: name → value. */
export type ResolvedTokens = Readonly<Record<string, TokenValue>>;

/** The host's fonts (the theme's `--font-sans`/`--font-mono` stack, or whatever the page has). */
export interface HostFonts {
  readonly sans?: string;
  readonly mono?: string;
}

/** Kind of value that the `$token` position expects (and that the token's value has). */
export type TokenKind = 'color' | 'number' | 'family';

export const FONT_SANS_TOKEN = 'font-sans';
export const FONT_MONO_TOKEN = 'font-mono';
/** Built-in names: they exist in every library, with the host's value. */
export const BUILTIN_TOKENS: readonly string[] = [FONT_SANS_TOKEN, FONT_MONO_TOKEN];
/** Pattern of a token name. */
export const TOKEN_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Family when the host provides none. */
const DEFAULT_SANS = 'sans-serif';
const DEFAULT_MONO = 'monospace';

const COLOR_VALUE =
  /^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(rgb|hsl)a?\(.*\)|none|transparent)$/i;

/** The kind of a token value: number, color (`#…`, `rgb()`, `hsl()`, `none`) or family. */
export function tokenKind(value: TokenValue): TokenKind {
  if (typeof value === 'number') return 'number';
  return COLOR_VALUE.test(value.trim()) ? 'color' : 'family';
}

/**
 * The table of `mode` (or of the first mode, if `mode` was not declared or not given), without a
 * warning. `font-sans` and `font-mono` are worth what the host gave; the specialization can
 * redefine them.
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

/** A `{ "$token": … }`, with optional `alpha` (a color's opacity) and `over` (the color underneath) (v4). */
type TokenRef = { $token: string; alpha?: unknown; over?: unknown };

function isTokenRef(value: unknown): value is TokenRef {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.includes('$token') &&
    keys.every((k) => k === '$token' || k === 'alpha' || k === 'over')
  );
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

/** Converts `hsl(h, s, l)` (h in degrees, s and l from 0 to 1) to RGB (0 to 255). */
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

/** A numeric color argument; `50%` is worth `percentOf × 0.5`. */
function colorNumber(text: string, percentOf: number): number | undefined {
  const match = WITH_PERCENT.exec(text);
  if (!match) return undefined;
  const n = parseFloat(match[1] ?? '');
  return match[2] === '%' ? (n / 100) * percentOf : n;
}

/** The hue of an `hsl()` in degrees (accepts `deg`, `grad`, `rad` and `turn`). */
function hueDegrees(text: string): number | undefined {
  const match = WITH_ANGLE_UNIT.exec(text);
  if (!match) return undefined;
  return parseFloat(match[1] ?? '') * (DEGREES_PER_UNIT[match[2] ?? 'deg'] ?? 1);
}

/** The `rgb()`/`hsl()` arguments split apart (comma, space or slash); 3 or 4, otherwise none. */
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

/** `rgb`/`rgba` or `hsl`/`hsla` with the arguments already split; none if any is not a number. */
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

function parseColor(text: string): Rgba | undefined {
  return parseHex(text) ?? parseFunctional(text);
}

/** Is the text a literal color (`#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb(...)`, `hsl(...)`)? */
export function isLiteralColor(text: string): boolean {
  return parseColor(text.trim()) !== undefined;
}

/**
 * The color with its alpha multiplied by `alpha` (0 to 1), in `#rrggbbaa`. `none`, `transparent`
 * and anything that is not an understood color stay as they are.
 */
function withAlpha(color: string, alpha: number): string {
  const text = color.trim();
  const rgba = parseColor(text);
  if (!rgba) return color;
  return `#${toByte(rgba.r)}${toByte(rgba.g)}${toByte(rgba.b)}${toByte(rgba.a * alpha * 255)}`;
}

/** The `$token`'s `alpha` as a number from 0 to 1 (literal or number `$token`); none if missing or invalid. */
function alphaOf(ref: TokenRef, tokens: ResolvedTokens): number | undefined {
  const raw = isTokenRef(ref.alpha) ? tokens[ref.alpha.$token] : ref.alpha;
  return typeof raw === 'number' && Number.isFinite(raw)
    ? Math.min(1, Math.max(0, raw))
    : undefined;
}

/** The color `top` composited over `base` (Compose's `compositeOver`); the base's alpha enters the result. */
function compositeOver(top: string, base: string): string {
  const above = parseColor(top.trim());
  const below = parseColor(base.trim());
  if (!above || !below) return top;
  const alpha = above.a + below.a * (1 - above.a);
  if (alpha === 0) return `#00000000`;
  const mix = (a: number, b: number): number =>
    (a * above.a + b * below.a * (1 - above.a)) / alpha;
  return `#${toByte(mix(above.r, below.r))}${toByte(mix(above.g, below.g))}${toByte(mix(above.b, below.b))}${toByte(alpha * 255)}`;
}

/** The `over` underneath color: the color token (from the table) or the literal color; none if invalid. */
function overColor(ref: TokenRef, tokens: ResolvedTokens): string | undefined {
  if (typeof ref.over !== 'string') return undefined;
  const value = isLiteralColor(ref.over) ? ref.over : tokens[ref.over];
  return typeof value === 'string' ? value : undefined;
}

/** The `$token`'s value in the table (with `alpha` and `over` applied, if any), or none if the name does not exist. */
function resolveRef(ref: TokenRef, tokens: ResolvedTokens): TokenValue | undefined {
  const resolved = tokens[ref.$token];
  if (typeof resolved !== 'string') return resolved;
  const alpha = ref.alpha === undefined ? undefined : alphaOf(ref, tokens);
  const faded = alpha === undefined ? resolved : withAlpha(resolved, alpha);
  const base = overColor(ref, tokens);
  return base === undefined ? faded : compositeOver(faded, base);
}

function substitute(node: unknown, tokens: ResolvedTokens): unknown {
  if (Array.isArray(node)) {
    // A list item (`cornerRadius`, `dash`) does not vanish: a `$token` with no value stays as it is.
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
 * The component with each `{ "$token": … }` replaced by the table's value (a token the table
 * does not have vanishes from the node, and the node falls back to the default: the library
 * validation rejects it beforehand). With no `$token` it returns the component itself; the result
 * is cached per component and table.
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

/** The default text family: the table's `font-sans`. */
export function defaultFontFamily(tokens: ResolvedTokens | undefined): string {
  const sans = tokens?.[FONT_SANS_TOKEN];
  return typeof sans === 'string' ? sans : DEFAULT_SANS;
}

/** Name of the kind of value, for the messages. */
export const TOKEN_KIND_NAMES: Readonly<Record<TokenKind, string>> = {
  color: 'cor',
  number: 'número',
  family: 'família de fonte',
};

/** Name → kind of each token of the specialization, plus the built-in ones (`font-sans`, `font-mono`). */
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
