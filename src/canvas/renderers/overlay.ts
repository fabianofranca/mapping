// Overlays: selection outline and handles, highlight of the picked item, draft
// of the drawing and target of a file drag-and-drop.
import Konva from 'konva/lib/Core';
import { Circle as KonvaCircle } from 'konva/lib/shapes/Circle';
import { Line as KonvaLine } from 'konva/lib/shapes/Line';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import {
  canEditArrow,
  canEditImagePlacement,
  canEditMarkingGeometry,
  imageCanvasRect,
  markingCanvasRectOf,
  projectIndex,
  type Placement,
  type Rect,
} from '../../model';
import { resolveSelection, sameItem } from '../../store/ui';
import {
  arrowHandles,
  flatPoints,
  headDirection,
  headPoints,
  linkHandlePoint,
  type ArrowShape,
} from '../arrowGeometry';
import { visibleArea, type Frame } from '../frame';
import { CORNERS, cornerPoint, type Corner } from '../imageGeometry';
import { isDrawableRect, markingCanvasRect, placementOfSpace } from '../markingGeometry';
import { LockBadge } from './lockBadge';
import type { HeaderLookup } from './markings';
import {
  HALO_WIDTH,
  OPAQUE,
  SELECTION_STROKE,
  STRIKE_HEIGHT,
  STRIKE_WIDTH,
  fontStyle,
  intersectRects,
} from './metrics';

/** Name tag (screen px): inner padding, gap to the edge and maximum width. */
const NAME_TAG_PADDING = 4;
const NAME_TAG_GAP = 2;
const NAME_TAG_MAX_WIDTH = 240;
/** Gap between the image title and its top edge (the same as `images.ts`). */
const IMAGE_TITLE_GAP = 4;
const NO_HEADERS: HeaderLookup = { get: () => undefined };

export type OverlayFrame = Pick<
  Frame,
  | 'project'
  | 'readOnly'
  | 'preview'
  | 'draft'
  | 'dropTarget'
  | 'absorb'
  | 'hoverLock'
  | 'hoverMarking'
  | 'tokens'
  | 'selection'
  | 'items'
  | 'mode'
  | 'arrows'
  | 'arrowDraft'
  | 'marquee'
  | 'review'
  | 'viewport'
  | 'size'
>;

/** Link from the anchored one to the anchor (R4): the halo underneath and the dashed stroke on top. */
interface AnchorLink {
  readonly halo: KonvaLine;
  readonly line: KonvaLine;
}

/** Highlight of a selected arrow: the stroke and the tip, on top of its drawing. */
interface ArrowHighlight {
  readonly line: KonvaLine;
  readonly head: KonvaLine;
}

