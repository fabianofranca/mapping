// Measures (screen px) and utilities shared by the renderers.
import type { Rect } from '../../model';

export const SELECTION_STROKE = 2;
/** Full opacity (not faded): not a design value, just the opposite of the theme's opacities. */
export const OPAQUE = 1;
/** Width of the halo on each side of a line (screen px). */
export const HALO_WIDTH = 1;
export const REVIEW_BADGE_SIZE = 14;
/**
 * Strike-through of a removed item's name in review (screen px): thickness and height in the
 * text box (0 = top, 1 = bottom).
 */
export const STRIKE_WIDTH = 1.5;
export const STRIKE_HEIGHT = 0.55;
/** Margin of the marking's top-left corner, for the "to review" badge and the alert (screen px). */
export const CORNER_MARGIN = 3;
/** Incomplete annotation alert, in the corner after the "to review" badge (screen px). */
export const ALERT_GLYPH = '⚠';
export const ALERT_SIZE = 13;
export const ELLIPSIS = '…';
/** Lock badge: the stroke takes this fraction of the side; the icon grid has 16 units. */
export const LOCK_GLYPH_RATIO = 0.7;
export const LOCK_GLYPH_GRID = 16;
/** Gap between the lock badge and the item's edge (screen px). */
export const LOCK_BADGE_GAP = 2;

/** Konva `fontStyle` for a numeric weight (weights 400 and 600 come from `--t-cv-*-weight`). */
export function fontStyle(weight: number, italic = false): string {
  const w = weight === 400 ? '' : String(weight);
  return [italic ? 'italic' : '', w].filter(Boolean).join(' ') || 'normal';
}

/** The same items (by reference) in the same order. */
export function sameInputs(a: readonly unknown[] | null, b: readonly unknown[]): boolean {
  return a !== null && a.length === b.length && a.every((item, i) => item === b[i]);
}

export function intersectRects(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}
