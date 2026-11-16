// Pure framing of the cross-page preview (stage #883, PG3): which item the preview highlights, the
// canvas rectangle it occupies and the viewport that centers it. No Konva.
import {
  imageCanvasRect,
  projectIndex,
  type Project,
  type ProjectContainer,
  type Rect,
} from '../model';
import type { Selection } from '../store/ui';
import { arrowShape } from './arrowGeometry';
import { imagesBounds } from './imageGeometry';
import { markingCanvasRect } from './markingGeometry';
import { clampZoom, fitRect, type Size, type Viewport } from './viewport';

/** Screen pixels left around the item when it is framed. */
export const PREVIEW_ITEM_PADDING = 48;

/** The selection that highlights `itemId` (container, marking or arrow); `null` if it is not there. */
export function previewSelection(project: Project, itemId: string): Selection {
  const index = projectIndex(project);
  if (index.markings.has(itemId)) return { kind: 'marking', id: itemId };
  if (index.containers.has(itemId)) return { kind: 'image', id: itemId };
  if (index.arrows.has(itemId)) return { kind: 'arrow', id: itemId };
  return null;
}

/** Canvas rectangle of the item: a canvas marking, a marking in its container, a container or an arrow's stroke box. */
export function previewItemRect(project: Project, itemId: string): Rect | null {
  const selection = previewSelection(project, itemId);
  if (!selection) return null;
  const index = projectIndex(project);
  if (selection.kind === 'image') return containerRect(index.containers.get(itemId));
  if (selection.kind === 'arrow') {
    const arrow = index.arrows.get(itemId);
    return (arrow && arrowShape(project, arrow)?.bounds) || null;
  }
  const marking = index.markings.get(itemId);
  if (!marking) return null;
  if (marking.containerId === null) return marking.rect;
  const container = index.containers.get(marking.containerId);
  return container ? markingCanvasRect(container.placement, marking.rect) : null;
}

function containerRect(image: ProjectContainer | undefined): Rect | null {
  return image ? imageCanvasRect(image, image.placement) : null;
}

/**
 * Viewport that centers the item: the fit of the item (with `PREVIEW_ITEM_PADDING`), never above 1
 * and never below the fit of the whole group, so the context stays recognizable.
 */
export function previewViewport(project: Project, itemId: string, size: Size): Viewport {
  const bounds = imagesBounds(project.containers, project.markings);
  const item = previewItemRect(project, itemId) ?? bounds;
  if (!item) return { x: size.width / 2, y: size.height / 2, scale: 1 };
  const own = fitRect(item, size, PREVIEW_ITEM_PADDING).scale;
  const group = bounds ? fitRect(bounds, size).scale : own;
  const scale = clampZoom(Math.min(Math.max(own, Math.min(group, 1)), 1));
  return {
    x: size.width / 2 - (item.x + item.width / 2) * scale,
    y: size.height / 2 - (item.y + item.height / 2) * scale,
    scale,
  };
}
