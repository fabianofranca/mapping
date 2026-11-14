import { getLinkedAnnotations } from './links';
import type { SpecChildRole } from './spec';
import { ownerRolesOf } from './specLookup';
import type { Annotation, Project } from './types';

// "Linked" items of an owner with roles (v14, decision 19): one row per role.

export interface RoleLinks {
  readonly role: SpecChildRole;
  /** The direct children with this role, in project order. */
  readonly items: readonly Annotation[];
}

export interface LinkedByRole {
  /** `childRolesLabel` of the owner's type ("Trigger", "Slot"…); `null` = no declared label. */
  readonly label: string | null;
  /** One row per role, in `childRoles` order (including those without children). */
  readonly rows: readonly RoleLinks[];
  /** Children without a role, or with a role the owner does not offer (pending items). */
  readonly unassigned: readonly Annotation[];
}

/**
 * The direct children of `owner` grouped by the role it offers. `null` when the owner's type
 * does not declare `childRoles`: there the children stay grouped by layer.
 */
export function linkedByRole(p: Project, owner: Annotation): LinkedByRole | null {
  const offered = ownerRolesOf(p, owner);
  if (!offered) return null;
  const linked = getLinkedAnnotations(p, owner.id);
  const known = new Set(offered.roles.map((r) => r.id));
  return {
    label: offered.label,
    rows: offered.roles.map((role) => ({
      role,
      items: linked.filter((a) => a.parentRole === role.id),
    })),
    unassigned: linked.filter((a) => a.parentRole === null || !known.has(a.parentRole)),
  };
}
