import { IMAGE_GAP, nearestFreeSpot } from './containers';
import { fail } from './errors';
import { bottom, boundingBox, imageCanvasRect, rectsOverlap, right } from './geometry';
import { markingCanvasRectOf, settleHierarchy } from './hierarchySettle';
import { floatingSpotNear } from './markings';
import {
  isMarkingRoot,
  perspectiveView,
  rootFootprint,
  rootPosition,
  type CanvasPosition,
} from './perspective';
import { projectIndex } from './projectIndex';
import type { Arrival, Arrow, Marking, Perspective, Project, Rect } from './types';

// Busca de lugar de uma raiz numa vista e chegada à Principal (v16, decisão 8). Uma "vista" é um
// projeto: a Principal (o próprio projeto) ou o projeto à vista de uma perspectiva
// (`perspectiveView`). As posições são do canvas.

/** Onde a raiz fica na vista de destino e por quê. */
export interface RootPlacement {
  readonly x: number;
  readonly y: number;
  /**
   * `near`: na mesma distância que tinha da referência; `occupied`: o lugar estava ocupado, foi
   * ao livre mais próximo; `arrival-area`: sem referência, foi à área de chegada.
   */
  readonly kind: 'near' | 'occupied' | 'arrival-area';
  /** Raiz de referência (a outra ponta da seta), ou `null` na área de chegada. */
  readonly referenceId: string | null;
}

/** A raiz de referência de uma busca e a marcação dela em que a seta termina. */
interface Reference {
  readonly rootId: string;
  readonly endId: string;
}

/** Ids da raiz e de tudo o que é dela na vista (containers e marcações). */
function memberIds(view: Project, rootId: string): string[] {
  const group = projectIndex(view).rootMembers.get(rootId);
  if (!group) return [];
  return [...group.containers.map((c) => c.id), ...group.markings.map((m) => m.id)];
}

/**
 * Obstáculos de uma busca de lugar: as pegadas dos containers, das flutuantes e das marcações do
 * canvas não flutuantes (nunca se cai dentro de uma delas), menos os membros da própria raiz.
 */
function obstaclesOf(view: Project, exclude: ReadonlySet<string>): Rect[] {
  const obstacles: Rect[] = [];
  for (const c of view.containers) {
    if (!exclude.has(c.id)) obstacles.push(imageCanvasRect(c, c.placement));
  }
  for (const m of view.markings) {
    if (m.containerId === null && !exclude.has(m.id)) obstacles.push(m.rect);
  }
  return obstacles;
}

/** A outra ponta de `arrow` quando ela liga a raiz `rootId` a outra raiz; senão `null`. */
function otherEnd(
  arrow: Arrow,
  roots: ReadonlyMap<string, string>,
  rootId: string,
): Reference | null {
  const from = roots.get(arrow.from);
  const to = roots.get(arrow.to);
  if (from === rootId && to !== undefined && to !== rootId) {
    return { rootId: to, endId: arrow.to };
  }
  if (to === rootId && from !== undefined && from !== rootId) {
    return { rootId: from, endId: arrow.from };
  }
  return null;
}

/**
 * A primeira seta da origem (na ordem do array) que liga a raiz a outra raiz presente também no
 * destino: a outra raiz e a marcação dela em que a seta termina.
 */
function findReference(
  target: Project,
  source: Project,
  rootId: string,
): Reference | null {
  const sourceRoots = projectIndex(source).rootOf;
  const targetRoots = projectIndex(target).rootOf;
  for (const arrow of source.arrows) {
    const ref = otherEnd(arrow, sourceRoots, rootId);
    if (ref && targetRoots.get(ref.rootId) === ref.rootId) return ref;
  }
  return null;
}

function overlapsAny(rect: Rect, obstacles: readonly Rect[]): Rect | undefined {
  return obstacles.find((o) => rectsOverlap(rect, o));
}

interface Seek {
  readonly obstacles: readonly Rect[];
  readonly width: number;
  readonly height: number;
  /** Marcação: posição inteira (`ceil`/`round`). */
  readonly whole: boolean;
  readonly floating: boolean;
}

/** O ponto da outra ponta da seta, no destino, para ancorar uma flutuante. */
function anchorOf(target: Project, endId: string): { anchor: Rect; start: Rect } {
  const index = projectIndex(target);
  const end = index.markings.get(endId) as Marking;
  const start = markingCanvasRectOf(target, end);
  const container =
    end.containerId === null ? undefined : index.containers.get(end.containerId);
  return {
    anchor: container ? imageCanvasRect(container, container.placement) : start,
    start,
  };
}

