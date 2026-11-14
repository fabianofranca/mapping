import { signal, type ReadonlySignal } from '@preact/signals';
import { tokenValue } from '../theme/tokens';
import { readSetting, writeSetting } from '../utils/safeStorage';

// Desktop tool windows (design system: docs/DESIGN-SYSTEM.md): which ones are
// open, which tab the bottom window is on and the size of each side. It is UI state,
// per device: it lives in `localStorage` (with try/catch, in `safeStorage`), never in
// `mapping.json` nor in the undo history.

/**
 * Available windows. The bottom window has one tab per window: List, Incomplete,
 * Warnings, Diagnostics and Proposals (stage 4).
 */
export const TOOL_WINDOWS = [
  'tree',
  'layers',
  'details',
  'list',
  'incomplete',
  'notices',
  'diagnostics',
  'proposals',
  'comments',
  'catalog',
] as const;

export type ToolWindowId = (typeof TOOL_WINDOWS)[number];

export type ToolWindowSide = 'left' | 'right' | 'bottom';

/** Side of each window: left and right are columns; the bottom one has tabs. */
export const WINDOW_SIDE: Readonly<Record<ToolWindowId, ToolWindowSide>> = {
  tree: 'left',
  layers: 'left',
  details: 'right',
  list: 'bottom',
  incomplete: 'bottom',
  notices: 'bottom',
  diagnostics: 'bottom',
  proposals: 'bottom',
  comments: 'bottom',
  catalog: 'left',
};

/**
 * Shortcut number of each window (Ctrl+Shift+N, and Alt+N where the browser allows it).
 * The numbering is that of the DS 2.0 Shortcuts section: Tree 1, Layers 2, Details 3, and in the
 * bottom window List 4, Incomplete 5, Diagnostics 6 and Proposals 7; the Catalog
 * (Library stage, B5, which keeps B3's palette as a tab) is 9. The 8, vacant since B3,
 * is the Warnings window (stage #486), which sits in the tab between Incomplete and Diagnostics.
 * The 0 is the Comments window (Comments stage), the last tab of the bottom window.
 */
export const WINDOW_NUMBER: Readonly<Record<ToolWindowId, number>> = {
  tree: 1,
  layers: 2,
  details: 3,
  list: 4,
  incomplete: 5,
  notices: 8,
  diagnostics: 6,
  proposals: 7,
  comments: 0,
  catalog: 9,
};

/** Window of the Ctrl+Shift+N shortcut (`null` if the number has no window yet). */
export function toolWindowByNumber(n: number): ToolWindowId | null {
  return TOOL_WINDOWS.find((id) => WINDOW_NUMBER[id] === n) ?? null;
}

/** Number from a length token (`--size-tw-left: 264px` → 264). */
function px(token: string): number {
  return Number.parseInt(tokenValue(token, 'light'), 10);
}

/** Minimum canvas width: the side windows never invade it (`--size-canvas-min`). */
const CANVAS_MIN = px('size-canvas-min');

/** Default and limits of each side (Layouts section of the DS 2.0). */
export const WINDOW_LIMITS: Readonly<
  Record<
    ToolWindowSide,
    { readonly default: number; readonly min: number; readonly max: number }
  >
> = {
  // The minimums add up, with the canvas, to the minimum window area (900px minus the two strips): 180 + 280 + 360 = 820.
  left: { default: px('size-tw-left'), min: 180, max: 480 },
  right: { default: px('size-tw-right'), min: 280, max: 560 },
  // The bottom window goes up to 60% of the editor body height (`maxFraction` below).
  bottom: { default: px('size-tw-bottom'), min: 120, max: Number.POSITIVE_INFINITY },
};

const BOTTOM_MAX_FRACTION = 0.6;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** Minimum height of each window of the left column when Tree and Layers share it. */
const SPLIT_MIN = 96;

/**
 * Height of the Layers window when it is stacked below the Tree: neither of the two
 * goes below `SPLIT_MIN` (nor exceeds the column's space). Pure function.
 */