export class OverlayRenderer {
  /** Gets the class `canvas-host--drop` when the drop target is the empty area. */
  private readonly container: HTMLElement;
  readonly selectionOutline = new KonvaRect({ visible: false });
  readonly draftRect = new KonvaRect({ visible: false });
  readonly dropRect = new KonvaRect({ visible: false });
  /** Selection rectangle by Shift+drag (Shift+drag adds what is inside). */
  readonly marqueeRect = new KonvaRect({ visible: false, listening: false });
  /** `cv-halo` halo under the rectangle's border, like that of the selection and the draft. */
  readonly marqueeHalo = new KonvaRect({
    visible: false,
    listening: false,
    fillEnabled: false,
  });
  /** Highlights of the items that drawing or resizing would absorb on release (one reused per item). */
  private readonly absorbRects: KonvaRect[] = [];
  /** Outlines of the selected items that are not the primary (one reused per item). */
  private readonly secondaryRects: KonvaRect[] = [];
  private readonly layer: Konva.Layer;
  readonly handles = new Map<Corner, KonvaRect>();
  /** Tag with the name of the selected marking, above the top-left corner. */
  readonly nameTag = new Konva.Group({ visible: false });
  readonly nameTagBox = new KonvaRect();
  readonly nameTagText = new KonvaText({ wrap: 'none', ellipsis: true });
  /** Strike-through of the name when the selected marking is the one removed in the review. */
  private readonly nameTagStrike: KonvaLine = new KonvaLine({
    name: 'name-tag-strike',
    visible: false,
  });
  /** Lock badge: one on the selected item and another on the locked item under the mouse. */
  readonly selectionLock = new LockBadge();
  readonly hoverLockBadge = new LockBadge();
  /** Highlights of the selected arrows (one reused per arrow). */
  private readonly arrowHighlights: ArrowHighlight[] = [];
  /** Links of the selected and under-the-mouse anchored ones (one pair reused per link). */
  private readonly anchorLinks: AnchorLink[] = [];
  /** Handles of the selected arrow: ends, waypoints and segment midpoints. */
  private readonly arrowHandleNodes: KonvaCircle[] = [];
  /** Link handle of the selected marking: pulling from it creates an arrow. */
  readonly linkHandle: KonvaCircle = new KonvaCircle({
    visible: false,
    listening: false,
  });
  /** Provisional arrow of the create gesture (or of swapping the end). */
  readonly arrowDraftLine: KonvaLine = new KonvaLine({
    visible: false,
    listening: false,
  });
  readonly arrowDraftHead: KonvaLine = new KonvaLine({
    visible: false,
    closed: true,
    listening: false,
  });

  constructor(layer: Konva.Layer, container: HTMLElement) {
    this.container = container;
    this.layer = layer;
    this.nameTag.add(this.nameTagBox, this.nameTagText, this.nameTagStrike);
    layer.add(
      this.selectionOutline,
      this.draftRect,
      this.dropRect,
      this.marqueeHalo,
      this.marqueeRect,
    );
    for (const corner of CORNERS) {
      const handle = new KonvaRect({ visible: false });
      this.handles.set(corner, handle);
      layer.add(handle);
    }
    layer.add(
      this.linkHandle,
      this.arrowDraftLine,
      this.arrowDraftHead,
      this.nameTag,
      this.selectionLock.group,
      this.hoverLockBadge.group,
    );
  }

  /** The nodes of the selected arrows' highlights (reused; the ones not needed stay invisible). */
  arrowHighlightNodes(): readonly ArrowHighlight[] {
    return this.arrowHighlights;
  }

  /** The nodes of the anchor links (reused; the ones not needed stay invisible). */
  anchorLinkNodes(): readonly AnchorLink[] {
    return this.anchorLinks;
  }

  /** The nodes of the selected arrow's handles (reused; the ones not needed stay invisible). */
  arrowHandleCircles(): readonly KonvaCircle[] {
    return this.arrowHandleNodes;
  }

  /** The nodes of the absorption highlights (reused; the ones not needed stay invisible). */
  absorbHighlights(): readonly KonvaRect[] {
    return this.absorbRects;
  }

  /** The nodes of the secondary selection outlines (reused; the ones not needed stay invisible). */
  secondaryHighlights(): readonly KonvaRect[] {
    return this.secondaryRects;
  }

  /** Something is anchored to the visible part of the screen (the name tag, the lock): pan must redraw. */
  get followsView(): boolean {
    return (
      this.nameTag.visible() ||
      this.selectionLock.group.visible() ||
      this.hoverLockBadge.group.visible()
    );
  }

  /** `headers`: name labels drawn by the markings (the tag dodges the parent). */
  render(
    frame: OverlayFrame,
    placements: ReadonlyMap<string, Placement>,
    headers: HeaderLookup = NO_HEADERS,
  ): void {
    this.renderDraft(frame, placements);
    this.renderAbsorb(frame);
    this.renderSecondarySelection(frame, placements);
    this.renderSelection(frame, placements, headers);
    this.renderAnchorLinks(frame, placements);
    this.renderArrowSelection(frame);
    this.renderArrowDraft(frame);
    this.renderHoverLock(frame, placements);
    this.renderDropTarget(frame);
    this.renderMarquee(frame);
  }

