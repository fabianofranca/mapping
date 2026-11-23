import {
  colorOverWhite,
  createTokenTables,
  tokenKind,
  type SpecTokens,
  type TokenSelection,
  type TokenTables,
} from './components/tokens';
import { effectiveDrawingMode } from './drawingMode';
import { projectIndex } from './projectIndex';
import type { ContainerBackground, ContainerBackgroundToken, Project } from './types';

// Background of a container without a file by token (stage #1900, NV4). Pure, no DOM: the canvas, the
// MCP renders and the views read the resolved `#RRGGBB`. A token is read in the first applied
// specialization (in the project's order) whose `tokens` declares the name with a color value, in the
// container's effective selection; the color is composited over white, so the board stays opaque.

/** The color a background resolves to when the token is not declared by any applied specialization. */
const FALLBACK = '#FFFFFF';

/** Is the background a token reference (`{ "$token": … }`)? */
export function isBackgroundToken(
  b: ContainerBackground | null | undefined,
): b is ContainerBackgroundToken {
  return typeof b === 'object' && b !== null;
}

interface Cache {
  /** Color token names, computed on first use (`undefined` until then). */
  names: readonly string[] | undefined;
  readonly resolved: Map<string, string | null>;
}

const caches = new WeakMap<Project, Cache>();
/** Token tables by the `spec.tokens` object, so they survive the new `Project` objects of a gesture. */
const tablesByTokens = new WeakMap<object, TokenTables>();

function isColor(value: unknown): value is string {
  return typeof value === 'string' && tokenKind(value) === 'color';
}

function tablesOf(tokens: SpecTokens | undefined): TokenTables | undefined {
  if (tokens === undefined) return undefined;
  let tables = tablesByTokens.get(tokens);
  if (tables === undefined) {
    tables = createTokenTables(tokens, {});
    tablesByTokens.set(tokens, tables);
  }
  return tables;
}

function cacheOf(p: Project): Cache {
  let cache = caches.get(p);
  if (cache === undefined) {
    cache = { names: undefined, resolved: new Map() };
    caches.set(p, cache);
  }
  return cache;
}

/** Names of the color tokens the applied specializations declare, in specialization order, no repeats. */
export function colorTokenNames(p: Project): readonly string[] {
  const cache = cacheOf(p);
  if (cache.names === undefined) {
    const names: string[] = [];
    for (const s of p.specializations) {
      for (const [name, value] of Object.entries(
        tablesOf(s.spec?.tokens)?.get(undefined) ?? {},
      )) {
        if (isColor(value) && !names.includes(name)) names.push(name);
      }
    }
    cache.names = names;
  }
  return cache.names;
}

/** `#RRGGBB` (uppercase) of a background in `selection` (undefined = axis defaults); an undeclared token is white. */
export function resolveBackground(
  p: Project,
  background: ContainerBackground,
  selection?: TokenSelection,
): string {
  if (!isBackgroundToken(background)) return background.toUpperCase();
  for (const s of p.specializations) {
    const value = tablesOf(s.spec?.tokens)?.get(selection)[background.$token];
    if (isColor(value)) return colorOverWhite(value) ?? FALLBACK;
  }
  return FALLBACK;
}

function keyOf(containerId: string, selection: TokenSelection | undefined): string {
  const entries = Object.entries(selection ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
  return `${containerId}\u0000${JSON.stringify(entries)}`;
}

/**
 * Resolved `#RRGGBB` of a container's background in its effective selection (the container's axes over the
 * project's; `pinned` axes override, as the `drawingMode` of a `render_*`). `null` for a container with a
 * file (or one that does not exist).
 */
export function containerBackgroundColor(
  p: Project,
  containerId: string,
  pinned?: TokenSelection,
): string | null {
  const container = projectIndex(p).containers.get(containerId);
  if (container === undefined || container.background === null) return null;
  const mode = effectiveDrawingMode(p, containerId);
  const selection = pinned === undefined ? mode : { ...mode, ...pinned };
  const cache = cacheOf(p);
  const key = keyOf(containerId, selection);
  let color = cache.resolved.get(key);
  if (color === undefined) {
    color = resolveBackground(p, container.background, selection);
    cache.resolved.set(key, color);
  }
  return color;
}

/** A stored background token that no applied specialization declares as a color. */
export interface UndeclaredBackgroundToken {
  readonly containerId: string;
  readonly token: string;
}

/** Containers whose stored token no applied specialization declares as a color, in container order. */
export function undeclaredBackgroundTokens(p: Project): UndeclaredBackgroundToken[] {
  const names = new Set(colorTokenNames(p));
  const out: UndeclaredBackgroundToken[] = [];
  for (const c of p.containers) {
    if (isBackgroundToken(c.background) && !names.has(c.background.$token)) {
      out.push({ containerId: c.id, token: c.background.$token });
    }
  }
  return out;
}
