// Box, in canvas space, that wraps all the selected items (Frame selection).
// Pure function, tested in `tests/canvas/`.
import { imageCanvasRect, type Project, type Rect } from '../model';
import { resolveSelection, type SelectionItem } from '../store/ui';
import { arrowShape } from './arrowGeometry';
import { markingCanvasRect } from './markingGeometry';
import { unionRect } from './minimap';

/** Drawn box of an item (marking, container, floating or arrow), or `null` if it does not exist. */
function itemCanvasRect(project: Project, item: SelectionItem): Rect | null {
  const selected = resolveSelection(project, item);
  if (!selected) return null;
  if (selected.kind === 'arrow')
    return arrowShape(project, selected.arrow)?.bounds ?? null;
  if (selected.kind === 'marking') {
    return markingCanvasRect(selected.space.placement, selected.marking.rect);
  }
  return imageCanvasRect(selected.image, selected.image.placement);
}

/** Union of the items' boxes; `null` without any item that exists. */
export function selectionCanvasBounds(
  project: Project | null,
  items: readonly SelectionItem[],
): Rect | null {
  if (!project) return null;
  let bounds: Rect | null = null;
  for (const item of items) {
    const rect = itemCanvasRect(project, item);
    if (rect) bounds = bounds ? unionRect(bounds, rect) : rect;
  }
  return bounds;
}
