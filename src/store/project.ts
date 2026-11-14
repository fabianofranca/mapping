import * as model from '../model';
import type {
  AnnotationTypeRef,
  ArrowEnd,
  ArrowPoint,
  ArrowSide,
  ArrowStyle,
  ComponentCatalog,
  EntryInput,
  JsonValue,
  LabelTexts,
  Layer,
  Perspective,
  Placement,
  PlatformRepoInput,
  Project,
  ReadingDirection,
  Rect,
  Spec,
  SpecRemovalMode,
  TextMeasurer,
} from '../model';
import type { ActionResult, Operation, ProjectStore } from './history';
import * as view from './perspectiveGestures';
import { openPerspectiveIn, type ArrivalInfo } from './perspectives';
import { textMeasurer } from './textMeasure';

/** Ponto em pixels (da imagem ou do canvas, conforme a action). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface ActionDeps {
  readonly newId?: () => string;
  /** Current component catalog (default: empty). It gives the minimum size and the instance drawing. */
  readonly components?: () => ComponentCatalog;
  /** Current text measurer (default: `textMeasurer`'s, which the canvas swaps for the real one). */
  readonly measure?: () => TextMeasurer;
  /**
   * The open perspective (`null` = Main; without this function, always Main). With one
   * open, the canvas calls the actions with view coordinates and they become what actually changes
   * (`perspectiveGestures.ts`): dragging a root changes only its position in the perspective, and
   * the "Main only" commands refuse with `principal-only`.
   */
  readonly perspective?: () => string | null;
  /** Called with the arrivals in Main of an operation that created roots in a perspective. */
  readonly onArrival?: (infos: readonly ArrivalInfo[]) => void;
}

/**
 * Clamps the requested rectangle to the component's minimum size, instead of refusing: the
 * resize gesture does not lock up midway. The edge the gesture does not move (the one opposite the
 * handle) stays where it was at the start of the gesture (`base`); if no edge stayed, it anchors at
 * x and y.
 */
export function clampToMinSize(
  rect: Rect,
  base: Rect,
  min: { readonly width: number; readonly height: number },
): Rect {
  const fit = (
    start: number,
    size: number,
    minimum: number,
    baseStart: number,
    baseSize: number,
  ): [number, number] => {
    // An axis the gesture did not move stays as it is, even below the minimum (old marking).
    if (size >= minimum || (start === baseStart && size === baseSize))
      return [start, size];
    // Only the bottom/right edge stayed where it was: the handle is the top/left one.
    const anchorFar = start + size === baseStart + baseSize && start !== baseStart;
    return [anchorFar ? start + size - minimum : start, minimum];
  };
  const [x, width] = fit(rect.x, rect.width, min.width, base.x, base.width);
  const [y, height] = fit(rect.y, rect.height, min.height, base.y, base.height);
  return { x, y, width, height };
}

/**
 * Files of a library package: path relative to the package folder
 * (`components/button.json`) → text (`.json`, `.md`) or bytes (fonts).
 */
export type SpecPackageFiles = ReadonlyMap<string, string | Blob>;

function packageSpecNameIn(spec: Spec, files?: SpecPackageFiles): string | undefined {
  return files === undefined ? undefined : model.packageSpecNameOf(files, spec.id);
}

/**
 * Project actions: every mutation goes through here. Each action applies a pure model
 * operation and creates a history entry. Those that create items
 * return the generated id.
 *
 * Gestures (drag/resize) use `store.beginGesture/updateGesture/commitGesture`
 * with the same operations, to produce a single history entry.
 */
/**
 * Joint drag in Main: `moveItems` with the offset reduced to the largest that does not overlap
 * a container that does not move (the edges touch; decision 4 of stage #764).
 */
function movedTouching(
  p: Project,
  items: readonly model.ItemRef[],
  dx: number,
  dy: number,
  options: model.SettleOptions,
): Project {
  const limited = model.limitItemsMove(p, items, dx, dy);
  return model.moveItems(p, items, limited.dx, limited.dy, options);
}

/**
 * Requested position to move a container (same scale) in Main, reduced to what touches the
 * container the pointer would cross. Resizing (different scale) goes through as it came.
 */
function touchingPlacement(
  p: Project,
  containerId: string,
  placement: Placement,
): Placement {
  const own = model.projectIndex(p).containers.get(containerId);
  if (!own || own.placement.scale !== placement.scale) return placement;
  const wantedX = placement.x - own.placement.x;
  const wantedY = placement.y - own.placement.y;
  const { dx, dy } = model.limitItemsMove(
    p,
    [{ kind: 'image', id: containerId }],
    wantedX,
    wantedY,
  );
  return dx === wantedX && dy === wantedY
    ? placement
    : { ...placement, x: own.placement.x + dx, y: own.placement.y + dy };
}

