// Markings on the canvas: border, review alert, layer indicators and the
// semantic zoom name. Only the part visible on screen is updated.
import Konva from 'konva/lib/Core';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import {
  memoByProject,
  projectIndex,
  topDown,
  type Marking,
  type MarkingVisibility,
  type Placement,
  type Project,
  type Rect,
} from '../../model';
import { visibleArea, type Frame } from '../frame';
import { semanticMode } from '../semanticText';
import { levelOfDetail, type LevelOfDetail } from './levelOfDetail';
import type { MarkingReviewMark } from '../reviewMarks';
import { markingCanvasRect, placementOfSpace } from '../markingGeometry';
import type { CanvasTokens } from '../theme';
import {
  ALERT_GLYPH,
  ALERT_SIZE,
  CORNER_MARGIN,
  HALO_WIDTH,
  REVIEW_BADGE_SIZE,
  fontStyle,
  intersectRects,
  sameInputs,
} from './metrics';
import {
  TEXT_HEADER_HEIGHT,
  createSemanticNode,
  updateSemanticText,
  type HeaderBand,
  type SemanticNode,
  type SemanticText,
} from './semanticCard';

/** Thickness of the marking border (screen px): normal and selected. */
const MARKING_STROKE = 1;
const MARKING_SELECTED_STROKE = 2;
/** Double line of a marking changed in review (screen px). */
const REVIEW_DOUBLE_STROKE = 3;
/** Stroke of the canvas marking's border (screen px): long dash and gap, unlike "to review". */
/** Mask of the parts hung when the node is created: only the border (index 1 in `partsOf`). */
const BORDER_ONLY = 0b000010;
const CANVAS_DASH: readonly [number, number] = [10, 6];

/**
 * A marking's node. Born with just the group and the border; the other (optional) parts are born
 * on the first frame in which they become visible and, once created, stay (decision 5 of the
 * canvas-performance stage).
 */
export interface MarkingNode {
  readonly group: Konva.Group;
  readonly border: KonvaRect;
  halo?: KonvaRect;
  /** Middle line of the "double line" (changed, in proposal review). */
  inner?: KonvaRect;
  badge?: KonvaText;
  /** Clips the alert to the marking's rectangle. */
  alertClip?: Konva.Group;
  /** Incomplete annotation alert, in the corner after the "to review" badge. */
  alert?: KonvaText;
  /** Semantic zoom text, clipped to the marking's rectangle. */
  text?: SemanticNode;
  /** Inputs of the last `updateMarkingNode`: if equal, the node is already right. */
  drawn: readonly unknown[] | null;
  /** Inputs of the last `updateSemanticText`: if equal, the name is already right. */
  textDrawn: readonly unknown[] | null;
  /** Name strip returned by the last `updateSemanticText` (so the children avoid it). */
  band: HeaderBand | null;
  /** Parts currently hung on the group (`parts` mask): Konva walks every child, visible or not. */
  attached: number;
}

/**
 * What a frame touched in each node stack: `main` (the markings layer) and `floating` (the layer
 * of the floating ones). The `CanvasController` only redraws the layers that changed.
 */
export interface MarkingChanges {
  main: boolean;
  floating: boolean;
  /** Some node taken to the drag group changed (the overlays layer redraws). */
  drag: boolean;
}

/** Where the nodes of the markings moving in a gesture stay: one group for each stack. */
export interface DragTargets {
  readonly main: Konva.Container;
  readonly floating: Konva.Container;
}

export type MarkingFrame = Pick<
  Frame,
  | 'project'
  | 'selection'
  | 'size'
  | 'viewport'
  | 'incomplete'
  | 'visibility'
  | 'tokens'
  | 'review'
  | 'drawn'
  | 'hoverMarking'
  | 'items'
  | 'view'
>;

/** Query of a marking's drawn name label (canvas). */
export interface HeaderLookup {
  get(id: string): Rect | undefined;
}

/**
 * A marking's level of detail by its on-screen size (decision 4 of the canvas-scale stage). The
 * selected one (including in multiple selection), the one under the mouse and the one with a review
 * mark are always complete. In view mode (`picked` empty, no hover or review) only the size counts.
 */
function detailOf(
  marking: Marking,
  pxPerUnit: number,
  tokens: CanvasTokens,
  always: boolean,
): LevelOfDetail {
  return levelOfDetail({
    screenWidth: marking.rect.width * pxPerUnit,
    screenHeight: marking.rect.height * pxPerUnit,
    always,
    minFull: tokens.lodMinMarking,
    hide: tokens.lodHideMarking,
  });
}

