import { signal, type Signal } from '@preact/signals';
import type { Rect } from '../model';
import type { Size, Viewport } from './viewport';

// View state that the interface reads (status bar, minimap and zoom field): the
// `CanvasController` writes here, and the components only read. It lives outside the
// project and the undo, and the cursor is updated at most once per frame.

/** Pointer position in pixels of the image under it. */
export interface CanvasCursor {
  readonly containerId: string;
  readonly x: number;
  readonly y: number;
}

export interface CanvasViewState {
  readonly viewport: Signal<Viewport>;
  readonly size: Signal<Size>;
  /** Area occupied by all the images (canvas units); `null` without images. */
  readonly bounds: Signal<Rect | null>;
  /** Image pixel under the mouse; `null` outside any image (or on touch). */
  readonly cursor: Signal<CanvasCursor | null>;
}

export function createCanvasViewState(): CanvasViewState {
  return {
    viewport: signal<Viewport>({ x: 0, y: 0, scale: 1 }),
    size: signal<Size>({ width: 0, height: 0 }),
    bounds: signal<Rect | null>(null),
    cursor: signal<CanvasCursor | null>(null),
  };
}

/** Same cursor (avoids writing the signal on every idle frame). */
export function sameCursor(a: CanvasCursor | null, b: CanvasCursor | null): boolean {
  if (a === null || b === null) return a === b;
  return a.containerId === b.containerId && a.x === b.x && a.y === b.y;
}