export function createProjectActions(store: ProjectStore, deps: ActionDeps = {}) {
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const catalog = deps.components ?? (() => model.EMPTY_CATALOG);
  const measure = deps.measure ?? (() => textMeasurer.peek());
  /** A perspectiva aberta em `p` (`null` = a Principal). */
  const viewFor = (p: Project): Perspective | null =>
    openPerspectiveIn(p, deps.perspective?.() ?? null);
  /** Returns `principal-only` when the operation is refused outside Main. */
  const guarded = <T>(run: () => ActionResult<T>): ActionResult<T> => {
    try {
      return run();
    } catch (e) {
      if (e instanceof view.PrincipalOnlyError) {
        return { ok: false, error: 'principal-only' };
      }
      throw e;
    }
  };
  /** Component minimum of each marking of `p`: applies when converting the `rect` to another space. */
  const minSizeOf = (p: Project) => (id: string) =>
    model.componentMinSize(p, catalog(), id);
  /**
   * Settle options of the geometry operations that are not a gesture preview. `before` is the
   * earlier project (the one from the start of the gesture): perspectives reconcile with the
   * difference up to it.
   */
  const settleOptions = (p: Project): model.SettleOptions => ({
    settle: true,
    before: p,
    minSizeOf: minSizeOf(p),
  });
  /**
   * Options of the operations that change the marking's rectangle: the minimum size of the
   * component that draws it (nothing for a plain marking) and the minimum of the others, for the
   * space change.
   */
  const rectOptions = (p: Project, markingId: string): model.RectOptions => {
    const minSize = model.componentMinSize(p, catalog(), markingId);
    return minSize === null
      ? { minSizeOf: minSizeOf(p) }
      : { minSize, minSizeOf: minSizeOf(p) };
  };
  /** Snap options: the usual settle and the `anchor` defaults that the component declares. */
  const snapOptions = (p: Project): model.SnapToAnchorOptions => ({
    ...settleOptions(p),
    defaults: model.markingAnchorDefaults(p, catalog()),
  });
  /**
   * A marking's Arrange: the arrangement of the children or the fit to the content and, with an
   * anchor, the snap afterwards (the size is already the new one). An anchored marking that is
   * neither arranged nor fitted only snaps; without an anchor, today's rule (and its errors).
   */
  const arrangeAndSnap = (
    p: Project,
    markingId: string,
  ): { project: Project; warnings: readonly model.ModelMessage[] } => {
    const components = catalog();
    const anchored = model.projectIndex(p).markings.get(markingId)?.anchor != null;
    const skipsArrange =
      anchored &&
      !model.canArrange(p, components, markingId) &&
      !model.canFit(p, components, markingId);
    let next = p;
    let warnings: readonly model.ModelMessage[] = [];
    if (!skipsArrange && model.arrangesByFit(p, components, markingId)) {
      next = model.fitMarking(p, components, markingId, measure(), settleOptions(p));
    } else if (!skipsArrange) {
      const arranged = model.arrangeMarking(
        p,
        components,
        markingId,
        measure(),
        settleOptions(p),
      );
      next = arranged.project;
      warnings = arranged.warnings;
    }
    if (!anchored) return { project: next, warnings };
    const snapped = model.snapToAnchor(next, markingId, {
      ...snapOptions(next),
      before: p,
    });
    return { project: snapped.project, warnings: [...warnings, ...snapped.warnings] };
  };
  /** The requested rectangle clamped to the component's minimum size (the gesture does not lock up). */
  const wantedRect = (p: Project, markingId: string, rect: Rect): Rect => {
    const min = model.componentMinSize(p, catalog(), markingId);
    const base = view.shownRect(p, viewFor(p), markingId);
    return min && base ? clampToMinSize(rect, base, min) : rect;
  };
  /**
   * Final operation of a gesture: repeats the operation with the final values and `settle: true` on
   * the project from the start of the gesture (`updateGesture` always starts from it). The final
   * one can never fail: if it did, `commitGesture` would record the preview without settling; so it
   * settles the last valid preview. `op` receives the starting project and the last preview.
   */
  const finishGesture = (op: (base: Project, last: Project) => Project): ActionResult => {
    const last = store.project.peek();
    if (!last) return { ok: false, error: 'no-project' };
    const result = store.updateGesture((base) => op(base, last));
    if (result.ok) return result;
    store.updateGesture((base) => model.settleHierarchy(last, settleOptions(base)));
    return result;
  };

  /**
   * Applies an operation that creates (containers, markings, components). With an open perspective
   * (decision 8): a new canvas marking that is not floating refuses the whole operation
   * (`principal-only`); each new root enters the perspective where it was created and arrives in
   * Main, and the arrivals go to `deps.onArrival`. In Main it is `store.apply`.
   */
  const applyCreating = (op: Operation): ActionResult =>
    guarded(() => {
      const arrivals: ArrivalInfo[] = [];
      const result = store.apply((p) => {
        const next = op(p);
        const open = viewFor(p);
        if (open === null || next === p) return next;
        const created = view.creationInPerspective(p, next, open.id);
        arrivals.push(...created.arrivals);
        return created.project;
      });
      if (result.ok && arrivals.length > 0) deps.onArrival?.(arrivals);
      return result;
    });

  const create = (op: (id: string) => (p: Project) => Project): ActionResult<string> => {
    const id = newId();
    const result = applyCreating(op(id));
    return result.ok ? { ok: true, value: id } : result;
  };

  return {
    newProject(name: string, now: string, firstLayer: Omit<Layer, 'id' | 'spec'>): void {
      store.load(
        model.createProject({ name, now, firstLayer: { ...firstLayer, id: newId() } }),
      );
    },
    /** Applies an operation that creates roots (see `applyCreating`): the session uses it for those that create containers. */
    applyCreating,
    renameProject: (name: string) => store.apply((p) => model.renameProject(p, name)),
    setContainerMarkingColor: (containerId: string, color: string | null) =>
      store.apply((p) => model.setContainerMarkingColor(p, containerId, color)),
    /** Project drawing mode (v18); `null` goes back to the first mode of each specialization. */
    setProjectDrawingMode: (mode: string | null) =>
      store.apply((p) => model.setProjectDrawingMode(p, mode)),
    /** Modo do desenho que o container fixa; `null` volta a seguir o do projeto. */
    setContainerDrawingMode: (containerId: string, mode: string | null) =>
      store.apply((p) => model.setContainerDrawingMode(p, containerId, mode)),
    /** Densidade do container (v19); `null` volta a 1. Uma entrada de desfazer. */
    setContainerDensity: (containerId: string, density: number | null) =>
      store.apply((p) => model.setContainerDensity(p, containerId, density)),
    /** Project reading direction (v20); `null` goes back to `ltr`. One undo entry. */
    setProjectDirection: (direction: ReadingDirection | null) =>
      store.apply((p) => model.setProjectDirection(p, direction)),
    /** Direction the container fixes; `null` goes back to following the project's. One undo entry. */
    setContainerDirection: (containerId: string, direction: ReadingDirection | null) =>
      store.apply((p) => model.setContainerDirection(p, containerId, direction)),
    renameContainer: (containerId: string, name: string | null) =>
      store.apply((p) => model.renameContainer(p, containerId, name)),

    // Lock (stage 2.5): each call is one history entry, including "lock all".
    setMarkingLocked: (markingId: string, locked: boolean) =>
      store.apply((p) => model.setMarkingLocked(p, markingId, locked)),
    setImageLocked: (containerId: string, locked: boolean) =>
      store.apply((p) => model.setImageLocked(p, containerId, locked)),
    setImageMarkingsLocked: (containerId: string, locked: boolean) =>
      store.apply((p) => model.setImageMarkingsLocked(p, containerId, locked)),

    // Camadas
    addLayer: (name: string, color: string) =>
      create((id) => (p) => model.addLayer(p, { id, name, color })),
    renameLayer: (layerId: string, name: string) =>
      store.apply((p) => model.renameLayer(p, layerId, name)),
    setLayerColor: (layerId: string, color: string) =>
      store.apply((p) => model.setLayerColor(p, layerId, color)),
    moveLayer: (layerId: string, toIndex: number) =>
      store.apply((p) => model.moveLayer(p, layerId, toIndex)),
    removeLayer: (layerId: string) => store.apply((p) => model.removeLayer(p, layerId)),

    // Imagens
    addContainer: (
      file: model.ImageFile,
      center?: { readonly x: number; readonly y: number },
    ) =>
      create(
        (id) => (p) => model.addContainer(p, { ...file, id, center }, settleOptions(p)),
      ),
    setContainerPlacement: (containerId: string, placement: Placement) =>
      guarded(() =>
        store.apply(
          (p) =>
            view.placementInView(
              p,
              viewFor(p),
              containerId,
              placement,
              settleOptions(p),
            ) ?? model.setContainerPlacement(p, containerId, placement, settleOptions(p)),
        ),
      ),
    replaceContainer: (
      containerId: string,
      file: model.ImageFile,
      options?: model.ReplaceContainerOptions,
    ) =>
      store.apply((p) =>
        model.replaceContainer(p, containerId, file, { ...options, ...settleOptions(p) }),
      ),
    /** Numa perspectiva, excluir uma raiz recusa (`principal-only`). */
    removeContainer: (containerId: string) =>
      guarded(() =>
        store.apply((p) => {
          view.refuseRootDeletion(p, viewFor(p), [containerId]);
          return model.removeContainer(p, containerId, settleOptions(p));
        }),
      ),
    /** Container sem arquivo: imagem sem arquivo, com tamanho e cor de fundo. */
    addBackgroundContainer: (args: {
      readonly name: string | null;
      readonly width: number;
      readonly height: number;
      readonly background: string;
      readonly center?: Point;
      /** Density (v19); absent or 1 does not write the key. In the same undo entry. */
      readonly density?: number;
    }) => {
      const { density, ...rest } = args;
      return create((id) => (p) => {
        const next = model.addBackgroundContainer(p, { ...rest, id }, settleOptions(p));
        return density === undefined || density === 1
          ? next
          : model.setContainerDensity(next, id, density);
      });
    },
    setBackgroundContainer: (
      containerId: string,
      patch: model.BackgroundContainerChanges,
    ) =>
      store.apply((p) =>
        model.setBackgroundContainer(p, containerId, patch, settleOptions(p)),
      ),

    // Gestures: previews without history and a single entry at the end (see `ProjectStore`).
    // Previews run with `settle: false` (membership frozen while the pointer
    // moves); on release, the canvas calls the `finish…` action of the same operation, with the
    // final values (snap and absorption already applied) and `settle: true`, inside the SAME
    // gesture, and only then `commitGesture`: one undo entry with geometry, space and membership.
    beginGesture: () => store.beginGesture(),
    /**
     * Move/resize preview. If it overlaps, it stays at the last valid position. In a
     * perspective, `placement` is OF THE VIEW and moving moves only the root in the perspective.
     */
    previewImagePlacement: (containerId: string, placement: Placement) =>
      guarded(() =>
        store.updateGesture(
          (p) =>
            view.placementInView(p, viewFor(p), containerId, placement, {
              settle: false,
            }) ??
            model.setContainerPlacement(
              p,
              containerId,
              touchingPlacement(p, containerId, placement),
              {
                settle: false,
              },
            ),
        ),
      ),
    /**
     * Final of moving/resizing the container: repeats the operation with the position of the last
     * valid preview and settles (it enters or leaves a canvas marking). Never fails.
     */
    finishImagePlacement: (containerId: string): ActionResult =>
      guarded(() =>
        finishGesture((base, last) => {
          const open = viewFor(base);
          const placement =
            open === null
              ? last.containers.find((c) => c.id === containerId)?.placement
              : view.viewPlacement(last, open.id, containerId);
          return placement === undefined
            ? last
            : (view.placementInView(
                base,
                open,
                containerId,
                placement,
                settleOptions(base),
              ) ??
                model.setContainerPlacement(
                  base,
                  containerId,
                  placement,
                  settleOptions(base),
                ));
        }),
      ),
    /**
     * Move preview of the marking by the offset `dx`, `dy` (integers, in the marking's space).
     * Nothing holds the marking to the container: it can leave it; the new space is decided on
     * release.
     */
    previewMarkingMove: (markingId: string, dx: number, dy: number) =>
      guarded(() =>
        store.updateGesture((p) => {
          const [x, y] = [Math.round(dx), Math.round(dy)];
          return (
            view.markingMoveInView(p, viewFor(p), markingId, x, y) ??
            model.moveMarking(p, markingId, x, y, { settle: false })
          );
        }),
      ),
    /**
     * Final of moving the marking: `dx`, `dy` are the final offset in the marking's source
     * space (the pointer's, plus the snap the canvas computed). It settles the space (converts its
     * `rect` and its descendants', with the components' `minSize`) and the membership.
     */
    finishMarkingMove: (markingId: string, dx: number, dy: number): ActionResult =>
      guarded(() =>
        finishGesture((base) => {
          const [x, y] = [Math.round(dx), Math.round(dy)];
          return (
            view.markingMoveInView(base, viewFor(base), markingId, x, y) ??
            model.moveMarking(base, markingId, x, y, rectOptions(base, markingId))
          );
        }),
      ),
    /** Resize preview of the marking. */
    previewMarkingRect: (markingId: string, rect: Rect) =>
      guarded(() =>
        store.updateGesture((p) => {
          const wanted = wantedRect(p, markingId, rect);
          const options = { ...rectOptions(p, markingId), settle: false };
          return (
            view.markingRectInView(p, viewFor(p), markingId, wanted, options) ??
            model.setMarkingRect(p, markingId, wanted, options)
          );
        }),
      ),
    /**
     * Final of resizing the marking: `rect` is the final rectangle (with the absorption the canvas
     * computed). It settles the membership: what no longer fits leaves the parent, what now fits
     * enters.
     */
    finishMarkingRect: (markingId: string, rect: Rect): ActionResult =>
      guarded(() =>
        finishGesture((base) => {
          const wanted = wantedRect(base, markingId, rect);
          const options = rectOptions(base, markingId);
          return (
            view.markingRectInView(base, viewFor(base), markingId, wanted, options) ??
            model.setMarkingRect(base, markingId, wanted, options)
          );
        }),
      ),
    /**
     * Preview of the joint drag: all items by the offset `dx`, `dy` in canvas units, each in its
     * own space (`moveItems`). All or nothing: if some item cannot go (container overlapping one
     * that does not move, marking leaving the container, locked item), the whole preview stays at
     * the last valid position.
     */
    previewItemsMove: (items: readonly model.ItemRef[], dx: number, dy: number) =>
      guarded(() =>
        store.updateGesture(
          (p) =>
            view.itemsMoveInView(p, viewFor(p), items, { dx, dy }, 'move', {
              settle: false,
            }) ?? movedTouching(p, items, dx, dy, { settle: false }),
        ),
      ),
    /**
     * Final of the joint drag: repeats the operation with the last valid offset (`dx`, `dy`,
     * kept by the canvas) and settles once over the whole result. Never fails.
     */
    finishItemsMove: (
      items: readonly model.ItemRef[],
      dx: number,
      dy: number,
    ): ActionResult =>
      guarded(() =>
        finishGesture(
          (base) =>
            view.itemsMoveInView(
              base,
              viewFor(base),
              items,
              { dx, dy },
              'move',
              settleOptions(base),
            ) ?? movedTouching(base, items, dx, dy, settleOptions(base)),
        ),
      ),
    /**
     * Preview of the arrow-key step (`nudgeItems`): `dx`, `dy` summed since the start of the
     * gesture, each item in its own space. All or nothing, like the joint drag.
     */
    previewItemsNudge: (items: readonly model.ItemRef[], dx: number, dy: number) =>
      guarded(() =>
        store.updateGesture(
          (p) =>
            view.itemsMoveInView(p, viewFor(p), items, { dx, dy }, 'nudge', {
              settle: false,
            }) ?? model.nudgeItems(p, items, dx, dy, { settle: false }),
        ),
      ),
    /** Final of the arrow-key step: repeats the operation with the last valid offset and settles. */
    finishItemsNudge: (
      items: readonly model.ItemRef[],
      dx: number,
      dy: number,
    ): ActionResult =>
      guarded(() =>
        finishGesture(
          (base) =>
            view.itemsMoveInView(
              base,
              viewFor(base),
              items,
              { dx, dy },
              'nudge',
              settleOptions(base),
            ) ?? model.nudgeItems(base, items, dx, dy, settleOptions(base)),
        ),
      ),
    commitGesture: () => store.commitGesture(),
    cancelGesture: () => store.cancelGesture(),

    // Markings
    /**
     * Creates the marking. `containerId` null = canvas marking (`rect` in canvas units);
     * otherwise, `rect` in container pixels. The space and the parent come from the settle (a
     * canvas marking that fits entirely inside a container becomes the container's).
     */
    createMarking: (containerId: string | null, rect: Rect, name?: string | null) =>
      create(
        (id) => (p) =>
          model.createMarking(p, { id, containerId, rect, name }, rectOptions(p, id)),
      ),
    renameMarking: (markingId: string, name: string | null) =>
      store.apply((p) => model.renameMarking(p, markingId, name)),
    setMarkingRect: (markingId: string, rect: Rect) =>
      guarded(() =>
        store.apply(
          (p) =>
            view.markingRectInView(
              p,
              viewFor(p),
              markingId,
              rect,
              rectOptions(p, markingId),
            ) ?? model.setMarkingRect(p, markingId, rect, rectOptions(p, markingId)),
        ),
      ),
    /** Fine adjustment from the panel: the value is limited by the rules (see `adjustMarkingRect`). */
    adjustMarkingRect: (markingId: string, field: keyof Rect, value: number) =>
      guarded(() =>
        store.apply(
          (p) =>
            view.markingAdjustInView(
              p,
              viewFor(p),
              markingId,
              field,
              value,
              rectOptions(p, markingId),
            ) ??
            model.adjustMarkingRect(
              p,
              markingId,
              field,
              value,
              rectOptions(p, markingId),
            ),
        ),
      ),
    moveMarking: (markingId: string, dx: number, dy: number) =>
      guarded(() =>
        store.apply(
          (p) =>
            view.markingMoveInView(p, viewFor(p), markingId, dx, dy) ??
            model.moveMarking(p, markingId, dx, dy, rectOptions(p, markingId)),
        ),
      ),
    /**
     * Turns the floating marking on or off (a comment over the canvas, outside membership).
     * Turning it on removes it from the container and takes it to the canvas, converted; turning it
     * off returns it to the container that contains it entirely, if any. It is geometry: the lock
     * prevents it both ways.
     */
    setMarkingFloating: (markingId: string, floating: boolean) =>
      store.apply((p) =>
        model.setMarkingFloating(p, markingId, floating, rectOptions(p, markingId)),
      ),
    confirmMarkingReview: (markingId: string) =>
      store.apply((p) => model.confirmMarkingReview(p, markingId)),
    removeMarking: (markingId: string) =>
      guarded(() =>
        store.apply((p) => {
          view.refuseRootDeletion(p, viewFor(p), [markingId]);
          return model.removeMarking(p, markingId, settleOptions(p));
        }),
      ),
    /** Position among the siblings (0 = underneath). Not geometry: the lock does not prevent it. */
    reorderMarking: (markingId: string, index: number) =>
      store.apply((p) => model.reorderMarking(p, markingId, index)),
    /**
     * Writes (or, with `null`, removes) the marking's anchor (v20, decision 9). Moves nothing (the
     * snap is `snapToAnchor`) and is not geometry: the lock does not prevent it. One undo entry.
     */
    setMarkingAnchor: (markingId: string, anchor: model.MarkingAnchor | null) =>
      store.apply((p) => model.setMarkingAnchor(p, markingId, anchor)),
    /**
     * "Snap to anchor": puts the anchored marking next to the anchor (effective side, alignment and
     * offset, the defaults coming from the component) and carries its children and the markings
     * anchored to it. Returns the warnings (went past the container). With no change, there is no
     * undo entry.
     */
    snapToAnchor: (markingId: string): ActionResult<readonly model.ModelMessage[]> => {
      let warnings: readonly model.ModelMessage[] = [];
      const result = guarded(() =>
        store.apply((p) => {
          view.requirePrincipal(viewFor(p));
          const snapped = model.snapToAnchor(p, markingId, snapOptions(p));
          warnings = snapped.warnings;
          return snapped.project;
        }),
      );
      return result.ok ? { ok: true, value: warnings } : result;
    },

    // Arrows (ME4, decision 14): each action is one undo entry. The route and the tip also
    // have a gesture preview (`preview…`, inside `beginGesture`/`commitGesture`): a gesture of
    // dragging a point or a tip is a single entry. An arrow has no membership: no settle.
    /** Links two markings; returns the arrow id. The route starts as the default (`points` empty). */
    addArrow: (
      from: string,
      to: string,
      options: Omit<model.NewArrowArgs, 'id' | 'from' | 'to'> = {},
    ) => create((id) => (p) => model.createArrow(p, { ...options, id, from, to })),
    /** Deletes the arrow and its annotations. */
    removeArrow: (arrowId: string) => store.apply((p) => model.removeArrow(p, arrowId)),
    /** Changes the marking of a tip and/or the side (`null` = automatic). */
    setArrowEndpoint: (
      arrowId: string,
      end: ArrowEnd,
      markingId: string,
      side: ArrowSide | null,
    ) => store.apply((p) => model.setArrowEndpoint(p, arrowId, end, markingId, side)),
    /** Waypoints (in the tips' space, `arrowPointsSpace`); `[]` goes back to the default route. */
    setArrowRoute: (arrowId: string, points: readonly ArrowPoint[]) =>
      guarded(() =>
        store.apply((p) => {
          view.requirePrincipal(viewFor(p));
          return model.setArrowRoute(p, arrowId, points);
        }),
      ),
    setArrowStyle: (arrowId: string, style: ArrowStyle) =>
      store.apply((p) => model.setArrowStyle(p, arrowId, style)),
    setArrowName: (arrowId: string, name: string | null) =>
      store.apply((p) => model.setArrowName(p, arrowId, name)),
    setArrowLocked: (arrowId: string, locked: boolean) =>
      store.apply((p) => model.setArrowLocked(p, arrowId, locked)),
    /** Preview of the waypoint drag gesture; if it fails, it stays at the last valid preview. */
    previewArrowRoute: (arrowId: string, points: readonly ArrowPoint[]) =>
      guarded(() =>
        store.updateGesture((p) => {
          view.requirePrincipal(viewFor(p));
          return model.setArrowRoute(p, arrowId, points);
        }),
      ),
    /** Preview of the gesture of dragging a tip to another marking or another side. */
    previewArrowEndpoint: (
      arrowId: string,
      end: ArrowEnd,
      markingId: string,
      side: ArrowSide | null,
    ) =>
      store.updateGesture((p) =>
        model.setArrowEndpoint(p, arrowId, end, markingId, side),
      ),

    // Multiple selection (ME2): the whole selection in one operation, one undo entry.
    /** Deletes the items (markings with what they cover, containers with the markings). */
    removeItems: (items: readonly model.ItemRef[]) =>
      guarded(() =>
        store.apply((p) => {
          const ids = items.filter((i) => i.kind !== 'arrow').map((i) => i.id);
          view.refuseRootDeletion(p, viewFor(p), ids);
          return model.removeItems(p, items, settleOptions(p));
        }),
      ),
    /** Tranca ou destranca todos os itens. */
    setItemsLocked: (items: readonly model.ItemRef[], locked: boolean) =>
      store.apply((p) => model.setItemsLocked(p, items, locked)),

    /** Creates the parent marking that wraps the selection; returns its id (one undo entry). */
    wrapItems: (items: readonly model.ItemRef[]) =>
      create((id) => (p) => model.wrapItems(p, { id, items }, settleOptions(p))),

    // Components (Library stage, B3): each action is one undo entry.
    /** Creates the marking and the typed annotation that draws it; returns the marking id. */
    addComponent: (args: {
      /** Instance container; `null` = the canvas (`center` in canvas units). */
      readonly containerId: string | null;
      readonly parentId: string | null;
      readonly specId: string;
      readonly typeId: string;
      readonly center?: Point;
      /** Floating type only: near this target (`placeFloatingNear`), instead of `center`. */
      readonly near?: model.FloatingNearTarget;
      /**
       * Born anchored to this marking (of the same space) and already snapped, with the `anchor`
       * defaults that the component declares at the root (R4, decision 13); applies instead of
       * `center`.
       */
      readonly anchorTo?: string;
    }): ActionResult<string> => {
      const markingId = newId();
      const annotationId = newId();
      const { anchorTo, ...rest } = args;
      const defaults =
        anchorTo === undefined
          ? undefined
          : model.typeAnchorDefaults(catalog(), args.specId, args.typeId);
      const result = applyCreating((p) =>
        model.addComponentMarking(
          p,
          catalog(),
          {
            ...rest,
            markingId,
            annotationId,
            ...(anchorTo === undefined ? {} : { anchor: { to: anchorTo } }),
            ...(defaults === undefined ? {} : { anchorDefaults: defaults }),
          },
          measure(),
        ),
      );
      return result.ok ? { ok: true, value: markingId } : result;
    },
    /**
     * Arranges the container's children by the slot layout (returns the warnings) or, on the
     * marking of a component with no children in the slot, fits it to the content (`fitMarking`,
     * no warnings). With an anchor, the marking also snaps (R4, decision 12), in the same undo
     * entry. With no change, there is no undo entry.
     */
    arrange: (markingId: string): ActionResult<readonly model.ModelMessage[]> => {
      let warnings: readonly model.ModelMessage[] = [];
      const result = guarded(() =>
        store.apply((p) => {
          view.requirePrincipal(viewFor(p));
          const arranged = arrangeAndSnap(p, markingId);
          warnings = arranged.warnings;
          return arranged.project;
        }),
      );
      return result.ok ? { ok: true, value: warnings } : result;
    },

    // Annotations and pairs
    addAnnotation: (
      markingId: string,
      layerId: string,
      name?: string | null,
      entries?: readonly EntryInput[],
    ) =>
      create(
        (id) => (p) =>
          model.addAnnotation(p, {
            id,
            markingId,
            layerId,
            name,
            entries: entries?.map((e) => ({ ...e, id: e.id ?? newId() })),
          }),
      ),
    renameAnnotation: (annotationId: string, name: string | null) =>
      store.apply((p) => model.renameAnnotation(p, annotationId, name)),
    removeAnnotation: (annotationId: string) =>
      store.apply((p) => model.removeAnnotation(p, annotationId)),
    setAnnotationParent: (annotationId: string, ownerId: string | null) =>
      store.apply((p) => model.setAnnotationParent(p, annotationId, ownerId)),
    setAnnotationRole: (annotationId: string, role: string | null) =>
      store.apply((p) => model.setAnnotationRole(p, annotationId, role)),
    setEntries: (annotationId: string, entries: readonly EntryInput[]) =>
      store.apply((p) =>
        model.setEntries(
          p,
          annotationId,
          entries.map((e) => ({ ...e, id: e.id ?? newId() })),
        ),
      ),
    addEntry: (annotationId: string, entry: { key: string; value: string }) =>
      create((id) => (p) => model.addEntry(p, annotationId, { ...entry, id })),
    updateEntry: (
      annotationId: string,
      entryId: string,
      entry: { key: string; value: string },
    ) => store.apply((p) => model.updateEntry(p, annotationId, entryId, entry)),
    removeEntry: (annotationId: string, entryId: string) =>
      store.apply((p) => model.removeEntry(p, annotationId, entryId)),
    moveEntry: (annotationId: string, entryId: string, to: number) =>
      store.apply((p) => model.moveEntry(p, annotationId, entryId, to)),

    // Specializations (docs/ARCHITECTURE.md, "Specializations in the project and typed
    // annotations"): each operation is one history entry.
    // `packageFiles`: the library package. The store only uses the NAME of the specialization
    // file inside it; the bytes belong to the session (it writes to `specs/<id>/`), never to the store.
    applySpecialization: (spec: Spec, packageFiles?: SpecPackageFiles) =>
      store.apply((p) =>
        model.applySpecialization(p, spec, {
          newId,
          packageSpecName: packageSpecNameIn(spec, packageFiles),
        }),
      ),
    updateSpecialization: (
      spec: Spec,
      texts?: LabelTexts,
      packageFiles?: SpecPackageFiles,
    ) =>
      store.apply((p) =>
        model.updateSpecialization(p, spec, {
          newId,
          texts,
          packageSpecName: packageSpecNameIn(spec, packageFiles),
        }),
      ),
    removeSpecialization: (specId: string, mode: SpecRemovalMode, texts?: LabelTexts) =>
      store.apply((p) => model.removeSpecialization(p, specId, mode, { newId, texts })),

    // Typed annotations
    addTypedAnnotation: (
      markingId: string,
      layerId: string,
      type: AnnotationTypeRef,
      parentAnnotationId?: string | null,
      parentRole?: string | null,
    ) =>
      create(
        (id) => (p) =>
          model.addTypedAnnotation(p, {
            id,
            markingId,
            layerId,
            type,
            parentAnnotationId,
            parentRole,
          }),
      ),
    setFieldValue: (annotationId: string, key: string, value: JsonValue) =>
      store.apply((p) => model.setFieldValue(p, annotationId, key, value)),
    setFieldValues: (annotationId: string, values: Readonly<Record<string, JsonValue>>) =>
      store.apply((p) => model.setFieldValues(p, annotationId, values)),
    addTableRow: (annotationId: string, key: string) =>
      create((rowId) => (p) => model.addTableRow(p, annotationId, key, rowId)),
    setTableCell: (
      annotationId: string,
      key: string,
      rowId: string,
      column: string,
      value: JsonValue,
    ) =>
      store.apply((p) => model.setTableCell(p, annotationId, key, rowId, column, value)),
    setTableCells: (
      annotationId: string,
      key: string,
      rowId: string,
      cells: Readonly<Record<string, JsonValue>>,
    ) => store.apply((p) => model.setTableCells(p, annotationId, key, rowId, cells)),
    removeTableRow: (annotationId: string, key: string, rowId: string) =>
      store.apply((p) => model.removeTableRow(p, annotationId, key, rowId)),
    moveTableRow: (annotationId: string, key: string, rowId: string, toIndex: number) =>
      store.apply((p) => model.moveTableRow(p, annotationId, key, rowId, toIndex)),
    convertAnnotationToFree: (annotationId: string, texts?: LabelTexts) =>
      store.apply((p) =>
        model.convertAnnotationToFree(p, annotationId, { newId, texts }),
      ),

    // Platform repositories (stage 3b): each call is one history entry.
    setPlatformRepo: (platformId: string, repo: PlatformRepoInput) =>
      store.apply((p) => model.setPlatformRepo(p, platformId, repo)),
    removePlatformRepo: (platformId: string) =>
      store.apply((p) => model.removePlatformRepo(p, platformId)),

    // Document repositories (schema v14): each call is one history entry.
    setDocRepo: (docRepoId: string, localPath: string | null) =>
      store.apply((p) => model.setDocRepo(p, docRepoId, { localPath })),
    removeDocRepo: (docRepoId: string) =>
      store.apply((p) => model.removeDocRepo(p, docRepoId)),
  };
}

export type ProjectActions = ReturnType<typeof createProjectActions>;
