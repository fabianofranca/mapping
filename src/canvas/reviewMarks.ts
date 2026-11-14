// Review marks on the canvas (HANDOFF-PROPOSALS 4): what to draw over the "how it would
// look" project (Proposed view) or the current one (Current view). The line shape and the badge
// tell the kind; color is never the only cue. Pure function over the derived review
// state (kinds, conflicts, invalid set) and the two projects; the renderers only
// draw the result.
import {
  IDENTITY_PLACEMENT,
  changeImageFile,
  dominantChangeType,
  findSpecType,
  isRecord,
  proposalImagePath,
  projectIndex,
  proposalIndex,
  type Change,
  type ChangeType,
  type JsonValue,
  type Placement,
  type Project,
  type Proposal,
  type Rect,
  type ReviewTree,
} from '../model';

export type ReviewView = 'current' | 'proposed';

/** Badge at the top-right corner (at most two per marking). */
export type ReviewBadge = ChangeType | 'conflict' | 'invalid' | 'rejected';

/**
 * The marking's line: created dashed, changed double, invalid dashed in `cv-invalid`,
 * rejected dotted (the existing one, only in the Current view; a rejected creation becomes just
 * the ghost, in both).
 */
export type ReviewLine = 'created' | 'changed' | 'invalid' | 'rejected';

export interface MarkingReviewMark {
  readonly line: ReviewLine | null;
  /** Faded (rejected, in the Current view). */
  readonly dim: boolean;
  readonly badges: readonly ReviewBadge[];
}

/** Rectangle drawn separately: ghost of the other position, removed or rejected item. */
export interface ReviewShape {
  readonly key: string;
  readonly placement: Placement;
  /** In image pixels. */
  readonly rect: Rect;
  readonly name: string | null;
  readonly badges: readonly ReviewBadge[];
}

export interface ImageReviewMark {
  readonly line: 'created' | null;
  readonly badges: readonly ReviewBadge[];
}

export interface ReviewCanvas {
  readonly view: ReviewView;
  readonly markings: ReadonlyMap<string, MarkingReviewMark>;
  readonly images: ReadonlyMap<string, ImageReviewMark>;
  /** Dotted ghosts: the old position (Proposed) or the new one (Current), and the rejected ones. */
  readonly ghosts: readonly ReviewShape[];
  /** Removed (hatching and struck-through name): whole markings and images. */
  readonly removed: readonly ReviewShape[];
}

export interface ReviewMarksInput {
  readonly proposal: Proposal;
  readonly tree: ReviewTree;
  readonly types: ReadonlyMap<string, ChangeType>;
  readonly conflicts: ReadonlySet<string>;
  /** Accepted changes that make up the invalid set. */
  readonly invalid: ReadonlySet<string>;
  readonly view: ReviewView;
  /** Current project. */
  readonly current: Project;
  /** Drawn project (the current one or the "how it would look"). */
  readonly drawn: Project;
}

const asRect = (value: JsonValue | undefined): Rect | null => {
  if (!isRecord(value)) return null;
  const { x, y, width, height } = value;
  return typeof x === 'number' &&
    typeof y === 'number' &&
    typeof width === 'number' &&
    typeof height === 'number'
    ? { x, y, width, height }
    : null;
};

const textOf = (value: JsonValue | undefined): string | null =>
  typeof value === 'string' ? value : null;

/** Up to two badges: the alert (invalid or conflict) and the kind. */
function badgesOf(
  type: ReviewBadge | null,
  conflict: boolean,
  invalid: boolean,
): ReviewBadge[] {
  const out: ReviewBadge[] = [];
  if (invalid) out.push('invalid');
  else if (conflict) out.push('conflict');
  if (type) out.push(type);
  return out.slice(0, 2);
}

