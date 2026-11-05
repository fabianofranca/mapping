import type { Project } from './types';

// Quem mudou de pai ou de espaço entre dois projetos. O pertencimento é decidido só pela
// geometria (`settleHierarchy`); aqui só se compara o resultado, por `parentId` e `containerId`
// de cada item, sem olhar a ordem do array (ela pode diferir só pelo lugar das filhas).

/** Onde o item está: o pai (marcação) e, só na marcação, o espaço (`null` = canvas). */
export interface MembershipPlace {
  readonly parentId: string | null;
  readonly containerId?: string | null;
}

export interface MembershipChange {
  readonly kind: 'marking' | 'container';
  readonly id: string;
  readonly from: MembershipPlace;
  readonly to: MembershipPlace;
}

interface Placed {
  readonly id: string;
  readonly parentId: string | null;
  readonly containerId?: string | null;
}

function diff(
  kind: MembershipChange['kind'],
  before: readonly Placed[],
  after: readonly Placed[],
  place: (item: Placed) => MembershipPlace,
): MembershipChange[] {
  const old = new Map(before.map((item) => [item.id, item]));
  const out: MembershipChange[] = [];
  for (const item of after) {
    const previous = old.get(item.id);
    if (previous === undefined) continue;
    if (
      previous.parentId !== item.parentId ||
      (previous.containerId ?? null) !== (item.containerId ?? null)
    ) {
      out.push({ kind, id: item.id, from: place(previous), to: place(item) });
    }
  }
  return out;
}

/**
 * Marcações e containers que já existiam na base e cujo pai ou espaço muda no projeto
 * proposto, marcações primeiro, na ordem do projeto proposto.
 */
export function membershipChanges(base: Project, after: Project): MembershipChange[] {
  return [
    ...diff('marking', base.markings, after.markings, (m) => ({
      parentId: m.parentId,
      containerId: m.containerId ?? null,
    })),
    ...diff('container', base.containers, after.containers, (c) => ({
      parentId: c.parentId,
    })),
  ];
}
