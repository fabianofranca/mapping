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

/** An alias: `{ "$token": "<name>" }`, with `alpha` and `over` on a color (the component meaning). */
export interface TokenAlias {
  readonly $token: string;
  readonly alpha?: number | { readonly $token: string };
  readonly over?: string;
}

/** A literal or an alias: what a scalar position holds. */
export type TokenScalar = TokenValue | TokenAlias;

/** A scalar that varies by one axis (`{ "$axis": "<axis>", "<entry>": <scalar>… }`), also nested. */
export interface TokenAxisScalar {
  readonly $axis: string;
  readonly [entry: string]: TokenScalar | TokenAxisScalar;
}

/** A field of a composite: a scalar, or a scalar per axis entry. */
export type TokenField = TokenScalar | TokenAxisScalar;

/** A composite value: named fields (`size`, `lineHeight`…), each a scalar. No nesting. */
export type TokenComposite = Readonly<Record<string, TokenField>>;

/** Any value form that varies by one axis (`{ "$axis": "<axis>", "<entry>": <value>… }`). */
export interface TokenAxisValue {
  readonly $axis: string;
  readonly [entry: string]: TokenBranch;
}

/**
 * A value: a literal, an alias, a composite or a per-axis value. In a `modes` library a plain object whose
 * keys are exactly the modes is the legacy per-mode value (it is also a `TokenComposite` by shape).
 */
export type TokenBranch = TokenScalar | TokenComposite | TokenAxisValue;

/** A `deprecated`/`removed`/… notice of the `$notices` list (the shape of a specialization notice). */
export interface TokenNotice {
  readonly kind: string;
  readonly message: string;
  readonly since?: string;
  readonly ref?: string;
}

/** The metadata wrapper: the value plus its description, group and notices (only at the top of a token). */
export interface TokenWrapper {
  readonly $value: TokenBranch;
  readonly $description?: string;
  readonly $group?: string;
  readonly $notices?: readonly TokenNotice[];
}

/** What `tokens.values` holds per name (the raw JSON forms). */
export type TokenEntry = TokenBranch | TokenWrapper;

/** The specialization's `tokens` (the mirror of the validation in `specTokens.ts`). */
export interface SpecTokens {
  /** The single axis `mode` (up to `formatVersion` 22, and in 23 when the library has no `axes`). */
  readonly modes?: readonly string[];
  /** Axis name → its entries; the first entry is the default (`formatVersion` 23). */
  readonly axes?: Readonly<Record<string, readonly string[]>>;
  readonly values: Readonly<Record<string, TokenEntry>>;
}

/** The entry of each axis a table is resolved for (axis → entry). An axis left out uses its default. */
export type TokenSelection = Readonly<Record<string, string>>;

/** The tokens of a mode: name → value. */
export type ResolvedTokens = Readonly<Record<string, TokenValue>>;

/** The host's fonts (the theme's `--font-sans`/`--font-mono` stack, or whatever the page has). */
export interface HostFonts {
  readonly sans?: string;
  readonly mono?: string;
}

/** Kind of value that the `$token` position expects (and that the token's value has). */
export type TokenKind = 'color' | 'number' | 'family';

/** What `knownTokenKinds` gives per name: a kind, or `composite` for a whole composite (only a lookup result). */
export type NamedTokenKind = TokenKind | 'composite';

/** The axis that `modes` stands for, and the one a legacy mode string selects. */
export const MODE_AXIS = 'mode';

export const FONT_SANS_TOKEN = 'font-sans';
export const FONT_MONO_TOKEN = 'font-mono';
/** Built-in names: they exist in every library, with the host's value. */
export const BUILTIN_TOKENS: readonly string[] = [FONT_SANS_TOKEN, FONT_MONO_TOKEN];
/** Pattern of a token name. */
export const TOKEN_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
/** Pattern of a token reference in a component: a name, or `name.field` for one field of a composite. */
export const TOKEN_REFERENCE_PATTERN = /^[a-z0-9][a-z0-9-]*(\.[a-z][a-zA-Z0-9]*)?$/;