/** Ids of the selected markings (multiple selection included). */
function selectedMarkingIds(frame: MarkingFrame): ReadonlySet<string> {
  const ids = new Set<string>();
  if (frame.view !== null) return ids;
  for (const item of frame.items) if (item.kind === 'marking') ids.add(item.id);
  return ids;
}

/** Parts of the node in draw order. */
function partsOf(node: MarkingNode): readonly (Konva.Group | Konva.Shape | undefined)[] {
  return [
    node.halo,
    node.border,
    node.inner,
    node.badge,
    node.alertClip,
    node.text?.group,
  ];
}

/**
 * Only the visible parts are hung on the group: Konva's `drawScene` walks every child,
 * even hidden ones, and from afar (level of detail) almost all are hidden. It touches the tree only
 * when the set changes.
 */
function syncParts(node: MarkingNode): void {
  const parts = partsOf(node);
  let mask = 0;
  parts.forEach((part, i) => {
    if (part?.visible()) mask |= 1 << i;
  });
  if (mask === node.attached) return;
  node.attached = mask;
  node.group.removeChildren();
  node.group.add(
    ...parts.filter(
      (part, i): part is Konva.Group | Konva.Shape =>
        part !== undefined && (mask & (1 << i)) !== 0,
    ),
  );
}

/**
 * Destroys the group and the parts. The parts detached by `syncParts` are not children of the
 * group, and `Shape.destroy` is what removes them from Konva's hit-color registry: they leak without it.
 */
function destroyNode(node: MarkingNode): void {
  for (const part of partsOf(node)) part?.destroy();
  node.group.destroy();
}

/** Markings from top to bottom in the hierarchy, once per project version. */
const topDownMarkings = memoByProject((p: Project) => topDown(p.markings));

/**
 * Marking nodes, reused between frames (one group per marking). The floating ones go to
 * `floatingParent`, above everything (containers, components and the other markings' borders).
 */
export class MarkingRenderer {
  private readonly layer: Konva.Container;
  private readonly floatingParent: Konva.Container;
  private readonly nodes = new Map<string, MarkingNode>();
  /** The markings moving in a gesture and where they stay until dropped (decisions 5 and 6). */
  private dragIds: ReadonlySet<string> | null = null;
  private dragTargets: DragTargets | null = null;
  /** Markings drawn (with a visible node) in the last frame. */
  shown = 0;

  constructor(layer: Konva.Container, floatingParent: Konva.Container = layer) {
    this.layer = layer;
    this.floatingParent = floatingParent;
  }

  /**
   * Takes the markings in `ids` to the drag groups on the next `render` (the nodes are the same,
   * moved with `moveTo`), or returns them to the usual stacks with `null`. No node is cloned: the
   * usual `render` keeps updating each one wherever it is.
   */
  setDragged(ids: ReadonlySet<string> | null, targets: DragTargets): void {
    this.dragIds = ids && ids.size > 0 ? ids : null;
    this.dragTargets = targets;
  }

  /** The node's parent: the drag group, if it moves, otherwise the usual stack. */
  private parentFor(id: string, floating: boolean): Konva.Container {
    const targets = this.dragTargets;
    if (targets && this.dragIds?.has(id))
      return floating ? targets.floating : targets.main;
    return floating ? this.floatingParent : this.layer;
  }

  /** Which stack the parent is: marks in `changes` the layer (or drag group) it touches. */
  private touchParent(changes: MarkingChanges, parent: Konva.Container | null): void {
    const targets = this.dragTargets;
    if (targets && (parent === targets.main || parent === targets.floating)) {
      changes.drag = true;
    } else if (parent === this.floatingParent) changes.floating = true;
    else changes.main = true;
  }

  /**
   * Rectangle (canvas) of each marking's name label drawn in the last frame: the
   * selected one's label avoids the parent's label. Computed only when requested.
   */
  readonly headers: HeaderLookup = { get: (id) => this.headerRect(id) };

