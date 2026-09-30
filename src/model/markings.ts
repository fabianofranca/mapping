import { fail } from './errors';
import {
  MIN_MARKING_SIZE,
  area,
  boundingBox,
  containsRect,
  imagePixelRect,
  isIntegerRect,
  translateRect,
} from './geometry';
import { childrenOf, depthOf, descendantIds } from './hierarchy';
import { findById, normalizeOptionalName, updateById } from './project';
import type { Marking, Project, Rect } from './types';

function checkRectShape(rect: Rect): void {
  if (!isIntegerRect(rect)) fail('rect-not-integer');
  if (rect.width < MIN_MARKING_SIZE || rect.height < MIN_MARKING_SIZE)
    fail('rect-too-small');
}

/** Área onde a marcação pode ficar: o `rect` do pai ou a imagem inteira. */
function containerOf(p: Project, marking: Pick<Marking, 'imageId' | 'parentId'>): Rect {
  if (marking.parentId !== null) return findById(p.markings, marking.parentId).rect;
  return imagePixelRect(findById(p.images, marking.imageId));
}

/**
 * Limites para redimensionar uma marcação: ela precisa ficar dentro de `outer`
 * (pai ou imagem) e envolver `inner` (caixa das filhas, ou `null` se não tiver filhas).
 */
export function markingRectLimits(
  p: Project,
  markingId: string,
): { outer: Rect; inner: Rect | null } {
  const marking = findById(p.markings, markingId);
  return {
    outer: containerOf(p, marking),
    inner: boundingBox(childrenOf(p, markingId).map((c) => c.rect)),
  };
}

/** A marcação mais interna da imagem que contém `rect` (menor área; empate → mais funda). */
export function innermostContaining(
  p: Project,
  imageId: string,
  rect: Rect,
  exclude: ReadonlySet<string> = new Set(),
): Marking | null {
  let best: Marking | null = null;
  let bestDepth = -1;
  for (const m of p.markings) {
    if (m.imageId !== imageId || exclude.has(m.id) || !containsRect(m.rect, rect))
      continue;
    const depth = depthOf(p, m.id);
    if (
      !best ||
      area(m.rect) < area(best.rect) ||
      (area(m.rect) === area(best.rect) && depth > bestDepth)
    ) {
      best = m;
      bestDepth = depth;
    }
  }
  return best;
}

export interface NewMarkingArgs {
  readonly id: string;
  readonly imageId: string;
  readonly rect: Rect;
  readonly name?: string | null;
}

/** Cria uma marcação. Se o retângulo estiver dentro de outras, a mais interna vira o pai. */
export function createMarking(p: Project, args: NewMarkingArgs): Project {
  const image = findById(p.images, args.imageId);
  checkRectShape(args.rect);
  if (!containsRect(imagePixelRect(image), args.rect)) fail('rect-out-of-image');
  const parent = innermostContaining(p, image.id, args.rect);
  const marking: Marking = {
    id: args.id,
    imageId: image.id,
    parentId: parent?.id ?? null,
    name: normalizeOptionalName(args.name ?? null),
    rect: {
      x: args.rect.x,
      y: args.rect.y,
      width: args.rect.width,
      height: args.rect.height,
    },
    needsReview: false,
  };
  return { ...p, markings: [...p.markings, marking] };
}

export function renameMarking(
  p: Project,
  markingId: string,
  name: string | null,
): Project {
  const normalized = normalizeOptionalName(name);
  return {
    ...p,
    markings: updateById(p.markings, markingId, (m) => ({ ...m, name: normalized })),
  };
}

/**
 * Altera o retângulo (redimensionar ou ajuste fino). As filhas não se movem:
 * o novo retângulo precisa continuar dentro do pai e envolvendo as filhas.
 */