  /** The Shift+drag rectangle: dashed blue with light fill and halo outside and inside. */
  private renderMarquee(frame: OverlayFrame): void {
    const { marquee, tokens } = frame;
    if (!marquee) {
      this.marqueeRect.visible(false);
      this.marqueeHalo.visible(false);
      return;
    }
    const zoom = frame.viewport.scale;
    const dash = [6 / zoom, 4 / zoom];
    this.marqueeHalo.setAttrs({
      ...marquee,
      visible: true,
      stroke: tokens.halo,
      strokeWidth: (SELECTION_STROKE + 2 * HALO_WIDTH) / zoom,
      dash,
    });
    this.marqueeRect.setAttrs({
      ...marquee,
      visible: true,
      stroke: tokens.select,
      strokeWidth: SELECTION_STROKE / zoom,
      dash,
      fill: tokens.selectFill,
    });
  }

  /** Lock on the locked item under the mouse (unless it is the selected one, which already has its own). */
  private renderHoverLock(
    frame: OverlayFrame,
    placements: ReadonlyMap<string, Placement>,
  ): void {
    const { project, hoverLock: hover, selection } = frame;
    const same = hover && selection?.kind === hover.kind && selection.id === hover.id;
    const target =
      hover && !same && project ? lockedRect(project, hover, placements) : null;
    if (!target || !hover) {
      this.hoverLockBadge.hide();
      return;
    }
    this.hoverLockBadge.show(
      target.rect,
      visibleArea(frame.size, frame.viewport),
      frame.viewport.scale,
      frame.tokens,
      target.inherited,
    );
  }

  private renderDropTarget(frame: OverlayFrame): void {
    const { project, dropTarget: target, tokens } = frame;
    const zoom = frame.viewport.scale;
    this.container.classList.toggle(
      'canvas-host--drop',
      target?.containerId === null && target.markingId === undefined,
    );
    const index = project && projectIndex(project);
    const marking = target?.markingId ? index?.markings.get(target.markingId) : undefined;
    const image = target?.containerId
      ? index?.containers.get(target.containerId)
      : undefined;
    const rect =
      marking && project
        ? markingCanvasRectOf(project, marking)
        : image && imageCanvasRect(image, image.placement);
    if (!rect) {
      this.dropRect.visible(false);
      return;
    }
    this.dropRect.setAttrs({
      ...rect,
      visible: true,
      stroke: tokens.select,
      strokeWidth: (3 * SELECTION_STROKE) / zoom,
      dash: [10 / zoom, 6 / zoom],
    });
  }

  /**
   * Items that would be absorbed if the gesture ended now: stroke and fill of the new
   * token, over the image and below the selection.
   */
  private renderAbsorb(frame: OverlayFrame): void {
    const { absorb, tokens } = frame;
    const zoom = frame.viewport.scale;
    while (this.absorbRects.length < absorb.length) {
      const rect = new KonvaRect({ visible: false, listening: false });
      this.layer.add(rect);
      rect.moveToBottom(); // Below the draft, the selection and the handles.
      this.absorbRects.push(rect);
    }
    this.absorbRects.forEach((node, i) => {
      const rect = absorb[i];
      if (!rect) {
        node.visible(false);
        return;
      }
      node.setAttrs({
        ...rect,
        visible: true,
        stroke: tokens.absorb,
        strokeWidth: (2 * SELECTION_STROKE) / zoom,
        fill: tokens.absorbFill,
      });
    });
  }