  /** The marking's node (or `undefined` if it was never drawn: nodes are born on demand). */
  node(id: string): MarkingNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Markings from top to bottom in the hierarchy: children go above parents. Returns in
   * which of the two stacks some node changed (created, moved, shown, hidden, redone, removed).
   */
  render(
    frame: MarkingFrame,
    placements: ReadonlyMap<string, Placement>,
  ): MarkingChanges {
    const changes: MarkingChanges = { main: false, floating: false, drag: false };
    // The node moving in a gesture is in a drag group: touching it redraws only that group.
    let dragged = false;
    const touch = (floating: boolean) => {
      if (dragged) changes.drag = true;
      else if (floating) changes.floating = true;
      else changes.main = true;
    };
    const { project, selection, incomplete, tokens, review, drawn } = frame;
    // View mode (`null` outside it): no selection, hover, alert or review marks.
    const mode = frame.view;
    const zoom = frame.viewport.scale;
    const area = visibleArea(frame.size, frame.viewport);
    const lookup = project ? projectIndex(project) : null;
    const ordered = project ? topDownMarkings(project) : [];
    const seen = new Set<string>();
    const picked = selectedMarkingIds(frame);
    // Header of each marking already drawn (parents before children).
    const headers = new Map<string, HeaderBand>();
    // Draw order is per parent: each stack (the normal one and the floating one) counts its own.
    let index = 0;
    let floatingIndex = 0;
    this.shown = 0;
    for (const marking of ordered) {
      const placement = placementOfSpace(placements, marking.containerId);
      if (!placement) continue;
      seen.add(marking.id);
      dragged = this.dragIds?.has(marking.id) ?? false;
      const markingRect = markingCanvasRect(placement, marking.rect);
      // Off screen: neither updates nor draws (the layer receives no touches, so it is safe).
      const visibility = frame.visibility.get(marking.id) ?? 'full';
      // View mode: the marking only shows if the outline or the name are on.
      const shown = mode === null || mode.outline || mode.names;
      const selected =
        mode === null && selection?.kind === 'marking' && selection.id === marking.id;
      const reviewMark =
        mode === null ? (review?.markings.get(marking.id) ?? null) : null;
      const pxPerUnit = placement.scale * zoom;
      const level = detailOf(
        marking,
        pxPerUnit,
        tokens,
        selected ||
          picked.has(marking.id) ||
          (mode === null && frame.hoverMarking === marking.id) ||
          reviewMark !== null,
      );
      const onScreen =
        visibility !== 'hidden' &&
        shown &&
        level !== 'hidden' &&
        intersectRects(markingRect, area) !== null;
      // Node on demand (decision 8): only born on the first frame in which the marking is drawn and
      // stays until it leaves the project.
      let node = this.nodes.get(marking.id);
      if (!node) {
        if (!onScreen) continue;
        node = this.createNode(marking.id, this.parentFor(marking.id, marking.floating));
        touch(marking.floating);
      }
      const parent = this.parentFor(marking.id, marking.floating);
      if (node.group.getParent() !== parent) {
        this.touchParent(changes, node.group.getParent());
        touch(marking.floating);
        node.group.moveTo(parent);
      }
      if (node.group.visible() !== onScreen) {
        node.group.visible(onScreen);
        touch(marking.floating);
      }
      // Reordering is expensive in Konva: only when the position in the stack changed. The node in
      // the drag group keeps the order in which it arrived (top to bottom), and does not count in
      // the stack it left.
      if (!dragged) {
        const position = marking.floating ? floatingIndex++ : index++;
        if (node.group.zIndex() !== position) {
          node.group.zIndex(position);
          touch(marking.floating);
        }
      }
      if (!onScreen) continue;
      this.shown++;
      // Border color chosen for the image (no choice, `cv-line`); the canvas marking has no
      // container: it uses its own token and the dashed border.
      const canvasMarking = marking.containerId === null;
      const lineColor = canvasMarking
        ? tokens.canvasMarking
        : (lookup?.containers.get(marking.containerId ?? '')?.markingColor ?? null);
      const markingIncomplete = mode === null && incomplete.has(marking.id);
      // Marking with the drawing in view: the border only shows under the mouse or when selected
      // (proposal review, which marks the change on the border itself, keeps it).
      const withDrawing = drawn.has(marking.id);
      const showBorder = mode
        ? mode.outline && !withDrawing
        : !withDrawing ||
          selected ||
          frame.hoverMarking === marking.id ||
          (reviewMark?.line ?? null) !== null;
      // Pan without changing anything on the marking (the common case): border and indicators stay.
      const inputs = [
        reviewMark,
        marking,
        placement,
        selected,
        showBorder,
        visibility,
        markingIncomplete,
        tokens,
        lineColor,
        zoom,
        mode === null,
        level,
      ];
      if (!sameInputs(node.drawn, inputs)) {
        node.drawn = inputs;
        updateMarkingNode(
          node,
          marking,
          placement,
          selected,
          showBorder,
          visibility,
          markingIncomplete,
          lineColor ?? tokens.line,
          tokens,
          zoom,
          reviewMark,
          canvasMarking,
          mode === null,
          level,
        );
        syncParts(node);
        touch(marking.floating);
      }
      // Context ancestor (Hide mode): only the border, no name. The drawing takes the
      // place of the name of markings with a component in view.
      const textMode =
        visibility !== 'outline' && !withDrawing && (mode?.names ?? true)
          ? semanticMode({
              screenWidth: marking.rect.width * pxPerUnit,
              screenHeight: marking.rect.height * pxPerUnit,
            })
          : 'none';
      const parentHeader = marking.parentId ? headers.get(marking.parentId) : undefined;
      // Child starting under the parent's name: its own drops one line.
      const headerFloor =
        parentHeader &&
        markingRect.y < parentHeader.bottom &&
        markingRect.x < parentHeader.right
          ? parentHeader.bottom
          : null;
      // The name is only redone when something it uses changed (the screen clip enters: pan redoes it).
      const textInputs = [
        marking,
        placement,
        markingIncomplete,
        tokens,
        zoom,
        textMode,
        headerFloor,
        area.x,
        area.y,
        area.width,
        area.height,
      ];
      if (!sameInputs(node.textDrawn, textInputs)) {
        node.textDrawn = textInputs;
        node.band = updateNodeText(
          node,
          {
            marking,
            markingRect,
            view: area,
            mode: textMode,
            incomplete: markingIncomplete,
            headerFloor,
          },
          tokens,
          zoom,
        );
        syncParts(node);
        touch(marking.floating);
      }
      const header = node.band;
      if (header) headers.set(marking.id, header);
    }
    for (const [id, node] of this.nodes) {
      if (seen.has(id)) continue;
      this.touchParent(changes, node.group.getParent());
      destroyNode(node);
      this.nodes.delete(id);
    }
    return changes;
  }

