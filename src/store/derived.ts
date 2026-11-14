import { computed, signal, untracked, type ReadonlySignal } from '@preact/signals';
import { t } from '../i18n';
import {
  EMPTY_CATALOG,
  NO_DRAWINGS,
  acceptedPending,
  buildIncompleteList,
  buildListing,
  buildNoticeList,
  changeStatus,
  changeType,
  checkRemoteImageUrl,
  compareProposals,
  componentMinSize,
  componentTypes,
  createDrawingCache,
  filterChanges,
  layerDotsByMarking,
  leftBehind,
  levelType,
  markingLockStates,
  markingVisibility,
  memoByProject,
  noticeCounts,
  noticedCount,
  previewProject,
  projectIndex,
  structuralMarkingIds,
  suggestDensities,
  projectIssues,
  reviewKey,
  reviewProgress,
  reviewTree,
  sceneRemoteImageUrls,
  summarizeDecisions,
  validateAccepted,
  type AcceptedValidation,
  type Annotation,
  type AnnotationIssue,
  type Change,
  type ChangeEntity,
  type ChangeComparison,
  type ChangeStatus,
  type ChangeType,
  type ComponentCatalog,
  type ComponentDrawings,
  type ComponentType,
  type DensitySuggestion,
  type IncompleteImage,
  type Layer,
  type LayerDot,
  type Perspective,
  type LeftBehind,
  type ModelMessage,
  type LevelSummary,
  type ListedImage,
  type Marking,
  type MarkingLockState,
  type MarkingVisibility,
  type NoticeCounts,
  type NoticeGroup,
  type PatchResult,
  type Project,
  type ProjectContainer,
  type Proposal,
  type ProposalApplied,
  type ProposalNote,
  type ReviewFilters,
  type ReviewProgress,
  type ReviewTree,
  latestRevisionSummary,
  visibleRevisedChanges,
} from '../model';
import type { SceneNode } from '../model/components/scene';
import type { ProjectStore } from './history';
import * as imagePermissions from './imagePermissions';
import { NO_PERSPECTIVE, projectInPerspective } from './perspectiveShown';
import { markingDisplay, showComponentsOnPhotos } from './settings';
import { memoizedTextMeasurer, textMeasurer } from './textMeasure';
import {
  NO_THREAD_SOURCES,
  createThreadDerived,
  type ThreadDerived,
  type ThreadSources,
} from './threadDerived';
import { visibleLayers, type EditorUi } from './ui';

// Derived editor state (docs/ARCHITECTURE.md, "Performance"): computed once from the project
// and the UI and read by the canvas, panel and list. Nothing here depends on the viewport, so
// pan and zoom recompute none of it.

export interface EditorDerived {
  /** The open perspective (`null` = the Main one): the interface reads its name and layers. */
  readonly perspective: ReadonlySignal<Perspective | null>;
  /**
   * Visible layers, in project order (there may be none). With a perspective open, the
   * hidden ones are its own; in the Main one, the interface's (`ui.hiddenLayers`).
   */
  readonly visibleLayers: ReadonlySignal<readonly Layer[]>;
  /** Pending items per annotation (only the incomplete ones). */
  readonly issues: ReadonlySignal<ReadonlyMap<string, readonly AnnotationIssue[]>>;
  /** Annotations of each marking, in project order. */
  readonly annotationsByMarking: ReadonlySignal<
    ReadonlyMap<string, readonly Annotation[]>
  >;
  /**
   * The markings of the project in view by space (the container id; `null` = the canvas), in
   * project order: the candidates for a marking's anchor are those of the same space (`canAnchorTo`).
   * The same map while the project does not change.
   */
  readonly markingsBySpace: ReadonlySignal<
    ReadonlyMap<string | null, readonly Marking[]>
  >;
  /** Indicators (dots) of each marking in the visible layers. */
  readonly layerDots: ReadonlySignal<ReadonlyMap<string, readonly LayerDot[]>>;
  /** Visibility of each marking according to the display mode and the visible layers. */
  readonly markingVisibility: ReadonlySignal<ReadonlyMap<string, MarkingVisibility>>;
  /**
   * The visibility the canvas draws. Outside view mode it is `markingVisibility`; in view mode
   * all markings are whole (the filter does not apply and hiding the outline does not hide the
   * marking for the arrow): the panel decides what appears.
   */
  readonly canvasVisibility: ReadonlySignal<ReadonlyMap<string, MarkingVisibility>>;
  /** Markings with an incomplete annotation in a visible layer (alert on the canvas). */
  readonly incompleteMarkings: ReadonlySignal<ReadonlySet<string>>;
  /** Markings with locked geometry (own or inherited from the parent); free ones do not appear. */
  readonly markingLocks: ReadonlySignal<ReadonlyMap<string, MarkingLockState>>;
  /** Whether any image or marking has locked geometry (shortcut to avoid computing needlessly). */
  readonly hasLocks: ReadonlySignal<boolean>;
  /** List View data, with its filters. */
  readonly listing: ReadonlySignal<readonly ListedImage[]>;
  /** Pending items grouped by image, for the Incomplete window (B5). */
  readonly incompleteList: ReadonlySignal<readonly IncompleteImage[]>;
  /** How many annotations are incomplete in the project (all layers). */
  readonly incompleteCount: ReadonlySignal<number>;
  /** Specialization notices with the affected annotations, for the Notices window (stage #486). */
  readonly noticeList: ReadonlySignal<readonly NoticeGroup[]>;
  /** Counts of annotations with a notice (by `kind` and in total), with the window's filters. */
  readonly noticeCounts: ReadonlySignal<NoticeCounts>;
  /** How many annotations have some notice (window tab and status bar; without filters). */
  readonly noticedCount: ReadonlySignal<number>;
  /** Anchored threads (Comments stage): window rows, counts and threads per item. */
  readonly threads: ThreadDerived;
  /**
   * Density suggestion for each container from the ready-made sizes of the applied specializations
   * (`suggestDensity`; only containers with a suggestion appear). It depends only on the containers and
   * specializations, never on the viewport: pan and zoom do not recompute it, and the same table
   * comes back
   * while none of that changes.
   */
  readonly densitySuggestions: ReadonlySignal<ReadonlyMap<string, DensitySuggestion>>;
  /** Components of the specializations applied to the project (empty while they load). */
  readonly catalog: ReadonlySignal<ComponentCatalog>;
  /**
   * Drawings of the components of the project in view, per marking, in drawing order. An edit
   * re-instantiates only the changed marking; the others keep the same object (the canvas compares by
   * identity). It follows undo, external reload and the review's Proposed view.
   */
  readonly componentScenes: ReadonlySignal<ComponentDrawings>;
  /**
   * Drawings of `p` (the canvas draws the project with the gesture preview). The project in view
   * returns `componentScenes`; another project uses the same cache, and only the marking that changed
   * is re-instantiated. It reads the same signals: it can be called inside a `computed`.
   */
  drawingsOf(p: Project | null): ComponentDrawings;
  /**
   * Markings whose drawing is visible: they have a drawing, the image is a container without a file
   * or the person
   * turned on "draw over photos", and their visibility is not `hidden`.
   */
  readonly drawnMarkings: ReadonlySignal<ReadonlySet<string>>;
  /**
   * Layers of the project that draw: those with some type with a component (`componentTypes`),
   * in project order. Free and data-only ones do not enter. List of the view mode panel.
   */
  readonly drawingLayers: ReadonlySignal<readonly Layer[]>;
  /** Minimum size of each marking that draws a component: its `minSize` or 1×1. */
  readonly componentMinSizes: ReadonlySignal<
    ReadonlyMap<string, { readonly width: number; readonly height: number }>
  >;
  /**
   * Floating markings of the project in view (v13): drawn above everything. The same set
   * while none changes, so the canvas does not rebuild the components layer needlessly.
   */
  readonly floatingMarkings: ReadonlySignal<ReadonlySet<string>>;
  /**
   * Origins of the remote images used by the components of the project in view (the URL policy
   * with the current switches already applied). It follows the review's Proposed view.
   */
  readonly remoteImageOrigins: ReadonlySignal<readonly RemoteImageOrigin[]>;
  /** The origins of `remoteImageOrigins` that still ask for consent and were not dismissed. */
  readonly pendingImageOrigins: ReadonlySignal<readonly RemoteImageOrigin[]>;
  /** Types with a component from the applied specializations, for the palette. */
  readonly componentTypes: ReadonlySignal<readonly ComponentType[]>;
  /** Drawing notices of each marking that has any (Diagnostics). */
  readonly componentWarnings: ReadonlySignal<
    readonly {
      readonly markingId: string;
      readonly warnings: readonly ModelMessage[];
    }[]
  >;
}

