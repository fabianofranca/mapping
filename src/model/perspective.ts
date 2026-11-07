import { imageCanvasRect, toCanvasRect } from './geometry';
import { projectIndex, type ProjectIndex } from './projectIndex';
import type {
  Arrow,
  Marking,
  Perspective,
  Project,
  ProjectContainer,
  Rect,
} from './types';

// Perspectivas (v16, etapa #659): o projeto à vista de uma perspectiva e as consultas de raiz.
// A Principal é o próprio projeto (perspectiva `null` nas funções); uma perspectiva só diz quais
// raízes aparecem, onde ficam no canvas e que camadas ficam escondidas. O conteúdo é o do projeto.
// Raiz: container sem pai, marcação do canvas sem pai ou flutuante (`projectIndex(p).roots`).

/** Posição no canvas (canto de cima à esquerda, em unidades do canvas). */
export interface CanvasPosition {
  readonly x: number;
  readonly y: number;
}

/** Retângulo no canvas de uma marcação (o do container dela converte o `rect`). */
function markingFootprint(index: ProjectIndex, marking: Marking): Rect {
  const container =
    marking.containerId === null ? undefined : index.containers.get(marking.containerId);
  return container ? toCanvasRect(container.placement, marking.rect) : marking.rect;
}

/**
 * A pegada do item no canvas: o retângulo da imagem do container, ou o da marcação em unidades
 * do canvas. `null` para um id que não é de container nem de marcação.
 */
export function rootFootprint(p: Project, id: string): Rect | null {
  const index = projectIndex(p);
  const container = index.containers.get(id);
  if (container) return imageCanvasRect(container, container.placement);
  const marking = index.markings.get(id);
  return marking ? markingFootprint(index, marking) : null;
}

/**
 * Onde o item está no canvas (o canto de cima à esquerda da pegada): `placement` do container;
 * `rect` da marcação do canvas; `placement + rect × escala` da marcação de container.
 */
export function rootPosition(p: Project, id: string): CanvasPosition | null {
  const rect = rootFootprint(p, id);
  return rect ? { x: rect.x, y: rect.y } : null;
}

/** A raiz do container ou da marcação (`null` se o id não existe). */
export function perspectiveRootOf(p: Project, id: string): string | null {
  return projectIndex(p).rootOf.get(id) ?? null;
}

/** `true` se `id` é um container ou uma marcação que é raiz. */
export function isRootId(p: Project, id: string): boolean {
  return projectIndex(p).rootOf.get(id) === id;
}

/** `true` se a raiz é uma marcação (e não um container): a posição dela é inteira. */
export function isMarkingRoot(p: Project, id: string): boolean {
  const index = projectIndex(p);
  return !index.containers.has(id) && index.markings.has(id);
}

// ---------------------------------------------------------------------------
// O projeto à vista

/** Deslocamento de cada raiz presente na vista (a primeira entrada de cada raiz vale). */
function viewShifts(p: Project, perspective: Perspective): Map<string, CanvasPosition> {
  const shifts = new Map<string, CanvasPosition>();
  for (const item of perspective.items) {
    if (shifts.has(item.root) || !isRootId(p, item.root)) continue;
    const at = rootPosition(p, item.root) as CanvasPosition;
    // Posição de marcação é inteira: o deslocamento também.
    const whole = isMarkingRoot(p, item.root);
    const dx = item.x - at.x;
    const dy = item.y - at.y;
    shifts.set(
      item.root,
      whole ? { x: Math.round(dx) || 0, y: Math.round(dy) || 0 } : { x: dx, y: dy },
    );
  }
  return shifts;
}

const isStill = (d: CanvasPosition) => d.x === 0 && d.y === 0;

/** A seta da vista: pontos mantidos, deslocados ou apagados conforme o espaço das pontas. */
function arrowInView(
  index: ProjectIndex,
  arrow: Arrow,
  shift: CanvasPosition,
): Arrow | null {
  const from = index.markings.get(arrow.from);
  const to = index.markings.get(arrow.to);
  if (!from || !to) return null;
  if (arrow.points.length === 0) return arrow;
  // Pontos em pixels do container: as pontas no mesmo container andam juntas com ele.
  if (from.containerId !== null && from.containerId === to.containerId) return arrow;
  if (index.rootOf.get(from.id) !== index.rootOf.get(to.id))
    return { ...arrow, points: [] };
  if (isStill(shift)) return arrow;
  const points = arrow.points.map((pt) => ({ x: pt.x + shift.x, y: pt.y + shift.y }));
  return { ...arrow, points };
}

