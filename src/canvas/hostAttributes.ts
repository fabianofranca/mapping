// Text of the test attributes of `.canvas-host` (`data-selection`, `data-arrow-handles` and
// `data-container-boxes`), read-only for the tests and for the cloud tester. Pure functions,
// without Konva, tested in `tests/canvas/hostAttributes.test.ts`. Numbers with 2 decimals, like
// `formatSelectionBox`.
import {
  imageCanvasRect,
  type Placement,
  type Project,
  type ProjectContainer,
} from '../model';
import { resolveSelection, type Selection } from '../store/ui';
import { arrowHandles, type ArrowHandle, type ArrowShape } from './arrowGeometry';
import type { Viewport } from './viewport';

const round2 = (n: number): string => String(Math.round(n * 100) / 100);

/** `"<type> <id>"` of the primary selection (`image`, `marking` or `arrow`); `null` if it does not resolve. */
export function formatSelection(
  project: Project | null,
  selection: Selection,
): string | null {
  if (!selection || !resolveSelection(project, selection)) return null;
  return `${selection.kind} ${selection.id}`;
}

function handleName(handle: ArrowHandle): string {
  return handle.kind === 'end' ? handle.end : `${handle.kind}${handle.index}`;
}

/**
 * `"<name> <x> <y>"` separated by `;`, in CSS px relative to the host's corner: `center` (the middle of the
 * stroke, where the click catches the arrow) and the `arrowHandles` handles in their order.
 */
export function formatArrowHandles(shape: ArrowShape, view: Viewport): string {
  const entry = (name: string, at: { x: number; y: number }) =>
    `${name} ${round2(at.x * view.scale + view.x)} ${round2(at.y * view.scale + view.y)}`;
  return [
    entry('center', shape.label),
    ...arrowHandles(shape, view.scale).map((h) => entry(handleName(h), h.at)),
  ].join(';');
}

/**
 * `"<id> <x> <y> <width> <height> <scale>"` per placed container, em unidades do canvas e na
 * order of `containers`, separated by `;`. `null` without a placed container.
 */
export function formatContainerBoxes(
  containers: readonly ProjectContainer[],
  placements: ReadonlyMap<string, Placement>,
): string | null {
  const entries: string[] = [];
  for (const container of containers) {
    const placement = placements.get(container.id);
    if (!placement) continue;
    const r = imageCanvasRect(container, placement);
    entries.push(
      [container.id, r.x, r.y, r.width, r.height, placement.scale]
        .map((v) => (typeof v === 'number' ? round2(v) : v))
        .join(' '),
    );
  }
  return entries.length > 0 ? entries.join(';') : null;
}
