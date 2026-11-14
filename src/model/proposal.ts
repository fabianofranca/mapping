import { HEX_COLOR_RE } from './hexColor';
import { z } from 'zod';
import {
  annotationSchema,
  arrowSchema,
  entrySchema,
  containerSchema,
  jsonValue,
  layerSchema,
  anchorSchema,
  markingSchema,
  normalizeIsoDate,
  placementSchema,
  docRepoSchema,
  platformRepoSchema,
  sourceSchema,
} from './schema';
import { PLATFORM_ID_RE, formatSpecPath, specSchema, type SpecIssue } from './spec';
import { READING_DIRECTIONS, type JsonValue } from './types';

// Format of the change proposal (stage 4): `proposals/<id>/proposal.json`, `formatVersion` 4 on
// creation, 5 with `revisions`, 6 with the drawing mode and 7 with the container density (only
// when the proposal uses them: `proposalFormatVersionFor`; 1 to 3 are still read). See
// docs/PROPOSAL-FORMAT.md. The zod schema here is the source of truth; reading returns the errors
// with the exact path (`changes[3].to.rect.width: …`).

export const PROPOSAL_FORMAT = 'mapping-proposal';
export const PROPOSAL_FORMAT_VERSION = 4;
/**
 * Versions read, from 1 to 9: 9 adds the marking's anchor (the marking's `anchor` field and
 * `anchor` in the value of a created marking, schema v20) and is only written when the proposal
 * uses it (it includes what 8 and the earlier ones have); 8 adds the reading direction (the
 * `direction` field of the container and of the project, schema v20) and is only written when
 * the proposal uses it (it includes what 7 and 6 have); 7 adds the container density (the
 * `density` field, schema v19) and is only written when the proposal uses it (it includes what 6
 * has); 6 adds the drawing mode (the `project` entity and the container's `drawingMode` field)
 * and is only written when the proposal uses it; 5 adds `revisions` (the agent's revision); 4
 * adds `insertBefore` to marking creation (its position in the array; an old app refuses 4
 * instead of dropping the field when rewriting the decisions). 3 has no `inherit` on the
 * annotation or compared `parentId` on the marking (the change from an old proposal is
 * ignored, with a warning), and brings the `canvas` level, the composite `space` change and
 * `floating`, and the `create-arrow` and `delete-arrow` changes (`arrow` entity, ME4); 2 adds
 * `add_container` to the `operations`; 1 is still valid. Creation writes 4 (6, with the drawing
 * mode).
 */
export const PROPOSAL_FORMAT_VERSIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/**
 * Proposal version that carries the drawing mode (schema v18): the `project` entity (field
 * `drawingMode`), the container's `drawingMode` field and the `drawingMode` in the value of a
 * created container. An earlier version would refuse the entity and the field, but would
 * silently drop the created container's `drawingMode`; so a proposal that uses it is written as
 * 6 (creation and revision do not raise the version of a proposal that does not use it). 6
 * accepts `revisions` (optional).
 */
export const PROPOSAL_DRAWING_MODE_FORMAT_VERSION = 6;

/** Does the proposal use the drawing mode (so that only `formatVersion` 6 represents it)? */
export function usesDrawingMode(changes: readonly Change[]): boolean {
  return changes.some(
    (c) =>
      c.entity === 'project' ||
      (c.entity === 'image' &&
        (c.field === 'drawingMode' || hasDrawingMode(c.to) || hasDrawingMode(c.from))),
  );
}

/**
 * Proposal version that carries the container density (schema v19): the `density` field and the
 * `density` in the value of a created container. An earlier version would refuse the field, but
 * would silently drop the created container's `density`; so a proposal that uses it is written
 * as 7 (creation and revision do not raise the version of a proposal that does not use it). 7
 * accepts `revisions` (optional) and everything 6 accepts.
 */
export const PROPOSAL_DENSITY_FORMAT_VERSION = 7;

/** Does the proposal use the container density (so that only `formatVersion` 7 represents it)? */
export function usesDensity(changes: readonly Change[]): boolean {
  return changes.some(
    (c) =>
      c.entity === 'image' &&
      (c.field === 'density' || hasDensity(c.to) || hasDensity(c.from)),
  );
}

function hasDensity(value: JsonValue): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { readonly density?: JsonValue }).density === 'number'
  );
}

/**
 * Proposal version that carries the reading direction (schema v20): the `direction` field of the
 * container and of the `project` entity and the `direction` in the value of a created container.
 * An earlier version would silently drop the `direction` of the created container and of the
 * project entity; so a proposal that uses it is written as 8 (creation and revision do not
 * raise the version of a proposal that does not use it). 8 accepts `revisions` (optional) and
 * everything 7 accepts.
 */
export const PROPOSAL_DIRECTION_FORMAT_VERSION = 8;

/** Does the proposal use the reading direction (so that only `formatVersion` 8 represents it)? */
export function proposalUsesDirection(changes: readonly Change[]): boolean {
  return changes.some(
    (c) =>
      (c.entity === 'image' && c.field === 'direction') ||
      ((c.entity === 'image' || c.entity === 'project') &&
        (hasDirection(c.to) || hasDirection(c.from))),
  );
}

function hasDirection(value: JsonValue): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { readonly direction?: JsonValue }).direction === 'string'
  );
}

/**
 * Proposal version that carries the marking's anchor (schema v20): the `anchor` field of a
 * marking (the anchor value or `null`) and the `anchor` in the value of a created marking. An
 * earlier version would silently drop the created marking's anchor (and refuse the new field);
 * so a proposal that uses it is written as 9. `snap_to_anchor` does not need it: it is just the
 * Position (`rect`) change.
 */
