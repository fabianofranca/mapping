import {
  ENTRIES_FIELD_PREFIX,
  PROPOSAL_FORMAT,
  PROPOSAL_FORMAT_VERSION,
  VALUES_FIELD_PREFIX,
  proposalFormatVersionFor,
  type Change,
  type ChangeEntity,
  type Proposal,
} from './proposal';
import {
  COMPARED_FIELDS,
  annotationField,
  annotationValue,
  arrowValue,
  imageField,
  imageFieldsFor,
  imageValue,
  jsonEqual,
  layerField,
  layerValue,
  markingField,
  markingFieldsFor,
  markingValue,
  pageField,
  pageValue,
  docRepoValue,
  projectValue,
  platformRepoValue,
  specializationValue,
  toJson,
} from './proposalValues';
import { siblingPosition } from './markings';
import { proposalAnchors, simulateApplied } from './proposalAnchors';
import { projectIndex } from './projectIndex';
import type { Annotation, JsonValue, Marking, Page, Project } from './types';

// Computing the changes (stage 4): whoever sends the proposal applies the operations to a copy
// of the project with the model's pure operations (the MCP batch, `mcp/batch.ts`) and delivers
// the before and the after; here they are compared entity by entity, field by field.
// The ids of the created entities are those of the "after": they are already the final ones.

type Draft = Omit<Change, 'id'>;

function byId<T extends { readonly id: string }>(list: readonly T[]): Map<string, T> {
  return new Map(list.map((item) => [item.id, item]));
}

/**
 * Indices of `seq` that form the longest increasing subsequence (the items that do not
 * need to move to reach the new order).
 */
function longestIncreasing(seq: readonly number[]): Set<number> {
  const tails: number[] = [];
  const prev: number[] = new Array<number>(seq.length).fill(-1);
  seq.forEach((value, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((seq[tails[mid] as number] as number) < value) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1] as number;
    tails[lo] = i;
  });
  const keep = new Set<number>();
  let k = tails.length > 0 ? (tails[tails.length - 1] as number) : -1;
  while (k >= 0) {
    keep.add(k);
    k = prev[k] as number;
  }
  return keep;
}

/**
 * Order among siblings (same space and same parent): whatever is outside the longest increasing
 * subsequence of the applied array's order changes position. The applied array is what
 * `patchProject` builds without the `position`s (`simulateApplied`): the previous one, with each
 * created one before its anchor and the settle. `from` is the index among the siblings before
 * (`null` for a created one); `to`, the index among the siblings after.
 */
function markingPositions(
  diff: Diff,
  base: Project,
  after: Project,
  anchors: ReadonlyMap<string, string>,
): void {
  const baseIds = new Set(base.markings.map((m) => m.id));
  const applied = simulateApplied(base, after, anchors).markings;
  const rank = new Map<string, number>(applied.map((m, i) => [m.id, i]));
  const groups = new Map<string, Marking[]>();
  for (const m of after.markings) {
    const key = `${m.containerId ?? ''}|${m.parentId ?? ''}`;
    const group = groups.get(key);
    if (group) group.push(m);
    else groups.set(key, [m]);
  }
  for (const group of groups.values()) {
    const keep = longestIncreasing(group.map((m) => rank.get(m.id) ?? 0));
    group.forEach((m, i) => {
      if (keep.has(i)) return;
      diff.push({
        entity: 'marking',
        entityId: m.id,
        imageId: m.containerId,
        markingId: m.id,
        kind: 'update',
        field: 'position',
        from: baseIds.has(m.id) ? siblingPosition(base, m.id).index : null,
        to: i,
      });
    });
  }
}

/**
 * Order of a list of the Project group (layers, pages): after applying creations (at the end) and
 * removals, the existing ones keep the order from before and the created ones the order from
 * after. Whatever is outside the longest increasing subsequence changes `position`; `from` is the
 * index before (`null` for a created one) and `to` the index after.
 */
function positionChanges(
  diff: Diff,
  entity: 'layer' | 'page',
  before: readonly { readonly id: string }[],
  after: readonly { readonly id: string }[],
): void {
  const known = new Set(before.map((item) => item.id));
  const rank = new Map<string, number>(before.map((item, i) => [item.id, i]));
  after
    .filter((item) => !known.has(item.id))
    .forEach((item, i) => rank.set(item.id, before.length + i));
  const keep = longestIncreasing(after.map((item) => rank.get(item.id) ?? 0));
  after.forEach((item, i) => {
    if (keep.has(i)) return;
    diff.push({
      entity,
      entityId: item.id,
      imageId: null,
      markingId: null,
      kind: 'update',
      field: 'position',
      from: known.has(item.id) ? (rank.get(item.id) ?? null) : null,
      to: i,
    });
  });
}

