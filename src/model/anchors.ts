import { fail } from './errors';
import { descendantsOf } from './hierarchy';
import { findById, updateById } from './project';
import { projectIndex } from './projectIndex';
import type { Marking, MarkingAnchor, Project } from './types';

// Âncora da marcação (schema v20, etapa "direção e âncora", R3). A âncora liga uma marcação a
// outra do mesmo espaço; ela não entra no pertencimento (`settleHierarchy` não a lê). Aqui
// ficam a conferência, o gravar e o conjunto que anda junto quando a âncora se move.

/** `to` já depende de `id` pela cadeia de âncoras: ancorar `id` em `to` fecharia um ciclo. */
function wouldCycle(p: Project, id: string, to: string): boolean {
  const { anchorOf } = projectIndex(p);
  const seen = new Set<string>();
  for (let next: string | undefined = to; next !== undefined; next = anchorOf.get(next)) {
    if (next === id) return true;
    if (seen.has(next)) return false;
    seen.add(next);
  }
  return false;
}

/**
 * Confere a âncora nova de `id` (que está em `containerId`, ou ainda não existe) e falha com o
 * código da invariante quebrada; devolve a marcação-alvo. Serve também à criação, antes de a
 * marcação existir (sem ela não há ciclo possível).
 */
export function checkAnchorTarget(
  p: Project,
  id: string,
  containerId: string | null,
  anchor: MarkingAnchor,
): Marking {
  if (anchor.to === id) fail('anchor-self', id);
  const target = projectIndex(p).markings.get(anchor.to);
  if (target === undefined) return fail('anchor-missing', anchor.to);
  if (target.containerId !== containerId) fail('anchor-other-space', anchor.to);
  if (wouldCycle(p, id, anchor.to)) fail('anchor-cycle', id);
  return target;
}

function sameOffset(a: MarkingAnchor['offset'], b: MarkingAnchor['offset']): boolean {
  return a?.main === b?.main && a?.cross === b?.cross;
}

function sameAnchor(
  a: MarkingAnchor | null | undefined,
  b: MarkingAnchor | null,
): boolean {
  if (a == null || b === null) return (a ?? null) === b;
  return (
    a.to === b.to &&
    a.side === b.side &&
    a.align === b.align &&
    sameOffset(a.offset, b.offset)
  );
}

/**
 * Grava (ou, com `null`, tira) a âncora da marcação. Confere as invariantes: o alvo existe
 * (`anchor-missing`), não é a própria marcação (`anchor-self`), está no mesmo espaço
 * (`anchor-other-space`) e não fecha um ciclo (`anchor-cycle`). Não move nada (o encosto é
 * `snapToAnchor`) e não é geometria: a trava não impede. A mesma âncora devolve `p`.
 */
export function setMarkingAnchor(
  p: Project,
  markingId: string,
  anchor: MarkingAnchor | null,
): Project {
  const marking = findById(p.markings, markingId);
  if (sameAnchor(marking.anchor, anchor)) return p;
  if (anchor !== null) checkAnchorTarget(p, markingId, marking.containerId, anchor);
  return {
    ...p,
    markings: updateById(p.markings, markingId, (m) => ({ ...m, anchor })),
  };
}

/**
 * O que anda junto quando `ids` se movem: as marcações ancoradas em qualquer delas, as
 * descendentes delas (dentro de um container; no canvas a marcação é uma lente e anda sozinha) e
 * as ancoradas dessas, transitivamente. Sem duplicar: um id que já está em `ids` ou que várias
 * cadeias alcançam entra uma vez. Devolve um conjunto novo com `ids` inclusive.
 */
export function withAnchoredFollowers(p: Project, ids: Iterable<string>): Set<string> {
  const { anchoredBy, markings } = projectIndex(p);
  const result = new Set<string>(ids);
  const queue = [...result];
  const add = (id: string): void => {
    if (!result.has(id)) {
      result.add(id);
      queue.push(id);
    }
  };
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i] as string;
    for (const m of anchoredBy.get(id) ?? []) add(m.id);
    if (markings.get(id)?.containerId == null) continue;
    for (const d of descendantsOf(p, id)) add(d.id);
  }
  return result;
}
