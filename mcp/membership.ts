import { membershipChanges, type MembershipChange, type Project } from '../src/model';
import { Refs } from './items';

// The `membership` of the result of `plan_changes` and `propose_changes`: who changed parent or
// space through geometry (`settleHierarchy`) between the project before the batch and after it.
// The comparison belongs to the model (`membershipChanges`); here only names and references are given.

interface Place {
  readonly parent: string | null;
  readonly container?: string | null;
}

/** Names on one side of the change: the parent and the space (`null` without a parent; the canvas is "Canvas"). */
interface Names {
  readonly parent: string | null;
  readonly space: string | null;
}

function parentPhrase(from: Names, to: Names): string {
  if (from.parent !== null && to.parent === null) {
    return `leaves ${from.parent}; now directly in ${to.space ?? 'the canvas'}`;
  }
  if (from.parent !== null) return `leaves ${from.parent}; now inside ${to.parent}`;
  return `enters ${to.parent}`;
}

/** Short sentence: "Button leaves Header; now directly in Details". */
function messageOf(name: string, from: Names, to: Names): string {
  const spaceMoved = from.space !== to.space;
  const parentMoved = from.parent !== to.parent;
  const parts: string[] = [];
  if (parentMoved) parts.push(parentPhrase(from, to));
  if (spaceMoved) parts.push(`moves from ${from.space} to ${to.space}`);
  return `${name} ${parts.join('; ')}`;
}

function placeView(refs: Refs, place: MembershipChange['from']): Place {
  const parent = place.parentId === null ? null : refs.ref('m', place.parentId);
  if (place.containerId === undefined) return { parent };
  return {
    parent,
    container: place.containerId === null ? null : refs.ref('i', place.containerId),
  };
}

function namesOf(refs: Refs, place: MembershipChange['from']): Names {
  return {
    parent: place.parentId === null ? null : refs.markingName(place.parentId),
    space: place.containerId === undefined ? null : refs.imageLabel(place.containerId),
  };
}

function entryView(
  change: MembershipChange,
  before: Refs,
  after: Refs,
): Record<string, unknown> {
  const isMarking = change.kind === 'marking';
  const name = isMarking ? after.markingName(change.id) : after.imageLabel(change.id);
  const kind = isMarking ? 'm' : 'i';
  return {
    kind: change.kind,
    ref: after.ref(kind, change.id),
    name,
    from: placeView(before, change.from),
    to: placeView(after, change.to),
    message: messageOf(name, namesOf(before, change.from), namesOf(after, change.to)),
  };
}

/**
 * The `membership` list: each marking or container that already existed and whose parent or
 * space changes in the batch. Empty when nothing changes (the field does not appear in the response).
 */
export function membershipView(
  base: Project,
  before: Refs,
  after: Refs,
): Record<string, unknown>[] {
  return membershipChanges(base, after.project).map((change) =>
    entryView(change, before, after),
  );
}