/** Pages (formatVersion 10): creation, removal, rename and, last, the order. */
function pageChanges(diff: Diff, base: Project, after: Project): void {
  const basePages = byId(base.pages);
  const afterPages = byId(after.pages);
  for (const g of [...after.pages, ...base.pages.filter((g) => !afterPages.has(g.id))]) {
    const before = basePages.get(g.id);
    const next = afterPages.get(g.id);
    diff.entity(
      'page',
      g.id,
      { imageId: null, markingId: null },
      before,
      next,
      pageValue,
      COMPARED_FIELDS.page,
      (page: Page, f) => pageField(page === before ? base : after, page, f),
    );
  }
  positionChanges(diff, 'page', base.pages, after.pages);
}

/**
 * Does a created or removed root carry its `pageId`? Not on the first page, which is where a root
 * with no `pageId` goes when applied (so a proposal that only creates there stays as it always
 * was); yes on any other, and on a page the proposal removes (so removing the page requires
 * removing what is on it).
 */
function pageCarrier(base: Project, after: Project): (pageId: string) => boolean {
  const first = base.pages[0]?.id;
  const kept = new Set(after.pages.map((g) => g.id));
  return (pageId) => pageId !== first || !kept.has(pageId);
}

class Diff {
  readonly out: Draft[] = [];

  /** Puts `insertBefore` (the anchor) on the marking creations that have one. */
  insertBefore(anchors: ReadonlyMap<string, string>): void {
    this.out.forEach((d, i) => {
      const anchor = anchors.get(d.entityId);
      if (d.entity === 'marking' && d.kind === 'create' && anchor !== undefined) {
        this.out[i] = { ...d, insertBefore: anchor };
      }
    });
  }

  push(draft: Draft): void {
    this.out.push(draft);
  }

  /**
   * Creation, removal or a per-field change, depending on whether it exists before and/or after.
   */
  entity<T>(
    entity: ChangeEntity,
    entityId: string,
    where: { imageId: string | null; markingId: string | null },
    before: T | undefined,
    after: T | undefined,
    value: (item: T) => JsonValue,
    fields: readonly string[],
    get: (item: T, field: string) => JsonValue | undefined,
  ): void {
    const base = { entity, entityId, ...where };
    if (before === undefined && after !== undefined) {
      this.push({ ...base, kind: 'create', field: null, from: null, to: value(after) });
    } else if (before !== undefined && after === undefined) {
      this.push({ ...base, kind: 'remove', field: null, from: value(before), to: null });
    } else if (before !== undefined && after !== undefined) {
      for (const field of fields) {
        const from = get(before, field) ?? null;
        const to = get(after, field) ?? null;
        if (!jsonEqual(from, to)) this.push({ ...base, kind: 'update', field, from, to });
      }
    }
  }
}

/** Changes of an annotation: a type change carries `values` and `entries` along. */
function annotationChanges(
  diff: Diff,
  where: { imageId: string | null; markingId: string },
  before: Annotation | undefined,
  after: Annotation | undefined,
): void {
  const entityId = (after ?? before)?.id ?? '';
  if (!before || !after) {
    diff.entity(
      'annotation',
      entityId,
      where,
      before,
      after,
      annotationValue,
      [],
      () => undefined,
    );
    return;
  }
  const fields: string[] = [...COMPARED_FIELDS.annotation];
  if (!jsonEqual(toJson(before.type), toJson(after.type))) {
    fields.push('type');
  } else {
    const keys = new Set([
      ...Object.keys(after.values ?? {}),
      ...Object.keys(before.values ?? {}),
    ]);
    for (const key of keys) fields.push(`${VALUES_FIELD_PREFIX}${key}`);
    const entryIds = new Set([...after.entries, ...before.entries].map((e) => e.id));
    for (const entryId of entryIds) fields.push(`${ENTRIES_FIELD_PREFIX}${entryId}`);
  }
  diff.entity(
    'annotation',
    entityId,
    where,
    before,
    after,
    annotationValue,
    fields,
    (a, f) => annotationField(a, f),
  );
}

/** The keys of the after and, at the end, those that only existed before. */
function recordKeys(before: object, after: object): string[] {
  return [
    ...Object.keys(after),
    ...Object.keys(before).filter((k) => !Object.hasOwn(after, k)),
  ];
}

/** The value of the record's own key, or `undefined`. */
function ownValue<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/**
 * Changes of a whole project entity (without fields): updated with an `update` with a null
 * `field`, created and removed like any entity.
 */