  /**
   * Multi-select: the selected items that are not the primary get an outline on their
   * rectangle (container or marking), without handles, lock or name tag, which belong
   * only to the primary. Uses the frame's project (which already has the gesture preview) and the positions of the
   * frame's containers, so it follows the joint drag.
   */
  private renderSecondarySelection(
    frame: OverlayFrame,
    placements: ReadonlyMap<string, Placement>,
  ): void {
    const { project, items, selection, tokens } = frame;
    const zoom = frame.viewport.scale;
    const rects: Rect[] = [];
    if (project && items.length > 0) {
      const index = projectIndex(project);
      for (const item of items) {
        if (sameItem(item, selection)) continue;
        if (item.kind === 'image') {
          const image = index.containers.get(item.id);
          if (image) {
            rects.push(
              imageCanvasRect(image, placements.get(image.id) ?? image.placement),
            );
          }
          continue;
        }
        const marking = index.markings.get(item.id);
        const placement = marking && placementOfSpace(placements, marking.containerId);
        if (marking && placement) rects.push(markingCanvasRect(placement, marking.rect));
      }
    }
    while (this.secondaryRects.length < rects.length) {
      const rect = new KonvaRect({ visible: false, listening: false });
      this.layer.add(rect);
      rect.moveToBottom(); // Below the draft, the selection and the handles.
      this.secondaryRects.push(rect);
    }
    this.secondaryRects.forEach((node, i) => {
      const rect = rects[i];
      if (!rect) {
        node.visible(false);
        return;
      }
      node.setAttrs({
        ...rect,
        visible: true,
        stroke: tokens.selectSecondary,
        strokeWidth: SELECTION_STROKE / zoom,
      });
    });
  }

  private renderDraft(
    frame: OverlayFrame,
    placements: ReadonlyMap<string, Placement>,
  ): void {
    const { draft, tokens } = frame;
    const zoom = frame.viewport.scale;
    const placement = draft && placementOfSpace(placements, draft.containerId);
    if (!draft || !placement) {
      this.draftRect.visible(false);
      return;
    }
    const valid = isDrawableRect(draft.rect);
    this.draftRect.setAttrs({
      ...markingCanvasRect(placement, draft.rect),
      visible: true,
      stroke: valid ? tokens.select : tokens.invalid,
      strokeWidth: SELECTION_STROKE / zoom,
      dash: [6 / zoom, 4 / zoom],
    });
  }

  private renderSelection(
    frame: OverlayFrame,
    placements: ReadonlyMap<string, Placement>,
    headers: HeaderLookup,
  ): void {
    const { preview, tokens } = frame;
    const zoom = frame.viewport.scale;
    const selected = resolveSelection(frame.project, frame.selection);
    // Handles only in Navigate mode (in Draw, dragging always draws) and if the item can change.
    const handlesAllowed = !frame.readOnly && frame.mode === 'navigate';
    // The selected arrow has its own highlight and handles (`renderArrowSelection`): here only
    // what belongs to markings and containers goes away.
    if (!selected || selected.kind === 'arrow') {
      this.selectionLock.hide();
      this.selectionOutline.visible(false);
      this.nameTag.visible(false);
      this.linkHandle.visible(false);
      for (const handle of this.handles.values()) handle.visible(false);
      return;
    }

    let rect: Rect;
    let color = tokens.select;
    if (selected.kind === 'image') {
      const { image } = selected;
      const invalid = preview?.containerId === image.id && !preview.valid;
      if (invalid) color = tokens.invalid;
      rect = imageCanvasRect(image, placements.get(image.id) ?? image.placement);
      this.selectionOutline.setAttrs({
        ...rect,
        visible: true,
        stroke: color,
        strokeWidth: (SELECTION_STROKE * (invalid ? 2 : 1)) / zoom,
      });
      this.nameTag.visible(false);
      this.linkHandle.visible(false);
    } else {
      // The selected marking's border is already thicker; here only the handles.
      const placement =
        placementOfSpace(placements, selected.marking.containerId) ??
        selected.space.placement;
      rect = markingCanvasRect(placement, selected.marking.rect);
      this.selectionOutline.visible(false);
      // Without a container (canvas marking), there is no image title to avoid.
      const imageTop = selected.image
        ? imageCanvasRect(selected.image, placement).y
        : -Infinity;
      const { parentId } = selected.marking;
      const parentLabel = parentId === null ? undefined : headers.get(parentId);
      this.renderNameTag(
        frame,
        rect,
        selected.marking.name,
        imageTop,
        parentLabel,
        selected.marking.id,
      );
      // The link handle applies to a single marking (creating the arrow does not change it: valid when locked).
      this.renderLinkHandle(frame, rect, handlesAllowed && frame.items.length <= 1);
    }

    const selectedId =
      selected.kind === 'image' ? selected.image.id : selected.marking.id;
    const lock = frame.project
      ? lockedRect(frame.project, { kind: selected.kind, id: selectedId }, placements)
      : null;
    // No handles on the locked item; with the lock on the selection (dimmed if it comes from the parent).
    const showHandles = handlesAllowed && lock === null;
    if (lock) {
      this.selectionLock.show(
        lock.rect,
        visibleArea(frame.size, frame.viewport),
        zoom,
        tokens,
        lock.inherited,
      );
    } else {
      this.selectionLock.hide();
    }

    const side = tokens.handleSize / zoom;
    for (const [corner, handle] of this.handles) {
      const c = cornerPoint(rect, corner);
      handle.setAttrs({
        visible: showHandles,
        x: c.x - side / 2,
        y: c.y - side / 2,
        width: side,
        height: side,
        fill: tokens.line,
        stroke: color,
        strokeWidth: SELECTION_STROKE / zoom,
      });
    }
  }

