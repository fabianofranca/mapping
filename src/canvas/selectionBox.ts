// Primary selection box in screen pixels, published in `data-selection-box` (read-only
// for the e2e tests). Pure function, tested in `tests/canvas/`.
import { imageCanvasRect, type Placement, type Project, type Rect } from '../model';
import { resolveSelection, type Selection } from '../store/ui';
import { markingCanvasRect, placementOfSpace } from './markingGeometry';
import type { Viewport } from './viewport';

/**
 * Rectangle (CSS px, relative to the canvas host) of the selected marking, container or floating item,
 * with the container's placement already added. `null` with no selection, with a selected arrow
 * or with the item outside the placed view (another perspective, for example).
 */
export function selectionScreenBox(
  project: Project | null,
  selection: Selection,
  placements: ReadonlyMap<string, Placement>,
  viewport: Viewport,
): Rect | null {
  const selected = resolveSelection(project, selection);
  if (!selected || selected.kind === 'arrow') return null;
  let canvas: Rect;
  if (selected.kind === 'image') {
    const placement = placements.get(selected.image.id);
    if (!placement) return null;
    canvas = imageCanvasRect(selected.image, placement);
  } else {
    const placement = placementOfSpace(placements, selected.marking.containerId);
    if (!placement) return null;
    canvas = markingCanvasRect(placement, selected.marking.rect);
  }
  return {
    x: canvas.x * viewport.scale + viewport.x,
    y: canvas.y * viewport.scale + viewport.y,
    width: canvas.width * viewport.scale,
    height: canvas.height * viewport.scale,
  };
}

const round2 = (n: number): string => String(Math.round(n * 100) / 100);

/** `"<left> <top> <width> <height>"` with 2 decimals; `null` becomes an absent attribute. */
export function formatSelectionBox(box: Rect | null): string | null {
  return box
    ? `${round2(box.x)} ${round2(box.y)} ${round2(box.width)} ${round2(box.height)}`
    : null;
}

/** `"<x> <y> <scale>"`: translation with 2 decimals and scale without rounding. */
export function formatViewport(v: Viewport): string {
  return `${round2(v.x)} ${round2(v.y)} ${String(v.scale)}`;
}