export const PROPOSAL_ANCHOR_FORMAT_VERSION = 9;

/** Does the proposal use the marking's anchor (so that only `formatVersion` 9 represents it)? */
export function proposalUsesAnchor(changes: readonly Change[]): boolean {
  return changes.some(
    (c) =>
      c.entity === 'marking' &&
      (c.field === 'anchor' || hasAnchor(c.to) || hasAnchor(c.from)),
  );
}

function hasAnchor(value: JsonValue): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { readonly anchor?: JsonValue }).anchor != null
  );
}

/**
 * The `formatVersion` that creation or revision writes: 9 with an anchor, 8 with a direction, 7
 * with a density, 6 with a drawing mode, otherwise `fallback` (4 on creation, 5 on revision).
 * `current` is the version of the proposal being rewritten: a 6, 7, 8 or 9 never goes down.
 */
export function proposalFormatVersionFor(
  changes: readonly Change[],
  fallback: number,
  current = 0,
): (typeof PROPOSAL_FORMAT_VERSIONS)[number] {
  if (current === PROPOSAL_ANCHOR_FORMAT_VERSION || proposalUsesAnchor(changes)) {
    return PROPOSAL_ANCHOR_FORMAT_VERSION;
  }
  if (current === PROPOSAL_DIRECTION_FORMAT_VERSION || proposalUsesDirection(changes)) {
    return PROPOSAL_DIRECTION_FORMAT_VERSION;
  }
  if (current === PROPOSAL_DENSITY_FORMAT_VERSION || usesDensity(changes)) {
    return PROPOSAL_DENSITY_FORMAT_VERSION;
  }
  if (current === PROPOSAL_DRAWING_MODE_FORMAT_VERSION || usesDrawingMode(changes)) {
    return PROPOSAL_DRAWING_MODE_FORMAT_VERSION;
  }
  return fallback as (typeof PROPOSAL_FORMAT_VERSIONS)[number];
}

function hasDrawingMode(value: JsonValue): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { readonly drawingMode?: JsonValue }).drawingMode === 'string'
  );
}

/**
 * Version written by the agent's revision (`reviseProposal`): 5, with `revisions` at the root (6,
 * when the proposal uses the drawing mode, keeps 6). Creation keeps writing
 * `PROPOSAL_FORMAT_VERSION` (4); whoever rewrites decisions and notes keeps the file's version.
 * See docs/PROPOSAL-FORMAT.md, "Agent revision".
 */
export const PROPOSAL_REVISED_FORMAT_VERSION = 5;
/** Folder of the proposals, relative to the project root. */
export const PROPOSALS_DIR = 'proposals';
/** Name of the proposal file inside `proposals/<id>/`. */
export const PROPOSAL_FILE = 'proposal.json';

/**
 * `open`: under review. `applied`: everything decided and the accepted ones applied.
 * `superseded`: replaced by another (the accepted ones can still be applied; the pending ones
 * cannot). `withdrawn`: withdrawn by the agent.
 */
export type ProposalStatus = 'open' | 'applied' | 'superseded' | 'withdrawn';
export const PROPOSAL_STATUSES: readonly ProposalStatus[] = [
  'open',
  'applied',
  'superseded',
  'withdrawn',
];

export type ChangeKind = 'create' | 'update' | 'remove';

/** Entities a change can alter. The first three form the "Project" group. */
export type ChangeEntity =
  | 'specialization'
  | 'platformRepo'
  | 'docRepo'
  | 'project'
  | 'layer'
  | 'image'
  | 'marking'
  | 'arrow'
  | 'annotation';

export const CHANGE_ENTITIES: readonly ChangeEntity[] = [
  'specialization',
  'platformRepo',
  'docRepo',
  'project',
  'layer',
  'image',
  'marking',
  'arrow',
  'annotation',
];

/**
 * Fields altered on an image (`file` is the swap: `{ file, width, height }`). `background` and
 * `size` (`{ width, height }`) only exist on a container without a file (v10).
 */
export const IMAGE_FIELDS = [
  'name',
  'file',
  'background',
  'size',
  'placement',
  'markingColor',
  'locked',
  'source',
  'drawingMode',
  'density',
  'direction',
] as const;
/**
 * Fields altered on a marking. `space` is the change of space (`{ containerId, rect }`, a null
 * `containerId` is the canvas): it becomes a single change so the reviewer does not accept half
 * of it; `rect` is only a separate field when the space does not change. `floating` is
 * compared; `parentId` is derived (the settle recomputes it) and is not compared. `containerId`
 * alone is the format from before v13, still accepted when reading. `position`: index among the
 * siblings (same space and same parent), only when the relative order changes.
 */
export const MARKING_FIELDS = [
  'name',
  'space',
  'rect',
  'containerId',
  'floating',
  'locked',
  'source',
  'position',
  'anchor',
] as const;
/**
 * The arrow (v13, ME4) only has creation and removal (`create-arrow`, `delete-arrow`): no field
 * is compared. The route (`points`) belongs only to the person and never comes from a proposal;
 * the style, name, lock and endpoints of an arrow that already exists are not proposed either (a
 * change like that is ignored when reading, with a warning). An annotation on an arrow uses the
 * usual annotation changes.
 */
export const ARROW_FIELDS = [] as const;
/**
 * Fixed fields of an annotation. Besides them: `values.<key>` (a field of the typed one) and
 * `entries.<id>` (a pair of the free one). `type` is the type swap, which carries `type`,
 * `values` and `entries` together (e.g. the conversion to free when removing a specialization).
 */