/** The objects of a component that take a whole composite (`"font": { "$token": "title" }`). */
export type WholeObject = 'font' | 'shadow';

/** The composite fields that each object takes, with the kind of value each must have. */
export const WHOLE_FIELD_KINDS: Readonly<
  Record<WholeObject, Readonly<Record<string, TokenKind>>>
> = {
  font: {
    family: 'family',
    size: 'number',
    weight: 'number',
    lineHeight: 'number',
    letterSpacing: 'number',
  },
  shadow: { color: 'color', x: 'number', y: 'number', blur: 'number', spread: 'number' },
};

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

export interface Rgba {
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

/**
 * The literal color with each channel changed by `change` (`#rrggbb`, or `#rrggbbaa` when it is not
 * opaque). `none`, `transparent` and anything that is not an understood color stay as they are.
 */
export function mapColor(color: string, change: (rgba: Rgba) => Rgba): string {
  const rgba = parseColor(color.trim());
  if (!rgba) return color;
  const out = change(rgba);
  const body = `#${toByte(out.r)}${toByte(out.g)}${toByte(out.b)}`;
  return out.a >= 1 ? body : `${body}${toByte(out.a * 255)}`;
}

/** Where a name is read: the flat table, or the resolver's lazy evaluation. */
type Lookup = (name: string) => TokenValue | undefined;

/** The `$token`'s `alpha` as a number from 0 to 1 (literal or number `$token`); none if missing or invalid. */
function alphaOf(ref: TokenRef, lookup: Lookup): number | undefined {
  const raw = isTokenRef(ref.alpha) ? lookup(ref.alpha.$token) : ref.alpha;
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

/**
 * The color composited over opaque white as `#RRGGBB` (uppercase); `none` and `transparent` give white.
 * Undefined when the text is not a color.
 */
export function colorOverWhite(text: string): string | undefined {
  const color = text.trim();
  if (/^(none|transparent)$/i.test(color)) return '#FFFFFF';
  const rgba = parseColor(color);
  if (rgba === undefined) return undefined;
  const mix = (c: number): string => toByte(c * rgba.a + 255 * (1 - rgba.a));
  return `#${mix(rgba.r)}${mix(rgba.g)}${mix(rgba.b)}`.toUpperCase();
}

/** The `over` underneath color: the color token (from the table) or the literal color; none if invalid. */
function overColor(ref: TokenRef, lookup: Lookup): string | undefined {
  if (typeof ref.over !== 'string') return undefined;
  const value = isLiteralColor(ref.over) ? ref.over : lookup(ref.over);
  return typeof value === 'string' ? value : undefined;
}

/** The target's value `resolved` with the reference's `alpha` and `over` applied (a number stays as it is). */
function deriveRef(
  ref: TokenRef,
  resolved: TokenValue | undefined,
  lookup: Lookup,
): TokenValue | undefined {
  if (typeof resolved !== 'string') return resolved;
  const alpha = ref.alpha === undefined ? undefined : alphaOf(ref, lookup);
  const faded = alpha === undefined ? resolved : withAlpha(resolved, alpha);
  const base = overColor(ref, lookup);
  return base === undefined ? faded : compositeOver(faded, base);
}

/** The `$token`'s value in the table (with `alpha` and `over` applied, if any), or none if the name does not exist. */
function resolveRef(ref: TokenRef, tokens: ResolvedTokens): TokenValue | undefined {
  return deriveRef(ref, tokens[ref.$token], (name) => tokens[name]);
}

/**
 * A single value (an axis of `sizing`, or any piece of a component) with each `{ "$token": … }`
 * replaced by the table's value; a token the table lacks vanishes from an object and stays in a list.
 */
export function substituteTokens(node: unknown, tokens: ResolvedTokens): unknown {
  return isTokenRef(node) ? resolveRef(node, tokens) : substitute(node, tokens);
}

/**
 * `{ "$token": "<composite>", …explicit keys }` as the object that `key` (`font` or `shadow`) holds:
 * the composite's fields valid for it, with the explicit keys winning. None when the name is not a
 * composite of the table (a scalar or a missing name keep the `$token` as it is).
 */
function spreadComposite(
  key: WholeObject,
  node: unknown,
  tokens: ResolvedTokens,
): Record<string, unknown> | undefined {
  if (!isObj(node) || typeof node.$token !== 'string') return undefined;
  const name = node.$token;
  const prefix = `${name}.`;
  if (
    Object.hasOwn(tokens, name) ||
    !Object.keys(tokens).some((k) => k.startsWith(prefix))
  )
    return undefined;
  const fields: Record<string, unknown> = {};
  for (const field of Object.keys(WHOLE_FIELD_KINDS[key])) {
    const value = tokens[prefix + field];
    if (value !== undefined) fields[field] = value;
  }
  const explicit = Object.fromEntries(
    Object.entries(node).filter(([k]) => k !== '$token'),
  );
  return { ...fields, ...(substitute(explicit, tokens) as Record<string, unknown>) };
}

/** The value of `font` or `shadow` (an object or a list of shadows) when it reads a whole composite. */
function wholeComposite(key: string, value: unknown, tokens: ResolvedTokens): unknown {
  if (key === 'font') return spreadComposite('font', value, tokens);
  if (key !== 'shadow') return undefined;
  if (!Array.isArray(value)) return spreadComposite('shadow', value, tokens);
  return value.map(
    (item) =>
      spreadComposite('shadow', item, tokens) ??
      (isTokenRef(item) ? (resolveRef(item, tokens) ?? item) : substitute(item, tokens)),
  );
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
    const whole = wholeComposite(key, value, tokens);
    if (whole !== undefined) {
      out[key] = whole;
    } else if (isTokenRef(value)) {
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
  // Also a `font`/`shadow` that reads a whole composite next to its other keys.
  if (isTokenRef(node) || '$token' in node) return true;
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

/** The notices (`deprecated`, `removed`…) of the token `name`; empty when it has none or does not exist. */
export function tokenNotices(
  tokens: SpecTokens | undefined,
  name: string,
): readonly TokenNotice[] {
  const entry: unknown =
    tokens !== undefined && Object.hasOwn(tokens.values, name)
      ? tokens.values[name]
      : undefined;
  if (!isObj(entry) || !('$value' in entry) || !Array.isArray(entry.$notices)) return [];
  return entry.$notices as readonly TokenNotice[];
}

/** Name of the kind of value, for the messages. */
export const TOKEN_KIND_NAMES: Readonly<Record<TokenKind, string>> = {
  color: 'color',
  number: 'number',
  family: 'font family',
};

const HOST_NONE: HostFonts = {};

/** Does the leaf (what a selection leads to) hold named fields, rather than a literal or an alias? */
function isCompositeLeaf(leaf: unknown): leaf is Readonly<Record<string, unknown>> {
  return typeof leaf === 'object' && leaf !== null && !('$token' in leaf);
}

/**
 * Name → kind of each token of the specialization, plus the built-in ones (`font-sans`, `font-mono`):
 * a composite is `composite` and each of its fields is `name.field`, with the kind of the field. The
 * kinds are those of the default entries (a value has the same kind in every entry).
 */
export function knownTokenKinds(
  tokens: SpecTokens | undefined,
): Map<string, NamedTokenKind> {
  const out = new Map<string, NamedTokenKind>(
    BUILTIN_TOKENS.map((name) => [name, 'family' as const]),
  );
  if (tokens === undefined) return out;
  const { table, composites } = evaluateTokens(tokens, HOST_NONE, undefined);
  for (const [name, value] of Object.entries(table)) out.set(name, tokenKind(value));
  for (const name of composites) out.set(name, 'composite');
  return out;
}

// ---- Resolution of the named values (axes, aliases, composites) -------------------------------------

export type Obj = Readonly<Record<string, unknown>>;

const isObj = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The axes of the tokens: `axes`, or `modes` as the axis `mode`; the first entry of each is its default. */
export function tokenAxes(
  tokens: SpecTokens | undefined,
): ReadonlyMap<string, readonly string[]> {
  if (tokens?.axes !== undefined) return new Map(Object.entries(tokens.axes));
  if (tokens?.modes !== undefined) return new Map([[MODE_AXIS, tokens.modes]]);
  return new Map();
}

/** The entry that `selection` asks for on `axis` (a string is the entry of every axis that declares it). */
function wantedEntry(
  selection: string | TokenSelection | undefined,
  axis: string,
): string | undefined {
  return typeof selection === 'string' ? selection : selection?.[axis];
}

/** The entry of each declared axis: the selected one when the axis declares it, otherwise the default. */
function chosenEntries(
  tokens: SpecTokens,
  selection: string | TokenSelection | undefined,
): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [axis, entries] of tokenAxes(tokens)) {
    const wanted = wantedEntry(selection, axis);
    const entry = wanted !== undefined && entries.includes(wanted) ? wanted : entries[0];
    if (entry !== undefined) out[axis] = entry;
  }
  return out;
}

interface Picker {
  readonly chosen: Readonly<Record<string, string>>;
  /** `modes` of a library without `axes`: the legacy plain per-mode object is recognized by these. */
  readonly modes: readonly string[] | undefined;
}

/** A plain object whose keys are exactly the `modes`: the per-mode value of 15 to 22. */
export function isPerModeValue(node: Obj, modes: readonly string[] | undefined): boolean {
  if (modes === undefined) return false;
  const keys = Object.keys(node);
  return keys.length === modes.length && modes.every((mode) => keys.includes(mode));
}

/** The branch of an axis form for the chosen entry; without it, the first entry that is not a `$` key. */
function branchOf(node: Obj, axis: string, pick: Picker): unknown {
  const entry = pick.chosen[axis];
  if (entry !== undefined && Object.hasOwn(node, entry)) return node[entry];
  const first = Object.keys(node).find((key) => !key.startsWith('$'));
  return first === undefined ? undefined : node[first];
}

/** One step down: the wrapper's value or the selected branch; none when `node` is a leaf. */
function stepDown(node: unknown, pick: Picker): { readonly value: unknown } | undefined {
  if (!isObj(node)) return undefined;
  if ('$value' in node) return { value: node.$value };
  if (typeof node.$axis === 'string') return { value: branchOf(node, node.$axis, pick) };
  return isPerModeValue(node, pick.modes)
    ? { value: branchOf(node, MODE_AXIS, pick) }
    : undefined;
}

/** What the selection leads to: a literal, an alias or a composite (never a wrapper or a per-axis value). */
function leafOf(raw: unknown, pick: Picker): unknown {
  let node = raw;
  for (let step = stepDown(node, pick); step !== undefined; step = stepDown(node, pick)) {
    node = step.value;
  }
  return node;
}

interface Evaluation {
  readonly values: Readonly<Record<string, unknown>>;
  readonly pick: Picker;
  readonly builtin: ResolvedTokens;
  readonly cache: Map<string, TokenValue | undefined>;
  readonly visiting: Set<string>;
}

/** The value of a name (`x`) or of a composite field (`x.y`), in the selection; none if it has none. */
function slotValue(slot: string, ev: Evaluation): TokenValue | undefined {
  if (ev.cache.has(slot)) return ev.cache.get(slot);
  if (ev.visiting.has(slot)) return undefined;
  ev.visiting.add(slot);
  const value = computeSlot(slot, ev);
  ev.visiting.delete(slot);
  ev.cache.set(slot, value);
  return value;
}

function computeSlot(slot: string, ev: Evaluation): TokenValue | undefined {
  const dot = slot.indexOf('.');
  const name = dot < 0 ? slot : slot.slice(0, dot);
  if (!Object.hasOwn(ev.values, name)) return dot < 0 ? ev.builtin[name] : undefined;
  const leaf = leafOf(ev.values[name], ev.pick);
  if (dot < 0) return scalarValue(leaf, ev);
  if (!isCompositeLeaf(leaf)) return undefined;
  const field = slot.slice(dot + 1);
  return Object.hasOwn(leaf, field)
    ? scalarValue(leafOf(leaf[field], ev.pick), ev)
    : undefined;
}

/** The value of a literal or of an alias (with its `alpha` and `over`); a composite has none as a scalar. */
function scalarValue(leaf: unknown, ev: Evaluation): TokenValue | undefined {
  if (typeof leaf === 'string' || typeof leaf === 'number') return leaf;
  if (!isObj(leaf) || typeof leaf.$token !== 'string') return undefined;
  const lookup: Lookup = (name) => slotValue(name, ev);
  return deriveRef(leaf as TokenRef, lookup(leaf.$token), lookup);
}

interface Evaluated {
  readonly table: ResolvedTokens;
  /** Names of the composite tokens (each field is in the table as `name.field`). */
  readonly composites: readonly string[];
}

function evaluateTokens(
  tokens: SpecTokens,
  host: HostFonts,
  selection: string | TokenSelection | undefined,
): Evaluated {
  const builtin = {
    [FONT_SANS_TOKEN]: host.sans ?? DEFAULT_SANS,
    [FONT_MONO_TOKEN]: host.mono ?? DEFAULT_MONO,
  };
  const ev: Evaluation = {
    values: tokens.values,
    pick: {
      chosen: chosenEntries(tokens, selection),
      modes: tokens.axes === undefined ? tokens.modes : undefined,
    },
    builtin,
    cache: new Map(),
    visiting: new Set(),
  };
  const table: Record<string, TokenValue> = { ...builtin };
  const composites: string[] = [];
  const put = (slot: string): void => {
    const value = slotValue(slot, ev);
    if (value !== undefined) table[slot] = value;
  };
  for (const [name, entry] of Object.entries(tokens.values)) {
    const leaf = leafOf(entry, ev.pick);
    if (!isCompositeLeaf(leaf)) put(name);
    else {
      composites.push(name);
      for (const field of Object.keys(leaf)) put(`${name}.${field}`);
    }
  }
  return { table, composites };
}

/**
 * The flat table (name → value) of a selection: scalars by name, each composite field as `name.field`,
 * aliases resolved in the same selection. `selection` is a map axis → entry; an axis it leaves out, or an
 * entry the axis does not declare, uses the axis default, without a warning. A string sets that entry on
 * every axis that declares it (the legacy drawing mode). `font-sans` and `font-mono` are worth what the host gave; the specialization can
 * redefine them.
 */
export function resolveTokens(
  tokens: SpecTokens | undefined,
  host: HostFonts,
  selection?: string | TokenSelection,
): ResolvedTokens {
  if (tokens === undefined) return evaluateTokens({ values: {} }, host, undefined).table;
  return evaluateTokens(tokens, host, selection).table;
}

/**
 * The canonical form of a selection: the effective entry of each declared axis, sorted, as `axis=entry`
 * lines. Two selections that draw the same share a key (another key order, a default spelled out, a string
 * that names the same entries); no tokens gives an empty key.
 */
export function selectionKey(
  tokens: SpecTokens | undefined,
  selection: string | TokenSelection | undefined,
): string {
  if (tokens === undefined) return '';
  return Object.entries(chosenEntries(tokens, selection))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([axis, entry]) => `${axis}=${entry}`)
    .join('\n');
}

/** The tables of a specialization's tokens, one per selection, built on first use and then shared. */
export interface TokenTables {
  readonly get: (selection: string | TokenSelection | undefined) => ResolvedTokens;
}

/**
 * A lazy per-selection cache of `resolveTokens`: nothing is precomputed (the product of the axes is never
 * walked); the same effective selection returns the same table object.
 */
export function createTokenTables(
  tokens: SpecTokens | undefined,
  host: HostFonts,
): TokenTables {
  const tables = new Map<string, ResolvedTokens>();
  return {
    get: (selection) => {
      const key = selectionKey(tokens, selection);
      let table = tables.get(key);
      if (table === undefined) {
        table = resolveTokens(tokens, host, selection);
        tables.set(key, table);
      }
      return table;
    },
  };
}
