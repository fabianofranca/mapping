import type { DropTarget } from '../canvas/frame';
import { ABSORB_TOLERANCE, snapTarget } from '../canvas/containment';
import { imageAt, pointInRect } from '../canvas/imageGeometry';
import { hitChain } from '../canvas/input/intents';
import { canvasToImagePixel } from '../canvas/markingGeometry';
import type { Point } from '../canvas/viewport';
import { t } from '../i18n';
import {
  IDENTITY_PLACEMENT,
  imageCanvasRect,
  hasSlotComponent,
  markingComponent,
  projectIndex,
  type ComponentCatalog,
  type ComponentType,
  type FloatingNearTarget,
  type Marking,
  type MarkingVisibility,
  type Project,
  type ProjectContainer,
} from '../model';
import { resolveSelection } from '../store/ui';
import type { EditorContextValue } from './EditorContext';
import { imageLabel, markingLabel } from './labels';

// Where the Library puts the new component: selection first (component with a slot, container or
// container marking, canvas marking); with no selection, the container under the view center or,
// with no container, the canvas. Read function: reads the signals with `.value`, so inside a
// `computed` it follows the selection, the project and the viewport; called in a click, it only
// reads.

/**
 * Where the component goes: container (`null` = canvas), parent marking with a slot (or `null`) and
 * center in the target's space (container pixels or canvas units).
 */
export interface ComponentTarget {
  readonly containerId: string | null;
  readonly parentId: string | null;
  readonly center?: { readonly x: number; readonly y: number };
  /** Floating type with a container or marking selected: born near it (`placeFloatingNear`). */
  readonly near?: FloatingNearTarget;
  /**
   * Type with `anchor` at the root and a marking selected: the instance is born anchored to it and
   * adjacent (R4, decision 13), instead of inside it or centered.
   */
  readonly anchorTo?: string;
  /** How the button label describes the target. */
  readonly destination:
    | { readonly kind: 'slot' | 'container' | 'anchor'; readonly name: string }
    | { readonly kind: 'canvas' };
}

/**
 * Target of the palette's "Add" (always exists: with no container, it is the canvas).
 *
 * 1. The selection is a marking that draws a component with a slot: goes into it.
 * 2. The selection is a container or a container marking: into it. If the viewport center
 *    falls inside it, the component is born centered at that point; otherwise, at the center
 *    of the container itself.
 * 3. The selection is a canvas marking without a slot: onto the canvas.
 * 4. No selection: the container under the viewport center; with no container, the canvas, at the
 *    center.
 *
 * A floating type (`floating`, decision 10) lives only on the canvas: the target is always the
 * canvas, at the view center; with a container or a marking selected, it also carries `near` (ME4)
 * and is born near it.
 *
 * A type that declares `anchor` at the root (`anchored`) with a marking selected is born anchored
 * to it (`anchorTo`), before rule 1 and the others apply (R4, decision 13).
 */
export function componentTarget(
  editor: EditorContextValue,
  options: { readonly floating?: boolean; readonly anchored?: boolean } = {},
): ComponentTarget | null {
  const { review, ui, derived, canvas, view } = editor;
  const project = review.derived.shownProject.value;
  if (!project) return null;
  const selected = resolveSelection(project, ui.selection.value);

  if (
    options.anchored === true &&
    options.floating !== true &&
    selected?.kind === 'marking'
  ) {
    return {
      containerId: selected.marking.containerId,
      parentId: null,
      anchorTo: selected.marking.id,
      destination: { kind: 'anchor', name: slotTargetName(project, selected.marking) },
    };
  }

  if (options.floating !== true && selected?.kind === 'marking') {
    const drawn = markingComponent(project, derived.catalog.value, selected.marking.id);
    if (drawn && hasSlotComponent(drawn.component)) {
      return {
        containerId: selected.marking.containerId,
        parentId: selected.marking.id,
        destination: { kind: 'slot', name: slotTargetName(project, selected.marking) },
      };
    }
  }

  // Reading the viewport makes the target follow pan and zoom.
  void view.viewport.value;
  const point = canvas.current?.viewportCenter();
  const inContainer = (image: ProjectContainer): ComponentTarget =>
    point && pointInRect(point, imageCanvasRect(image, image.placement))
      ? {
          containerId: image.id,
          parentId: null,
          center: canvasToImagePixel(image.placement, point),
          destination: { kind: 'container', name: imageLabel(image) },
        }
      : {
          containerId: image.id,
          parentId: null,
          destination: { kind: 'container', name: imageLabel(image) },
        };
  const onCanvas = (): ComponentTarget => ({
    containerId: null,
    parentId: null,
    ...(point ? { center: { x: Math.round(point.x), y: Math.round(point.y) } } : {}),
    destination: { kind: 'canvas' },
  });

  if (options.floating === true) {
    // ME4: with a container or a marking selected, the floating one is born near it.
    if (selected?.kind === 'image') {
      return { ...onCanvas(), near: { kind: 'container', id: selected.image.id } };
    }
    if (selected?.kind === 'marking') {
      return { ...onCanvas(), near: { kind: 'marking', id: selected.marking.id } };
    }
    return onCanvas();
  }
  // ME4: the selected arrow is not a component target (UI): falls back to the view center.
  if (selected && selected.kind !== 'arrow') {
    if (selected.image) return inContainer(selected.image);
    return onCanvas();
  }

  const image = point ? imageAt(project.containers, point) : undefined;
  return image ? inContainer(image) : onCanvas();
}