  /**
   * Anchor link (R4, decision 13): the selected anchored marking, or the one under the mouse, shows a
   * thin dashed line from its center to the anchor's, in the control color and with the halo underneath.
   * Only reads the frame's positions (the drag preview carries the anchored one along): pan and zoom do not
   * recompute anything beyond the transform and the thickness.
   */
  private renderAnchorLinks(
    frame: OverlayFrame,
    placements: ReadonlyMap<string, Placement>,
  ): void {
    const ends = anchorLinkEnds(frame, placements);
    const { tokens } = frame;
    const zoom = frame.viewport.scale;
    while (this.anchorLinks.length < ends.length) {
      const halo = new KonvaLine({ visible: false, listening: false, lineCap: 'round' });
      const line = new KonvaLine({ visible: false, listening: false, lineCap: 'round' });
      this.layer.add(halo, line);
      this.anchorLinks.push({ halo, line });
    }
    const dash = [6 / zoom, 4 / zoom];
    this.anchorLinks.forEach((node, i) => {
      const end = ends[i];
      if (!end) {
        node.halo.visible(false);
        node.line.visible(false);
        return;
      }
      const points = [end.from.x, end.from.y, end.to.x, end.to.y];
      node.halo.setAttrs({
        visible: true,
        points,
        stroke: tokens.halo,
        strokeWidth: (SELECTION_STROKE + 2 * HALO_WIDTH) / zoom,
        dash,
      });
      node.line.setAttrs({
        visible: true,
        points,
        stroke: tokens.borderControl,
        strokeWidth: SELECTION_STROKE / zoom,
        dash,
      });
    });
  }

  /** Link handle (circle in the middle of the right side, outside): pulling from it creates an arrow. */
  private renderLinkHandle(frame: OverlayFrame, rect: Rect, show: boolean): void {
    if (!show) {
      this.linkHandle.visible(false);
      return;
    }
    const { tokens } = frame;
    const zoom = frame.viewport.scale;
    const at = linkHandlePoint(rect, zoom);
    this.linkHandle.setAttrs({
      visible: true,
      x: at.x,
      y: at.y,
      radius: tokens.handleSize / 2 / zoom,
      fill: tokens.arrow.select,
      stroke: tokens.line,
      strokeWidth: SELECTION_STROKE / zoom,
    });
  }