/** A remote image origin used by the project. */
export interface RemoteImageOrigin {
  readonly origin: string;
  /** Local network: always asks for its own consent. */
  readonly local: boolean;
  /** `http:` (unencrypted). */
  readonly insecure: boolean;
}

const NO_IMAGE_ORIGINS: readonly RemoteImageOrigin[] = [];

/** Remote URLs per drawing (the scene is immutable): avoids sweeping the project on every edit. */
const sceneUrls = new WeakMap<object, readonly string[]>();
function urlsOfScene(root: SceneNode): readonly string[] {
  let urls = sceneUrls.get(root);
  if (urls === undefined) {
    urls = sceneRemoteImageUrls(root);
    sceneUrls.set(root, urls);
  }
  return urls;
}

/** What the session hands to the derived state about the components (`session.components`). */
export interface ComponentSources {
  readonly catalog: ReadonlySignal<ComponentCatalog>;
  /** Rises on every font registration: the drawings are remeasured. */
  readonly fontsEpoch: ReadonlySignal<number>;
}

const NO_ISSUES: ReadonlyMap<string, readonly AnnotationIssue[]> = new Map();
const NO_ANNOTATIONS: ReadonlyMap<string, readonly Annotation[]> = new Map();
const NO_DOTS: ReadonlyMap<string, readonly LayerDot[]> = new Map();
const NO_VISIBILITY: ReadonlyMap<string, MarkingVisibility> = new Map();

function hiddenVisibility(p: Project): ReadonlyMap<string, MarkingVisibility> {
  return new Map(p.markings.map((m) => [m.id, 'hidden' as const]));
}

/** All the whole markings, once per project version (view mode). */
const fullVisibility = memoByProject(
  (p: Project): ReadonlyMap<string, MarkingVisibility> =>
    new Map(p.markings.map((m) => [m.id, 'full' as const])),
);
const NO_LAYER_IDS: ReadonlySet<string> = new Set();

/** The project's layers from which any of the component types came (in project order). */
function layersWithDrawing(
  layers: readonly Layer[],
  types: readonly ComponentType[],
): readonly Layer[] {
  const keys = new Set(types.map((t) => `${t.specId}\u0000${t.layerId}`));
  return layers.filter(
    (l) => l.spec !== null && keys.has(`${l.spec.specId}\u0000${l.spec.layerId}`),
  );
}

/**
 * Markings whose drawing may appear: the canvas's (no photo underneath) always; that of a container
 * without a file always; that of a photo only with the option on. `hiddenLayers`: layers with drawings
 * unchecked in view mode.
 */
function drawnIds(
  all: ComponentDrawings,
  containers: ReadonlyMap<string, ProjectContainer>,
  onPhotos: boolean,
  hiddenLayers: ReadonlySet<string>,
): ReadonlySet<string> {
  const result = new Set<string>();
  for (const [id, drawing] of all) {
    if (hiddenLayers.has(drawing.layerId)) continue;
    // Canvas marking (v13): no photo under its space, the drawing always appears
    // (the floating one, in particular, "over everything, including over photos").
    if (drawing.containerId === null) {
      result.add(id);
      continue;
    }
    const image = containers.get(drawing.containerId);
    if (image && (image.file === null || onPhotos)) result.add(id);
  }
  return result;
}
const NO_LAYERS: readonly Layer[] = [];
const NO_MARKINGS: ReadonlySet<string> = new Set();
const NO_LOCKS: ReadonlyMap<string, MarkingLockState> = new Map();
const NO_DRAWN: ReadonlySet<string> = new Set();
const NO_MIN_SIZES: ReadonlyMap<
  string,
  { readonly width: number; readonly height: number }
> = new Map();
const NO_COMPONENT_TYPES: readonly ComponentType[] = [];
const NO_DENSITY_SUGGESTIONS: ReadonlyMap<string, DensitySuggestion> = new Map();

function sameDensitySuggestions(
  a: ReadonlyMap<string, DensitySuggestion>,
  b: ReadonlyMap<string, DensitySuggestion>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [id, suggestion] of a) {
    const other = b.get(id);
    if (
      other === undefined ||
      other.density !== suggestion.density ||
      other.specId !== suggestion.specId ||
      other.preset !== suggestion.preset
    ) {
      return false;
    }
  }
  return true;
}

const NO_COMPONENT_WARNINGS: readonly {
  readonly markingId: string;
  readonly warnings: readonly ModelMessage[];
}[] = [];
const NO_COMPONENTS: ComponentSources = {
  catalog: signal<ComponentCatalog>(EMPTY_CATALOG),
  fontsEpoch: signal(0),
};

function sameIssueList(
  a: readonly AnnotationIssue[],
  b: readonly AnnotationIssue[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (x, i) =>
        x.code === b[i]?.code &&
        x.key === b[i]?.key &&
        x.rowId === b[i]?.rowId &&
        x.column === b[i]?.column,
    )
  );
}

