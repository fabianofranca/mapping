// Rectangle selection (SM2): which items the Shift+drag rectangle adds to the selection.
// Pure functions (no DOM or Konva), tested in `tests/canvas/input/marquee.test.ts`.
import {
  arrowsOf,
  containsRect,
  imageCanvasRect,
  markingCanvasRectOf,
  movingItems,
  projectIndex,
  type Marking,
  type MarkingVisibility,
  type Project,
  type ProjectContainer,
  type Rect,
} from '../../model';
import type { SelectionItem } from '../../store/ui';
import type { ArrowShape } from '../arrowGeometry';
import type { Point } from '../viewport';

/** What the rectangle sees beyond the project: the visibility and the drawn arrows. */
export interface MarqueeView {
  /** Visibility of each marking (the same map as the click): `hidden` is not included. */
  readonly visibility: ReadonlyMap<string, MarkingVisibility>;
  /** The drawn arrows; without "Show arrows" or in view mode, the list is empty. */
  readonly arrows: readonly ArrowShape[];
}

/** The rectangle with the corners `a` and `b` (canvas), in any direction, without rounding. */
export function rectFromCorners(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x, b.x) - x, height: Math.max(a.y, b.y) - y };
}

/**
 * All items in the order of the Tree window (`src/ui/MarkingTree.tsx`): first the canvas, with
 * each canvas marking followed by its children, the containers it contains and the arrows leaving
 * it (floating ones are canvas markings, in array order); then the containers without a parent,
 * each with the markings of its root. The arrow has no place of its own: it comes under the
 * source marking, as in the Tree.
 */
export function treeOrder(project: Project): SelectionItem[] {
  const index = projectIndex(project);
  const roots = new Map<string | null, Marking[]>();
  for (const m of index.children.get(null) ?? []) {
    const list = roots.get(m.containerId);
    if (list) list.push(m);
    else roots.set(m.containerId, [m]);
  }
  const out: SelectionItem[] = [];
  const seen = new Set<string>();
  const visitContainer = (c: ProjectContainer): void => {
    if (!seen.has(`i:${c.id}`)) {
      seen.add(`i:${c.id}`);
      out.push({ kind: 'image', id: c.id });
      for (const m of roots.get(c.id) ?? []) visitMarking(m);
    }
  };
  const visitMarking = (m: Marking): void => {
    if (seen.has(`m:${m.id}`)) return;
    seen.add(`m:${m.id}`);
    out.push({ kind: 'marking', id: m.id });
    for (const child of index.children.get(m.id) ?? []) visitMarking(child);
    if (!m.floating) {
      for (const c of index.containersByParent.get(m.id) ?? []) visitContainer(c);
    }
    for (const a of arrowsOf(project, m.id).outgoing) {
      out.push({ kind: 'arrow', id: a.id });
    }
  };
  for (const m of roots.get(null) ?? []) visitMarking(m);
  for (const c of index.containersByParent.get(null) ?? []) visitContainer(c);
  return out;
}

/** All the points of the arrow's stroke fit in `rect`. */
function arrowInside(rect: Rect, shape: ArrowShape): boolean {
  const points = [...shape.route.points, ...shape.path];
  return points.every((p) => containsRect(rect, { x: p.x, y: p.y, width: 0, height: 0 }));
}

/**
 * The items that the rectangle `rect` (canvas) adds to the selection: those **entirely inside** it
 * (a border that crosses leaves it out), visible (`visibility`; locked is included) and only the outermost: what
 * the joint drag would not carry on its own (`movingItems`) is not included, because whoever carries it is the
 * item that contains it (container marking that came in, descendant of a marking that came in). On the
 * canvas nothing carries anything. The arrows stay. Tree order (`treeOrder`).
 */
export function marqueeItems(
  project: Project,
  rect: Rect,
  view: MarqueeView,
): SelectionItem[] {
  const index = projectIndex(project);
  const arrows = new Set(
    view.arrows.filter((s) => arrowInside(rect, s)).map((s) => s.arrow.id),
  );
  const candidates = treeOrder(project).filter((item) => {
    if (item.kind === 'arrow') return arrows.has(item.id);
    if (item.kind === 'image') {
      const c = index.containers.get(item.id);
      return c !== undefined && containsRect(rect, imageCanvasRect(c, c.placement));
    }
    const m = index.markings.get(item.id);
    return (
      m !== undefined &&
      view.visibility.get(item.id) !== 'hidden' &&
      containsRect(rect, markingCanvasRectOf(project, m))
    );
  });
  const moving = movingItems(project, candidates);
  const movingKeys = new Set(moving.map((m) => `${m.kind}:${m.id}`));
  return candidates.filter(
    (item) => item.kind === 'arrow' || movingKeys.has(`${item.kind}:${item.id}`),
  );
}