  /** Destroys all the nodes (including detached parts, which the group does not reach). */
  destroy(): void {
    for (const node of this.nodes.values()) destroyNode(node);
    this.nodes.clear();
  }

  private headerRect(id: string): Rect | undefined {
    const node = this.nodes.get(id);
    if (!node?.group.visible() || !node.text?.group.visible()) return undefined;
    const { header } = node.text;
    if (!header.visible()) return undefined;
    return {
      x: header.x(),
      y: header.y(),
      width: Math.min(header.width(), header.getTextWidth()),
      height: header.height(),
    };
  }

  private createNode(id: string, parent: Konva.Container): MarkingNode {
    const node: MarkingNode = {
      group: new Konva.Group(),
      border: new KonvaRect(),
      drawn: null,
      textDrawn: null,
      band: null,
      attached: BORDER_ONLY,
    };
    node.group.add(node.border);
    parent.add(node.group);
    this.nodes.set(id, node);
    return node;
  }
}

function updateMarkingNode(
  node: MarkingNode,
  marking: Marking,
  placement: Placement,
  selected: boolean,
  showBorder: boolean,
  visibility: MarkingVisibility,
  incomplete: boolean,
  lineColor: string,
  tokens: CanvasTokens,
  zoom: number,
  review: MarkingReviewMark | null = null,
  canvasMarking = false,
  indicators = true,
  detail: LevelOfDetail = 'full',
): void {
  const rect = markingCanvasRect(placement, marking.rect);
  // No annotation (own or inherited) in the visible layers: faded (the selected one, never).
  // In review, the rejected one (Current view) too.
  node.group.opacity(
    visibility === 'dim'
      ? tokens.opacity.dimmed
      : visibility === 'outline' || review?.dim
        ? tokens.opacity.ancestor
        : 1,
  );
  const line = review?.line ?? null;
  const base = selected
    ? MARKING_SELECTED_STROKE
    : line === 'changed'
      ? REVIEW_DOUBLE_STROKE
      : line === 'invalid'
        ? MARKING_SELECTED_STROKE
        : MARKING_STROKE;
  const stroke = base / zoom;
  // Dashed: "to review" (rescaled) and, in review, created and invalid; dotted: rejected;
  // long dash: the canvas marking (no container).
  const dash =
    line === 'rejected'
      ? [1.5 / zoom, 2.5 / zoom]
      : marking.needsReview || line === 'created' || line === 'invalid'
        ? [6 / zoom, 4 / zoom]
        : canvasMarking
          ? CANVAS_DASH.map((d) => d / zoom)
          : [];
  // Halo outside and inside the line (a wider stroke underneath), on every marking:
  // the line shows over light and dark photos.
  // From afar (`border`): only the border, no halo, double line, badge or ⚠.
  const full = detail === 'full';
  if (showBorder && full) {
    ensureHalo(node).setAttrs({
      ...rect,
      visible: true,
      stroke: tokens.halo,
      strokeWidth: stroke + (2 * HALO_WIDTH) / zoom,
      dash,
    });
  } else node.halo?.visible(false);
  node.border.setAttrs({
    ...rect,
    visible: showBorder,
    stroke: selected ? tokens.select : line === 'invalid' ? tokens.invalid : lineColor,
    strokeWidth: stroke,
    dash,
  });
  // Changed: double line (the 3px stroke with a thread of the halo in the middle).
  if (line === 'changed' && showBorder && full) {
    ensureInner(node).setAttrs({
      ...rect,
      visible: true,
      stroke: tokens.halo,
      strokeWidth: 1 / zoom,
      dash,
    });
  } else node.inner?.visible(false);
  // Konva text re-measures on every attribute change: only touch those that show.
  // Context ancestor (Hide mode): only the border, no alert.
  const outline = visibility === 'outline' || !indicators || !full;
  updateBadge(node, marking.needsReview && !outline, rect, tokens, zoom);
  updateAlert(node, marking, rect, incomplete && !outline, tokens, zoom);
}