function sameIssues(
  a: ReadonlyMap<string, readonly AnnotationIssue[]>,
  b: ReadonlyMap<string, readonly AnnotationIssue[]>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [id, list] of a) {
    const other = b.get(id);
    if (other === undefined || !sameIssueList(list, other)) return false;
  }
  return true;
}

function sameComponentTypes(
  a: readonly ComponentType[],
  b: readonly ComponentType[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (x, i) =>
        x.specId === b[i]?.specId &&
        x.typeId === b[i]?.typeId &&
        x.name === b[i]?.name &&
        x.layerId === b[i]?.layerId &&
        x.container === b[i]?.container &&
        x.component === b[i]?.component,
    )
  );
}

/** Same items in the same order. */
function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

/**
 * `shown`: the project in view (`review.derived.shownProject`): in the review's Proposed view,
 * the "as it would be"; otherwise, the confirmed one. Without it (editor tests without a review), the
 * confirmed one. Never the project with the gesture preview: nothing here depends on geometry,
 * so dragging/resizing recomputes nothing (`drawingsOf` is the exception: the canvas asks for the
 * drawings of the project with the gesture preview). `components`: catalog and fonts epoch of the
 * session; without it, the catalog is empty and no marking has a drawing. `perspective`: the open
 * perspective (`null` = the Main one); without it, the Main one. The project in view (`shown`)
 * already comes clipped
 * by it (`review.derived.shownProject`); here it decides the hidden layers.
 */