export function setMarkingRect(p: Project, markingId: string, rect: Rect): Project {
  checkRectShape(rect);
  const { outer, inner } = markingRectLimits(p, markingId);
  const marking = findById(p.markings, markingId);
  if (!containsRect(outer, rect)) {
    fail(marking.parentId === null ? 'rect-out-of-image' : 'rect-outside-parent');
  }
  if (inner && !containsRect(rect, inner)) fail('rect-excludes-children');
  const copy: Rect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  return {
    ...p,
    markings: updateById(p.markings, markingId, (m) => ({ ...m, rect: copy })),
  };
}

/** Limita o deslocamento para a marcação não sair do pai (ou da imagem). */
export function clampMarkingDelta(
  p: Project,
  markingId: string,
  dx: number,
  dy: number,
): { dx: number; dy: number } {
  const { rect } = findById(p.markings, markingId);
  const { outer } = markingRectLimits(p, markingId);
  const limit = (d: number, pos: number, size: number, min: number, max: number) =>
    Math.min(Math.max(Math.round(d), min - pos), max - size - pos);
  return {
    dx: limit(dx, rect.x, rect.width, outer.x, outer.x + outer.width),
    dy: limit(dy, rect.y, rect.height, outer.y, outer.y + outer.height),
  };
}

/** Move a marcação e todos os descendentes pelo mesmo deslocamento (inteiro). */
export function moveMarking(
  p: Project,
  markingId: string,
  dx: number,
  dy: number,
): Project {
  if (!Number.isInteger(dx) || !Number.isInteger(dy)) fail('rect-not-integer');
  const marking = findById(p.markings, markingId);
  const moved = translateRect(marking.rect, dx, dy);
  if (!containsRect(containerOf(p, marking), moved)) {
    fail(marking.parentId === null ? 'rect-out-of-image' : 'rect-outside-parent');
  }
  const affected = descendantIds(p, markingId).add(markingId);
  return {
    ...p,
    markings: p.markings.map((m) =>
      affected.has(m.id) ? { ...m, rect: translateRect(m.rect, dx, dy) } : m,
    ),
  };
}

/** Pais válidos: mesma imagem, contém o retângulo, não é a própria nem descendente. */
export function parentCandidates(p: Project, markingId: string): Marking[] {
  const marking = findById(p.markings, markingId);
  const excluded = descendantIds(p, markingId).add(markingId);
  return p.markings.filter(
    (m) =>
      m.imageId === marking.imageId &&
      !excluded.has(m.id) &&
      containsRect(m.rect, marking.rect),
  );
}

export function setMarkingParent(
  p: Project,
  markingId: string,
  parentId: string | null,
): Project {
  if (
    parentId !== null &&
    !parentCandidates(p, markingId).some((m) => m.id === parentId)
  ) {
    fail('invalid-parent');
  }
  return {
    ...p,
    markings: updateById(p.markings, markingId, (m) => ({ ...m, parentId })),
  };
}

/** Limpa a flag `needsReview` ("Confirmar posição"). */
export function confirmMarkingReview(p: Project, markingId: string): Project {
  return {
    ...p,
    markings: updateById(p.markings, markingId, (m) => ({ ...m, needsReview: false })),
  };
}

export function markingDeletionImpact(
  p: Project,
  markingId: string,
): { descendants: number; annotations: number } {
  findById(p.markings, markingId);
  const ids = descendantIds(p, markingId);
  const descendants = ids.size;
  ids.add(markingId);
  return {
    descendants,
    annotations: p.annotations.filter((a) => ids.has(a.markingId)).length,
  };
}

/** Exclui a marcação, os descendentes e as anotações de todos eles. */
export function removeMarking(p: Project, markingId: string): Project {
  findById(p.markings, markingId);
  const ids = descendantIds(p, markingId).add(markingId);
  return {
    ...p,
    markings: p.markings.filter((m) => !ids.has(m.id)),
    annotations: p.annotations.filter((a) => !ids.has(a.markingId)),
  };
}
