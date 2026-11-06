import type { Change } from './proposal';
import type { Marking } from './types';

// Onde a marcação criada entra no array `markings` (proposta formatVersion 4, `insertBefore`).
// A mesma regra serve ao cálculo das mudanças (`computeChanges`) e à aplicação
// (`patchProject`), para o aplicado ter a ordem do projeto proposto.

/**
 * Âncora de partida de cada marcação criada no projeto proposto: o id da primeira marcação
 * **depois** dela que já existia na base (ela continua no proposto, então a proposta não a
 * remove). Sem uma, a criada vai para o fim e não aparece no mapa. O mapa sai na ordem do array
 * (crescente). A âncora final, que respeita os empates, é a de `proposalAnchors`.
 */
export function insertAnchors(
  baseIds: ReadonlySet<string>,
  afterMarkings: readonly Marking[],
): Map<string, string> {
  const found: [string, string][] = [];
  let next: string | undefined;
  for (let i = afterMarkings.length - 1; i >= 0; i--) {
    const m = afterMarkings[i] as Marking;
    if (baseIds.has(m.id)) next = m.id;
    else if (next !== undefined) found.push([m.id, next]);
  }
  return new Map(found.reverse());
}

/**
 * Põe cada marcação criada (que `markings` traz no fim, na ordem das mudanças) antes da
 * âncora, se a âncora estiver na lista; sem âncora, ou com ela fora da lista, a criada fica no
 * fim. `anchors` é lido na ordem: as criadas com a mesma âncora entram na ordem do mapa, que é a
 * do proposto (as mudanças, em `anchorsOfChanges`, e o array, em `insertAnchors` e
 * `proposalAnchors`).
 */
export function placeCreatedMarkings(
  markings: readonly Marking[],
  anchors: ReadonlyMap<string, string>,
): Marking[] {
  const list = [...markings];
  for (const [id, anchor] of anchors) {
    const at = list.findIndex((m) => m.id === id);
    if (at < 0 || !list.some((m) => m.id === anchor)) continue;
    const [marking] = list.splice(at, 1);
    list.splice(
      list.findIndex((m) => m.id === anchor),
      0,
      marking as Marking,
    );
  }
  return list;
}

/** As âncoras que as mudanças de criação de marcação trazem (`insertBefore`), na ordem delas. */
export function anchorsOfChanges(
  changes: readonly Change[],
  baseIds: ReadonlySet<string>,
): Map<string, string> {
  const anchors = new Map<string, string>();
  for (const c of changes) {
    if (c.kind !== 'create' || c.entity !== 'marking') continue;
    if (typeof c.insertBefore === 'string' && !baseIds.has(c.entityId)) {
      anchors.set(c.entityId, c.insertBefore);
    }
  }
  return anchors;
}