export function createEditorDerived(
  store: ProjectStore,
  ui: EditorUi,
  shown: ReadonlySignal<Project | null> = store.committed,
  components: ComponentSources = NO_COMPONENTS,
  threadSources: ThreadSources = NO_THREAD_SOURCES,
  perspective: ReadonlySignal<Perspective | null> = NO_PERSPECTIVE,
): EditorDerived {
  const project = shown;

  // Returns the previous list when the layers are the same: whoever depends on it
  // (indicators, canvas cards) does not recompute on every edit that does not touch them.
  let lastVisible: readonly Layer[] = [];
  const visible = computed(() => {
    const open = perspective.value;
    const hidden = open ? new Set(open.hiddenLayers) : ui.hiddenLayers.value;
    const next = visibleLayers(project.value, hidden);
    if (!sameItems(next, lastVisible)) lastVisible = next;
    return lastVisible;
  });

  // A single cache for the drawings of the project in view and those of the project with the
  // gesture preview:
  // the dragged marking is the only one re-instantiated, and the others keep the same object.
  const drawingCache = createDrawingCache();
  const drawings = (p: Project | null): ComponentDrawings => {
    const catalog = components.catalog.value;
    // Without components (most projects) there is nothing to traverse on every edit.
    if (catalog.size === 0) return NO_DRAWINGS;
    return drawingCache(
      p,
      catalog,
      memoizedTextMeasurer(textMeasurer.value, components.fontsEpoch.value),
      components.fontsEpoch.value,
      t('annotation.untitled'),
    );
  };
  const scenes = computed((): ComponentDrawings => drawings(project.value));
  const drawingsOf = (p: Project | null): ComponentDrawings =>
    p === project.value ? scenes.value : drawings(p);

  // Model pending items plus "the component does not fit" (only the drawing knows). Without a
  // drawing that
  // overflows, it is the model's map; with one, the previous map if nothing changed.
  let lastIssues: ReadonlyMap<string, readonly AnnotationIssue[]> = NO_ISSUES;
  const issues = computed(() => {
    const p = project.value;
    const base = p ? projectIssues(p) : NO_ISSUES;
    const overflowing = [...scenes.value.values()].filter((d) => d.overflow);
    if (overflowing.length === 0) return base;
    const merged = new Map(base);
    for (const d of overflowing) {
      merged.set(d.annotationId, [
        ...(merged.get(d.annotationId) ?? []),
        { code: 'component-overflow' } satisfies AnnotationIssue,
      ]);
    }
    if (sameIssues(merged, lastIssues)) return lastIssues;
    lastIssues = merged;
    return merged;
  });

  const annotationsByMarking = computed(() => {
    const p = project.value;
    return p ? projectIndex(p).annotationsByMarking : NO_ANNOTATIONS;
  });

  const markingsBySpace = computed((): ReadonlyMap<string | null, readonly Marking[]> => {
    const spaces = new Map<string | null, Marking[]>();
    for (const marking of project.value?.markings ?? []) {
      const list = spaces.get(marking.containerId);
      if (list) list.push(marking);
      else spaces.set(marking.containerId, [marking]);
    }
    return spaces;
  });

  const layerDots = computed(() => {
    const p = project.value;
    return p ? layerDotsByMarking(p, visible.value) : NO_DOTS;
  });

  // Layers with drawings unchecked in the view mode panel; empty outside the mode. The same
  // set while the person does not check a layer: changing outline, name or arrows does not pass
  // through here.
  const hiddenDrawingLayers = computed(() =>
    ui.viewMode.value ? ui.viewShow.value.hiddenDrawingLayers : NO_LAYER_IDS,
  );

  // Markings whose drawing may appear: container without a file, or a photo with the option on. It
  // does not depend
  // on visibility: on the contrary, the "no annotation" filter does not hide what draws. In view
  // mode, the layers unchecked in the panel remove their drawings (the cache does not change).
  const drawn = computed((): ReadonlySet<string> => {
    const all = scenes.value;
    const p = project.value;
    const hiddenLayers = hiddenDrawingLayers.value;
    if (!p) return NO_DRAWN;
    // Structural-type marking (v15): it does not draw, but counts as drawn for the outline
    // (only with mouse or selection) and for the name (without a header); the rest of the canvas
    // does not change.
    const structural = structuralMarkingIds(p);
    if (all.size === 0 && structural.size === 0) return NO_DRAWN;
    const ids = drawnIds(
      all,
      projectIndex(p).containers,
      showComponentsOnPhotos.value,
      hiddenLayers,
    );
    if (structural.size === 0) return ids;
    const withStructural = new Set(ids);
    for (const id of structural) withStructural.add(id);
    return withStructural;
  });

  let lastFloating: ReadonlySet<string> = NO_DRAWN;
  const floatingMarkings = computed((): ReadonlySet<string> => {
    const next = new Set<string>();
    for (const m of project.value?.markings ?? []) if (m.floating) next.add(m.id);
    if (
      next.size === lastFloating.size &&
      [...next].every((id) => lastFloating.has(id))
    ) {
      return lastFloating;
    }
    lastFloating = next.size === 0 ? NO_DRAWN : next;
    return lastFloating;
  });

  let lastDrawn: ReadonlySet<string> = NO_DRAWN;
  const drawnMarkings = computed(() => {
    const next = drawn.value;
    if (next.size === lastDrawn.size && [...next].every((id) => lastDrawn.has(id))) {
      return lastDrawn;
    }
    lastDrawn = next;
    return next;
  });

  const visibility = computed(() => {
    const p = project.value;
    if (!p) return NO_VISIBILITY;
    // View mode: nothing is selected, so no marking appears on touch (the
    // drawn components stay in `drawn`; what the canvas draws is `canvasVisibility`).
    if (ui.viewMode.value) return hiddenVisibility(p);
    const selection = ui.selection.value;
    return markingVisibility(
      p,
      layerDots.value,
      markingDisplay.value,
      selection?.kind === 'marking' ? selection.id : null,
      drawnMarkings.value,
    );
  });

  // What the canvas draws: equal to the filter outside the mode; in the mode, all whole (the filter
  // does not
  // apply, and hiding the outline does not hide the marking for the arrow).
  const canvasVisibility = computed(() => {
    const p = project.value;
    if (!ui.viewMode.value) return visibility.value;
    return p ? fullVisibility(p) : NO_VISIBILITY;
  });

  const incompleteMarkings = computed(() => {
    const p = project.value;
    if (!p) return NO_MARKINGS;
    const shown = new Set(visible.value.map((l) => l.id));
    const { annotations } = projectIndex(p);
    const result = new Set<string>();
    for (const id of issues.value.keys()) {
      const a = annotations.get(id);
      if (a && shown.has(a.layerId)) result.add(a.markingId);
    }
    return result;
  });

  const markingLocks = computed(() => {
    const p = project.value;
    return p ? markingLockStates(p) : NO_LOCKS;
  });

  const hasLocks = computed(() => {
    const p = project.value;
    return markingLocks.value.size > 0 || (p?.containers.some((i) => i.locked) ?? false);
  });

  const listing = computed((): readonly ListedImage[] => {
    const p = project.value;
    if (!p) return [];
    return buildListing(p, visible.value, {
      showEmpty: ui.listShowEmpty.value,
      onlyAnnotations: ui.listIncompleteOnly.value
        ? new Set(issues.value.keys())
        : undefined,
    });
  });

  // With "Visible layers only" the list follows the canvas layer filter.
  const incompleteList = computed((): readonly IncompleteImage[] => {
    const p = project.value;
    if (!p) return [];
    return buildIncompleteList(
      p,
      issues.value,
      ui.incompleteVisibleOnly.value ? visible.value : undefined,
    );
  });

  const incompleteCount = computed(() => issues.value.size);

  // Specialization notices (stage #486): read from `model/noticeList.ts`, memoized by the project
  // version; only the choice of filters and visible layers is recomputed, never pan or zoom.
  const noticeFilters = computed(() => ({
    inUseOnly: ui.noticesInUseOnly.value,
    onlyLayers: ui.noticesVisibleOnly.value ? visible.value : undefined,
  }));
  const noticeList = computed((): readonly NoticeGroup[] => {
    const p = project.value;
    if (!p) return [];
    return buildNoticeList(p, { ...noticeFilters.value, kind: ui.noticeKind.value });
  });
  const noticeCountsSignal = computed((): NoticeCounts => {
    const p = project.value;
    if (!p)
      return {
        unit: 'annotations',
        total: 0,
        byKind: { removed: 0, deprecated: 0, diverges: 0, pending: 0 },
        present: [],
      };
    return noticeCounts(p, noticeFilters.value);
  });
  const noticedCountSignal = computed(() => {
    const p = project.value;
    return p ? noticedCount(p) : 0;
  });

  let lastOrigins = NO_IMAGE_ORIGINS;
  const remoteImageOrigins = computed((): readonly RemoteImageOrigin[] => {
    const policy = {
      allowHttp: imagePermissions.allowHttp.value,
      allowLocalNetwork: imagePermissions.allowLocalNetwork.value,
    };
    const found = new Map<string, RemoteImageOrigin>();
    for (const drawing of scenes.value.values()) {
      for (const url of urlsOfScene(drawing.root)) {
        const check = checkRemoteImageUrl(url, policy);
        if (!check.ok || found.has(check.origin)) continue;
        found.set(check.origin, {
          origin: check.origin,
          local: check.local,
          insecure: check.origin.startsWith('http:'),
        });
      }
    }
    const next = [...found.values()];
    const same =
      next.length === lastOrigins.length &&
      next.every(
        (o, i) =>
          o.origin === lastOrigins[i]?.origin &&
          o.local === lastOrigins[i]?.local &&
          o.insecure === lastOrigins[i]?.insecure,
      );
    if (same) return lastOrigins;
    lastOrigins = next.length === 0 ? NO_IMAGE_ORIGINS : next;
    return lastOrigins;
  });

  let lastPending = NO_IMAGE_ORIGINS;
  const pendingImageOrigins = computed((): readonly RemoteImageOrigin[] => {
    const permitted = new Set(imagePermissions.allowedOrigins.value);
    const any = imagePermissions.allowAnyOrigin.value;
    const skipped = imagePermissions.dismissedOrigins.value;
    const next = remoteImageOrigins.value.filter(
      (o) => !permitted.has(o.origin) && !(any && !o.local) && !skipped.has(o.origin),
    );
    const same =
      next.length === lastPending.length && next.every((o, i) => o === lastPending[i]);
    if (same) return lastPending;
    lastPending = next.length === 0 ? NO_IMAGE_ORIGINS : next;
    return lastPending;
  });

  let lastMinSizes = NO_MIN_SIZES;
  const componentMinSizes = computed(() => {
    const p = project.value;
    const all = scenes.value;
    if (!p || all.size === 0) return NO_MIN_SIZES;
    const next = new Map<string, { readonly width: number; readonly height: number }>();
    for (const id of all.keys()) {
      const min = componentMinSize(p, components.catalog.value, id);
      if (min !== null) next.set(id, min);
    }
    const same =
      next.size === lastMinSizes.size &&
      [...next].every(([id, min]) => {
        const before = lastMinSizes.get(id);
        return before?.width === min.width && before.height === min.height;
      });
    if (same) return lastMinSizes;
    lastMinSizes = next.size === 0 ? NO_MIN_SIZES : next;
    return lastMinSizes;
  });

  let lastTypes = NO_COMPONENT_TYPES;
  const types = computed(() => {
    const p = project.value;
    const next = p ? componentTypes(p, components.catalog.value) : NO_COMPONENT_TYPES;
    if (sameComponentTypes(next, lastTypes)) return lastTypes;
    lastTypes = next.length === 0 ? NO_COMPONENT_TYPES : next;
    return lastTypes;
  });

  // Project layers with some type with a component (free and data-only ones are left out). The
  // previous list comes back while they are the same layers: the mode panel does not redraw needlessly.
  let lastDrawingLayers = NO_LAYERS;
  const drawingLayers = computed((): readonly Layer[] => {
    const p = project.value;
    const next =
      p && types.value.length > 0 ? layersWithDrawing(p.layers, types.value) : NO_LAYERS;
    if (sameItems(next, lastDrawingLayers)) return lastDrawingLayers;
    lastDrawingLayers = next.length === 0 ? NO_LAYERS : next;
    return lastDrawingLayers;
  });

  // The two lists in their own computeds: an edit that changes neither of them (most) does not
  // recompute anything. The previous table comes back while the suggestions are the same: the
  // Details panel does not redraw on every edit that does not touch the containers.
  const containersOnly = computed(() => project.value?.containers);
  const specializationsOnly = computed(() => project.value?.specializations);
  let lastSuggestions = NO_DENSITY_SUGGESTIONS;
  const densitySuggestions = computed((): ReadonlyMap<string, DensitySuggestion> => {
    const containers = containersOnly.value;
    const specializations = specializationsOnly.value;
    const next =
      containers && specializations
        ? suggestDensities({ containers, specializations })
        : NO_DENSITY_SUGGESTIONS;
    if (sameDensitySuggestions(next, lastSuggestions)) return lastSuggestions;
    lastSuggestions = next.size === 0 ? NO_DENSITY_SUGGESTIONS : next;
    return lastSuggestions;
  });

  let lastComponentWarnings = NO_COMPONENT_WARNINGS;
  const componentWarnings = computed(() => {
    const next: { markingId: string; warnings: readonly ModelMessage[] }[] = [];
    for (const [markingId, drawing] of scenes.value) {
      if (drawing.warnings.length > 0)
        next.push({ markingId, warnings: drawing.warnings });
    }
    const same =
      next.length === lastComponentWarnings.length &&
      next.every(
        (item, i) =>
          item.markingId === lastComponentWarnings[i]?.markingId &&
          item.warnings === lastComponentWarnings[i]?.warnings,
      );
    if (same) return lastComponentWarnings;
    lastComponentWarnings = next.length === 0 ? NO_COMPONENT_WARNINGS : next;
    return lastComponentWarnings;
  });

  return {
    perspective,
    visibleLayers: visible,
    issues,
    annotationsByMarking,
    markingsBySpace,
    layerDots,
    markingVisibility: visibility,
    canvasVisibility,
    incompleteMarkings,
    markingLocks,
    hasLocks,
    listing,
    incompleteList,
    incompleteCount,
    noticeList,
    noticeCounts: noticeCountsSignal,
    noticedCount: noticedCountSignal,
    threads: createThreadDerived(project, ui, threadSources),
    densitySuggestions,
    catalog: components.catalog,
    componentScenes: scenes,
    floatingMarkings,
    drawingsOf,
    drawnMarkings,
    drawingLayers,
    componentMinSizes,
    remoteImageOrigins,
    pendingImageOrigins,
    componentTypes: types,
    componentWarnings,
  };
}