export const ANNOTATION_FIELDS = [
  'name',
  'parentAnnotationId',
  'parentRole',
  'markingId',
  'layerId',
  'type',
] as const;
/** `position` is the index in the layer list (only when the relative order changes). */
export const LAYER_FIELDS = ['name', 'color', 'spec', 'position'] as const;

export const VALUES_FIELD_PREFIX = 'values.';
export const ENTRIES_FIELD_PREFIX = 'entries.';

/**
 * An isolated change. `from` is the value at the time of the proposal and `to` the proposed
 * one: on creation, `from` is `null` and `to` the whole entity; on removal, the opposite; on
 * update, the values of the `field` (specialization and repository have no field: `field` is
 * `null` and the values are the whole entity). `imageId` and `markingId` say in which image and
 * item (marking) the change appears in the review: both `null` is the Project group; a null
 * `imageId` with `markingId` is a canvas marking (and its annotations). The arrow
 * (`entity: "arrow"`) is an item like the marking: `markingId` is its id and `imageId` the
 * container of the origin marking (or `null`, the canvas); its annotations carry the same pair.
 */
export interface Change {
  readonly id: string;
  readonly kind: ChangeKind;
  readonly entity: ChangeEntity;
  /** Id of the entity; for the repository, the platform id. */
  readonly entityId: string;
  readonly imageId: string | null;
  readonly markingId: string | null;
  readonly field: string | null;
  readonly from: JsonValue;
  readonly to: JsonValue;
  /**
   * Only on marking creation (formatVersion 4): the id of a base marking before which the
   * created one enters the applier's array, chosen (`proposalAnchors`) so that ties come out as
   * in the proposed project. Absent or `null`: the created one goes to the end. An anchor that
   * is not in the base when applying (removed, or nonexistent) also sends it to the end.
   */
  readonly insertBefore?: string | null;
}

export type DecisionState = 'accepted' | 'rejected';

export interface Decision {
  readonly state: DecisionState;
  readonly at: string;
}

/** Decision of each change (by id). Absent change = no decision. */
export type ProposalDecisions = { readonly [changeId: string]: Decision };

/** Changes already carried out in the project (by id), with the date. */
export type ProposalApplied = { readonly [changeId: string]: { readonly at: string } };

/** Review levels. `canvas` is the group of canvas markings, a sibling of the containers. */
export type ReviewLevel = 'proposal' | 'project' | 'canvas' | 'image' | 'item' | 'change';

/**
 * Target of a decision or note. `id` is `null` in `proposal`, `project` and `canvas`; in the
 * others, the id of the image, of the marking (item) or of the change.
 */
export interface ReviewTarget {
  readonly level: ReviewLevel;
  readonly id: string | null;
}

export interface ProposalNote {
  readonly id: string;
  readonly target: ReviewTarget;
  readonly text: string;
  readonly at: string;
}

/** Decision from before a revision: rejected or no decision (accepted stays frozen). */
export type RevisedPriorState = 'rejected' | null;

/**
 * A change withdrawn in a revision: as it was, the decision from before and the notes that moved
 * up.
 */
export interface RevisionDropped {
  readonly change: Change;
  readonly state: RevisedPriorState;
  /** Ids of the change's notes that moved to the proposal level. */
  readonly notes: readonly string[];
}

/** An agent revision (formatVersion 5), in `revisions`, from oldest to newest. */
export interface ProposalRevision {
  readonly at: string;
  /** `revision` of the `mapping.json` on which the revision was computed. */
  readonly baseRevision: number;
  /** The batch's operations, for reference only (base64 replaced by the marker). */
  readonly operations: readonly JsonValue[];
  /** Changes swapped: the `to` and the decision from before this revision. */
  readonly changed: {
    readonly [changeId: string]: {
      readonly to: JsonValue;
      readonly state: RevisedPriorState;
    };
  };
  /** Ids of the new changes. */
  readonly added: readonly string[];
  readonly dropped: readonly RevisionDropped[];
}

export interface Proposal {
  readonly format: typeof PROPOSAL_FORMAT;
  readonly formatVersion: (typeof PROPOSAL_FORMAT_VERSIONS)[number];
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  /** Where the data came from (free text, e.g. "Figma: Store v3 › Checkout"). */
  readonly origin: string | null;
  readonly author: string | null;
  readonly createdAt: string;
  /** `revision` of the `mapping.json` on which the changes were computed. */
  readonly baseRevision: number;
  /** Id of the proposal that this one supersedes. */
  readonly supersedes: string | null;
  readonly status: ProposalStatus;
  /** Write counter of the proposal file (same check as `mapping.json`). */
  readonly revision: number;
  /** The operations sent by the agent, for reference only. */
  readonly operations: readonly JsonValue[];
  readonly changes: readonly Change[];
  readonly decisions: ProposalDecisions;
  readonly notes: readonly ProposalNote[];
  readonly applied: ProposalApplied;
  /** History of the agent's revisions: required in formatVersion 5, absent before. */
  readonly revisions?: readonly ProposalRevision[];
}

/** `proposals/<id>`. */
export function proposalDir(proposalId: string): string {
  return `${PROPOSALS_DIR}/${proposalId}`;
}

/** `proposals/<id>/proposal.json`. */
export function proposalFilePath(proposalId: string): string {
  return `${proposalDir(proposalId)}/${PROPOSAL_FILE}`;
}

/**
 * Where the new or swapped image waits for acceptance: `proposals/<id>/` plus the final path
 * (`images/screen.webp` → `proposals/<id>/images/screen.webp`).
 */
export function proposalImagePath(proposalId: string, file: string): string {
  return `${proposalDir(proposalId)}/${file}`;
}

/**
 * Where the library package files wait for acceptance: `proposals/<id>/` plus the final
 * folder (`specs/material3` → `proposals/<id>/specs/material3`).
 */
