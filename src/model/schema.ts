import { HEX_COLOR_RE } from './hexColor';
import { z } from 'zod';
import { PLATFORM_ID_RE } from './spec';
import {
  ANCHOR_ALIGNS,
  ANCHOR_SIDES,
  APP_ID,
  LEGACY_APP_ID,
  COORDINATE_SYSTEM,
  READING_DIRECTIONS,
  SCHEMA_VERSION,
  type JsonValue,
  type ProjectFile,
} from './types';

// Zod schema of mapping.json at the current version (`SCHEMA_VERSION`, in `types.ts`). It
// validates the shape; the invariants across collections (references, containment, overlap) live
// in `invariants.ts`. The values of typed annotations are free JSON here: the check against the
// type becomes an issue (`issues.ts`).

const id = z.string().min(1);
const hexColor = z.string().regex(HEX_COLOR_RE);
const finite = z.number().finite();
const readingDirection = z.enum(READING_DIRECTIONS);
export const anchorSchema = z.object({
  to: id,
  side: z.enum(ANCHOR_SIDES).optional(),
  align: z.enum(ANCHOR_ALIGNS).optional(),
  offset: z.object({ main: finite, cross: finite }).optional(),
});

/** ISO 8601 date as written by the app: UTC with `Z`; with a time zone, normalized to UTC. */
export function normalizeIsoDate(value: string): string {
  return value.endsWith('Z') ? value : new Date(value).toISOString();
}

/** ISO 8601 date, with `Z` or a time zone (written by an external tool); comes out in UTC `Z`. */
export const isoDateTime = z.iso.datetime({ offset: true }).transform(normalizeIsoDate);

/**
 * Integer rectangle. `x` and `y` accept negatives because the canvas marking (v13, null
 * `containerId`) lives in canvas units, where there is no edge. A container marking still stays
 * inside the image: the schema does not know which space the rectangle belongs to, so the
 * rejection lives in the `rect-out-of-image` invariant (which only applies with a non-null
 * `containerId`, and has a repair: the clipping).
 */
export const rectSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const placementSchema = z.object({
  x: finite,
  y: finite,
  scale: finite.positive(),
});

/** Identity in the origin system (v8): non-empty `system` and `id`, optional `url` (`null`). */
export const sourceSchema = z.object({
  system: z.string().min(1),
  id: z.string().min(1),
  url: z.string().nullable(),
});

export const layerSchema = z.object({
  id,
  name: z.string().trim().min(1),
  color: hexColor,
  spec: z.object({ specId: id, layerId: id }).nullable(),
});

export const containerSchema = z.object({
  id,
  name: z.string().nullable(),
  file: z.string().min(1).nullable(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  placement: placementSchema,
  /**
   * Canvas marking that contains the container (v13). A v13 `mapping.json` written before this
   * field (ME0 preview) does not have it and opens without migration, as `null`.
   */
  parentId: id.nullable().default(null),
  markingColor: hexColor.nullable(),
  locked: z.boolean(),
  source: sourceSchema.nullable(),
  background: hexColor.nullable(),
  /** Drawing mode the container pins (v18); absent or `null` = follows the project. */
  drawingMode: z.string().min(1).nullable().optional(),
  /** Reading direction the container pins (v20); absent or `null` = follows the project. */
  direction: readingDirection.nullable().optional(),
  /** Container density (v19); the 0.5 to 8 range is the `container-density` invariant. */
  density: z.number().nullable().optional(),
});

export const markingSchema = z.object({
  id,
  /** `null` = canvas marking (v13): `rect` in canvas units. */
  containerId: id.nullable(),
  parentId: id.nullable(),
  name: z.string().nullable(),
  rect: rectSchema,
  needsReview: z.boolean(),
  locked: z.boolean(),
  /** Floating (v13). Absent in a v13 from before this field: `false`. */
  floating: z.boolean().default(false),
  source: sourceSchema.nullable(),
  /** Anchor (v20); absent or `null` = no anchor. */
  anchor: anchorSchema.nullable().optional(),
});

const pointSchema = z.object({ x: finite, y: finite });

/**
 * Arrow (v13, ME4). The optional ones may be missing from the file (hand-written or by a v13 from
 * before arrows) and come in with the default.
 */
export const arrowSchema = z.object({
  id,
  from: id,
  to: id,
  fromSide: z.enum(['top', 'right', 'bottom', 'left']).nullable().default(null),
  toSide: z.enum(['top', 'right', 'bottom', 'left']).nullable().default(null),
  points: z.array(pointSchema).default([]),
  style: z.enum(['straight', 'curve', 'elbow']).default('curve'),
  name: z.string().nullable().default(null),
  locked: z.boolean().default(false),
});

/** Position of a root in a perspective (v16). */
export const perspectiveItemSchema = z.object({ root: id, x: finite, y: finite });

/** "For everyone" perspective (v16). Name uniqueness and root validity are invariants. */
export const perspectiveSchema = z.object({
  id,
  name: z.string(),
  hiddenLayers: z.array(id),
  items: z.array(perspectiveItemSchema),
});

/** "Came from…" mark (v16). */
export const arrivalSchema = z.object({ root: id, from: id, fromName: z.string() });

export const entrySchema = z.object({ id, key: z.string(), value: z.string() });

/** Any JSON value. The check against the type becomes an issue (`issues.ts`), not an error. */
export const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    finite,
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);