export function clampLayersHeight(size: number, columnHeight: number): number {
  const max = Math.max(SPLIT_MIN, columnHeight - SPLIT_MIN);
  return clamp(size, SPLIT_MIN, max);
}

/** Passo do Ctrl+Shift+setas (B2). */
export const RESIZE_STEP = 16;

/** Space available for the windows: the editor body, without the strips. */
export interface LayoutSpace {
  readonly width: number;
  readonly height: number;
  /** Width of the other open side window (0 if it is collapsed). */
  readonly otherWidth: number;
}

/**
 * Valid size for the window: between the side's minimum and maximum, without leaving the
 * canvas below `--size-canvas-min` (side windows) nor exceeding 60% of the height
 * (bottom). Pure function: `tests/store/toolWindows.test.ts` covers the limits.
 */
export function clampWindowSize(
  side: ToolWindowSide,
  size: number,
  space: LayoutSpace,
): number {
  const { min, max } = WINDOW_LIMITS[side];
  const room =
    side === 'bottom'
      ? space.height * BOTTOM_MAX_FRACTION
      : space.width - space.otherWidth - CANVAS_MIN;
  return clamp(size, min, Math.max(min, Math.min(max, room)));
}

interface StoredLayout {
  /** Read from `localStorage` with no type guarantee: `storedOpen` validates. */
  readonly open?: unknown;
  readonly bottomTab?: string;
  readonly left?: number;
  readonly right?: number;
  readonly bottom?: number;
  /** Height of the bottom window in review mode (kept apart from the normal one). */
  readonly bottomReview?: number;
  readonly layersHeight?: number;
}

const KEY = 'mapping.toolWindows';

/** Ids that existed before and are now another window (B3's palette became a Catalog tab). */
const RENAMED: Readonly<Record<string, ToolWindowId>> = { library: 'catalog' };

function isToolWindow(value: unknown): value is ToolWindowId {
  return TOOL_WINDOWS.some((id) => id === value);
}

function readStored(): StoredLayout {
  const text = readSetting(KEY);
  if (text === null) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object' ? (parsed as StoredLayout) : {};
  } catch {
    // Corrupted value: the default applies.
    return {};
  }
}

function storedSize(value: unknown, side: ToolWindowSide): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : WINDOW_LIMITS[side].default;
}

/** Open by default: Tree, Layers and Details (the List opens from the strip). */
const DEFAULT_OPEN: readonly ToolWindowId[] = ['tree', 'layers', 'details'];

const stored = readStored();

/** `open` only applies as a list; any other stored type falls back to the default (#943). */
function storedOpen(value: unknown): readonly ToolWindowId[] {
  if (!Array.isArray(value)) return DEFAULT_OPEN;
  return value
    .map((id: unknown) => (typeof id === 'string' ? (RENAMED[id] ?? id) : id))
    .filter(isToolWindow);
}

const openIds = signal<ReadonlySet<ToolWindowId>>(new Set(storedOpen(stored.open)));

/** Initial height of the bottom window in review mode (`--size-tw-bottom-review`). */
export const REVIEW_BOTTOM_DEFAULT = px('size-tw-bottom-review');

/**
 * The old review default (344 px). `persist()` used to write `bottomReview` even for those who
 * never resized; so a stored 344 is the earlier default, not a choice, and moves
 * to the new default (#598). Any other stored value is a choice and stays.
 */
const OLD_REVIEW_BOTTOM_DEFAULT = 344;

/**
 * The bottom window has two stored heights: the normal one and the review mode one, which starts
 * larger than the normal one (three whole list rows and the shortcuts footer). `sizes.bottom` is the current one.
 */