function wholeEntityDiff<T>(
  diff: Diff,
  entity: 'specialization' | 'platformRepo' | 'docRepo',
  spec: {
    keys: readonly string[];
    before: (key: string) => T | undefined;
    next: (key: string) => T | undefined;
    value: (item: T) => JsonValue;
  },
): void {
  const projectLevel = { imageId: null, markingId: null };
  for (const key of spec.keys) {
    const before = spec.before(key);
    const next = spec.next(key);
    if (before && next) {
      const from = spec.value(before);
      const to = spec.value(next);
      if (!jsonEqual(from, to)) {
        diff.push({
          entity,
          entityId: key,
          ...projectLevel,
          kind: 'update',
          field: null,
          from,
          to,
        });
      }
    } else {
      diff.entity(
        entity,
        key,
        projectLevel,
        before,
        next,
        spec.value,
        [],
        () => undefined,
      );
    }
  }
}

/** The after list and, at the end, the ones that only existed before. */
function union<T extends { readonly id: string }>(
  next: readonly T[],
  previous: readonly T[],
  nextIds: ReadonlyMap<string, T>,
): T[] {
  return [...next, ...previous.filter((item) => !nextIds.has(item.id))];
}

/** Containers: creation, fields (the page swap carries the placement) and removal. */
function containerChanges(
  diff: Diff,
  base: Project,
  after: Project,
  carries: (pageId: string) => boolean,
): void {
  const baseImages = byId(base.containers);
  const afterImages = byId(after.containers);
  for (const image of union(after.containers, base.containers, afterImages)) {
    const before = baseImages.get(image.id);
    const next = afterImages.get(image.id);
    diff.entity(
      'image',
      image.id,
      { imageId: image.id, markingId: null },
      before,
      next,
      (i) => imageValue(i, carries(i.pageId)),
      before && next ? imageFieldsFor(before, next) : [],
      imageField,
    );
  }
}

/** Markings: creation, fields (the space and page swaps carry the `rect`), removal, anchors and order. */
function markingChanges(
  diff: Diff,
  base: Project,
  after: Project,
  carries: (pageId: string) => boolean,
): void {
  const baseMarkings = byId(base.markings);
  const afterMarkings = byId(after.markings);
  const basePage = projectIndex(base).pageOf;
  for (const m of union(after.markings, base.markings, afterMarkings)) {
    const before = baseMarkings.get(m.id);
    const next = afterMarkings.get(m.id);
    diff.entity(
      'marking',
      m.id,
      // Null `imageId` with `markingId`: the canvas marking (the review's Canvas group).
      { imageId: m.containerId, markingId: m.id },
      before,
      next,
      (marking) => markingValue(marking, carries(marking.pageId ?? '')),
      before && next ? markingFieldsFor(before, next, basePage.get(m.id) ?? null) : [],
      (marking, f) => markingField(marking === before ? base : after, marking, f),
    );
  }
  const anchors = proposalAnchors(base, after);
  diff.insertBefore(anchors);
  markingPositions(diff, base, after, anchors);
}

/**
 * Compares the project before and after the operations and returns the changes, with ids
 * `c1`, `c2`… in order: Project group (specializations, repositories, layers, pages), images,
 * markings, arrows and annotations; in each collection, the after order and, at the end, the
 * removed ones. The review groups by image and item (`reviewTree`), so this order only
 * guarantees that applying everything appends the created entities in the same order as the
 * proposed project. The order of the pairs inside the list does not become a change; that of
 * layers, pages and sibling markings does (`position`, only for those whose relative order changes).
 * `needsReview` does not become a change: the review is the check itself (the creation carries
 * the after value).
 */