export function proposalPackageDir(proposalId: string, dir: string): string {
  return `${proposalDir(proposalId)}/${dir}`;
}

// ---------------------------------------------------------------------------
// Validation (zod)

/** Proposal id: it becomes a folder name, so only `[A-Za-z0-9._-]`, not starting with a dot. */
export const PROPOSAL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const id = z.string().min(1, 'cannot be empty');
const proposalId = z
  .string()
  .regex(PROPOSAL_ID_RE, 'invalid id; use [A-Za-z0-9._-], not starting with a dot');
const isoDate = z.iso
  .datetime({ offset: true, error: 'invalid date; use ISO 8601 (UTC)' })
  .transform(normalizeIsoDate);
const hexColor = z.string().regex(HEX_COLOR_RE, 'invalid color; use #RRGGBB');
const optionalText = z.string().nullable();

const imageFileValue = z.object({
  file: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const imageSizeValue = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const typeRef = z.object({ specId: id, typeId: id });

/** Value of the `type` field of an annotation: the type with the values and pairs that go along. */
const annotationTypeValue = z
  .object({
    type: typeRef.nullable(),
    values: z.record(z.string(), jsonValue).nullable(),
    entries: z.array(entrySchema),
  })
  .superRefine((v, ctx) => {
    if ((v.type === null) !== (v.values === null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['values'],
        message: 'type and values must be both null or both filled in',
      });
    }
    if (v.type !== null && v.entries.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['entries'],
        message: 'a typed annotation has no entries',
      });
    }
  });

const entryValue = z.object({ key: z.string(), value: z.string() }).nullable();

const specializationValue = z
  .object({
    id,
    version: z.number().int().min(1),
    file: z.string().min(1),
    spec: specSchema.nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.spec && v.spec.id !== v.id) {
      ctx.addIssue({
        code: 'custom',
        path: ['spec', 'id'],
        message: `must be "${v.id}"`,
      });
    }
  });

/**
 * The arrow in a proposal: without `points` (the route belongs only to the person; a `points` that
 * comes is ignored).
 */
const arrowValue = arrowSchema.omit({ points: true });

/**
 * The annotation in a proposal. The `parentRole` is from v14, but the proposal stays at
 * `formatVersion` 4: whoever writes without it (an agent from before v14) counts as no role
 * (`null`).
 */
const annotationValueSchema = z.preprocess(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !('parentRole' in value)
      ? { ...value, parentRole: null }
      : value,
  annotationSchema,
);

const drawingModeName = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'use [a-z0-9][a-z0-9-]*');

const readingDirection = z.enum(READING_DIRECTIONS);

/**
 * The `project` entity (formatVersion 6): what of the project is proposed, the drawing mode and,
 * in formatVersion 8, the reading direction (absent = no pinned direction).
 */
const projectValueSchema = z.object({
  drawingMode: drawingModeName.nullable(),
  direction: readingDirection.nullable().optional(),
});

const entitySchemas: Record<ChangeEntity, z.ZodType> = {
  specialization: specializationValue,
  platformRepo: platformRepoSchema,
  docRepo: docRepoSchema,
  project: projectValueSchema,
  layer: layerSchema,
  image: containerSchema,
  marking: markingSchema,
  arrow: arrowValue,
  annotation: annotationValueSchema,
};

const imageFieldSchemas: Record<(typeof IMAGE_FIELDS)[number], z.ZodType> = {
  name: z.string().nullable(),
  file: imageFileValue,
  background: hexColor,
  size: imageSizeValue,
  placement: placementSchema,
  markingColor: hexColor.nullable(),
  locked: z.boolean(),
  source: sourceSchema.nullable(),
  drawingMode: drawingModeName.nullable(),
  density: z.number().min(0.5).max(8).nullable(),
  direction: readingDirection.nullable(),
};

/**
 * Rectangle of a marking change: integers, without the `≥ 0` limit (a canvas marking accepts
 * negative coordinates); the limit of each space belongs to the invariants.
 */
const looseRect = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const markingFieldSchemas: Record<(typeof MARKING_FIELDS)[number], z.ZodType> = {
  name: z.string().nullable(),
  rect: looseRect,
  space: z.object({ containerId: id.nullable(), rect: looseRect }),
  containerId: id,
  floating: z.boolean(),
  locked: z.boolean(),
  source: sourceSchema.nullable(),
  position: z.number().int().min(0),
  anchor: anchorSchema.nullable(),
};

const annotationFieldSchemas: Record<(typeof ANNOTATION_FIELDS)[number], z.ZodType> = {
  name: z.string().nullable(),
  parentAnnotationId: id.nullable(),
  parentRole: z.string().min(1).nullable(),
  markingId: id,
  layerId: id,
  type: annotationTypeValue,
};

const layerFieldSchemas: Record<(typeof LAYER_FIELDS)[number], z.ZodType> = {
  name: z.string().trim().min(1),
  color: hexColor,
  spec: z.object({ specId: id, layerId: id }).nullable(),
  position: z.number().int().min(0),
};

function has<K extends string>(record: Record<K, unknown>, key: string): key is K {
  return Object.hasOwn(record, key);
}