/**
 * Name of the component with a slot in the Add label: the marking's label (the name; with no name,
 * that of the type it draws, "Card"; with no type, the default).
 */
export function slotTargetName(
  project: Project,
  marking: Pick<Marking, 'id' | 'name'>,
): string {
  return markingLabel(project, marking);
}

/** Label of the Add button with the target ("Add inside List"). */
export function addLabel(target: ComponentTarget | null): string {
  const destination = target?.destination;
  if (!destination) return t('library.add');
  if (destination.kind === 'slot') {
    return t('library.addInside', { name: destination.name });
  }
  if (destination.kind === 'container') {
    return t('library.addToScreen', { name: destination.name });
  }
  if (destination.kind === 'anchor') {
    return t('library.addAnchored', { name: destination.name });
  }
  return t('library.addToCanvas');
}

// ---------------------------------------------------------------------------
// Dropping a palette type on the canvas (stage Spatial markings, ME2)

/** Target of a palette type dropped on the canvas, plus what to light up while dragging. */
export interface ComponentDropTarget {
  readonly containerId: string | null;
  readonly parentId: string | null;
  readonly center?: { readonly x: number; readonly y: number };
  readonly highlight: NonNullable<DropTarget>;
}

export interface ComponentDropInput {
  readonly project: Project;
  readonly catalog: ComponentCatalog;
  readonly visibility: ReadonlyMap<string, MarkingVisibility>;
  /** Pointer, in canvas units. */
  readonly point: Point;
  readonly zoom: number;
  readonly type: ComponentType;
}

/**
 * Where a component dropped at `point` is born: in the slot of the innermost marking under the
 * pointer that draws a component with a slot; otherwise in the container under the pointer
 * (centered in it); otherwise, in the empty space, in the container where the rectangle of the
 * component centered on the pointer fits almost entirely (snap); otherwise on the canvas. No
 * absorption. A floating type is always born on the canvas, where it falls, with no slot, container
 * or snap (decision 10).
 */
export function componentDropTarget(input: ComponentDropInput): ComponentDropTarget {
  const { project, catalog, visibility, point, zoom, type } = input;
  const byId = projectIndex(project).markings;

  if (type.floating) {
    return {
      containerId: null,
      parentId: null,
      center: { x: Math.round(point.x), y: Math.round(point.y) },
      highlight: { containerId: null },
    };
  }

  for (const hit of hitChain(project, visibility, point)) {
    if (hit.kind === 'image') break; // the container wins over its ancestors
    const marking = byId.get(hit.id);
    if (!marking) continue;
    const drawn = markingComponent(project, catalog, marking.id);
    if (drawn && hasSlotComponent(drawn.component)) {
      return {
        containerId: marking.containerId,
        parentId: marking.id,
        highlight: { containerId: marking.containerId, markingId: marking.id },
      };
    }
  }

  const inside = (container: ProjectContainer): ComponentDropTarget => ({
    containerId: container.id,
    parentId: null,
    center: canvasToImagePixel(container.placement, point),
    highlight: { containerId: container.id },
  });
  const over = imageAt(project.containers, point);
  if (over) return inside(over);

  const { width, height } = type.component.size;
  const rect = { x: point.x - width / 2, y: point.y - height / 2, width, height };
  const snap = snapTarget(
    rect,
    IDENTITY_PLACEMENT,
    project.containers,
    ABSORB_TOLERANCE / zoom,
  );
  const snapped = snap && projectIndex(project).containers.get(snap.containerId);
  if (snapped) return inside(snapped);

  return {
    containerId: null,
    parentId: null,
    center: { x: Math.round(point.x), y: Math.round(point.y) },
    highlight: { containerId: null },
  };
}