  /**
   * Selected arrows: the highlight (stroke and tip in the selection color; the secondary ones, in that of
   * the multi-selection) and, on the primary one that can be edited, the handles. Locked arrow: no handles and with the
   * lock in the middle of the stroke. Only the drawn arrows (`frame.arrows`) have highlight and handles.
   */
  private renderArrowSelection(frame: OverlayFrame): void {
    const { project, items, selection, arrows, tokens } = frame;
    const zoom = frame.viewport.scale;
    const entries: { readonly shape: ArrowShape; readonly primary: boolean }[] = [];
    const byId = new Map(arrows.map((shape) => [shape.arrow.id, shape] as const));
    const shapeOf = (id: string) => byId.get(id);
    for (const item of items) {
      if (item.kind !== 'arrow' || sameItem(item, selection)) continue;
      const shape = shapeOf(item.id);
      if (shape) entries.push({ shape, primary: false });
    }
    const primary = selection?.kind === 'arrow' ? shapeOf(selection.id) : undefined;
    if (primary) entries.push({ shape: primary, primary: true });

    while (this.arrowHighlights.length < entries.length) {
      const line = new KonvaLine({
        visible: false,
        listening: false,
        lineCap: 'round',
        lineJoin: 'round',
      });
      const head = new KonvaLine({
        visible: false,
        listening: false,
        closed: true,
        lineJoin: 'round',
      });
      this.layer.add(line, head);
      this.arrowHighlights.push({ line, head });
    }
    this.arrowHighlights.forEach((node, i) => {
      const entry = entries[i];
      if (!entry) {
        node.line.visible(false);
        node.head.visible(false);
        return;
      }
      const { shape } = entry;
      const color = entry.primary ? tokens.arrow.select : tokens.selectSecondary;
      const tip = shape.path[shape.path.length - 1];
      if (!tip) return;
      node.line.setAttrs({
        visible: true,
        points: flatPoints(shape.path),
        stroke: color,
        strokeWidth: tokens.arrow.widthSelected / zoom,
      });
      node.head.setAttrs({
        visible: true,
        points: headPoints(tip, headDirection(shape.path), tokens.arrow.head / zoom),
        fill: color,
        stroke: color,
        strokeWidth: 1 / zoom,
      });
    });

    // Handles: only on the primary, in Navigate mode, and if the arrow can change.
    const editable =
      primary !== undefined &&
      project !== null &&
      !frame.readOnly &&
      frame.mode === 'navigate' &&
      canEditArrow(project, primary.arrow.id);
    const handles = editable ? arrowHandles(primary, zoom) : [];
    while (this.arrowHandleNodes.length < handles.length) {
      const circle = new KonvaCircle({ visible: false, listening: false });
      this.layer.add(circle);
      this.arrowHandleNodes.push(circle);
    }
    const radius = tokens.handleSize / 2 / zoom;
    this.arrowHandleNodes.forEach((circle, i) => {
      const handle = handles[i];
      if (!handle) {
        circle.visible(false);
        return;
      }
      // The end is filled in the selection color; the waypoint is hollow; the segment midpoint is
      // smaller and dimmed (it only becomes a point when dragged); the corner segment is hollow and
      // a little smaller than the waypoint.
      const common = {
        visible: true,
        x: handle.at.x,
        y: handle.at.y,
        strokeWidth: SELECTION_STROKE / zoom,
      };
      if (handle.kind === 'end') {
        circle.setAttrs({
          ...common,
          radius: radius * 1.2,
          fill: tokens.arrow.select,
          stroke: tokens.line,
          opacity: OPAQUE,
        });
      } else if (handle.kind === 'point' || handle.kind === 'segment') {
        circle.setAttrs({
          ...common,
          radius: handle.kind === 'point' ? radius : radius * 0.85,
          fill: tokens.line,
          stroke: tokens.arrow.select,
          opacity: OPAQUE,
        });
      } else {
        circle.setAttrs({
          ...common,
          radius: radius * 0.7,
          fill: tokens.line,
          stroke: tokens.arrow.select,
          opacity: tokens.opacity.inherited,
        });
      }
    });

    if (primary && project && !canEditArrow(project, primary.arrow.id)) {
      const at = primary.label;
      this.selectionLock.show(
        { x: at.x, y: at.y, width: 0, height: 0 },
        visibleArea(frame.size, frame.viewport),
        zoom,
        tokens,
        false,
      );
    }
  }

