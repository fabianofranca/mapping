// O que um gesto move (decisão 5 da etapa canvas-escala): comparando o projeto desenhado antes do
// gesto com o da prévia, saem as marcações, os containers e as setas que se mexem. O canvas leva os
// nós deles para o grupo de arrasto; o resto do palco não é redesenhado até soltar. Sem Konva.
import {
  projectIndex,
  type Arrow,
  type Marking,
  type Project,
  type ProjectContainer,
} from '../model';

/** Ids do que se move num gesto: marcações, containers (imagens) e setas. */
export interface DragSet {
  readonly markings: ReadonlySet<string>;
  readonly containers: ReadonlySet<string>;
  readonly arrows: ReadonlySet<string>;
}

const NONE: ReadonlySet<string> = new Set();

/** Nada se move (fora de um gesto, ou antes da primeira prévia). Sempre o mesmo objeto. */
export const EMPTY_DRAG: DragSet = { markings: NONE, containers: NONE, arrows: NONE };

export function isEmptyDrag(set: DragSet): boolean {
  return set.markings.size === 0 && set.containers.size === 0 && set.arrows.size === 0;
}

/**
 * O que a prévia move em relação a `base`:
 *  - o container cujo objeto mudou (ou que a prévia de imagem segue, `previewContainerId`), com
 *    todas as marcações dele (elas andam com a imagem sem mudar de objeto);
 *  - a marcação cujo objeto mudou (ela e as descendentes que a prévia moveu junto);
 *  - a seta cujo objeto mudou (rota, ponta) ou que toca qualquer marcação que se move.
 * Nenhum deles é decidido pelo canvas: é só a diferença entre os dois projetos, que o modelo já
 * produziu. Os ids são do projeto desenhado.
 */
export function dragSetOf(
  base: Project | null,
  current: Project | null,
  previewContainerId: string | null,
): DragSet {
  if (!base || !current) return EMPTY_DRAG;
  const before = projectIndex(base);
  const containers = movedContainers(before.containers, current, previewContainerId);
  const markings = movedMarkings(before.markings, current, containers);
  const arrows = movedArrows(before.arrows, current, markings);
  const set = { markings, containers, arrows };
  return isEmptyDrag(set) ? EMPTY_DRAG : set;
}

/** Os containers de `current` cujo objeto mudou, ou que a prévia de imagem segue. */
function movedContainers(
  before: ReadonlyMap<string, ProjectContainer>,
  current: Project,
  previewContainerId: string | null,
): Set<string> {
  const containers = new Set<string>();
  for (const container of current.containers) {
    if (container.id === previewContainerId || before.get(container.id) !== container) {
      containers.add(container.id);
    }
  }
  return containers;
}

/** As setas de `current` cujo objeto mudou, ou que tocam uma marcação que se move. */
function movedArrows(
  before: ReadonlyMap<string, Arrow>,
  current: Project,
  markings: ReadonlySet<string>,
): Set<string> {
  const arrows = new Set<string>();
  for (const arrow of current.arrows) {
    const touches = markings.has(arrow.from) || markings.has(arrow.to);
    if (touches || before.get(arrow.id) !== arrow) arrows.add(arrow.id);
  }
  return arrows;
}

/** As marcações de `current` cujo objeto mudou, ou que estão num container que se move. */
function movedMarkings(
  before: ReadonlyMap<string, Marking>,
  current: Project,
  containers: ReadonlySet<string>,
): Set<string> {
  const markings = new Set<string>();
  for (const marking of current.markings) {
    const inMoving = marking.containerId !== null && containers.has(marking.containerId);
    if (inMoving || before.get(marking.id) !== marking) markings.add(marking.id);
  }
  return markings;
}

/** Une dois conjuntos (o que se move só cresce durante o gesto); o primeiro se `b` não traz nada novo. */
export function mergeDrag(a: DragSet, b: DragSet): DragSet {
  if (isEmptyDrag(b)) return a;
  if (isEmptyDrag(a)) return b;
  const markings = union(a.markings, b.markings);
  const containers = union(a.containers, b.containers);
  const arrows = union(a.arrows, b.arrows);
  if (markings === a.markings && containers === a.containers && arrows === a.arrows) {
    return a;
  }
  return { markings, containers, arrows };
}

/** `a` se `b` está todo em `a`; senão um conjunto novo com os dois. */
function union(a: ReadonlySet<string>, b: ReadonlySet<string>): ReadonlySet<string> {
  let grown = false;
  for (const id of b) {
    if (!a.has(id)) {
      grown = true;
      break;
    }
  }
  return grown ? new Set([...a, ...b]) : a;
}
