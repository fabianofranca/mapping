import { isSameAspect, scaleRect } from './containers';
import { withoutDensity } from './density';
import { snapPlacement } from './geometry';
import { setProjectDirection } from './direction';
import { setProjectDrawingMode } from './drawingMode';
import { clearArrowRoutes, settleHierarchy } from './hierarchySettle';
import { reconcilePerspectives } from './perspectiveReconcile';
import { anchorsOfChanges, placeCreatedMarkings } from './proposalOrder';
import { validateProject, type InvariantCode } from './invariants';
import { packageDirOf } from './libraryPackage';
import {
  ENTRIES_FIELD_PREFIX,
  VALUES_FIELD_PREFIX,
  proposalImagePath,
  proposalPackageDir,
  type Change,
  type ChangeEntity,
  type Proposal,
} from './proposal';
import { proposalIndex } from './proposalReview';
import { isRecord } from './refs';
import type { Spec } from './spec';
import { fieldOf, findTypeInSpec } from './specLookup';
import { projectIndex } from './projectIndex';
import type {
  Annotation,
  AnnotationTypeRef,
  Arrow,
  Entry,
  ExternalSource,
  JsonValue,
  Layer,
  LayerSpecRef,
  Marking,
  Placement,
  DocRepo,
  PlatformRepo,
  Project,
  ProjectContainer,
  ReadingDirection,
  ProjectSpecialization,
  Rect,
  TypedValues,
} from './types';

// Applying a proposal (stage 4): the current project plus the accepted changes become the
// new project, without the model operations: the review is the decision (the lock does not
// prevent it, and stays on), and the result goes through the invariants of `validateProject`.
// The changes arrive validated by `parseProposal` (or assembled by `buildProposal`).

export type PatchProblemCode = 'entity-missing' | 'entity-exists' | 'field-mismatch';

/**
 * A change that could not be applied: a change to an entity that no longer exists
 * (`entity-missing`), creation of an id that already exists (`entity-exists`) or a field that
 * does not fit the current entity (`field-mismatch`, e.g. `values.*` on an annotation that became
 * free, or `values.<key>` with a new value on a key that is not a field of the type, like the
 * code field removed in stage 9 in an old proposal). Clearing (`to: null`) a key outside the
 * type is not a conflict: the key leaves `values`.
 */
export interface PatchProblem {
  readonly code: PatchProblemCode;
  readonly changeId: string;
}

/**
 * The `project` entity (formatVersion 6): the drawing mode (`null` = no mode pinned) and, in
 * formatVersion 8, the reading direction (absent or `null` = no direction pinned).
 */
interface ProjectModeEntity {
  readonly drawingMode: string | null;
  readonly direction?: ReadingDirection | null;
}

type Entity =
  | ProjectSpecialization
  | PlatformRepo
  | DocRepo
  | ProjectModeEntity
  | Layer
  | ProjectContainer
  | Marking
  | Arrow
  | Annotation;

/** Order of application: creations and changes from top to bottom, removals from bottom to top. */
const UPSERT_PHASE: Record<ChangeEntity, number> = {
  specialization: 0,
  platformRepo: 1,
  docRepo: 2,
  project: 3,
  layer: 4,
  image: 5,
  marking: 6,
  arrow: 7,
  annotation: 8,
};
const REMOVE_PHASE: Record<ChangeEntity, number> = {
  annotation: 9,
  arrow: 10,
  marking: 11,
  image: 12,
  layer: 13,
  project: 14,
  specialization: 15,
  platformRepo: 16,
  docRepo: 17,
};

/**
 * The arrow of a creation: what the proposal carries, with the format's defaults and `points`
 * always empty (the route belongs to the person only and never comes from a proposal; a `points`
 * in the value is discarded).
 */
function decodeArrow(value: JsonValue): Arrow {
  const v = isRecord(value) ? value : {};
  const side = (x: JsonValue | undefined): Arrow['fromSide'] =>
    x === 'top' || x === 'right' || x === 'bottom' || x === 'left' ? x : null;
  return {
    id: v.id as string,
    from: v.from as string,
    to: v.to as string,
    fromSide: side(v.fromSide),
    toSide: side(v.toSide),
    points: [],
    style: v.style === 'straight' || v.style === 'elbow' ? v.style : 'curve',
    name: typeof v.name === 'string' ? v.name : null,
    locked: v.locked === true,
  };
}