// ---------------------------------------------------------------------------
// Proposal review (stage 4)

/** Canvas (and Tree) view in the review: the project as it is or "as it would be". */
export type ReviewView = 'current' | 'proposed';

/**
 * Where the review's derived state reads from: the session's proposals and what the interface
 * chose (open proposal, view, filters, proposals this device has already opened).
 */
export interface ReviewSources {
  readonly proposals: ReadonlySignal<readonly Proposal[]>;
  readonly proposalId: ReadonlySignal<string | null>;
  readonly view: ReadonlySignal<ReviewView>;
  readonly filters: ReadonlySignal<ReviewFilters>;
  /** Proposals already opened on this device (ids), for the "New" mark. */
  readonly seen: ReadonlySignal<ReadonlySet<string>>;
  /**
   * Id of the open perspective (`session.perspective.id`; `null` = the Main one). Without it, the
   * Main one. The review locks the Main one, so it is `null` while a proposal is open.
   */
  readonly perspectiveId?: ReadonlySignal<string | null>;
}

/** Counts of the open proposal (the review strip and the Proposals window). */
export interface ReviewCounts {
  readonly total: number;
  /** Undecided. */
  readonly undecided: number;
  /** Accepted (includes those already applied). */
  readonly accepted: number;
  readonly rejected: number;
  readonly applied: number;
  /** Accepted and awaiting application ("5 accepted awaiting application"). */
  readonly acceptedPending: number;
  readonly conflicts: number;
  /** Reviewed by the agent and still undecided (the "Reviewed" mark). */
  readonly revised: number;
}

/** What a change is in the current project, without the decision (which changes on every click). */
export type ChangeSituation = Omit<ChangeStatus, 'decision'>;

/** A superseded proposal: who superseded it, what was left behind and how it compares. */
export interface Supersession {
  /** The proposal that supersedes it; `null` if it is no longer in the folder. */
  readonly by: Proposal | null;
  readonly leftBehind: LeftBehind;
  /**
   * Each change of the old one relative to the new one (equal, different or absent); `null` without
   * the new one.
   */
  readonly comparison: ReadonlyMap<string, ChangeComparison> | null;
}

/** A row of the Proposals window. */
export interface ProposalRow {
  readonly proposal: Proposal;
  readonly progress: ReviewProgress;
  readonly conflicts: number;
  /** Open and still without decisions, notes or opening on this device: the one that just arrived. */
  readonly fresh: boolean;
  /** Changes with the "Reviewed" mark and without a decision in an open proposal (stage #644). */
  readonly revised: number;
  /** Superseded: what was left behind (`null` for the others). */
  readonly leftBehind: LeftBehind | null;
  /**
   * The proposal that `supersedes` points to this one, if it is in the folder: derived from the new one,
   * whatever this one's status is (an applied one is history and does not change status).
   */
  readonly supersededBy: Proposal | null;
}

/**
 * Changes of an entity (marking, image, annotation or layer), for the markers of the
 * Details in the review: the creation or removal of the whole entity and the per-field changes.
 */
export interface EntityChanges {
  readonly entity: ChangeEntity;
  /** Creation or removal of the whole entity; `null` if there are only field changes. */
  readonly whole: Change | null;
  /**
   * Per-field changes, as in `Change.field`: `name`, `rect`, `parentId`, `file`,
   * `markingColor`, `parentAnnotationId`, `markingId`, `layerId`, `type`,
   * `values.<key>` (typed annotation field) and `entries.<id>` (free annotation pair).
   */
  readonly fields: ReadonlyMap<string, Change>;
}

/**
 * "Changes by entity and field" index of the open proposal (phase 9.5): it only depends on the
 * changes, so deciding does not recompute it. Specialization and repository (no panel in the
 * Details) are left out.
 */
