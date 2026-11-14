import type { Project } from './types';

// Who changed parent or space between two projects. Membership is decided only by
// geometry (`settleHierarchy`); here only the result is compared, by each item's `parentId` and `containerId`,
// without looking at array order (it may differ only by where the children sit).

/** Where the item is: the parent (marking) and, only on a marking, the space (`null` = canvas). */
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
 * Markings and containers that already existed in the base and whose parent or space changes in the proposed
 * project, markings first, in the proposed project's order.
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