  /** Provisional arrow (create from the handle or drag an end): dashed, with the tip, in the selection color. */
  private renderArrowDraft(frame: OverlayFrame): void {
    const line = frame.arrowDraft?.line;
    if (!line) {
      this.arrowDraftLine.visible(false);
      this.arrowDraftHead.visible(false);
      return;
    }
    const { tokens } = frame;
    const zoom = frame.viewport.scale;
    const dx = line.to.x - line.from.x;
    const dy = line.to.y - line.from.y;
    const length = Math.hypot(dx, dy);
    const dir = length > 0 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
    this.arrowDraftLine.setAttrs({
      visible: true,
      points: [line.from.x, line.from.y, line.to.x, line.to.y],
      stroke: tokens.arrow.select,
      strokeWidth: tokens.arrow.widthSelected / zoom,
      dash: [6 / zoom, 4 / zoom],
    });
    this.arrowDraftHead.setAttrs({
      visible: true,
      points: headPoints(line.to, dir, tokens.arrow.head / zoom),
      fill: tokens.arrow.select,
    });
  }

  /**
   * Name of the selected marking in a tag above the top-left corner (inside
   * when there is no room above on screen). Against the top of the image, it goes above its title
   * instead of covering it; over the parent's label (`parentLabel`), it goes below it,
   * like the label of the unselected child. With the corner off screen, the tag stays
   * anchored to the visible edge. Without a name, no tag.
   */
  private renderNameTag(
    frame: OverlayFrame,
    rect: Rect,
    name: string | null,
    imageTop: number,
    parentLabel?: Rect,
    markingId: string | null = null,
  ): void {
    const { tokens, viewport } = frame;
    const zoom = viewport.scale;
    if (name === null || name === '') {
      this.nameTag.visible(false);
      return;
    }
    const { size, line, weight } = tokens.type.name;
    const height = line + 2 * HALO_WIDTH;
    this.nameTagText.setAttrs({
      text: name,
      fontSize: size,
      fontFamily: tokens.fontFamily,
      fontStyle: fontStyle(weight),
      fill: tokens.nameTagText,
      x: NAME_TAG_PADDING,
      y: (height - size) / 2,
      width: undefined,
    });
    const width = Math.min(
      this.nameTagText.width() + 2 * NAME_TAG_PADDING,
      NAME_TAG_MAX_WIDTH,
    );
    this.nameTagText.width(width - 2 * NAME_TAG_PADDING);
    this.nameTagText.height(size);
    this.nameTagBox.setAttrs({
      width,
      height,
      fill: tokens.nameTag,
      stroke: tokens.halo,
      strokeWidth: HALO_WIDTH,
      cornerRadius: tokens.radius.sm,
    });
    // Removed in the review: the name is struck through in the tag too (which covers the review's).
    const struck = markingId !== null && isRemovedInReview(frame.review, markingId);
    const strikeY = (height - size) / 2 + size * STRIKE_HEIGHT;
    // The strike follows the visible text: it never exceeds the tag's width (cut text).
    const strikeWidth = Math.min(
      this.nameTagText.measureSize(name).width,
      width - 2 * NAME_TAG_PADDING,
    );
    this.nameTagStrike.visible(struck);
    this.nameTagStrike.setAttrs({
      points: [NAME_TAG_PADDING, strikeY, NAME_TAG_PADDING + strikeWidth, strikeY],
      stroke: tokens.nameTagText,
      strokeWidth: STRIKE_WIDTH,
    });
    const view = visibleArea(frame.size, viewport);
    const step = (height + NAME_TAG_GAP) / zoom;
    // Band of the image title, just above it: the tag does not cover it.
    const titleTop = imageTop - (tokens.type.image.line + IMAGE_TITLE_GAP) / zoom;
    let aboveY = rect.y - step;
    if (aboveY < imageTop && rect.y - NAME_TAG_GAP / zoom > titleTop) {
      aboveY = titleTop - step;
    }
    const above = aboveY >= view.y;
    const top = Math.max(rect.y, view.y);
    const x = Math.max(rect.x, view.x);
    let y = above ? aboveY : top + NAME_TAG_GAP / zoom;
    const tag = { x, y, width: width / zoom, height: height / zoom };
    if (parentLabel && intersectRects(tag, parentLabel)) {
      y = parentLabel.y + parentLabel.height + NAME_TAG_GAP / zoom;
    }
    this.nameTag.setAttrs({
      visible: true,
      x,
      y,
      scaleX: 1 / zoom,
      scaleY: 1 / zoom,
    });
  }
}