export function reviewMarks(input: ReviewMarksInput): ReviewCanvas {
  const { proposal: p, tree, types, conflicts, invalid, view, current, drawn } = input;
  const changes = proposalIndex(p).changes;
  const currentIndex = projectIndex(current);
  const drawnIndex = projectIndex(drawn);
  const rejected = (c: Change) => p.decisions[c.id]?.state === 'rejected';
  const applied = (c: Change) => Object.hasOwn(p.applied, c.id);
  const placementOf = (imageId: string): Placement | null =>
    drawnIndex.containers.get(imageId)?.placement ??
    currentIndex.containers.get(imageId)?.placement ??
    null;
  /**
   * Name of the component type of a rejected creation with no `name` (the instance is born with
   * no name): that of the typed annotation the proposal creates for the marking, as the Tree shows.
   */
  const createdTypeName = (markingId: string): string | null => {
    for (const c of p.changes) {
      if (c.entity !== 'annotation' || c.kind !== 'create' || c.markingId !== markingId)
        continue;
      const type = isRecord(c.to) && isRecord(c.to.type) ? c.to.type : null;
      if (!type || typeof type.specId !== 'string' || typeof type.typeId !== 'string')
        continue;
      const ref = { specId: type.specId, typeId: type.typeId };
      const found = findSpecType(drawn, ref) ?? findSpecType(current, ref);
      if (found?.type.component !== undefined) return found.type.name;
    }
    return null;
  };
  /** Position in a space: the container's or, on the canvas (`null`), the identity. */
  const spacePlacement = (containerId: JsonValue | undefined): Placement | null =>
    containerId === null
      ? IDENTITY_PLACEMENT
      : typeof containerId === 'string'
        ? placementOf(containerId)
        : null;
  /** Rectangle and position of one side of `rect` or of the composite `space`
   * (`{ containerId, rect }`). */
  const sideOf = (
    change: Change,
    value: JsonValue | undefined,
    fallback: Placement | null,
  ): { readonly placement: Placement; readonly rect: Rect } | null => {
    const record = change.field === 'space' && isRecord(value) ? value : null;
    const rect = asRect(record ? record.rect : value);
    const placement = record ? spacePlacement(record.containerId) : fallback;
    return rect && placement ? { placement, rect } : null;
  };

  const markings = new Map<string, MarkingReviewMark>();
  const images = new Map<string, ImageReviewMark>();
  const ghosts: ReviewShape[] = [];
  const removed: ReviewShape[] = [];

  for (const node of tree.nodes.values()) {
    if (node.id === null || (node.level !== 'item' && node.level !== 'image')) continue;
    const id = node.id;
    const own = node.changeIds
      .map((changeId) => changes.get(changeId))
      .filter((c): c is Change => c !== undefined && !applied(c));
    if (own.length === 0) continue;
    const live = own.filter((c) => !rejected(c));
    const conflict = live.some((c) => conflicts.has(c.id));
    const isInvalid = own.some((c) => invalid.has(c.id));
    const entity = node.level === 'item' ? 'marking' : 'image';
    const self = (c: Change) => c.entity === entity && c.entityId === id;
    const create = own.find((c) => self(c) && c.kind === 'create');
    const remove = own.find((c) => self(c) && c.kind === 'remove');
    // Kind by the entity itself; what changes inside (annotations) makes "changed", and
    // "moved" only when the position is the only thing that changes (the same rule as the levels).
    const ownLive = live.filter(self);
    const ownType = dominantChangeType(
      ownLive.map((c) => types.get(c.id)).filter((x): x is ChangeType => x !== undefined),
    );
    const liveType: ChangeType | null =
      live.length === 0
        ? null
        : ownType === null || (ownType === 'moved' && ownLive.length < live.length)
          ? 'changed'
          : ownType;

    if (node.level === 'image') {
      const image = currentIndex.containers.get(id);
      if (remove && !rejected(remove) && image) {
        removed.push({
          key: `image:${id}`,
          placement: image.placement,
          rect: { x: 0, y: 0, width: image.width, height: image.height },
          name: image.name ?? image.file,
          badges: badgesOf('removed', conflict, isInvalid),
        });
        continue;
      }
      if (create && !rejected(create)) {
        if (view === 'proposed') {
          images.set(id, {
            line: 'created',
            badges: badgesOf('created', conflict, isInvalid),
          });
        }
        continue;
      }
      if (liveType) {
        images.set(id, { line: null, badges: badgesOf(liveType, conflict, isInvalid) });
      }
      continue;
    }

    // Item (marking with everything that changed in it). Its space: the container or the canvas (`null`).
    const marking = currentIndex.markings.get(id);
    const rectChange = own.find(
      (c) =>
        self(c) && c.kind === 'update' && (c.field === 'rect' || c.field === 'space'),
    );
    const spaceId: string | null | undefined = create
      ? create.imageId
      : marking
        ? marking.containerId
        : node.changeIds.map((changeId) => changes.get(changeId)).find((c) => c)?.imageId;
    const placement = spaceId === undefined ? null : spacePlacement(spaceId);

    if (create) {
      if (!rejected(create)) {
        if (view === 'proposed') {
          markings.set(id, {
            line: isInvalid ? 'invalid' : 'created',
            dim: false,
            badges: badgesOf('created', conflict, isInvalid),
          });
        }
      } else if (placement) {
        // Rejected creation: only the ghost, in both views (the marking does not exist in the
        // "how it would look").
        const record = isRecord(create.to) ? create.to : null;
        const rect = asRect(record?.rect);
        if (rect) {
          ghosts.push({
            key: `rejected:${id}`,
            placement,
            rect,
            name: textOf(record?.name) ?? createdTypeName(id),
            badges: ['rejected'],
          });
        }
      }
      continue;
    }

    if (remove) {
      const rect =
        asRect(isRecord(remove.from) ? remove.from.rect : undefined) ?? marking?.rect;
      if (!rejected(remove)) {
        if (rect && placement) {
          removed.push({
            key: `marking:${id}`,
            placement,
            rect,
            name:
              marking?.name ?? textOf(isRecord(remove.from) ? remove.from.name : null),
            badges: badgesOf('removed', conflict, isInvalid),
          });
        }
        continue;
      }
      if (view === 'current')
        markings.set(id, { line: 'rejected', dim: true, badges: ['rejected'] });
      continue;
    }

    if (live.length === 0) {
      // Everything rejected: only shows in the Current view (ghost and ✕), never in the Proposed.
      if (view === 'current') {
        markings.set(id, { line: 'rejected', dim: true, badges: ['rejected'] });
        const ghost = rectChange ? sideOf(rectChange, rectChange.to, placement) : null;
        if (ghost) {
          ghosts.push({
            key: `rejected:${id}`,
            ...ghost,
            name: null,
            badges: ['rejected'],
          });
        }
      }
      continue;
    }

    const line: ReviewLine | null = isInvalid
      ? 'invalid'
      : liveType === 'changed' || liveType === 'replaced'
        ? 'changed'
        : null;
    markings.set(id, {
      line,
      dim: false,
      badges: badgesOf(liveType, conflict, isInvalid),
    });
    // Moved: ghost at the old position (Proposed) or at the new one (Current), in its space.
    if (rectChange && !rejected(rectChange)) {
      const ghost = sideOf(
        rectChange,
        view === 'proposed' ? rectChange.from : rectChange.to,
        placement,
      );
      if (ghost) {
        ghosts.push({ key: `moved:${id}`, ...ghost, name: null, badges: [] });
      }
    }
  }
  return { view, markings, images, ghosts, removed };
}