export interface FieldChangeIndex {
  /** By entity id. */
  readonly entities: ReadonlyMap<string, EntityChanges>;
  /** Annotation changes of each marking they appear in (`Change.markingId`), in proposal order. */
  readonly annotationsOf: ReadonlyMap<string, readonly Change[]>;
  /**
   * Annotations leaving each marking (by the id of the marking before): the removal and the swap
   * of marking (`markingId`). They are the "ghosts" of the Proposed view.
   */
  readonly leaving: ReadonlyMap<string, readonly Change[]>;
}

const PANEL_ENTITIES: ReadonlySet<ChangeEntity> = new Set([
  'marking',
  'arrow',
  'image',
  'annotation',
  'layer',
]);

const NO_FIELD_INDEX: FieldChangeIndex = {
  entities: new Map(),
  annotationsOf: new Map(),
  leaving: new Map(),
};

/** Adds `item` to the `key` list in the map. */
function pushTo<K, V>(map: Map<K, V[]>, key: K, item: V): void {
  const list = map.get(key);
  if (list) list.push(item);
  else map.set(key, [item]);
}

/** Builds the "changes by entity and field" index (a pure function of the changes). */
export function fieldChangeIndex(changes: readonly Change[]): FieldChangeIndex {
  const entities = new Map<
    string,
    { entity: ChangeEntity; whole: Change | null; fields: Map<string, Change> }
  >();
  const annotationsOf = new Map<string, Change[]>();
  const leaving = new Map<string, Change[]>();
  for (const c of changes) {
    if (!PANEL_ENTITIES.has(c.entity)) continue;
    let entry = entities.get(c.entityId);
    if (!entry) {
      entry = { entity: c.entity, whole: null, fields: new Map() };
      entities.set(c.entityId, entry);
    }
    if (c.kind === 'update' && c.field !== null) {
      // One field, one change: the first one counts (a hand-edited proposal may repeat).
      if (!entry.fields.has(c.field)) entry.fields.set(c.field, c);
    } else if (entry.whole === null) {
      entry.whole = c;
    }
    if (c.entity !== 'annotation') continue;
    if (c.markingId !== null) pushTo(annotationsOf, c.markingId, c);
    if (c.kind === 'remove' && c.markingId !== null) pushTo(leaving, c.markingId, c);
    if (c.kind === 'update' && c.field === 'markingId' && typeof c.from === 'string') {
      pushTo(leaving, c.from, c);
    }
  }
  return { entities, annotationsOf, leaving };
}

export interface ReviewDerived {
  /** Proposal open in the review (the session's newest version). */
  readonly proposal: ReadonlySignal<Proposal | null>;
  /** All the proposals with counts, for the Proposals window, newest first. */
  readonly rows: ReadonlySignal<readonly ProposalRow[]>;
  /** New proposals (still without a decision, note or opening): the badge and the notice. */
  readonly freshIds: ReadonlySignal<readonly string[]>;
  /** Levels Project → Image → Item (memoized by the changes and the project, not by the decisions). */
  readonly tree: ReadonlySignal<ReviewTree | null>;
  /** Position of each change in the proposal. */
  readonly order: ReadonlySignal<ReadonlyMap<string, number>>;
  /** Kind of each change. */
  readonly changeTypes: ReadonlySignal<ReadonlyMap<string, ChangeType>>;
  /** Dominant kind of each level (`reviewKey`), for the Tree and list badges. */
  readonly levelTypes: ReadonlySignal<ReadonlyMap<string, ChangeType>>;
  /** Conflict, current value and locked-item warning of each change. */
  readonly situation: ReadonlySignal<ReadonlyMap<string, ChangeSituation>>;
  readonly conflictIds: ReadonlySignal<ReadonlySet<string>>;
  /** Changes with the "Reviewed" mark and without a decision (`visibleRevisedChanges`). */
  readonly revisedIds: ReadonlySignal<ReadonlySet<string>>;
  /** The newest review of the open proposal (for the strip), or `null`. */
  readonly revisionSummary: ReadonlySignal<ReturnType<
    typeof latestRevisionSummary
  > | null>;
  /** Three-state decisions with "partial" and counts, per level (`reviewKey`, includes `proposal:`). */
  readonly levels: ReadonlySignal<ReadonlyMap<string, LevelSummary>>;
  readonly progress: ReadonlySignal<ReviewProgress | null>;
  readonly counts: ReadonlySignal<ReviewCounts>;
  /** Check of the accepted set (what blocks "Apply accepted"); `null` without a proposal. */
  readonly validation: ReadonlySignal<AcceptedValidation | null>;
  /** Accepted changes that cause the problem and the undecided ones that may resolve it. */
  readonly invalid: ReadonlySignal<{
    readonly changeIds: ReadonlySet<string>;
    readonly related: ReadonlySet<string>;
  }>;
  /**
   * Can be applied now: there are pending accepted ones, the set is valid, the project is not
   * read-only and no apply of this proposal is in progress.
   */
  readonly canApply: ReadonlySignal<boolean>;
  /** An apply of the open proposal is in progress (`hold`): the review does not reevaluate. */
  readonly applying: ReadonlySignal<boolean>;
  /**
   * Holds the reevaluation of the open proposal while its apply runs: `validation`,
   * `conflictIds` and `situation` (and what derives from them) keep the current value, only
   * while it is the open proposal. Returns the function that releases (calls add up).
   */
  hold(): () => void;
  /**
   * The "as it would be" project (current + changes not rejected and not applied); read only when
   * the interface asks.
   */
  readonly preview: ReadonlySignal<PatchResult | null>;
  /**
   * The project the interface shows: the "as it would be" in the review's Proposed view; the
   * current one (`store.committed`) in the Current view and outside the review. The Tree and the
   * empty state
   * of the canvas read from here (a new import has images only in the preview).
   */
  readonly shownProject: ReadonlySignal<Project | null>;
  /**
   * The "as it would be" with all the changes not yet applied, ignoring the decisions: what
   * a rejected creation proposed (the Details show it even outside the two views).
   * Memoized by the changes, the applied ones and the project; read only when the interface asks.
   */
  readonly fullPreview: ReadonlySignal<Project | null>;
  /** Changes by entity and field (the Details markers); memoized by the changes. */
  readonly fieldIndex: ReadonlySignal<FieldChangeIndex>;
  /** Changes that pass the filters, in proposal order. */
  readonly visibleIds: ReadonlySignal<readonly string[]>;
  /** Undecided (all, in proposal order). */
  readonly pendingIds: ReadonlySignal<readonly string[]>;
  /** Notes per target (`reviewKey`). */
  readonly notes: ReadonlySignal<ReadonlyMap<string, readonly ProposalNote[]>>;
  /** Whether the open proposal was superseded: what was left behind. */
  readonly supersession: ReadonlySignal<Supersession | null>;
}