function placeNear(
  target: Project,
  seek: Seek,
  desired: CanvasPosition,
  ref: Reference,
): RootPlacement {
  const spot = { x: desired.x, y: desired.y, width: seek.width, height: seek.height };
  const referenceId = ref.rootId;
  if (!overlapsAny(spot, seek.obstacles))
    return { x: spot.x, y: spot.y, kind: 'near', referenceId };
  if (seek.floating) {
    const { anchor, start } = anchorOf(target, ref.endId);
    const free = floatingSpotNear(seek.obstacles, anchor, start, spot);
    return { x: free.x, y: free.y, kind: 'occupied', referenceId };
  }
  const free = nearestFreeSpot(seek.obstacles, seek.width, seek.height, desired);
  const whole = seek.whole ? { x: Math.round(free.x), y: Math.round(free.y) } : free;
  return { ...whole, kind: 'occupied', referenceId };
}

/** Pegadas das raízes do destino que passam por `keep`. */
function rootRects(target: Project, keep: (id: string) => boolean): Rect[] {
  const rects: Rect[] = [];
  for (const id of projectIndex(target).roots) {
    const rect = keep(id) ? rootFootprint(target, id) : null;
    if (rect) rects.push(rect);
  }
  return rects;
}

/**
 * A coluna da área de chegada: à direita do conteúdo (as raízes com marca não contam) a partir do
 * topo dele. Na Principal (`from` informado), agrupada pela origem: a mesma origem empilha
 * embaixo da mais baixa das suas, outra origem abre uma coluna nova à direita de todas as raízes.
 */
function arrivalColumn(
  target: Project,
  rootId: string,
  from: string | undefined,
): CanvasPosition {
  const index = projectIndex(target);
  const marked = new Map<string, Arrival>();
  if (from !== undefined) {
    for (const a of target.arrivals) {
      if (a.root !== rootId && index.rootOf.get(a.root) === a.root) marked.set(a.root, a);
    }
  }
  const content = rootRects(target, (id) => id !== rootId && !marked.has(id));
  const top = content.length > 0 ? Math.min(...content.map((r) => r.y)) : 0;
  const lowest = [...marked.values()]
    .filter((a) => a.from === from)
    .map((a) => rootFootprint(target, a.root) as Rect)
    .reduce<Rect | null>((a, b) => (a === null || bottom(b) > bottom(a) ? b : a), null);
  if (lowest) return { x: lowest.x, y: bottom(lowest) + IMAGE_GAP };
  const all = rootRects(target, (id) => id !== rootId);
  return { x: all.length > 0 ? Math.max(...all.map(right)) + IMAGE_GAP : 0, y: top };
}

function placeInArrivalArea(
  target: Project,
  seek: Seek,
  rootId: string,
  from: string | undefined,
): RootPlacement {
  const snap = seek.whole ? Math.ceil : (v: number) => v;
  const column = arrivalColumn(target, rootId, from);
  let rect: Rect = {
    x: snap(column.x),
    y: snap(column.y),
    width: seek.width,
    height: seek.height,
  };
  for (
    let o = overlapsAny(rect, seek.obstacles);
    o;
    o = overlapsAny(rect, seek.obstacles)
  ) {
    rect = { ...rect, y: snap(bottom(o) + IMAGE_GAP) };
  }
  return { x: rect.x, y: rect.y, kind: 'arrival-area', referenceId: null };
}

/**
 * Onde a raiz `rootId` (que está na vista `source`) fica na vista `target`, onde ela ainda não
 * está (ou está longe: seus membros não contam como obstáculo).
 *
 * Com referência (a primeira seta, na ordem do array, que liga a raiz a outra raiz presente nas
 * duas vistas), vai para a mesma distância que tinha dela: `near`; se aí sobrepõe algo, vai para
 * o lugar livre mais próximo (`occupied`; a flutuante, para a margem da ponta da seta). Sem
 * referência vai para a área de chegada: uma coluna à direita de tudo, a partir do topo
 * (`arrival-area`); com `options.arrivalsFrom` (a Principal), agrupada por origem. Nunca cai
 * dentro de uma marcação do canvas. Posição de marcação é inteira.
 */