/** Schema of the value of `field` on the `entity`; `null` if the field does not exist. */
function fieldSchema(entity: ChangeEntity, field: string): z.ZodType | null {
  switch (entity) {
    case 'image':
      return has(imageFieldSchemas, field) ? imageFieldSchemas[field] : null;
    case 'marking':
      return has(markingFieldSchemas, field) ? markingFieldSchemas[field] : null;
    case 'layer':
      return has(layerFieldSchemas, field) ? layerFieldSchemas[field] : null;
    case 'annotation':
      if (field.startsWith(VALUES_FIELD_PREFIX)) {
        return field.length > VALUES_FIELD_PREFIX.length ? jsonValue : null;
      }
      if (field.startsWith(ENTRIES_FIELD_PREFIX)) {
        return field.length > ENTRIES_FIELD_PREFIX.length ? entryValue : null;
      }
      return has(annotationFieldSchemas, field) ? annotationFieldSchemas[field] : null;
    default:
      return null;
  }
}

/** Validates `value` with `schema` and copies the errors to `path`. */
function checkValue(
  schema: z.ZodType,
  value: unknown,
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void {
  const result = schema.safeParse(value);
  if (result.success) return;
  for (const issue of result.error.issues) {
    ctx.addIssue({
      code: 'custom',
      path: [...path, ...issue.path.map((p) => (typeof p === 'symbol' ? String(p) : p))],
      message: issue.message,
    });
  }
}

function idOf(value: unknown): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>).id
    : undefined;
}

const changeSchema = z
  .object({
    id,
    kind: z.enum(['create', 'update', 'remove'], {
      error: 'must be "create", "update" or "remove"',
    }),
    entity: z.enum(CHANGE_ENTITIES as [ChangeEntity, ...ChangeEntity[]], {
      error: `must be ${CHANGE_ENTITIES.map((e) => `"${e}"`).join(', ')}`,
    }),
    entityId: id,
    imageId: id.nullable(),
    markingId: id.nullable(),
    field: z.string().nullable(),
    from: jsonValue,
    to: jsonValue,
    insertBefore: id.nullable().optional(),
  })
  .superRefine((c, ctx) => {
    const add = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    if (c.entity === 'platformRepo' && !PLATFORM_ID_RE.test(c.entityId)) {
      add(['entityId'], 'invalid platform id; use [a-z0-9-]+');
    }
    if (c.entity === 'project' && (c.entityId !== 'project' || c.kind !== 'update')) {
      add(['entityId'], 'the project entity can only be updated, with entityId "project"');
    }
    if (c.entity === 'docRepo' && !PLATFORM_ID_RE.test(c.entityId)) {
      add(['entityId'], 'invalid repository id; use [a-z0-9-]+');
    }
    const projectLevel =
      c.entity === 'specialization' ||
      c.entity === 'platformRepo' ||
      c.entity === 'docRepo' ||
      c.entity === 'project' ||
      c.entity === 'layer';
    if (projectLevel && (c.imageId !== null || c.markingId !== null)) {
      add(['imageId'], 'project changes have neither imageId nor markingId');
    }
    // A marking (and annotation) without a container belongs to a canvas marking; only the image
    // requires the id.
    if (c.entity === 'image' && c.imageId === null) add(['imageId'], 'required');
    if (
      (c.entity === 'marking' || c.entity === 'arrow' || c.entity === 'annotation') &&
      c.markingId === null
    ) {
      add(['markingId'], 'required');
    }
    if (
      (c.entity === 'marking' || c.entity === 'arrow') &&
      c.markingId !== null &&
      c.markingId !== c.entityId
    ) {
      add(['markingId'], `must be "${c.entityId}"`);
    }
    if (c.entity === 'image' && c.imageId !== null && c.imageId !== c.entityId) {
      add(['imageId'], `must be "${c.entityId}"`);
    }

    const wholeEntity =
      c.entity === 'specialization' ||
      c.entity === 'platformRepo' ||
      c.entity === 'docRepo' ||
      c.entity === 'project';
    if (c.kind === 'update' && !wholeEntity) {
      if (c.field === null) {
        add(['field'], 'required in an update');
        return;
      }
      const schema = fieldSchema(c.entity, c.field);
      if (!schema) {
        add(['field'], `"${c.field}" is not a field of ${c.entity}`);
        return;
      }
      // A layer or marking created in this proposal and repositioned: `from` is `null`.
      const fromSchema = c.field === 'position' ? schema.nullable() : schema;
      checkValue(fromSchema, c.from, ctx, ['from']);
      checkValue(schema, c.to, ctx, ['to']);
      return;
    }
    if (c.field !== null) {
      add(['field'], 'must be null in creation, removal, specialization and repository');
    }
    const schema = entitySchemas[c.entity];
    if (c.kind !== 'create') checkValue(schema, c.from, ctx, ['from']);
    else if (c.from !== null) add(['from'], 'must be null in creation');
    if (c.kind !== 'remove') checkValue(schema, c.to, ctx, ['to']);
    else if (c.to !== null) add(['to'], 'must be null in removal');

    if (c.entity === 'platformRepo' || c.entity === 'docRepo' || c.entity === 'project')
      return;
    // Creation and removal carry the whole entity: its id is the `entityId`.
    for (const side of ['from', 'to'] as const) {
      const value = c[side];
      if (value === null) continue;
      const valueId = idOf(value);
      if (valueId !== undefined && valueId !== c.entityId) {
        add([side, 'id'], `must be "${c.entityId}"`);
      }
    }
  });

const targetSchema = z
  .object({
    level: z.enum(['proposal', 'project', 'canvas', 'image', 'item', 'change'], {
      error: 'must be "proposal", "project", "canvas", "image", "item" or "change"',
    }),
    id: id.nullable(),
  })
  .superRefine((t, ctx) => {
    const global =
      t.level === 'proposal' || t.level === 'project' || t.level === 'canvas';
    if (global && t.id !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['id'],
        message: `must be null in ${t.level}`,
      });
    }
    if (!global && t.id === null) {
      ctx.addIssue({ code: 'custom', path: ['id'], message: 'required' });
    }
  });

