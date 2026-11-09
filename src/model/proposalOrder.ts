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
  // Lista encadeada por id: cada movimento é O(1), em vez de `findIndex`/`splice` por âncora.
  const list = new LinkedMarkings(markings);
  // A âncora igual ao próprio id não move nada.
  for (const [id, anchor] of anchors) if (id !== anchor) list.moveBefore(id, anchor);
  return list.toArray();
}

interface Node {
  readonly marking: Marking;
  prev: Node | null;
  next: Node | null;
}

class LinkedMarkings {
  private head: Node | null = null;
  private readonly nodes = new Map<string, Node>();

  constructor(markings: readonly Marking[]) {
    let tail: Node | null = null;
    for (const marking of markings) {
      const node: Node = { marking, prev: tail, next: null };
      if (tail) tail.next = node;
      else this.head = node;
      tail = node;
      if (!this.nodes.has(marking.id)) this.nodes.set(marking.id, node);
    }
  }

  /** Move `id` para antes de `anchor`; sem um dos dois na lista, não faz nada. */
  moveBefore(id: string, anchor: string): void {
    const node = this.nodes.get(id);
    const target = this.nodes.get(anchor);
    if (!node || !target) return;
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    node.prev = target.prev;
    node.next = target;
    if (target.prev) target.prev.next = node;
    else this.head = node;
    target.prev = node;
  }

  toArray(): Marking[] {
    const out: Marking[] = [];
    for (let n = this.head; n; n = n.next) out.push(n.marking);
    return out;
  }
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