function decode(entity: ChangeEntity, value: JsonValue): Entity {
  if (entity === 'arrow') return decodeArrow(value);
  // Proposal written before v14: an annotation without `parentRole` counts as having no role.
  if (entity === 'annotation' && isRecord(value) && !('parentRole' in value)) {
    return { ...value, parentRole: null } as unknown as Entity;
  }
  if (entity === 'specialization' && isRecord(value)) {
    return {
      id: value.id as string,
      version: value.version as number,
      file: value.file as string,
      spec: (value.spec ?? null) as unknown as Spec | null,
    };
  }
  return value as unknown as Entity;
}

/**
 * `false` if the key is not a field of the annotation's type, in the specialization as it is in
 * the project being assembled. A type that cannot be resolved (specialization missing or without
 * a copy) does not decide: `true`, and the value becomes pending like any other.
 */
function typeHasField(
  specializations: ReadonlyMap<string, Entity>,
  type: AnnotationTypeRef | null,
  key: string,
): boolean {
  if (type === null) return true;
  const spec = (specializations.get(type.specId) as ProjectSpecialization | undefined)
    ?.spec;
  const resolved = spec ? findTypeInSpec(spec, type.typeId) : null;
  return resolved === null || fieldOf(resolved.type, key) !== null;
}

/**
 * File swap in the same proposal: `needsReview` does not become a change, so the marking whose
 * `rect` is not the pure rescale (it grew up to the minimum) or whose aspect changed gets it here,
 * as `replaceContainer` does in the app.
 */
