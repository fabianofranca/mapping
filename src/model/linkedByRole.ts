import { getLinkedAnnotations } from './links';
import type { SpecChildRole } from './spec';
import { ownerRolesOf } from './specLookup';
import type { Annotation, Project } from './types';

// "Vinculadas" de um dono com papéis (v14, decisão 19): uma linha por papel.

export interface RoleLinks {
  readonly role: SpecChildRole;
  /** Os filhos diretos com este papel, na ordem do projeto. */
  readonly items: readonly Annotation[];
}

export interface LinkedByRole {
  /** `childRolesLabel` do tipo do dono ("Trigger", "Slot"…); `null` = sem rótulo declarado. */
  readonly label: string | null;
  /** Uma linha por papel, na ordem de `childRoles` (inclusive os sem filhos). */
  readonly rows: readonly RoleLinks[];
  /** Filhos sem papel, ou com um papel que o dono não oferece (pendências). */
  readonly unassigned: readonly Annotation[];
}

/**
 * Os filhos diretos de `owner` agrupados pelo papel que ele oferece. `null` quando o tipo do dono
 * não declara `childRoles`: ali os filhos continuam agrupados por camada.
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
