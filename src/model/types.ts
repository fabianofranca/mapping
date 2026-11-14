import type { Spec } from './spec';

// Types of the `mapping.json` (schema v20). See docs/FORMAT.md. Everything is `readonly`: the model is immutable and
// the operations always return a new project.

export const SCHEMA_VERSION = 20;
/** The reading directions the file accepts (v20): single source of the type and the schemas (zod, MCP). */
export const READING_DIRECTIONS = ['ltr', 'rtl'] as const;
/** Reading direction (v20): left to right or right to left. */
export type ReadingDirection = (typeof READING_DIRECTIONS)[number];
export const APP_ID = 'mapping';
/** Value written before the product was renamed: still accepted on read and becomes `APP_ID`. */
export const LEGACY_APP_ID = 'mapeador-imagens';
export const COORDINATE_SYSTEM = 'image-pixels-exif-oriented';

/** Rectangle in whole pixels of the original image. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Position of the image on the canvas. `scale` = canvas units per image pixel. */
export interface Placement {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/**
 * Identity of the item in an external system (v8), so that a re-export recognizes the same
 * elements. The core does not interpret `system` (e.g. `"figma"`): it is just text.
 */
export interface ExternalSource {
  /** Source system (free text, non-empty). */
  readonly system: string;
  /** Id of the element in the source system (non-empty). */
  readonly id: string;
  /** Address of the element at the source; `null` when there is none. */
  readonly url: string | null;
}

/** Native JSON value (values of typed annotations). */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** Source layer in an applied specialization. */
export interface LayerSpecRef {
  readonly specId: string;
  readonly layerId: string;
}

export interface Layer {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  /** `null` = free layer; otherwise, the specialization layer it came from. */
  readonly spec: LayerSpecRef | null;
}

export interface ProjectContainer {
  readonly id: string;
  /** Editable label; `null` = the app shows the file name. It does not rename the file. */
  readonly name: string | null;
  /**
   * File in `images/`; `null` = container with no file (v10): without a file, only `width`,
   * `height` and `background`.
   */
  readonly file: string | null;
  readonly width: number;
  readonly height: number;
  readonly placement: Placement;
  /**
   * Canvas marking that contains the container (v13), derived from the geometry by the settle
   * (`settleHierarchy`); `null` = none. Never chosen by hand.
   */
  readonly parentId: string | null;
  /** Border color of this image's markings (`#RRGGBB`); `null` = the theme's neutral color. */
  readonly markingColor: string | null;
  /** Locked (v5): cannot be moved, resized or deleted. Selection stays free. */
  readonly locked: boolean;
  /** Identity in the source system (v8); `null` = no source. */
  readonly source: ExternalSource | null;
  /** Background color (`#RRGGBB`) of the container with no file (v10); `null` on an image with a file. */
  readonly background: string | null;
  /**
   * Drawing mode the container pins (v18); absent or `null` = follows the project's. The mode
   * chooses the values of the specializations' `tokens`, it does not depend on the interface theme.
   */
  readonly drawingMode?: string | null;
  /**
   * Density (v19): how many image pixels one component unit is worth (dp, pt, logical px at 1x),
   * from 0.5 to 8; absent or `null` = 1. The markings stay in image pixels.
   */
  readonly density?: number | null;
  /**
   * Reading direction the container pins (v20); absent or `null` = follows the project's. It applies
   * to the drawing of components (rows, grids, `start`/`end`, `mirror`).
   */
  readonly direction?: ReadingDirection | null;
}

import {
  ANCHOR_ALIGNS,
  ANCHOR_SIDES,
  type AnchorAlign,
  type AnchorSide,
} from './anchorSides';
export { ANCHOR_ALIGNS, ANCHOR_SIDES, type AnchorAlign, type AnchorSide };

/**
 * Anchor of a marking (v20): the marking sits against another in the same space (`to`), on side
 * `side`, aligned by `align`, with the `offset` in pixels of the space (`main` = distance from the
 * anchor's edge, negative overlaps; `cross` = offset along the side). Absent fields take the
 * component's defaults. It does not take part in containment: who contains whom is only geometry.
 */
export interface MarkingAnchor {
  readonly to: string;
  readonly side?: AnchorSide;
  readonly align?: AnchorAlign;
  readonly offset?: { readonly main: number; readonly cross: number };
}

export interface Marking {
  readonly id: string;
  /**
   * Space of the marking (v13): the container (`rect` in whole pixels of it) or `null`, a canvas
   * marking (`rect` in whole canvas units, coordinates may be negative). Decided by the geometry
   * when settling (`settleHierarchy`).
   */
  readonly containerId: string | null;
  /**
   * The smallest marking in the same space that fully contains it (v13: derived by the settle,
   * never chosen by hand); `null` = none.
   */
  readonly parentId: string | null;
  readonly name: string | null;
  readonly rect: Rect;
  readonly needsReview: boolean;
  /**
   * Locked (v5): cannot be moved, resized or deleted, and locking the parent
   * locks the geometry of the descendants. Selection and annotations stay free.
   */
  readonly locked: boolean;
  /**
   * Floating (v13): a comment over the canvas (a note), outside the containment tree in both
   * directions. It always lives on the canvas (null `containerId` and `parentId`) and is drawn
   * above everything.
   */
  readonly floating: boolean;
  /** Identidade no sistema de origem (v8); `null` = sem origem. */
  readonly source: ExternalSource | null;
  /**
   * Anchor (v20): snaps the marking to another in the same space; absent or `null` = no anchor.
   * Moving the anchor takes the anchored ones along; resizing it does not.
   */
  readonly anchor?: MarkingAnchor | null;
}

/** Side of a marking where the arrow attaches (v13). */
export type ArrowSide = 'top' | 'right' | 'bottom' | 'left';

/** Stroke style of the arrow (v13): `curve` is the default. */
export type ArrowStyle = 'straight' | 'curve' | 'elbow';

export const ARROW_SIDES: readonly ArrowSide[] = ['top', 'right', 'bottom', 'left'];
export const ARROW_STYLES: readonly ArrowStyle[] = ['straight', 'curve', 'elbow'];
export const DEFAULT_ARROW_STYLE: ArrowStyle = 'curve';

/**
 * Arrow (v13, decision 14): a marking that points. It links two markings (`from`, `to`), has
 * its own route and style and can have annotations per layer (`annotations[].markingId` = the
 * arrow's id; ids share the same space as the markings'). It is outside the containment tree: it has
 * no `rect`, container or parent.
 */
export interface Arrow {
  readonly id: string;
  /** Origin marking. */
  readonly from: string;
  /** Destination marking (different from `from`). */
  readonly to: string;
  /** Side of the origin; `null` = the default edge to edge. */
  readonly fromSide: ArrowSide | null;
  /** Side of the destination; `null` = the default edge to edge. */
  readonly toSide: ArrowSide | null;
  /**
   * Waypoints, set only by the person. Space derived from the two ends, never stored
   * (decision (d)): container pixels when both are in the same container; otherwise,
   * canvas units. `[]` = default route.
   */
  readonly points: readonly ArrowPoint[];
  readonly style: ArrowStyle;
  /** Label over the arrow; `null` = no label. */
  readonly name: string | null;
  /** Locked: the route and the ends do not change; selection and annotations stay free. */
  readonly locked: boolean;
}

/** Point (container pixels or canvas units, depending on who uses it). */
export interface ArrowPoint {
  readonly x: number;
  readonly y: number;
}

export interface Entry {
  /** Stable id of the tuple: references (`ref`) survive renaming the key. */
  readonly id: string;
  readonly key: string;
  readonly value: string;
}

/** Type of a typed annotation. */
export interface AnnotationTypeRef {
  readonly specId: string;
  readonly typeId: string;
}

/** Values of a typed annotation, by field `key` (see docs/FORMAT.md, "References (`ref`)"). */
export type TypedValues = { readonly [key: string]: JsonValue };

/** Row of a `table` field: the column keys plus the internal id `_id`. */
export type TableRow = { readonly _id: string; readonly [key: string]: JsonValue };

/** Reference to a tuple of a free annotation. */
export interface EntryRef {
  readonly annotationId: string;
  readonly entryId: string;
}

/** Reference to a labeled `table` row. */
export interface RowRef {
  readonly annotationId: string;
  readonly key: string;
  readonly rowId: string;
}

/** Reference to a labeled simple field. */
export interface FieldRef {
  readonly annotationId: string;
  readonly key: string;
}

/**
 * Reference to the whole annotation (v17): only the `annotationId`, with no `key`, `entryId` or
 * `rowId`. (`AnnotationRef` is already the output reference of `refs.ts`.)
 */
export interface WholeRef {
  readonly annotationId: string;
}

/** Value of a `ref` field: one of the four formats (docs/FORMAT.md, "References (`ref`)"). */
export type RefValue = EntryRef | RowRef | FieldRef | WholeRef;

/**
 * Local override of a platform's repository (v11), at the project level: where the clone is.
 * The repository's address belongs to the specialization (`platforms[].repo`).
 */
export interface PlatformRepo {
  /** Root of the clone, relative to the project folder (e.g. `../..`); `null` = not given. */
  readonly localPath: string | null;
}

/** `platformRepos` of the `mapping.json`: local override by platform id. */
export type PlatformRepos = { readonly [platformId: string]: PlatformRepo };

/**
 * Local override of a specialization's document repository (v14), at the project level: where
 * the clone is. The repository's address belongs to the specialization (`docRepos`).
 */
export interface DocRepo {
  /** Root of the clone, relative to the project folder (e.g. `../docs`). */
  readonly localPath: string;
}

/** `docRepos` of the `mapping.json`: local override by document repository id. */
export type DocRepos = { readonly [docRepoId: string]: DocRepo };

export interface Annotation {
  readonly id: string;
  /** Marking (or arrow, v13) that owns the annotation. */
  readonly markingId: string;
  readonly layerId: string;
  readonly name: string | null;
  /** "Owner" annotation (same marking, another layer, no cycles) or `null`. */
  readonly parentAnnotationId: string | null;
  /**
   * Role this annotation fills in the owner (v14): id of a `childRoles` of the owner's type, or
   * `null` = no role. It only exists with an owner (non-null `parentAnnotationId`). A missing role
   * and a role the owner does not offer become pending items (`missing-role`, `unknown-role`), not errors.
   */
  readonly parentRole: string | null;
  /** `null` = free annotation (pairs in `entries`). */
  readonly type: AnnotationTypeRef | null;
  /** Values of the typed annotation; `null` on a free annotation. */
  readonly values: TypedValues | null;
  /** Pairs of the free annotation; always `[]` on a typed one. */
  readonly entries: readonly Entry[];
}

/** Applied specialization, as written in the `mapping.json`. */
export interface SpecializationRef {
  readonly id: string;
  readonly version: number;
  /** Copy of the specialization, relative to the root (`specs/sdui.json`). */
  readonly file: string;
}

/**
 * Applied specialization, in memory: the reference from the `mapping.json` plus the
 * content of `file`. `spec` does not go into the `mapping.json` (it lives in `specs/`);
 * `null` when the file is missing or invalid.
 */
export interface ProjectSpecialization extends SpecializationRef {
  readonly spec: Spec | null;
}

export interface ProjectInfo {
  /**
   * Identity of the project (v16): a UUID created on migration and on project creation, which
   * never changes. It keys what stays in the browser (the open perspective, the "Only me" perspectives).
   */
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Position of a root in a perspective (v16): the top-left corner, in canvas units. */
export interface PerspectiveItem {
  /** Id of a root: container with no parent, canvas marking with no parent, or floating. */
  readonly root: string;
  readonly x: number;
  readonly y: number;
}

/**
 * Perspective (v16): a cut of the project. Which roots appear (`items`), where they sit on the
 * canvas and which layers are hidden. The content is the project's; only the roots' position
 * changes. The `mapping.json` stores only the "For everyone" ones; the "Only me" ones stay in the
 * browser, in the same format.
 */
export interface Perspective {
  readonly id: string;
  /** Unique among the perspectives, case-insensitive. */
  readonly name: string;
  /** Layers hidden in this perspective (a new layer is born visible). */
  readonly hiddenLayers: readonly string[];
  /** One entry per root, no repeats. */
  readonly items: readonly PerspectiveItem[];
}

/** "Came from…" mark (v16): a root created outside the Main one that arrived in it. */
export interface Arrival {
  readonly root: string;
  /** Id of the source perspective (may no longer exist). */
  readonly from: string;
  /** Name of the source perspective, stored so the mark survives it. */
  readonly fromName: string;
}

export interface Project {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  /**
   * Counter of the file's writes (v6). Whoever writes (app or MCP) checks that the
   * value on disk is still the one it loaded and writes `revision + 1`; this way it notices
   * a change made by another process. The model's operations do not change it.
   */
  readonly revision: number;
  readonly app: typeof APP_ID;
  readonly coordinateSystem: typeof COORDINATE_SYSTEM;
  readonly project: ProjectInfo;
  readonly specializations: readonly ProjectSpecialization[];
  /**
   * Repository of each platform (v7). It lives in the project, not in the specialization: the same
   * specialization serves different products. Platforms with the same id in different
   * specializations are the same one and use the same configuration.
   */
  readonly platformRepos: PlatformRepos;
  /**
   * Local clone of each document repository (v14), by `docRepos` id of the specialization.
   * Same rules as `platformRepos`: the same id in different specializations is the same entry.
   */
  readonly docRepos: DocRepos;
  /**
   * Drawing mode of the project (v18): chooses the mode of the specializations' `tokens`. Absent =
   * the first mode of each specialization. A mode that none declares stays stored (Diagnostics).
   */
  readonly drawingMode?: string;
  /** Reading direction of the project (v20): `ltr` or `rtl`; absent = `ltr`. */
  readonly direction?: ReadingDirection;
  readonly layers: readonly Layer[];
  readonly containers: readonly ProjectContainer[];
  readonly markings: readonly Marking[];
  /** Arrows (v13, ME4): markings that point. */
  readonly arrows: readonly Arrow[];
  /** "For everyone" perspectives (v16). The Main one is implicit and is not here. */
  readonly perspectives: readonly Perspective[];
  /** "Came from…" marks of the Main one (v16). */
  readonly arrivals: readonly Arrival[];
  readonly annotations: readonly Annotation[];
}

/** The `mapping.json` as written: the specializations without the content. */

export type ProjectFile = Omit<Project, 'specializations'> & {
  readonly specializations: readonly SpecializationRef[];
};