export function computeChanges(base: Project, after: Project): Change[] {
  const diff = new Diff();
  const projectLevel = { imageId: null, markingId: null };

  // Specializations, repositories per platform and document repositories (schema v14):
  // whole entities, without fields.
  const baseSpecs = byId(base.specializations);
  const afterSpecs = byId(after.specializations);
  wholeEntityDiff(diff, 'specialization', {
    keys: [
      ...after.specializations.map((s) => s.id),
      ...base.specializations.filter((s) => !afterSpecs.has(s.id)).map((s) => s.id),
    ],
    before: (k) => baseSpecs.get(k),
    next: (k) => afterSpecs.get(k),
    value: specializationValue,
  });
  wholeEntityDiff(diff, 'platformRepo', {
    keys: recordKeys(base.platformRepos, after.platformRepos),
    before: (k) => ownValue(base.platformRepos, k),
    next: (k) => ownValue(after.platformRepos, k),
    value: platformRepoValue,
  });
  // The local clone by id.
  wholeEntityDiff(diff, 'docRepo', {
    keys: recordKeys(base.docRepos, after.docRepos),
    before: (k) => ownValue(base.docRepos, k),
    next: (k) => ownValue(after.docRepos, k),
    value: docRepoValue,
  });

  // Project drawing mode (formatVersion 6): the `project` entity, only changed.
  const modeFrom = projectValue(base);
  const modeTo = projectValue(after);
  if (!jsonEqual(modeFrom, modeTo)) {
    diff.push({
      entity: 'project',
      entityId: 'project',
      ...projectLevel,
      kind: 'update',
      field: null,
      from: modeFrom,
      to: modeTo,
    });
  }

  // Layers: creation, fields, removal and, last, the order.
  const baseLayers = byId(base.layers);
  const afterLayers = byId(after.layers);
  for (const l of [
    ...after.layers,
    ...base.layers.filter((l) => !afterLayers.has(l.id)),
  ]) {
    diff.entity(
      'layer',
      l.id,
      projectLevel,
      baseLayers.get(l.id),
      afterLayers.get(l.id),
      layerValue,
      COMPARED_FIELDS.layer,
      (layer, f) => layerField(after, layer, f),
    );
  }
  positionChanges(diff, 'layer', base.layers, after.layers);
  pageChanges(diff, base, after);

  // Images, markings and annotations, each collection in the after order and then the
  // removed ones in the before order: applying everything appends the created ones in the same
  // order.
  const baseMarkings = byId(base.markings);
  const afterMarkings = byId(after.markings);
  const baseArrows = byId(base.arrows);
  const afterArrows = byId(after.arrows);
  const baseAnnotations = byId(base.annotations);
  const afterAnnotations = byId(after.annotations);
  const carries = pageCarrier(base, after);
  containerChanges(diff, base, after, carries);
  markingChanges(diff, base, after, carries);

  // The arrow appears in the review under the origin marking: its container (or the canvas).
  // Creating and removing are the only changes (no field of an arrow that already exists is
  // proposed, and the route never comes from a proposal); the annotation on an arrow carries
  // the same container.
  const containerOfMarking = (markingId: string): string | null =>
    (afterMarkings.get(markingId) ?? baseMarkings.get(markingId))?.containerId ?? null;
  const containerOfOwner = (ownerId: string): string | null => {
    const marking = afterMarkings.get(ownerId) ?? baseMarkings.get(ownerId);
    if (marking) return marking.containerId;
    const arrow = afterArrows.get(ownerId) ?? baseArrows.get(ownerId);
    return arrow ? containerOfMarking(arrow.from) : null;
  };
  for (const a of union(after.arrows, base.arrows, afterArrows)) {
    diff.entity(
      'arrow',
      a.id,
      { imageId: containerOfMarking(a.from), markingId: a.id },
      baseArrows.get(a.id),
      afterArrows.get(a.id),
      arrowValue,
      COMPARED_FIELDS.arrow,
      () => undefined,
    );
  }
  for (const a of union(after.annotations, base.annotations, afterAnnotations)) {
    annotationChanges(
      diff,
      { imageId: containerOfOwner(a.markingId), markingId: a.markingId },
      baseAnnotations.get(a.id),
      afterAnnotations.get(a.id),
    );
  }

  return diff.out.map((draft, i) => ({ id: `c${i + 1}`, ...draft }));
}

export interface NewProposalArgs {
  /** Id of the proposal (folder name in `proposals/`). Default: `crypto.randomUUID()`. */
  readonly id?: string;
  readonly title: string;
  readonly description?: string | null;
  readonly origin?: string | null;
  readonly author?: string | null;
  /** ISO 8601 creation date. */
  readonly createdAt: string;
  /** Proposal superseded by this one. */
  readonly supersedes?: string | null;
  /** The operations sent, kept for reference only. */
  readonly operations?: readonly JsonValue[];
}

/**
 * Builds an open proposal from the project read (`base`, whose `revision` becomes
 * `baseRevision`) and the result of the operations (`after`).
 */
export function buildProposal(
  base: Project,
  after: Project,
  args: NewProposalArgs,
): Proposal {
  const clean = (text: string | null | undefined) => {
    const trimmed = text?.trim() ?? '';
    return trimmed === '' ? null : trimmed;
  };
  const changes = computeChanges(base, after);
  return {
    format: PROPOSAL_FORMAT,
    formatVersion: proposalFormatVersionFor(changes, PROPOSAL_FORMAT_VERSION),
    id: args.id ?? crypto.randomUUID(),
    title: args.title.trim(),
    description: clean(args.description),
    origin: clean(args.origin),
    author: clean(args.author),
    createdAt: args.createdAt,
    baseRevision: base.revision,
    supersedes: args.supersedes ?? null,
    status: 'open',
    revision: 0,
    operations: (args.operations ?? []).map(toJson),
    changes,
    decisions: {},
    notes: [],
    applied: {},
  };
}