function movedContainer(c: ProjectContainer, d: CanvasPosition): ProjectContainer {
  if (isStill(d)) return c;
  return {
    ...c,
    placement: { ...c.placement, x: c.placement.x + d.x, y: c.placement.y + d.y },
  };
}

function movedMarking(m: Marking, d: CanvasPosition): Marking {
  if (isStill(d) || m.containerId !== null) return m;
  return { ...m, rect: { ...m.rect, x: m.rect.x + d.x, y: m.rect.y + d.y } };
}

function buildView(p: Project, perspective: Perspective): Project {
  const index = projectIndex(p);
  const shifts = viewShifts(p, perspective);
  const shiftOf = (id: string) => shifts.get(index.rootOf.get(id) ?? '');

  const containers = p.containers.flatMap((c) => {
    const d = shiftOf(c.id);
    return d ? [movedContainer(c, d)] : [];
  });
  const markings = p.markings.flatMap((m) => {
    const d = shiftOf(m.id);
    return d ? [movedMarking(m, d)] : [];
  });
  const arrows = p.arrows.flatMap((a) => {
    const d = shiftOf(a.from);
    const other = shiftOf(a.to);
    const next = d && other ? arrowInView(index, a, d) : null;
    return next ? [next] : [];
  });
  const kept = new Set<string>([...markings, ...arrows].map((x) => x.id));
  const annotations = p.annotations.filter((a) => kept.has(a.markingId));
  return { ...p, containers, markings, arrows, annotations };
}

const viewCache = new WeakMap<Project, WeakMap<Perspective, Project>>();

/**
 * O projeto como a perspectiva o mostra (decisão 3): só as raízes de `items` que existem e são
 * raiz, cada uma com o grupo dela, deslocadas para a posição do item; as setas com as duas
 * pontas na vista (os pontos de passagem acompanham); as anotações do que ficou. Nada do
 * pertencimento muda (`parentId`, `containerId`). A Principal (`null`) é o próprio projeto.
 * Memoizado: o mesmo projeto e o mesmo objeto de perspectiva dão o mesmo resultado.
 */
export function perspectiveView(p: Project, perspective: Perspective | null): Project {
  if (perspective === null) return p;
  let byPerspective = viewCache.get(p);
  if (!byPerspective) viewCache.set(p, (byPerspective = new WeakMap()));
  let view = byPerspective.get(perspective);
  if (!view) byPerspective.set(perspective, (view = buildView(p, perspective)));
  return view;
}

const rootSetCache = new WeakMap<Perspective, ReadonlySet<string>>();

/** As raízes de `items`, em conjunto (memoizado por perspectiva). */
export function perspectiveRootSet(perspective: Perspective): ReadonlySet<string> {
  let set = rootSetCache.get(perspective);
  if (!set) {
    set = new Set(perspective.items.map((item) => item.root));
    rootSetCache.set(perspective, set);
  }
  return set;
}

/**
 * A seta aparece na perspectiva? Na Principal sempre; senão, se as raízes das duas pontas estão
 * em `items` (decisão 7). Seta inexistente não aparece.
 */
export function arrowShownIn(
  p: Project,
  perspective: Perspective | null,
  arrowId: string,
): boolean {
  const index = projectIndex(p);
  const arrow = index.arrows.get(arrowId);
  if (!arrow) return false;
  if (perspective === null) return true;
  const roots = perspectiveRootSet(perspective);
  const from = index.rootOf.get(arrow.from);
  const to = index.rootOf.get(arrow.to);
  return from !== undefined && to !== undefined && roots.has(from) && roots.has(to);
}

/**
 * Quantos containers-raiz e quantas marcações-raiz a perspectiva mostra (itens inexistentes ou
 * que deixaram de ser raiz não contam). O texto ("N telas · N tabelas") é da interface.
 */
export function perspectiveContentCount(
  p: Project,
  perspective: Perspective,
): { readonly containers: number; readonly markings: number } {
  const index = projectIndex(p);
  let containers = 0;
  let markings = 0;
  for (const root of perspectiveRootSet(perspective)) {
    if (index.rootOf.get(root) !== root) continue;
    if (index.containers.has(root)) containers++;
    else markings++;
  }
  return { containers, markings };
}