const NO_SITUATIONS: ReadonlyMap<string, ChangeSituation> = new Map();

/** The snapshot of a proposal's review while its apply runs (`hold`). */
interface HeldReview {
  readonly count: number;
  readonly situation: ReadonlyMap<string, ChangeSituation>;
  readonly conflictIds: ReadonlySet<string>;
  readonly validation: AcceptedValidation | null;
}
const NO_HOLDS: ReadonlyMap<string, HeldReview> = new Map();
const NO_IDS: readonly string[] = [];
const NO_ID_SET: ReadonlySet<string> = new Set();
const NO_ORDER: ReadonlyMap<string, number> = new Map();
const NO_TYPES: ReadonlyMap<string, ChangeType> = new Map();
const NO_LEVELS: ReadonlyMap<string, LevelSummary> = new Map();
const NO_NOTES: ReadonlyMap<string, readonly ProposalNote[]> = new Map();
const NO_COUNTS: ReviewCounts = {
  total: 0,
  undecided: 0,
  accepted: 0,
  rejected: 0,
  applied: 0,
  acceptedPending: 0,
  conflicts: 0,
  revised: 0,
};
const NO_INVALID = { changeIds: NO_ID_SET, related: NO_ID_SET };
const NO_DECISIONS: Proposal['decisions'] = {};

/** Conflicts of each proposal by (changes, applied, project): deciding does not recompute them. */
const conflictCache = new WeakMap<
  readonly Change[],
  { project: Project; applied: ProposalApplied; ids: ReadonlySet<string> }
>();

/** Open proposal that nobody decided on, annotated or saw. */
function isFresh(p: Proposal, seen: ReadonlySet<string>): boolean {
  return (
    p.status === 'open' &&
    Object.keys(p.decisions).length === 0 &&
    p.notes.length === 0 &&
    !seen.has(p.id)
  );
}

function conflictsOf(p: Proposal, project: Project): ReadonlySet<string> {
  const cached = conflictCache.get(p.changes);
  if (cached && cached.project === project && cached.applied === p.applied) {
    return cached.ids;
  }
  const stub: Proposal = { ...p, decisions: NO_DECISIONS };
  const ids = new Set<string>();
  for (const c of p.changes) {
    if (changeStatus(stub, c, project).conflict) ids.add(c.id);
  }
  conflictCache.set(p.changes, { project, applied: p.applied, ids });
  return ids;
}

/**
 * Derived state of the proposal review: levels, counts, conflicts, "as it would be",
 * accepted awaiting application and superseded proposal. Memoized by the project version
 * (`store.committed`) and the proposal's: what only depends on the changes and the project (levels,
 * conflicts, kinds) is not recomputed on every decision. Nothing here depends on the viewport.
 */
