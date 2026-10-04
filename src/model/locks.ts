import { fail } from './errors';
import { ancestorsOf, descendantsOf } from './hierarchy';
import { projectIndex } from './projectIndex';
import { findById, updateById } from './project';
import type { Marking, Project } from './types';

// Trava (etapa 2.5): `locked` em marcações e imagens bloqueia mover, redimensionar e
// excluir. Selecionar, renomear e anotar seguem livres. Trancar um pai trava a
// geometria dos descendentes sem mexer no `locked` deles.

/** A marcação ou algum ancestral está trancado: a geometria dela não pode mudar. */
export function isMarkingGeometryLocked(p: Project, markingId: string): boolean {
  const marking = findById(p.markings, markingId);
  return marking.locked || ancestorsOf(p, markingId).some((a) => a.locked);
}

/** Por que a geometria da marcação está travada: trava própria ou herdada de um ancestral. */
export type MarkingLockState = 'self' | 'inherited';

/**
 * Estado de trava de cada marcação com a geometria travada (as livres não aparecem),
 * numa passada só: serve à Árvore e ao canvas sem subir a hierarquia a cada linha.
 */
export function markingLockStates(p: Project): Map<string, MarkingLockState> {
  const children = projectIndex(p).children;
  const states = new Map<string, MarkingLockState>();
  const visit = (parentLocked: boolean, markings: readonly Marking[] | undefined) => {
    for (const m of markings ?? []) {
      if (m.locked) states.set(m.id, 'self');
      else if (parentLocked) states.set(m.id, 'inherited');
      visit(parentLocked || m.locked, children.get(m.id));
    }
  };
  visit(false, children.get(null));
  return states;
}

/** Algum descendente está trancado (mover o pai o arrastaria junto). */
function hasLockedDescendant(p: Project, markingId: string): boolean {
  return descendantsOf(p, markingId).some((d) => d.locked);
}

/** Redimensionar: o item ou um ancestral trancado bloqueia. As filhas não se movem. */
export function canResizeMarking(p: Project, markingId: string): boolean {
  return !isMarkingGeometryLocked(p, markingId);
}

/** Mover (leva os descendentes junto): também bloqueia se algum descendente estiver trancado. */
export function canMoveMarking(p: Project, markingId: string): boolean {
  return canResizeMarking(p, markingId) && !hasLockedDescendant(p, markingId);
}

/** Excluir (leva os descendentes): o item ou qualquer descendente trancado bloqueia. */
export function canDeleteMarking(p: Project, markingId: string): boolean {
  return !findById(p.markings, markingId).locked && !hasLockedDescendant(p, markingId);
}

/** Mover ou redimensionar a imagem no canvas. */
export function canEditImagePlacement(p: Project, imageId: string): boolean {
  return !findById(p.images, imageId).locked;
}

/** Excluir a imagem leva as marcações: ela ou qualquer marcação dela trancada bloqueia. */
export function canDeleteImage(p: Project, imageId: string): boolean {
  return (
    !findById(p.images, imageId).locked &&
    !p.markings.some((m) => m.imageId === imageId && m.locked)
  );
}

/**
 * Trocar o arquivo reescala as marcações quando as dimensões mudam: bloqueia se a
 * imagem ou alguma marcação dela estiver trancada. Reapontar um arquivo do mesmo
 * tamanho não muda a geometria e fica livre.
 */
export function canReplaceImage(
  p: Project,
  imageId: string,
  next: { readonly width: number; readonly height: number },
): boolean {
  const image = findById(p.images, imageId);
  if (image.width === next.width && image.height === next.height) return true;
  return canDeleteImage(p, imageId);
}

export function setMarkingLocked(
  p: Project,
  markingId: string,
  locked: boolean,
): Project {
  if (findById(p.markings, markingId).locked === locked) return p;
  return {
    ...p,
    markings: updateById(p.markings, markingId, (m) => ({ ...m, locked })),
  };
}

export function setImageLocked(p: Project, imageId: string, locked: boolean): Project {
  if (findById(p.images, imageId).locked === locked) return p;
  return {
    ...p,
    images: updateById(p.images, imageId, (i) => ({ ...i, locked })),
  };
}

/** Tranca (ou destranca) todas as marcações da imagem de uma vez: uma operação, uma entrada no histórico. */
export function setImageMarkingsLocked(
  p: Project,
  imageId: string,
  locked: boolean,
): Project {
  findById(p.images, imageId);
  if (!p.markings.some((m) => m.imageId === imageId && m.locked !== locked)) return p;
  return {
    ...p,
    markings: p.markings.map((m) =>
      m.imageId === imageId && m.locked !== locked ? { ...m, locked } : m,
    ),
  };
}

/** Lança `locked` se a condição de permissão não valer. */
export function requireUnlocked(allowed: boolean): void {
  if (!allowed) fail('locked');
}