/** Parts born on demand (decision 5): created the first time they become visible. */
function ensureHalo(node: MarkingNode): KonvaRect {
  return (node.halo ??= new KonvaRect());
}

function ensureInner(node: MarkingNode): KonvaRect {
  return (node.inner ??= new KonvaRect());
}

/** "To review" badge at the top-left corner. */
function updateBadge(
  node: MarkingNode,
  show: boolean,
  rect: Rect,
  tokens: CanvasTokens,
  zoom: number,
): void {
  if (!show) {
    node.badge?.visible(false);
    return;
  }
  const badge = REVIEW_BADGE_SIZE / zoom;
  (node.badge ??= new KonvaText({ text: '⚠' })).setAttrs({
    visible: true,
    x: rect.x + badge / 3,
    y: rect.y + badge / 3,
    fontSize: badge,
    fontFamily: tokens.fontFamily,
    fontStyle: fontStyle(tokens.type.name.weight),
    fill: tokens.warning,
    stroke: tokens.halo,
    strokeWidth: 3 / zoom,
    fillAfterStrokeEnabled: true,
  });
}

/** The clip and the alert are born together, the first time the marking shows up incomplete. */
function ensureAlert(node: MarkingNode): { clip: Konva.Group; alert: KonvaText } {
  if (!node.alertClip || !node.alert) {
    node.alert = new KonvaText({ text: ALERT_GLYPH });
    node.alertClip = new Konva.Group();
    node.alertClip.add(node.alert);
  }
  return { clip: node.alertClip, alert: node.alert };
}

/** The name is born when it first shows up; a marking with no name or no mode does not create it. */
function updateNodeText(
  node: MarkingNode,
  input: SemanticText,
  tokens: CanvasTokens,
  zoom: number,
): HeaderBand | null {
  if (!node.text) {
    if (input.mode === 'none' || (input.marking.name ?? '') === '') return null;
    node.text = createSemanticNode();
  }
  return updateSemanticText(node.text, input, tokens, zoom);
}

/** Incomplete alert at the top-left corner, after the "to review" badge (if any). */
function updateAlert(
  node: MarkingNode,
  marking: Marking,
  rect: Rect,
  incomplete: boolean,
  tokens: CanvasTokens,
  zoom: number,
): void {
  if (!incomplete) {
    node.alertClip?.visible(false);
    node.alert?.visible(false);
    return;
  }
  const { clip, alert } = ensureAlert(node);
  clip.setAttrs({
    visible: true,
    clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
  });
  // With the review badge at the corner, the alert starts after it.
  const left = marking.needsReview ? REVIEW_BADGE_SIZE : 0;
  const size = ALERT_SIZE / zoom;
  alert.setAttrs({
    visible: true,
    x: rect.x + (left + CORNER_MARGIN) / zoom,
    y: rect.y + TEXT_HEADER_HEIGHT / 2 / zoom - size / 2,
    fontSize: size,
    fontFamily: tokens.fontFamily,
    fontStyle: fontStyle(tokens.type.name.weight),
    fill: tokens.warning,
    stroke: tokens.halo,
    strokeWidth: 3 / zoom,
    fillAfterStrokeEnabled: true,
  });
}
