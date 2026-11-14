// Minimap calculations (proposal P3): image area → minimap box and back.
// Pure functions, tested in `tests/canvas/minimap.test.ts`.
import { boundingBox, type Rect } from '../model';
import { visibleArea } from './frame';
import type { Point, Size, Viewport } from './viewport';

export interface MinimapLayout {
  /** Minimap scale: minimap pixels per canvas unit. */
  readonly scale: number;
  /** Minimap area, in pixels (fits inside `box`, in the content's proportion). */
  readonly size: Size;
  /** Drawn content (the images plus the visible part). */
  readonly content: Rect;
}

/** Rectangle that contains `a` and `b`. */
export function unionRect(a: Rect, b: Rect): Rect {
  return boundingBox([a, b]) ?? a;
}

/** Visible part of the canvas (canvas units) for a viewport and a screen size. */
export function visibleRect(viewport: Viewport, size: Size): Rect {
  return visibleArea(size, viewport);
}

/**
 * Fits the images (and the visible part, so the frame never leaves the map) into a
 * box of at most `box` pixels, keeping the proportion.
 */
export function minimapLayout(
  bounds: Rect,
  visible: Rect,
  box: Size,
): MinimapLayout | null {
  const content = unionRect(bounds, visible);
  if (content.width <= 0 || content.height <= 0) return null;
  const scale = Math.min(box.width / content.width, box.height / content.height);
  return {
    scale,
    size: { width: content.width * scale, height: content.height * scale },
    content,
  };
}

/** Canvas rectangle in minimap pixels. */
export function toMinimap(layout: MinimapLayout, rect: Rect): Rect {
  const { scale, content } = layout;
  return {
    x: (rect.x - content.x) * scale,
    y: (rect.y - content.y) * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

/** Point clicked on the minimap (pixels, relative to it) → canvas point. */
export function fromMinimap(layout: MinimapLayout, p: Point): Point {
  return {
    x: layout.content.x + p.x / layout.scale,
    y: layout.content.y + p.y / layout.scale,
  };
}
