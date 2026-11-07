// Seleção por retângulo (SM2): quais itens o retângulo de Shift+arrasto soma à seleção.
// Funções puras (sem DOM nem Konva), testadas em `tests/canvas/input/marquee.test.ts`.
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

/** O que o retângulo enxerga além do projeto: a visibilidade e as setas desenhadas. */
export interface MarqueeView {
  /** Visibilidade de cada marcação (o mesmo mapa do clique): `hidden` não entra. */
  readonly visibility: ReadonlyMap<string, MarkingVisibility>;
  /** As setas desenhadas; sem "Mostrar setas" ou no modo visualização, a lista vai vazia. */
  readonly arrows: readonly ArrowShape[];
}

/** O retângulo com os cantos `a` e `b` (canvas), em qualquer direção, sem arredondar. */
export function rectFromCorners(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x, b.x) - x, height: Math.max(a.y, b.y) - y };
}

/**
 * Todos os itens na ordem da janela Árvore (`src/ui/MarkingTree.tsx`): primeiro o canvas, com
 * cada marcação do canvas seguida das filhas, dos containers que ela contém e das setas que saem
 * dela (as flutuantes são marcações do canvas, na ordem do array); depois os containers sem pai,
 * cada um com as marcações da raiz dele. A seta não tem lugar próprio: vem sob a marcação de
 * origem, como na Árvore.
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

/** Todos os pontos do traço da seta cabem em `rect`. */
function arrowInside(rect: Rect, shape: ArrowShape): boolean {
  const points = [...shape.route.points, ...shape.path];
  return points.every((p) => containsRect(rect, { x: p.x, y: p.y, width: 0, height: 0 }));
}

/**
 * Os itens que o retângulo `rect` (canvas) soma à seleção: os **inteiramente dentro** dele
 * (a borda que cruza deixa de fora), visíveis (`visibility`; trancado entra) e só os de fora: o
 * que o arrasto conjunto não levaria sozinho (`movingItems`) não entra, porque quem o leva é o
 * item que o contém (marcação de container que entrou, descendente de marcação que entrou). No
 * canvas nada leva nada. As setas ficam. Ordem da Árvore (`treeOrder`).
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
  return candidates.filter(
    (item) =>
      item.kind === 'arrow' ||
      moving.some((m) => m.kind === item.kind && m.id === item.id),
  );
}