/** The ends of an anchor link, in canvas coordinates: the center of the anchored one and of the anchor. */
interface AnchorLinkEnds {
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
}

/**
 * The links to show: that of the selected marking (the primary) and that of the one under the mouse, only
 * of those with an anchor, without repeating when they are the same. The rectangle of each end uses the placement
 * of the frame (that of the dragged or resized container), like the rest of the overlays.
 */
function anchorLinkEnds(
  frame: OverlayFrame,
  placements: ReadonlyMap<string, Placement>,
): AnchorLinkEnds[] {
  const { project, selection, hoverMarking } = frame;
  if (!project) return [];
  const index = projectIndex(project);
  const ids = new Set<string>();
  if (selection?.kind === 'marking') ids.add(selection.id);
  if (hoverMarking !== null) ids.add(hoverMarking);
  const centerOf = (id: string) => {
    const marking = index.markings.get(id);
    const placement =
      marking === undefined
        ? undefined
        : marking.containerId === null
          ? placementOfSpace(placements, null)
          : (placements.get(marking.containerId) ??
            index.containers.get(marking.containerId)?.placement);
    if (marking === undefined || placement === undefined) return null;
    const rect = markingCanvasRect(placement, marking.rect);
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  };
  const ends: AnchorLinkEnds[] = [];
  for (const id of ids) {
    const target = index.anchorOf.get(id);
    const from = centerOf(id);
    const to = target === undefined ? null : centerOf(target);
    if (from !== null && to !== null) ends.push({ from, to });
  }
  return ends;
}

/** The marking is the removed one that the review shows struck through (the shape key is `marking:<id>`). */
function isRemovedInReview(review: OverlayFrame['review'], id: string): boolean {
  return review?.removed.some((shape) => shape.key === `marking:${id}`) ?? false;
}

/**
 * Rectangle (canvas) of the item if its geometry is locked, with `inherited` when the lock comes
 * from an ancestor; `null` if it is free. Marking: it or a locked ancestor; image: its
 * own or a canvas marking that contains it (locked, or with a locked ancestor).
 */
function lockedRect(
  project: NonNullable<OverlayFrame['project']>,
  item: { readonly kind: 'image' | 'marking'; readonly id: string },
  placements: ReadonlyMap<string, Placement>,
): { readonly rect: Rect; readonly inherited: boolean } | null {
  const index = projectIndex(project);
  if (item.kind === 'image') {
    const image = index.containers.get(item.id);
    if (!image || canEditImagePlacement(project, image.id)) return null;
    return {
      rect: imageCanvasRect(image, placements.get(image.id) ?? image.placement),
      inherited: !image.locked,
    };
  }
  const marking = index.markings.get(item.id);
  if (!marking || canEditMarkingGeometry(project, marking.id)) return null;
  const placement =
    marking.containerId === null
      ? placementOfSpace(placements, null)
      : (placements.get(marking.containerId) ??
        index.containers.get(marking.containerId)?.placement);
  if (!placement) return null;
  return {
    rect: markingCanvasRect(placement, marking.rect),
    inherited: !marking.locked,
  };
}