/** Badges that stay in view when the marking is small on screen (low zoom, many marks). */
export function importantBadge(badge: ReviewBadge): boolean {
  return (
    badge === 'changed' ||
    badge === 'removed' ||
    badge === 'conflict' ||
    badge === 'invalid'
  );
}

const displayCache = new WeakMap<Project, { proposal: Proposal; project: Project }>();

/**
 * The "how it would look" ready to draw: the images new or replaced by the proposal (not yet
 * applied) point to the file waiting at `proposals/<id>/images/…`. For display
 * only; none of this goes into the project.
 */
export function proposedDisplay(preview: Project, p: Proposal): Project {
  const cached = displayCache.get(preview);
  if (cached && cached.proposal === p) return cached.project;
  const files = new Map<string, string>();
  for (const c of p.changes) {
    if (p.decisions[c.id]?.state === 'rejected' || Object.hasOwn(p.applied, c.id))
      continue;
    const file = changeImageFile(c);
    if (file !== null) files.set(c.entityId, proposalImagePath(p.id, file));
  }
  const project =
    files.size === 0
      ? preview
      : {
          ...preview,
          containers: preview.containers.map((image) => {
            const file = files.get(image.id);
            return file === undefined || image.file === file ? image : { ...image, file };
          }),
        };
  displayCache.set(preview, { proposal: p, project });
  return project;
}