export const annotationSchema = z
  .object({
    id,
    markingId: id,
    layerId: id,
    name: z.string().nullable(),
    parentAnnotationId: id.nullable(),
    // Empty text passes here and is rejected by the `empty-role` invariant (with the message).
    parentRole: z.string().nullable(),
    type: z.object({ specId: id, typeId: id }).nullable(),
    values: z.record(z.string(), jsonValue).nullable(),
    entries: z.array(entrySchema),
  })
  .superRefine((a, ctx) => {
    // Free: `type` and `values` null. Typed: both filled in and no entries.
    if ((a.type === null) !== (a.values === null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['values'],
        message: 'type and values must both be null or both filled in',
      });
    }
    if (a.type !== null && a.entries.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['entries'],
        message: 'a typed annotation has no entries',
      });
    }
  });

const specializationSchema = z.object({
  id,
  version: z.number().int().min(1),
  file: z.string().min(1),
});

/** Local override of a platform (v11); an unknown key is discarded on read. */
export const platformRepoSchema = z.object({
  localPath: z.string().nullable(),
});

/**
 * Local clone of a documents repository (v14): `localPath` non-empty text; an unknown key is
 * discarded on read.
 */
export const docRepoSchema = z.object({ localPath: z.string().min(1) });

/** `docRepos` as read: an entry without a valid `localPath` is dropped (the file keeps no empty entry). */
const docReposSchema = z
  .record(z.string().regex(PLATFORM_ID_RE), z.unknown())
  .transform((entries) =>
    Object.fromEntries(
      Object.entries(entries).flatMap(([key, value]) => {
        const parsed = docRepoSchema.safeParse(value);
        return parsed.success ? [[key, parsed.data]] : [];
      }),
    ),
  );

export const projectSchema: z.ZodType<ProjectFile> = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  revision: z.number().int().min(0),
  // Accepts the old value and normalizes it: the next write already comes out as `APP_ID`.
  app: z
    .union([z.literal(APP_ID), z.literal(LEGACY_APP_ID)])
    .transform((): typeof APP_ID => APP_ID),
  coordinateSystem: z.literal(COORDINATE_SYSTEM),
  project: z.object({
    /** Project identity (v16): UUID created on migration and on creation. */
    id,
    name: z.string(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  }),
  specializations: z.array(specializationSchema),
  platformRepos: z.record(z.string().regex(PLATFORM_ID_RE), platformRepoSchema),
  docRepos: docReposSchema,
  /** Project drawing mode (v18); absent = the first mode of each specialization. */
  drawingMode: z.string().min(1).optional(),
  /** Project reading direction (v20); absent = `ltr`. */
  direction: readingDirection.optional(),
  layers: z.array(layerSchema),
  containers: z.array(containerSchema),
  markings: z.array(markingSchema),
  /** Absent in a v13 from before arrows (ME0 to ME3 previews): `[]`. */
  arrows: z.array(arrowSchema).default([]),
  /** Absent: `[]` (a hand-written file does not need to declare them). */
  perspectives: z.array(perspectiveSchema).default([]),
  arrivals: z.array(arrivalSchema).default([]),
  annotations: z.array(annotationSchema),
});