const revisionSchema = z.object({
  at: isoDate,
  baseRevision: z.number().int().min(0),
  operations: z.array(jsonValue),
  changed: z.record(
    z.string(),
    z.object({
      to: jsonValue,
      state: z.literal('rejected', { error: 'must be "rejected" or null' }).nullable(),
    }),
  ),
  added: z.array(id),
  dropped: z.array(
    z.object({
      change: changeSchema,
      state: z.literal('rejected', { error: 'must be "rejected" or null' }).nullable(),
      notes: z.array(id),
    }),
  ),
});

interface RevisionsToCheck {
  readonly formatVersion: number;
  readonly revisions?: readonly {
    readonly added: readonly string[];
    readonly dropped: readonly { readonly change: { readonly id: string } }[];
  }[];
}

type AddIssue = (path: (string | number)[], message: string) => void;

/**
 * Rules of the revision history (formatVersion 5): `revisions` is required in 5 and does not
 * exist before; a withdrawn change is no longer in `changes`; a new change enters the history
 * only once. Ids cited in `changed`, `added` and `notes` that no longer exist are history.
 */
function checkRevisions(
  p: RevisionsToCheck,
  changeIds: ReadonlySet<string>,
  add: AddIssue,
): void {
  if (p.revisions === undefined) {
    if (p.formatVersion === 5) add(['revisions'], 'required in formatVersion 5');
    return;
  }
  if (p.formatVersion < 5) {
    add(['revisions'], 'only in formatVersion 5 or later');
    return;
  }
  const added = new Set<string>();
  p.revisions.forEach((revision, i) => {
    revision.added.forEach((changeId, k) => {
      if (added.has(changeId))
        add(['revisions', i, 'added', k], `duplicate id "${changeId}"`);
      added.add(changeId);
    });
    revision.dropped.forEach((d, j) => {
      if (changeIds.has(d.change.id)) {
        add(
          ['revisions', i, 'dropped', j, 'change', 'id'],
          `id "${d.change.id}" is still in changes`,
        );
      }
    });
  });
}

export const proposalSchema = z
  .object({
    format: z.literal(PROPOSAL_FORMAT, { error: `must be "${PROPOSAL_FORMAT}"` }),
    formatVersion: z.union(
      [
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
        z.literal(5),
        z.literal(6),
        z.literal(7),
        z.literal(8),
        z.literal(9),
      ],
      { error: 'must be 1, 2, 3, 4, 5, 6, 7, 8 or 9' },
    ),
    id: proposalId,
    title: z.string().trim().min(1, 'cannot be empty'),
    description: optionalText,
    origin: optionalText,
    author: optionalText,
    createdAt: isoDate,
    baseRevision: z.number().int().min(0),
    supersedes: proposalId.nullable(),
    status: z.enum(['open', 'applied', 'superseded', 'withdrawn'], {
      error: 'must be "open", "applied", "superseded" or "withdrawn"',
    }),
    revision: z.number().int().min(0),
    operations: z.array(jsonValue),
    changes: z.array(changeSchema),
    decisions: z.record(
      z.string(),
      z.object({
        state: z.enum(['accepted', 'rejected'], {
          error: 'must be "accepted" or "rejected"',
        }),
        at: isoDate,
      }),
    ),
    notes: z.array(z.object({ id, target: targetSchema, text: z.string(), at: isoDate })),
    applied: z.record(z.string(), z.object({ at: isoDate })),
    revisions: z.array(revisionSchema).optional(),
  })
  .superRefine((p, ctx) => {
    const add = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    const changeIds = new Set<string>();
    p.changes.forEach((c, i) => {
      if (changeIds.has(c.id)) add(['changes', i, 'id'], `duplicate id "${c.id}"`);
      changeIds.add(c.id);
      if (
        c.insertBefore !== undefined &&
        (c.kind !== 'create' || c.entity !== 'marking')
      ) {
        add(['changes', i, 'insertBefore'], 'only in marking creation');
      }
    });
    if (p.supersedes !== null && p.supersedes === p.id) {
      add(['supersedes'], 'a proposal cannot supersede itself');
    }
    for (const changeId of Object.keys(p.decisions)) {
      if (!changeIds.has(changeId)) add(['decisions', changeId], 'nonexistent change');
    }
    for (const changeId of Object.keys(p.applied)) {
      if (!changeIds.has(changeId)) add(['applied', changeId], 'nonexistent change');
      else if (p.decisions[changeId]?.state !== 'accepted') {
        add(['applied', changeId], 'only an accepted change can be applied');
      }
    }
    checkRevisions(p, changeIds, add);
    const noteIds = new Set<string>();
    p.notes.forEach((n, i) => {
      if (noteIds.has(n.id)) add(['notes', i, 'id'], `duplicate id "${n.id}"`);
      noteIds.add(n.id);
      if (n.target.level === 'change' && n.target.id !== null) {
        if (!changeIds.has(n.target.id)) {
          add(['notes', i, 'target', 'id'], 'nonexistent change');
        }
      }
    });
  });

export type ProposalParseResult =
  | {
      readonly ok: true;
      readonly proposal: Proposal;
      /** Warnings from reading (e.g. a field that left the format and was ignored). */
      readonly warnings: readonly string[];
    }
  | { readonly ok: false; readonly issues: SpecIssue[]; readonly errors: string[] };

/**
 * Proposal written before schema 11: the `platformRepo` value had `urlTemplate` besides
 * `localPath`. The `urlTemplate` is ignored (the files' address belongs to the specialization):
 * each side keeps only `localPath`. A change that only altered the `urlTemplate` becomes an
 * update with `from` equal to `to`, with no effect on the project.
 */