let bottomHeights = {
  normal: storedSize(stored.bottom, 'bottom'),
  review:
    typeof stored.bottomReview === 'number' &&
    Number.isFinite(stored.bottomReview) &&
    stored.bottomReview > 0 &&
    stored.bottomReview !== OLD_REVIEW_BOTTOM_DEFAULT
      ? stored.bottomReview
      : REVIEW_BOTTOM_DEFAULT,
};
let reviewLayout = false;

const sizes = signal<Readonly<Record<ToolWindowSide, number>>>({
  left: storedSize(stored.left, 'left'),
  right: storedSize(stored.right, 'right'),
  bottom: bottomHeights.normal,
});

/** Height of the Layers window when it shares the left column with the Tree. */
const layersSplit = signal<number>(
  typeof stored.layersHeight === 'number' &&
    Number.isFinite(stored.layersHeight) &&
    stored.layersHeight > 0
    ? stored.layersHeight
    : px('size-tw-layers'),
);

/** Active tab of the bottom window (one at a time, as in an IDE). */
const bottomTab = signal<ToolWindowId>(
  isToolWindow(stored.bottomTab) && WINDOW_SIDE[stored.bottomTab] === 'bottom'
    ? stored.bottomTab
    : 'list',
);

export const openToolWindows: ReadonlySignal<ReadonlySet<ToolWindowId>> = openIds;
export const toolWindowSizes: ReadonlySignal<Readonly<Record<ToolWindowSide, number>>> =
  sizes;
export const bottomToolWindow: ReadonlySignal<ToolWindowId> = bottomTab;
export const layersWindowHeight: ReadonlySignal<number> = layersSplit;

/**
 * Visible windows of a side, in the order of the windows. The left stacks Tree and
 * Layers; the right has just one; the bottom shows the active tab.
 */
export function openWindowsOf(side: ToolWindowSide): readonly ToolWindowId[] {
  const open = openToolWindows.value;
  if (side === 'bottom') {
    const tab = bottomToolWindow.value;
    return open.has(tab) ? [tab] : [];
  }
  return TOOL_WINDOWS.filter((id) => WINDOW_SIDE[id] === side && open.has(id));
}

/** First visible window of a side; `null` if the side is collapsed. */
export function openWindowOf(side: ToolWindowSide): ToolWindowId | null {
  return openWindowsOf(side)[0] ?? null;
}

/** The window is visible (and, in the bottom one, is the active tab). */
export function isToolWindowOpen(id: ToolWindowId): boolean {
  return openWindowsOf(WINDOW_SIDE[id]).includes(id);
}

/** Width of the windows area (editor body without the strips); 0 = not measured yet. */
const paneWidth = signal(0);

export function setPaneWidth(width: number): void {
  if (width !== paneWidth.value) paneWidth.value = width;
}

/**
 * Widths the side windows actually occupy: the stored ones, shrunk (first the right,
 * then the left, down to the minimum of each) so the canvas keeps `--size-canvas-min`
 * in a window narrower than the stored layout's. At 900px or more the minimums
 * always fit (180 + 280 + 360 = 820, the minimum window area), so nothing goes under
 * the strips (#1464). `avail` 0
 * (not measured) keeps the stored ones; a collapsed side passes 0. Pure function.
 */
export function fitSideWidths(
  left: number,
  right: number,
  avail: number,
): { readonly left: number; readonly right: number } {
  if (avail <= 0) return { left, right };
  const excess = left + right + CANVAS_MIN - avail;
  if (excess <= 0) return { left, right };
  // A collapsed side (0) does not shrink; the open one only goes down to the minimum.
  const cutRight =
    right === 0 ? 0 : clamp(excess, 0, Math.max(0, right - WINDOW_LIMITS.right.min));
  const cutLeft =
    left === 0
      ? 0
      : clamp(excess - cutRight, 0, Math.max(0, left - WINDOW_LIMITS.left.min));
  return { left: left - cutLeft, right: right - cutRight };
}