export function createReviewDerived(
  store: ProjectStore,
  sources: ReviewSources,
): ReviewDerived {
  const project = store.committed;

  const proposal = computed(() => {
    const id = sources.proposalId.value;
    return id === null
      ? null
      : (sources.proposals.value.find((p) => p.id === id) ?? null);
  });
  // Derived signals only notify when the value changes: deciding does not swap `changes` or `applied`.
  const changesOf = computed(() => proposal.value?.changes ?? null);
  const appliedOf = computed(() => proposal.value?.applied ?? null);

  const supersededBy = computed(() => {
    const map = new Map<string, Proposal>();
    for (const p of sources.proposals.value) {
      if (p.supersedes !== null && !map.has(p.supersedes)) map.set(p.supersedes, p);
    }
    return map;
  });

  const rows = computed((): readonly ProposalRow[] => {
    const current = project.value;
    const successors = supersededBy.value;
    const seen = sources.seen.value;
    return sources.proposals.value.map((p) => ({
      proposal: p,
      progress: reviewProgress(p),
      conflicts: current ? conflictsOf(p, current).size : 0,
      fresh: isFresh(p, seen),
      revised: p.status === 'open' ? visibleRevisedChanges(p).length : 0,
      leftBehind: p.status === 'superseded' ? leftBehind(p) : null,
      supersededBy: successors.get(p.id) ?? null,
    }));
  });

  // Without `rows`: it computes the conflicts of all proposals, and `freshIds` is read
  // (strip, status bar) with the Proposals window closed, on every edit.
  const freshIds = computed(() => {
    const seen = sources.seen.value;
    return sources.proposals.value.filter((p) => isFresh(p, seen)).map((p) => p.id);
  });

  const tree = computed((): ReviewTree | null => {
    const changes = changesOf.value;
    const current = project.value;
    const p = untracked(() => proposal.value);
    return changes && current && p ? reviewTree(p, current) : null;
  });

  const order = computed(() => {
    const changes = changesOf.value;
    return changes ? new Map(changes.map((c, i) => [c.id, i])) : NO_ORDER;
  });

  const changeTypes = computed(() => {
    const changes = changesOf.value;
    return changes ? new Map(changes.map((c) => [c.id, changeType(c)])) : NO_TYPES;
  });

  // Kind of each level (the rule is `levelType`, from the model); memoized by the tree.
  const levelTypes = computed((): ReadonlyMap<string, ChangeType> => {
    const t = tree.value;
    const changes = changesOf.value;
    const result = new Map<string, ChangeType>();
    if (!t || !changes) return result;
    const byId = new Map(changes.map((c) => [c.id, c]));
    for (const [key, node] of t.nodes) {
      const own = t
        .changeIdsOf({ level: node.level, id: node.id })
        .map((id) => byId.get(id))
        .filter((c): c is Change => c !== undefined);
      const type = levelType(node.level, node.id, own);
      if (type !== null) result.set(key, type);
    }
    return result;
  });

  const liveSituation = computed((): ReadonlyMap<string, ChangeSituation> => {
    const changes = changesOf.value;
    void appliedOf.value;
    const current = project.value;
    const p = untracked(() => proposal.value);
    if (!changes || !current || !p) return NO_SITUATIONS;
    const stub: Proposal = { ...p, decisions: NO_DECISIONS };
    const result = new Map<string, ChangeSituation>();
    for (const c of changes) {
      const {
        applied,
        conflict,
        current: value,
        locked,
      } = changeStatus(stub, c, current);
      result.set(c.id, { applied, conflict, current: value, locked });
    }
    return result;
  });

  const liveConflictIds = computed((): ReadonlySet<string> => {
    const changes = changesOf.value;
    void appliedOf.value;
    const current = project.value;
    const p = untracked(() => proposal.value);
    return changes && current && p ? conflictsOf(p, current) : NO_ID_SET;
  });

  // Apply in progress (return of the 8.2 gate): between `store.apply` and the publication of
  // `proposal.json` with `applied`, the project already has the accepted ones and the proposal does
  // not yet give them
  // as applied. Reevaluating in that window would report conflicts and an invalid set that
  // do not exist. `hold()` keeps the earlier snapshot, tied to the open proposal: the exported
  // values only use it while it is the open one, and the snapshot goes away on release (none of it
  // stays stored), so a real conflict that arose in the window appears on release.
  const held = signal<ReadonlyMap<string, HeldReview>>(NO_HOLDS);
  const heldNow = computed((): HeldReview | null => {
    const id = sources.proposalId.value;
    return id === null ? null : (held.value.get(id) ?? null);
  });
  const applying = computed(() => heldNow.value !== null);
  const situation = computed(
    (): ReadonlyMap<string, ChangeSituation> =>
      heldNow.value?.situation ?? liveSituation.value,
  );
  const conflictIds = computed(
    (): ReadonlySet<string> => heldNow.value?.conflictIds ?? liveConflictIds.value,
  );

  const levels = computed((): ReadonlyMap<string, LevelSummary> => {
    const p = proposal.value;
    const t = tree.value;
    if (!p || !t) return NO_LEVELS;
    const result = new Map<string, LevelSummary>();
    for (const [key, node] of t.nodes) {
      result.set(
        key,
        summarizeDecisions(p, t.changeIdsOf({ level: node.level, id: node.id })),
      );
    }
    return result;
  });

  const progress = computed(() => {
    const p = proposal.value;
    return p ? reviewProgress(p) : null;
  });

  const revisedIds = computed((): ReadonlySet<string> => {
    const p = proposal.value;
    return p ? new Set(visibleRevisedChanges(p)) : NO_ID_SET;
  });
  const revisionSummary = computed(() => {
    const p = proposal.value;
    return p ? latestRevisionSummary(p) : null;
  });

  const counts = computed((): ReviewCounts => {
    const p = progress.value;
    if (!p) return NO_COUNTS;
    return {
      total: p.total,
      undecided: p.undecided,
      accepted: p.accepted,
      rejected: p.rejected,
      applied: p.applied,
      acceptedPending: p.acceptedPending,
      conflicts: conflictIds.value.size,
      revised: revisedIds.value.size,
    };
  });

  const liveValidation = computed((): AcceptedValidation | null => {
    const p = proposal.value;
    const current = project.value;
    if (!p || !current) return null;
    // Without pending accepted ones there is nothing to validate (and `validateProject` is costly).
    if (
      acceptedPending(p).length === 0 &&
      (p.status === 'open' || p.status === 'superseded')
    ) {
      return { ok: true, changeIds: NO_IDS, issues: [], project: current };
    }
    return validateAccepted(current, p);
  });

  const validation = computed((): AcceptedValidation | null => {
    const frozen = heldNow.value;
    return frozen ? frozen.validation : liveValidation.value;
  });

  const hold = (): (() => void) => {
    const id = sources.proposalId.peek();
    if (id === null) return () => undefined;
    const current = held.peek().get(id);
    const next = new Map(held.peek());
    next.set(
      id,
      current
        ? { ...current, count: current.count + 1 }
        : {
            count: 1,
            situation: liveSituation.peek(),
            conflictIds: liveConflictIds.peek(),
            validation: liveValidation.peek(),
          },
    );
    held.value = next;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const entry = held.peek().get(id);
      if (!entry) return;
      const rest = new Map(held.peek());
      if (entry.count > 1) rest.set(id, { ...entry, count: entry.count - 1 });
      else rest.delete(id);
      held.value = rest;
    };
  };

  const invalid = computed(() => {
    const v = validation.value;
    if (!v || v.ok) return NO_INVALID;
    return {
      changeIds: new Set(v.issues.flatMap((i) => i.changeIds)),
      related: new Set(v.issues.flatMap((i) => i.related)),
    };
  });

  const canApply = computed(() => {
    // While applying, the snapshot says "valid": it does not allow applying again.
    if (applying.value) return false;
    const v = validation.value;
    return v !== null && v.ok && v.changeIds.length > 0 && !store.readOnly.value;
  });

  const preview = computed((): PatchResult | null => {
    const p = proposal.value;
    const current = project.value;
    return p && current ? previewProject(current, p) : null;
  });

  // The project in view: the confirmed one or the proposal's "as it would be", clipped by the open
  // perspective (decision 3). `projectInPerspective` is memoized by project and perspective, and nothing
  // here reads the viewport: pan and zoom do not recompute.
  const shownProject = computed((): Project | null => {
    const base =
      sources.proposalId.value === null || sources.view.value === 'current'
        ? project.value
        : (preview.value?.project ?? project.value);
    return projectInPerspective(base, sources.perspectiveId?.value ?? null);
  });

  const fullPreview = computed((): Project | null => {
    const changes = changesOf.value;
    const applied = appliedOf.value;
    const current = project.value;
    const p = untracked(() => proposal.value);
    if (!changes || !applied || !current || !p) return null;
    return previewProject(current, { ...p, decisions: NO_DECISIONS }).project;
  });

  const fieldIndex = computed((): FieldChangeIndex => {
    const changes = changesOf.value;
    return changes ? fieldChangeIndex(changes) : NO_FIELD_INDEX;
  });

  const visibleIds = computed((): readonly string[] => {
    const p = proposal.value;
    const current = project.value;
    if (!p || !current) return NO_IDS;
    return filterChanges(
      p,
      current,
      sources.filters.value,
      conflictIds.value,
      revisedIds.value,
    ).map((c) => c.id);
  });

  const pendingIds = computed((): readonly string[] => {
    const p = proposal.value;
    if (!p) return NO_IDS;
    return p.changes.filter((c) => p.decisions[c.id] === undefined).map((c) => c.id);
  });

  const notes = computed((): ReadonlyMap<string, readonly ProposalNote[]> => {
    const p = proposal.value;
    if (!p || p.notes.length === 0) return NO_NOTES;
    const result = new Map<string, ProposalNote[]>();
    for (const note of p.notes) {
      const key = reviewKey(note.target);
      const list = result.get(key);
      if (list) list.push(note);
      else result.set(key, [note]);
    }
    return result;
  });

  const supersession = computed((): Supersession | null => {
    const p = proposal.value;
    if (!p || p.status !== 'superseded') return null;
    const by = supersededBy.value.get(p.id) ?? null;
    return {
      by,
      leftBehind: leftBehind(p),
      comparison: by ? compareProposals(p, by) : null,
    };
  });

  return {
    proposal,
    rows,
    freshIds,
    tree,
    order,
    changeTypes,
    levelTypes,
    situation,
    conflictIds,
    revisedIds,
    revisionSummary,
    levels,
    progress,
    counts,
    validation,
    invalid,
    canApply,
    applying,
    hold,
    preview,
    shownProject,
    fullPreview,
    fieldIndex,
    visibleIds,
    pendingIds,
    notes,
    supersession,
  };
}
