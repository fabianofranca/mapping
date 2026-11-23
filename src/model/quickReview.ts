import { projectIndex } from './projectIndex';
import {
  ENTRIES_FIELD_PREFIX,
  VALUES_FIELD_PREFIX,
  type Change,
  type Proposal,
} from './proposal';
import type { Project } from './types';

// Quick review (stage #1932, decision 2): which proposal can be accepted or rejected in place, on
// the canvas, without the full review. Pure: no DOM, reused by the store and the tests.

/** The most markings a quick review proposal can touch. */
export const QUICK_REVIEW_MAX_ITEMS = 5;

/** Why a proposal is not a quick review (one reason per rule of decision 2). */
export type QuickReviewReason =
  | 'not-open'
  | 'decided'
  | 'applied'
  | 'entity'
  | 'remove'
  | 'field'
  | 'spaces'
  | 'too-many';

export type QuickReviewEligibility =
  | {
      readonly ok: true;
      /** The container (or `null`, the canvas) where every change happens. */
      readonly spaceId: string | null;
      /** Ids of the markings the proposal creates. */
      readonly created: readonly string[];
      /** Ids of the existing markings it changes (name, rect or something of their annotations). */
      readonly changed: readonly string[];
    }
  | { readonly ok: false; readonly reason: QuickReviewReason };

const MARKING_QUICK_FIELDS: ReadonlySet<string> = new Set(['name', 'rect']);

function fieldAllowed(c: Change): boolean {
  if (c.kind !== 'update') return true;
  if (c.field === null) return false;
  if (c.entity === 'marking') return MARKING_QUICK_FIELDS.has(c.field);
  return (
    c.field === 'name' ||
    c.field.startsWith(VALUES_FIELD_PREFIX) ||
    c.field.startsWith(ENTRIES_FIELD_PREFIX)
  );
}

/** The marking an annotation or marking change belongs to, or `null` when it is not a marking. */
function markingOf(c: Change, project: Project, createdHere: ReadonlySet<string>) {
  const id = c.markingId;
  if (id === null) return null;
  return createdHere.has(id) || projectIndex(project).markings.has(id) ? id : null;
}

/** The first rule of decision 2 that the changes break, or `null` (every change is on a marking). */
function changesReason(
  changes: readonly Change[],
  project: Project,
  createdHere: ReadonlySet<string>,
): QuickReviewReason | null {
  const onMarking = (c: Change) =>
    c.entity === 'marking' ||
    (c.entity === 'annotation' && markingOf(c, project, createdHere) !== null);
  if (changes.length === 0 || !changes.every(onMarking)) return 'entity';
  if (changes.some((c) => c.kind === 'remove')) return 'remove';
  if (!changes.every(fieldAllowed)) return 'field';
  if (new Set(changes.map((c) => c.imageId)).size !== 1) return 'spaces';
  return null;
}

/** The status of the proposal itself: open, with no decision and nothing applied. */
function statusReason(p: Proposal): QuickReviewReason | null {
  if (p.status !== 'open') return 'not-open';
  if (Object.keys(p.decisions).length > 0) return 'decided';
  if (Object.keys(p.applied).length > 0) return 'applied';
  return null;
}

/**
 * Says whether `p` is a quick review over `project`: an open proposal with no decision, made only
 * of creations and of changes to the name or rect of markings and to the name, fields and pairs of
 * annotations, all in the same container (or on the canvas) and with at most
 * `QUICK_REVIEW_MAX_ITEMS` markings. Otherwise, the first reason that applies.
 */
export function quickReviewOf(p: Proposal, project: Project): QuickReviewEligibility {
  const no = (reason: QuickReviewReason): QuickReviewEligibility => ({
    ok: false,
    reason,
  });
  const status = statusReason(p);
  if (status) return no(status);
  const changes = p.changes;
  const createdHere = new Set(
    changes
      .filter((c) => c.entity === 'marking' && c.kind === 'create')
      .map((c) => c.entityId),
  );
  const reason = changesReason(changes, project, createdHere);
  if (reason) return no(reason);
  const touched = new Set<string>();
  for (const c of changes) {
    const id = c.entity === 'marking' ? c.entityId : c.markingId;
    if (id !== null) touched.add(id);
  }
  if (touched.size > QUICK_REVIEW_MAX_ITEMS) return no('too-many');
  return {
    ok: true,
    spaceId: changes[0]?.imageId ?? null,
    created: [...touched].filter((id) => createdHere.has(id)),
    changed: [...touched].filter((id) => !createdHere.has(id)),
  };
}