function withoutLegacyUrlTemplate(proposal: Proposal): Proposal {
  const strip = (value: JsonValue): JsonValue =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? { localPath: (value as { readonly localPath?: JsonValue }).localPath ?? null }
      : value;
  if (!proposal.changes.some((c) => c.entity === 'platformRepo')) return proposal;
  return {
    ...proposal,
    changes: proposal.changes.map((c) =>
      c.entity === 'platformRepo' ? { ...c, from: strip(c.from), to: strip(c.to) } : c,
    ),
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Proposal written before schema 12: the marking pointed to the image by `imageId`, and now it
 * points to the container by `containerId`. On reading, marking creation and removal (whole
 * value) and the `imageId` field change move to the new name. The change header (`imageId`,
 * which says in which container it appears in the review) does not change.
 */
function withContainerIdOnMarkings(data: unknown): unknown {
  if (!isPlainRecord(data) || !Array.isArray(data.changes)) return data;
  const rename = (value: unknown): unknown => {
    if (!isPlainRecord(value) || !Object.hasOwn(value, 'imageId')) return value;
    if (Object.hasOwn(value, 'containerId')) return value;
    const { imageId, ...rest } = value;
    return { ...rest, containerId: imageId };
  };
  return {
    ...data,
    changes: data.changes.map((c: unknown) => {
      if (!isPlainRecord(c) || c.entity !== 'marking') return c;
      return {
        ...c,
        field: c.field === 'imageId' ? 'containerId' : c.field,
        from: c.field === null ? rename(c.from) : c.from,
        to: c.field === null ? rename(c.to) : c.to,
      };
    }),
  };
}

/**
 * Drops from `data` the changes whose id is in `dropped` and their decisions and applications; a
 * note attached to a dropped change moves to the proposal.
 */
function pruneChanges(
  data: Record<string, unknown>,
  changes: readonly unknown[],
  dropped: ReadonlySet<string>,
): unknown {
  const without = (record: unknown): unknown =>
    isPlainRecord(record)
      ? Object.fromEntries(Object.entries(record).filter(([key]) => !dropped.has(key)))
      : record;
  const notes = Array.isArray(data.notes)
    ? (data.notes as unknown[]).map((n) => {
        if (!isPlainRecord(n) || !isPlainRecord(n.target)) return n;
        const { level, id: targetId } = n.target;
        return level === 'change' && typeof targetId === 'string' && dropped.has(targetId)
          ? { ...n, target: { level: 'proposal', id: null } }
          : n;
      })
    : data.notes;
  return {
    ...data,
    changes,
    decisions: without(data.decisions),
    applied: without(data.applied),
    notes,
  };
}

/**
 * Proposal written before schema 13: the annotation had `inherit` (inheritance to the
 * descendant markings left the format). On reading, the `inherit` field change is dropped (with
 * its decision and application; a note attached to it moves to the proposal) and the field
 * disappears from the whole annotations of creation and removal. `ignored` counts what was
 * ignored, for the warning.
 */
function withoutInherit(data: unknown): { data: unknown; ignored: number } {
  if (!isPlainRecord(data) || !Array.isArray(data.changes)) return { data, ignored: 0 };
  let ignored = 0;
  const dropped = new Set<string>();
  const strip = (value: unknown): unknown => {
    if (!isPlainRecord(value) || !Object.hasOwn(value, 'inherit')) return value;
    const { inherit, ...rest } = value;
    void inherit;
    ignored += 1;
    return rest;
  };
  const changes: unknown[] = [];
  for (const c of data.changes as unknown[]) {
    if (!isPlainRecord(c) || c.entity !== 'annotation') {
      changes.push(c);
    } else if (c.field === 'inherit') {
      ignored += 1;
      if (typeof c.id === 'string') dropped.add(c.id);
    } else if (c.field === null) {
      changes.push({ ...c, from: strip(c.from), to: strip(c.to) });
    } else {
      changes.push(c);
    }
  }
  if (ignored === 0) return { data, ignored };
  return { data: pruneChanges(data, changes, dropped), ignored };
}

/**
 * Proposal written before containment by geometry (schema 13): the marking had `parentId` as a
 * compared field, and now the parent is always derived (the settle recomputes it on apply). On
 * reading, the `parentId` field change is dropped, like the `inherit` one. It also completes what
 * schema 13 requires on whole entities: `floating: false` on the marking and `parentId: null`
 * on the container. `ignored` counts the `parentId` changes.
 */
function withDerivedParent(data: unknown): { data: unknown; ignored: number } {
  if (!isPlainRecord(data) || !Array.isArray(data.changes)) return { data, ignored: 0 };
  let ignored = 0;
  const dropped = new Set<string>();
  const complete = (entity: unknown, value: unknown): unknown => {
    if (!isPlainRecord(value)) return value;
    if (entity === 'marking' && !Object.hasOwn(value, 'floating')) {
      return { ...value, floating: false };
    }
    if (entity === 'image' && !Object.hasOwn(value, 'parentId')) {
      return { ...value, parentId: null };
    }
    return value;
  };
  const changes: unknown[] = [];
  for (const c of data.changes as unknown[]) {
    if (!isPlainRecord(c)) {
      changes.push(c);
    } else if (c.entity === 'marking' && c.field === 'parentId') {
      ignored += 1;
      if (typeof c.id === 'string') dropped.add(c.id);
    } else if (c.field === null && (c.entity === 'marking' || c.entity === 'image')) {
      changes.push({
        ...c,
        from: complete(c.entity, c.from),
        to: complete(c.entity, c.to),
      });
    } else {
      changes.push(c);
    }
  }
  return {
    data: ignored === 0 ? { ...data, changes } : pruneChanges(data, changes, dropped),
    ignored,
  };
}

/**
 * Field change of an arrow that already exists (style, name, endpoints, lock): the proposal only
 * creates and removes arrows (ME4, decision 14), so these changes are ignored on reading, with
 * their decision and application (a note attached to one moves to the proposal). `ignored`
 * counts what was ignored, for the warning.
 */
function withoutArrowUpdates(data: unknown): { data: unknown; ignored: number } {
  if (!isPlainRecord(data) || !Array.isArray(data.changes)) return { data, ignored: 0 };
  const dropped = new Set<string>();
  const changes: unknown[] = [];
  for (const c of data.changes as unknown[]) {
    if (isPlainRecord(c) && c.entity === 'arrow' && c.kind === 'update') {
      if (typeof c.id === 'string') dropped.add(c.id);
    } else {
      changes.push(c);
    }
  }
  if (dropped.size === 0) return { data, ignored: 0 };
  return { data: pruneChanges(data, changes, dropped), ignored: dropped.size };
}

/**
 * Before formatVersion 4 the change has no `insertBefore`: if the field appears in a 1 to 3
 * proposal, it is ignored (those versions are read and applied as they always were).
 */
function withoutInsertBefore(data: unknown): unknown {
  if (!isPlainRecord(data) || !Array.isArray(data.changes)) return data;
  if (typeof data.formatVersion !== 'number' || data.formatVersion >= 4) return data;
  return {
    ...data,
    changes: data.changes.map((c: unknown) => {
      if (!isPlainRecord(c) || !Object.hasOwn(c, 'insertBefore')) return c;
      const { insertBefore, ...rest } = c;
      void insertBefore;
      return rest;
    }),
  };
}

/** Validates an already parsed JSON; errors in the format `path: message`. */
export function parseProposal(data: unknown): ProposalParseResult {
  const noInherit = withoutInherit(withContainerIdOnMarkings(withoutInsertBefore(data)));
  const noParent = withDerivedParent(noInherit.data);
  const noArrowUpdate = withoutArrowUpdates(noParent.data);
  const result = proposalSchema.safeParse(noArrowUpdate.data);
  if (result.success) {
    const warnings: string[] = [];
    if (noInherit.ignored > 0) {
      warnings.push(
        `"inherit" left the format (schema 13): ${noInherit.ignored} occurrence(s) in the proposal ignored; the annotation applies only to its own marking`,
      );
    }
    if (noParent.ignored > 0) {
      warnings.push(
        `"parentId" of the marking is derived from the geometry (schema 13): ${noParent.ignored} parent change(s) in the proposal ignored; the parent is recomputed on apply`,
      );
    }
    if (noArrowUpdate.ignored > 0) {
      warnings.push(
        `An arrow only has creation and removal in the proposal (ME4): ${noArrowUpdate.ignored} arrow field change(s) ignored; the style, name, endpoints and route belong to the person`,
      );
    }
    return {
      ok: true,
      proposal: withoutLegacyUrlTemplate(result.data as Proposal),
      warnings,
    };
  }
  const issues = result.error.issues.map((i) => ({
    path: formatSpecPath(i.path),
    message: i.message,
  }));
  return {
    ok: false,
    issues,
    errors: issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)),
  };
}