function flagResized(
  p: Project,
  containers: ReadonlyMap<string, Entity>,
  before: Marking,
  after: Marking,
): Marking {
  const id = before.containerId;
  const old = id === null ? undefined : projectIndex(p).containers.get(id);
  const now = id === null ? undefined : (containers.get(id) as ProjectContainer);
  if (!old || !now || old.file === now.file || after.needsReview) return after;
  const plain =
    isSameAspect(old, now) && sameRect(scaleRect(before.rect, old, now), after.rect);
  return plain ? after : { ...after, needsReview: true };
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** The entity with the change's field applied; `null` if the field does not fit it. */
function withField(
  entity: ChangeEntity,
  current: Entity,
  c: Change,
  specializations: ReadonlyMap<string, Entity>,
): Entity | null {
  const field = c.field ?? '';
  const to = c.to;
  switch (entity) {
    case 'image': {
      const i = current as ProjectContainer;
      // A container without a file does not swap files; color and size only exist on it.
      const noFile = i.file === null;
      if (noFile && field === 'file') return null;
      if (!noFile && (field === 'background' || field === 'size')) return null;
      if (field === 'size' && isRecord(to)) {
        return { ...i, width: to.width as number, height: to.height as number };
      }
      if (field === 'file' && isRecord(to)) {
        return {
          ...i,
          file: to.file as string,
          width: to.width as number,
          height: to.height as number,
        };
      }
      if (field === 'density') {
        // `null` goes back to 1: the key leaves (the file only keeps the declared density).
        if (to === null || to === 1) return withoutDensity(i);
        return { ...i, density: to as number };
      }
      if (field === 'placement')
        return { ...i, placement: snapPlacement(to as unknown as Placement) };
      if (field === 'source')
        return { ...i, source: to as unknown as ExternalSource | null };
      return { ...i, [field]: to };
    }
    case 'marking': {
      const m = current as Marking;
      if (field === 'rect') return { ...m, rect: to as unknown as Rect };
      // Space swap: the container (or the canvas) and the `rect` in it, together.
      if (field === 'space' && isRecord(to)) {
        return {
          ...m,
          containerId: (to.containerId ?? null) as string | null,
          rect: to.rect as unknown as Rect,
        };
      }
      if (field === 'source')
        return { ...m, source: to as unknown as ExternalSource | null };
      return { ...m, [field]: to };
    }
    case 'layer': {
      const l = current as Layer;
      if (field === 'spec') return { ...l, spec: to as unknown as LayerSpecRef | null };
      return { ...l, [field]: to };
    }
    case 'arrow':
      // The arrow is only created and removed (none of its fields is proposed): it does not fit.
      return null;
    case 'annotation': {
      const a = current as Annotation;
      if (field === 'type' && isRecord(to)) {
        return {
          ...a,
          type: (to.type ?? null) as unknown as AnnotationTypeRef | null,
          values: (to.values ?? null) as TypedValues | null,
          entries: (to.entries ?? []) as unknown as Entry[],
        };
      }
      if (field.startsWith(VALUES_FIELD_PREFIX)) {
        if (a.values === null) return null;
        const key = field.slice(VALUES_FIELD_PREFIX.length);
        if (!typeHasField(specializations, a.type, key)) {
          // Clearing (`to: null`) a key the type no longer has only drops the orphan value (e.g.
          // the field left in a `remove-field`/`rename-field` migration of the same proposal): the
          // key leaves `values`. With a new value, a key outside the type does not fit.
          if (to !== null) return null;
          const rest = Object.fromEntries(
            Object.entries(a.values).filter(([k]) => k !== key),
          ) as TypedValues;
          return { ...a, values: rest };
        }
        return { ...a, values: { ...a.values, [key]: to } };
      }
      if (field.startsWith(ENTRIES_FIELD_PREFIX)) {
        if (a.type !== null) return null;
        const entryId = field.slice(ENTRIES_FIELD_PREFIX.length);
        if (!isRecord(to))
          return { ...a, entries: a.entries.filter((e) => e.id !== entryId) };
        const entry: Entry = {
          id: entryId,
          key: to.key as string,
          value: to.value as string,
        };
        const exists = a.entries.some((e) => e.id === entryId);
        return {
          ...a,
          entries: exists
            ? a.entries.map((e) => (e.id === entryId ? entry : e))
            : [...a.entries, entry],
        };
      }
      return { ...a, [field]: to };
    }
    case 'specialization':
    case 'platformRepo':
    case 'docRepo':
    case 'project':
      return decode(entity, to);
  }
}

/**
 * Applies the marking `position`s by group of siblings (same space and same parent, already
 * settled), all together (stage #549, decision 4): takes the repositioned ones out of the group and
 * puts them back in ascending order of `to`, each at index `to` among the siblings, clamped to the
 * valid range. The siblings take the same slots of the array (like `reorderMarking`). A single
 * change gives the same as `reorderMarking`; two for the same marking, the last one wins.
 */
function placeAmongSiblings(markings: Marking[], changes: readonly Change[]): void {
  const byGroup = new Map<string, Change[]>();
  const byId = new Map(markings.map((m) => [m.id, m]));
  // The siblings of each group and the slots they occupy, in a single pass.
  const slotsOf = new Map<string, number[]>();
  markings.forEach((m, slot) => {
    const key = siblingKey(m);
    const slots = slotsOf.get(key);
    if (slots) slots.push(slot);
    else slotsOf.set(key, [slot]);
  });
  for (const c of changes) {
    const m = byId.get(c.entityId);
    if (!m) continue;
    const key = siblingKey(m);
    const list = byGroup.get(key);
    if (list) list.push(c);
    else byGroup.set(key, [c]);
  }
  for (const [key, group] of byGroup) {
    placeGroup(markings, group, byId, slotsOf.get(key) ?? []);
  }
}

const siblingKey = (m: Marking) => `${m.containerId ?? ''}|${m.parentId ?? ''}`;

function placeGroup(
  markings: Marking[],
  group: readonly Change[],
  byId: ReadonlyMap<string, Marking>,
  slots: readonly number[],
): void {
  // Two changes for the same marking: the last one wins, as when applying one by one; without it
  // it would enter twice and another sibling would drop out of the array.
  const latest = new Map(group.map((c) => [c.entityId, c]));
  const siblings = slots.map((slot) => markings[slot] as Marking);
  const order = siblings.filter((m) => !latest.has(m.id));
  for (const c of [...latest.values()].sort(
    (a, b) => (a.to as number) - (b.to as number),
  )) {
    order.splice(
      Math.min(c.to as number, order.length),
      0,
      byId.get(c.entityId) as Marking,
    );
  }
  slots.forEach((slot, i) => {
    markings[slot] = order[i] as Marking;
  });
}

const hasDirection = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && 'direction' in v;

/**
 * The project change of a proposal that predates direction (no `direction` in `from` or in
 * `to`) does not mention it: the current direction stays. With `direction` in `from`, its absence
 * in `to` is the removal (`projectValue` does not write the field without a direction).
 */
function keepProjectDirection(c: Change, current: Entity, next: Entity): Entity {
  if (hasDirection(c.from) || hasDirection(c.to)) return next;
  return { ...next, direction: (current as ProjectModeEntity).direction ?? null };
}

export interface PatchResult {
  readonly project: Project;
  readonly problems: readonly PatchProblem[];
}

/**
 * Applies `changes` to the project, without validating the result: creations go to the end of
 * the lists (a marking before the `insertBefore` anchor, if it has one and it is in the list),
 * removals of an absent entity do nothing, the repositioned layers go to the proposed index (in
 * ascending order), and the repositioned markings of the same group of siblings, all together
 * (`placeAmongSiblings`). What could not be applied comes back in `problems` and stays out.
 * Touching a marking or container settles ownership (`settleHierarchy`) before the positions: the
 * parent always comes from the geometry, never from the proposal, and the siblings are those of
 * the space and parent already settled. The created arrow enters with `points: []`, and the
 * arrow that already existed loses its waypoints if an end changes space.
 */
export function patchProject(p: Project, changes: readonly Change[]): PatchResult {
  const maps: Record<ChangeEntity, Map<string, Entity>> = {
    specialization: new Map(p.specializations.map((s) => [s.id, s])),
    platformRepo: new Map(Object.entries(p.platformRepos)),
    docRepo: new Map(Object.entries(p.docRepos)),
    project: new Map([
      ['project', { drawingMode: p.drawingMode ?? null, direction: p.direction ?? null }],
    ]),
    layer: new Map(p.layers.map((l) => [l.id, l])),
    image: new Map(p.containers.map((i) => [i.id, i])),
    marking: new Map(p.markings.map((m) => [m.id, m])),
    arrow: new Map(p.arrows.map((a) => [a.id, a])),
    annotation: new Map(p.annotations.map((a) => [a.id, a])),
  };
  const problems: PatchProblem[] = [];
  const positions: Change[] = [];
  const markingPositions: Change[] = [];
  const phase = (c: Change) =>
    c.kind === 'remove' ? REMOVE_PHASE[c.entity] : UPSERT_PHASE[c.entity];
  const ordered = changes
    .map((c, i) => ({ c, i }))
    .sort((a, b) => phase(a.c) - phase(b.c) || a.i - b.i)
    .map(({ c }) => c);

  for (const c of ordered) {
    const map = maps[c.entity];
    if (c.kind === 'create') {
      if (map.has(c.entityId)) problems.push({ code: 'entity-exists', changeId: c.id });
      else map.set(c.entityId, decode(c.entity, c.to));
    } else if (c.kind === 'remove') {
      map.delete(c.entityId);
    } else if (
      (c.entity === 'layer' || c.entity === 'marking') &&
      c.field === 'position'
    ) {
      if (!map.has(c.entityId)) problems.push({ code: 'entity-missing', changeId: c.id });
      else if (c.entity === 'layer') positions.push(c);
      else markingPositions.push(c);
    } else {
      const current = map.get(c.entityId);
      let next = current && withField(c.entity, current, c, maps.specialization);
      if (next && c.entity === 'marking' && c.field === 'rect') {
        next = flagResized(p, maps.image, current as Marking, next as Marking);
      }
      if (!current) problems.push({ code: 'entity-missing', changeId: c.id });
      else if (!next) problems.push({ code: 'field-mismatch', changeId: c.id });
      else
        map.set(
          c.entityId,
          c.entity === 'project' ? keepProjectDirection(c, current, next) : next,
        );
    }
  }

  const layers = [...maps.layer.values()] as Layer[];
  for (const c of [...positions].sort((a, b) => (a.to as number) - (b.to as number))) {
    const from = layers.findIndex((l) => l.id === c.entityId);
    // A layer that the same proposal removes is not repositioned (`splice(-1, 1)` would
    // drop another).
    if (from < 0) continue;
    const [layer] = layers.splice(from, 1);
    if (layer) layers.splice(Math.min(c.to as number, layers.length), 0, layer);
  }

  let markings = placeCreatedMarkings(
    [...maps.marking.values()] as Marking[],
    anchorsOfChanges(ordered, new Set(p.markings.map((m) => m.id))),
  );
  let containers = [...maps.image.values()] as ProjectContainer[];
  let arrows = [...maps.arrow.values()] as Arrow[];
  if (changes.some((c) => c.entity === 'marking' || c.entity === 'image')) {
    // The perspectives are reconciled only once, at the end, with the final project (below).
    const settled = settleHierarchy({
      ...p,
      perspectives: [],
      arrivals: [],
      containers,
      markings,
      arrows,
    });
    markings = [...settled.markings];
    containers = [...settled.containers];
    arrows = [...settled.arrows];
    // An end that changed space (by the proposal's `space` or by the settle) takes the arrow
    // back to the default route: the `points` stay in the space of both ends.
    const before = projectIndex(p).markings;
    const moved = new Set<string>();
    for (const m of markings) {
      const old = before.get(m.id);
      if (old && old.containerId !== m.containerId) moved.add(m.id);
    }
    arrows = [...clearArrowRoutes({ ...p, arrows }, moved).arrows];
  }
  placeAmongSiblings(markings, markingPositions);

  const projectEntity = maps.project.get('project') as ProjectModeEntity | undefined;
  const assembled: Project = {
    ...p,
    specializations: [...maps.specialization.values()] as ProjectSpecialization[],
    platformRepos: Object.fromEntries(maps.platformRepo) as Record<string, PlatformRepo>,
    docRepos: Object.fromEntries(maps.docRepo) as Record<string, DocRepo>,
    layers,
    containers,
    markings,
    arrows,
    annotations: [...maps.annotation.values()] as Annotation[],
  };
  const project = setProjectDirection(
    setProjectDrawingMode(assembled, projectEntity?.drawingMode ?? null),
    projectEntity?.direction ?? null,
  );
  return { project: reconcilePerspectives(p, project), problems };
}

// ---------------------------------------------------------------------------
// Validation of the accepted set

export type ProposalIssueCode =
  | InvariantCode
  | PatchProblemCode
  /** Layer or typed annotation of a specialization that would not stay applied. */
  | 'missing-specialization'
  /** The proposal is neither open nor superseded: nothing else can be applied. */
  | 'proposal-closed';

/**
 * A problem that blocks "Apply accepted". `changeIds`: the accepted changes involved
 * (rejecting one of them resolves it); `related`: the changes without a decision on the same
 * entities (accepting one of them may resolve it, e.g. the missing parent's position).
 */
export interface ProposalIssue {
  readonly code: ProposalIssueCode;
  /** Entity with the problem (in an invariant's, the `id` of the `InvariantIssue`). */
  readonly id: string;
  readonly otherId?: string;
  readonly changeIds: readonly string[];
  readonly related: readonly string[];
}

/** Changes that "Apply accepted" carries out: accepted and not yet applied. */
export function acceptedPending(p: Proposal): Change[] {
  return p.changes.filter(isAcceptedPending(p));
}

/** The filter of the accepted changes not yet applied (also used by `acceptedPendingIds`). */
export function isAcceptedPending(p: Proposal): (c: Change) => boolean {
  return (c) =>
    p.decisions[c.id]?.state === 'accepted' && !Object.hasOwn(p.applied, c.id);
}

/** Layers and typed annotations that cite a specialization that is not in the project. */
function specializationIssues(p: Project): { id: string; otherId: string }[] {
  const applied = new Set(p.specializations.map((s) => s.id));
  const out: { id: string; otherId: string }[] = [];
  for (const l of p.layers) {
    if (l.spec && !applied.has(l.spec.specId))
      out.push({ id: l.id, otherId: l.spec.specId });
  }
  for (const a of p.annotations) {
    if (a.type && !applied.has(a.type.specId))
      out.push({ id: a.id, otherId: a.type.specId });
  }
  return out;
}

export interface AcceptedValidation {
  readonly ok: boolean;
  /** The changes that would be applied. */
  readonly changeIds: readonly string[];
  readonly issues: readonly ProposalIssue[];
  /** The project with them applied (even if invalid, for the review to show). */
  readonly project: Project;
}

interface Outcome {
  readonly project: Project;
  readonly problems: readonly PatchProblem[];
  /** Invariant problems of the result that the current project did not have yet. */
  readonly fresh: ReturnType<typeof validateProject>;
  /** Specializations cited and missing in the result that the current project did not have yet. */
  readonly freshSpecs: ReturnType<typeof specializationIssues>;
}

let lastOutcome: {
  project: Project;
  pending: readonly Change[];
  outcome: Outcome;
} | null = null;

/**
 * Applies the pending ones and validates the result against the current project. Each review
 * decision revalidates, but the current project and the accepted changes are almost always the
 * same (accepting or rejecting another change, undoing a note): the last computation is kept by
 * identity of the project and of the changes (the project is immutable), and `validateProject`
 * does not run again.
 */
function validateOutcome(project: Project, pending: readonly Change[]): Outcome {
  const last = lastOutcome;
  if (
    last &&
    last.project === project &&
    last.pending.length === pending.length &&
    last.pending.every((c, i) => c === pending[i])
  ) {
    return last.outcome;
  }
  // Nothing to apply: the same project (the store does not create an undo entry).
  const { project: result, problems } =
    pending.length === 0 ? { project, problems: [] } : patchProject(project, pending);
  const key = (code: string, id: string, otherId?: string) =>
    `${code}|${id}|${otherId ?? ''}`;
  const before = new Set(
    validateProject(project).map((i) => key(i.code, i.id, i.otherId)),
  );
  const fresh = validateProject(result).filter(
    (i) => !before.has(key(i.code, i.id, i.otherId)),
  );
  const specBefore = new Set(
    specializationIssues(project).map((i) =>
      key('missing-specialization', i.id, i.otherId),
    ),
  );
  const freshSpecs = specializationIssues(result).filter(
    (i) => !specBefore.has(key('missing-specialization', i.id, i.otherId)),
  );
  const outcome = { project: result, problems, fresh, freshSpecs };
  lastOutcome = { project, pending, outcome };
  return outcome;
}

/**
 * Aplica as aceitas pendentes a uma cópia e valida: invariantes do modelo, especializações
 * citadas e mudanças que não puderam ser aplicadas. Só contam os problemas novos (os que o
 * projeto atual já tinha não bloqueiam).
 */
export function validateAccepted(project: Project, p: Proposal): AcceptedValidation {
  const pending = acceptedPending(p);
  const changeIds = pending.map((c) => c.id);
  if (p.status !== 'open' && p.status !== 'superseded') {
    return {
      ok: pending.length === 0,
      changeIds,
      issues:
        pending.length === 0
          ? []
          : [{ code: 'proposal-closed', id: p.id, changeIds, related: [] }],
      project,
    };
  }
  const {
    project: result,
    problems,
    fresh,
    freshSpecs,
  } = validateOutcome(project, pending);
  const byEntity = new Map<string, Change[]>();
  for (const c of p.changes) {
    if (Object.hasOwn(p.applied, c.id)) continue;
    const list = byEntity.get(c.entityId);
    if (list) list.push(c);
    else byEntity.set(c.entityId, [c]);
  }
  const accepted = new Set(changeIds);
  const involved = (...ids: (string | undefined)[]) => {
    const changes = ids.flatMap((id) =>
      id === undefined ? [] : (byEntity.get(id) ?? []),
    );
    return {
      changeIds: changes.filter((c) => accepted.has(c.id)).map((c) => c.id),
      related: changes.filter((c) => p.decisions[c.id] === undefined).map((c) => c.id),
    };
  };

  const issues: ProposalIssue[] = [];
  const changesById = proposalIndex(p).changes;
  for (const problem of problems) {
    const change = changesById.get(problem.changeId);
    issues.push({
      code: problem.code,
      id: change?.entityId ?? problem.changeId,
      changeIds: [problem.changeId],
      related: [],
    });
  }
  for (const issue of fresh) {
    issues.push({
      code: issue.code,
      id: issue.id,
      ...(issue.otherId === undefined ? {} : { otherId: issue.otherId }),
      ...involved(issue.id, issue.otherId),
    });
  }
  for (const issue of freshSpecs) {
    issues.push({
      code: 'missing-specialization',
      ...issue,
      ...involved(issue.id, issue.otherId),
    });
  }
  return { ok: issues.length === 0, changeIds, issues, project: result };
}

// ---------------------------------------------------------------------------
// Apply accepted

/** Image file to move from `proposals/<id>/…` to its final place. */
export interface ProposalFileMove {
  readonly from: string;
  readonly to: string;
}

/**
 * Library package of a specialization applied now: the `specs/` folder that the change
 * brings (`dir`), where the files wait in the proposal (`from`, copied and not
 * moved) and the specialization (`to.spec`, the source of truth of its file).
 */
export interface ProposalPackage {
  readonly specId: string;
  readonly version: number;
  /** `specs/<pasta>`. */
  readonly dir: string;
  /** `proposals/<id>/specs/<pasta>`. */
  readonly from: string;
  readonly spec: Spec | null;
  /** Path of the specialization's file (`to.file`). */
  readonly file: string;
}

export type ApplyAcceptedResult =
  | {
      readonly ok: true;
      readonly project: Project;
      /** The proposal with `applied` (and the `status`, if everything was decided) updated. */
      readonly proposal: Proposal;
      /** The changes carried out, in the proposal's order. */
      readonly applied: readonly Change[];
      /** New or swapped images to move to `images/`. */
      readonly files: readonly ProposalFileMove[];
      /** Library packages of the specializations created or updated, to copy to `specs/`. */
      readonly packages: readonly ProposalPackage[];
    }
  | { readonly ok: false; readonly issues: readonly ProposalIssue[] };

/**
 * "Apply accepted": carries out only the accepted changes not yet applied (one undo entry
 * for the caller). What has no decision stays pending; a new application later
 * carries out what is accepted in the meantime. When nothing is left without a decision or
 * accepted without being applied, the open proposal becomes `applied`. Blocked (`ok: false`) if
 * the accepted set would leave the project invalid.
 */
export function applyAccepted(
  project: Project,
  p: Proposal,
  at: string,
): ApplyAcceptedResult {
  const validation = validateAccepted(project, p);
  if (!validation.ok) return { ok: false, issues: validation.issues };
  const ids = new Set(validation.changeIds);
  const applied = p.changes.filter((c) => ids.has(c.id));
  const appliedMap = { ...p.applied };
  for (const c of applied) appliedMap[c.id] = { at };
  const done = p.changes.every(
    (c) =>
      p.decisions[c.id] !== undefined &&
      (p.decisions[c.id]?.state === 'rejected' || Object.hasOwn(appliedMap, c.id)),
  );
  const files: ProposalFileMove[] = [];
  for (const c of applied) {
    if (c.entity !== 'image' || !isRecord(c.to)) continue;
    if (c.kind === 'create' || (c.kind === 'update' && c.field === 'file')) {
      const file = c.to.file;
      if (typeof file === 'string')
        files.push({ from: proposalImagePath(p.id, file), to: file });
    }
  }
  const packages: ProposalPackage[] = [];
  for (const c of applied) {
    if (c.entity !== 'specialization' || c.kind === 'remove' || !isRecord(c.to)) continue;
    const { file, version, id: specId } = c.to;
    if (typeof file !== 'string' || typeof version !== 'number') continue;
    const dir = packageDirOf(file);
    if (dir === null || typeof specId !== 'string') continue;
    packages.push({
      specId,
      version,
      dir,
      from: proposalPackageDir(p.id, dir),
      spec: (c.to.spec ?? null) as unknown as Spec | null,
      file,
    });
  }
  return {
    ok: true,
    project: validation.project,
    proposal: {
      ...p,
      applied: appliedMap,
      status: p.status === 'open' && done ? 'applied' : p.status,
    },
    applied,
    files,
    packages,
  };
}

/**
 * The "as it would be" project (the Proposed view): the current one plus the changes not
 * rejected and not yet applied, without validating. What does not fit stays out (`problems`).
 */
export function previewProject(project: Project, p: Proposal): PatchResult {
  return patchProject(
    project,
    p.changes.filter(
      (c) => p.decisions[c.id]?.state !== 'rejected' && !Object.hasOwn(p.applied, c.id),
    ),
  );
}