export function placeRootIn(
  target: Project,
  source: Project,
  rootId: string,
  options?: { readonly arrivalsFrom?: string },
): RootPlacement {
  const seek = seekFor(target, source, rootId);
  const ref = findReference(target, source, rootId);
  const desired = ref ? desiredNear(target, source, rootId, ref, seek.whole) : null;
  if (!ref || !desired)
    return placeInArrivalArea(target, seek, rootId, options?.arrivalsFrom);
  return placeNear(target, seek, desired, ref);
}

/** Tamanho, tipo e obstáculos da busca de lugar da raiz. */
function seekFor(target: Project, source: Project, rootId: string): Seek {
  const size = rootFootprint(source, rootId) ?? rootFootprint(target, rootId);
  if (!size) fail('not-found', rootId);
  const exclude = new Set([...memberIds(source, rootId), ...memberIds(target, rootId)]);
  const marking =
    projectIndex(source).markings.get(rootId) ??
    projectIndex(target).markings.get(rootId);
  return {
    obstacles: obstaclesOf(target, exclude),
    width: size.width,
    height: size.height,
    whole: isMarkingRoot(source, rootId) || isMarkingRoot(target, rootId),
    floating: marking?.floating === true,
  };
}

/**
 * Onde a raiz fica no destino para manter a distância que tem da raiz de referência na origem;
 * `null` se alguma das posições não existe. Posição de marcação é inteira.
 */
function desiredNear(
  target: Project,
  source: Project,
  rootId: string,
  ref: Reference,
  whole: boolean,
): CanvasPosition | null {
  const own = rootPosition(source, rootId);
  const there = rootPosition(source, ref.rootId);
  const here = rootPosition(target, ref.rootId);
  if (!own || !there || !here) return null;
  const x = here.x + own.x - there.x;
  const y = here.y + own.y - there.y;
  return whole ? { x: Math.round(x), y: Math.round(y) } : { x, y };
}

/** Move só a raiz para `at` (container: `placement`; marcação: `rect`). */
function moveRootTo(p: Project, rootId: string, at: CanvasPosition): Project {
  if (projectIndex(p).containers.has(rootId)) {
    return {
      ...p,
      containers: p.containers.map((c) =>
        c.id === rootId ? { ...c, placement: { ...c.placement, x: at.x, y: at.y } } : c,
      ),
    };
  }
  return {
    ...p,
    markings: p.markings.map((m) =>
      m.id === rootId ? { ...m, rect: { ...m.rect, x: at.x, y: at.y } } : m,
    ),
  };
}

/**
 * Uma raiz criada fora da Principal chega a ela (decisão 8). A raiz já existe em `p` (a store a
 * criou) e está em `from.items`. Calcula o lugar com `placeRootIn(p, perspectiveView(p, from))`,
 * move a raiz (só ela), assenta e SÓ DEPOIS acrescenta a marca `Veio de…` (substitui a anterior
 * da mesma raiz): o assentar tira a marca de quem mudou de lugar. `kind` e `referenceId` são para
 * a interface avisar onde a raiz foi parar; não são gravados.
 */
export function arriveInPrincipal(
  p: Project,
  rootId: string,
  from: Perspective,
): { project: Project; kind: RootPlacement['kind']; referenceId: string | null } {
  const roots = projectIndex(p).rootOf;
  if (!roots.has(rootId)) fail('not-found', rootId);
  if (roots.get(rootId) !== rootId || !from.items.some((item) => item.root === rootId)) {
    fail('not-root', rootId);
  }
  const place = placeRootIn(p, perspectiveView(p, from), rootId, {
    arrivalsFrom: from.id,
  });
  const settled = settleHierarchy(moveRootTo(p, rootId, place), { before: p });
  const arrival: Arrival = { root: rootId, from: from.id, fromName: from.name };
  const arrivals = [...settled.arrivals.filter((a) => a.root !== rootId), arrival];
  return {
    project: { ...settled, arrivals },
    kind: place.kind,
    referenceId: place.referenceId,
  };
}

/** Dispensa a marca `Veio de…` da raiz. Sem marca devolve `p`. */
export function dismissArrival(p: Project, rootId: string): Project {
  if (!p.arrivals.some((a) => a.root === rootId)) return p;
  return { ...p, arrivals: p.arrivals.filter((a) => a.root !== rootId) };
}

/** A caixa que envolve as raízes com marca de chegada (a faixa do canvas); `null` sem marcas. */
export function arrivalArea(p: Project): Rect | null {
  const rects: Rect[] = [];
  for (const a of p.arrivals) {
    const rect = rootFootprint(p, a.root);
    if (rect) rects.push(rect);
  }
  return boundingBox(rects);
}