/** Width each side window occupies now (0 when collapsed), already adjusted to the window. */
export function sideWidth(side: 'left' | 'right'): number {
  const sizes = toolWindowSizes.value;
  const fit = fitSideWidths(
    openWindowOf('left') ? sizes.left : 0,
    openWindowOf('right') ? sizes.right : 0,
    paneWidth.value,
  );
  return fit[side];
}

function persist(): void {
  bottomHeights = reviewLayout
    ? { ...bottomHeights, review: sizes.value.bottom }
    : { ...bottomHeights, normal: sizes.value.bottom };
  writeSetting(
    KEY,
    JSON.stringify({
      open: [...openIds.value],
      bottomTab: bottomTab.value,
      left: sizes.value.left,
      right: sizes.value.right,
      bottom: bottomHeights.normal,
      bottomReview: bottomHeights.review,
      layersHeight: layersSplit.value,
    } satisfies StoredLayout),
  );
}

/**
 * Enters or leaves the review layout: the bottom window switches to the mode's stored
 * height (the review one starts at `size-tw-bottom-review`). Resizing afterwards writes to the
 * current mode's height.
 */
export function setReviewLayout(on: boolean): void {
  if (reviewLayout === on) return;
  reviewLayout = on;
  sizes.value = {
    ...sizes.value,
    bottom: on ? bottomHeights.review : bottomHeights.normal,
  };
}

export function showToolWindow(id: ToolWindowId): void {
  const side = WINDOW_SIDE[id];
  if (side === 'bottom') bottomTab.value = id;
  const next = new Set(openIds.value);
  // The left stacks Tree and Layers; the other sides show one window at a time. The
  // Catalog's left column is its own: opening it hides the two and vice versa.
  if (side !== 'left') {
    for (const other of next) if (WINDOW_SIDE[other] === side) next.delete(other);
  } else if (id === 'catalog') {
    for (const other of next) if (WINDOW_SIDE[other] === 'left') next.delete(other);
  } else {
    next.delete('catalog');
  }
  next.add(id);
  openIds.value = next;
  persist();
}

export function hideToolWindow(id: ToolWindowId): void {
  if (!openIds.value.has(id)) return;
  const next = new Set(openIds.value);
  next.delete(id);
  openIds.value = next;
  persist();
}

/** Click on the strip (or shortcut): opens, switches tab or hides the visible window. */
export function toggleToolWindow(id: ToolWindowId): void {
  if (isToolWindowOpen(id)) hideToolWindow(id);
  else showToolWindow(id);
}

/** Writes the side's size, already limited to the available space. */
export function resizeToolWindow(
  side: ToolWindowSide,
  size: number,
  space: LayoutSpace,
): void {
  const next = clampWindowSize(side, size, space);
  if (next === sizes.value[side]) return;
  sizes.value = { ...sizes.value, [side]: next };
  persist();
}

/** Writes the Layers window height, limited to the left column's space. */
export function resizeLayersWindow(size: number, columnHeight: number): void {
  const next = clampLayersHeight(size, columnHeight);
  if (next === layersSplit.value) return;
  layersSplit.value = next;
  persist();
}

/** Double click on the divider between Tree and Layers: goes back to the default height. */
export function resetLayersWindowHeight(columnHeight: number): void {
  resizeLayersWindow(px('size-tw-layers'), columnHeight);
}

/** Double click on the divider: goes back to the side's default size (the review one's, in it). */
export function resetToolWindowSize(side: ToolWindowSide, space: LayoutSpace): void {
  const size =
    side === 'bottom' && reviewLayout
      ? REVIEW_BOTTOM_DEFAULT
      : WINDOW_LIMITS[side].default;
  resizeToolWindow(side, size, space);
}

/**
 * Compact desktop (below 1200px): Details starts collapsed (B2). Only on the
 * first visit; afterwards the stored layout applies.
 */
export function collapseDetailsOnCompact(): void {
  // Re-reads storage on every call: the first `persist()` already marks the layout as
  // stored, and the first visit does not repeat when switching projects.
  if (readSetting(KEY) !== null) return;
  hideToolWindow('details');
}