/** Reads the text of a `proposal.json`. */
export function parseProposalText(text: string): ProposalParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    const message = `invalid JSON: ${e instanceof Error ? e.message : String(e)}`;
    return { ok: false, issues: [{ path: '', message }], errors: [message] };
  }
  return parseProposal(data);
}

function serializeChange(c: Change) {
  return {
    id: c.id,
    kind: c.kind,
    entity: c.entity,
    entityId: c.entityId,
    imageId: c.imageId,
    markingId: c.markingId,
    field: c.field,
    from: c.from,
    to: c.to,
    ...(c.insertBefore === undefined ? {} : { insertBefore: c.insertBefore }),
  };
}

function serializeRevision(r: ProposalRevision) {
  return {
    at: r.at,
    baseRevision: r.baseRevision,
    operations: r.operations,
    changed: Object.fromEntries(
      Object.entries(r.changed).map(([k, v]) => [k, { to: v.to, state: v.state }]),
    ),
    added: r.added,
    dropped: r.dropped.map((d) => ({
      change: serializeChange(d.change),
      state: d.state,
      notes: d.notes,
    })),
  };
}

/**
 * Text of the `proposal.json`: top-level and change keys always in the same order, 2-space
 * indentation and a line break at the end.
 */
export function serializeProposal(p: Proposal): string {
  const canonical = {
    format: p.format,
    formatVersion: p.formatVersion,
    id: p.id,
    title: p.title,
    description: p.description,
    origin: p.origin,
    author: p.author,
    createdAt: p.createdAt,
    baseRevision: p.baseRevision,
    supersedes: p.supersedes,
    status: p.status,
    revision: p.revision,
    operations: p.operations,
    changes: p.changes.map(serializeChange),
    decisions: Object.fromEntries(
      Object.entries(p.decisions).map(([k, d]) => [k, { state: d.state, at: d.at }]),
    ),
    notes: p.notes.map((n) => ({
      id: n.id,
      target: { level: n.target.level, id: n.target.id },
      text: n.text,
      at: n.at,
    })),
    applied: Object.fromEntries(
      Object.entries(p.applied).map(([k, a]) => [k, { at: a.at }]),
    ),
    ...(p.revisions === undefined
      ? {}
      : { revisions: p.revisions.map(serializeRevision) }),
  };
  return `${JSON.stringify(canonical, null, 2)}\n`;
}
