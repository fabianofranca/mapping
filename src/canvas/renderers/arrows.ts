// Arrows (v13, ME4) on the canvas: a layer between the component drawings and the markings. All the
// arrows are a single Konva node that draws, in a few passes, the halos, the strokes (the polyline
// or the sampled curve of `arrowGeometry.ts`) and the heads: two hundred arrows cost the same
// number of paint operations as one, and zoom touches no node (the thickness and the head, in
// screen px, come from the zoom at paint time). Only the label (the `name`, in the middle of the
// stroke) is a node per arrow, and only on the ones that have a name and are whole. From afar the
// short arrow is just the stroke and the one that links invisible markings disappears
// (`arrowDetail.ts`); the one outside the visible area is not painted. Selection and the mouse only
// enter the level of detail (the selected one and the ones linked to what is selected stay whole);
// the highlight and the handles stay in the overlay (`overlay.ts`).
import Konva from 'konva/lib/Core';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import { projectIndex, type Placement, type Rect } from '../../model';
import { visibleArea, type Frame } from '../frame';
import {
  arrowPathLength,
  arrowStrokes,
  type ArrowShape,
  type ArrowStrokes,
} from '../arrowGeometry';
import { placementOfSpace } from '../markingGeometry';
import type { CanvasTokens } from '../theme';
import { arrowDetail, type ArrowEnd } from './arrowDetail';
import { HALO_WIDTH, fontStyle } from './metrics';

/** Inner inset and maximum width of the label (screen px). */
const LABEL_PADDING = 4;
const LABEL_MAX_WIDTH = 200;

/**
 * What the level of detail reads from the frame: the zoom and the visible area, the selection, the
 * mouse and the review.
 */
export type ArrowsFrame = Pick<
  Frame,
  | 'arrows'
  | 'tokens'
  | 'viewport'
  | 'size'
  | 'project'
  | 'selection'
  | 'items'
  | 'hoverMarking'
  | 'review'
  | 'view'
>;

/** What a frame touched: the markings layer (where the arrows live) and/or the drag group. */
export interface ArrowChanges {
  readonly main: boolean;
  readonly drag: boolean;
}

const NO_SHAPES: readonly ArrowShape[] = [];
const NO_PLACEMENTS: ReadonlyMap<string, Placement> = new Map();
const NO_STROKES: ArrowStrokes = { bodies: [], corners: [], heads: [] };

function sameShapes(a: readonly ArrowShape[], b: readonly ArrowShape[]): boolean {
  return a.length === b.length && a.every((shape, i) => shape === b[i]);
}

/** The arrows painted in a frame: the whole ones and the ones with only the stroke. */
interface DetailSplit {
  readonly full: readonly ArrowShape[];
  readonly thin: readonly ArrowShape[];
}
const NO_SPLIT: DetailSplit = { full: NO_SHAPES, thin: NO_SHAPES };

/**
 * The size of a head at zoom 1 (the screen one is it × the zoom; infinite without a position: with
 * no data, the head counts as visible).
 */
interface EndSize {
  readonly width: number;
  readonly height: number;
}

/**
 * What about the arrow changes only with the project, the positions and the theme (pan, zoom and
 * selection do not touch it).
 */
interface Measured {
  readonly shape: ArrowShape;
  /** Length of the stroke (canvas units). */
  readonly length: number;
  readonly from: EndSize;
  readonly to: EndSize;
}

const UNKNOWN_END: EndSize = {
  width: Number.POSITIVE_INFINITY,
  height: Number.POSITIVE_INFINITY,
};

/**
 * The items that make the arrow whole: selected arrows and markings that are selected or under the
 * mouse.
 */
interface Exceptions {
  readonly arrows: ReadonlySet<string>;
  readonly markings: ReadonlySet<string>;
}

const NO_IDS: ReadonlySet<string> = new Set();

function exceptionsOf(frame: ArrowsFrame): Exceptions {
  // In view mode there is no selection or mouse: only the size counts.
  if (frame.view !== null) return { arrows: NO_IDS, markings: NO_IDS };
  const arrows = new Set<string>();
  const markings = new Set<string>();
  for (const item of [...frame.items, frame.selection]) {
    if (item?.kind === 'arrow') arrows.add(item.id);
    else if (item?.kind === 'marking') markings.add(item.id);
  }
  if (frame.hoverMarking !== null) markings.add(frame.hoverMarking);
  return { arrows, markings };
}

/**
 * Inclusive overlap: the stroke box of a horizontal or vertical straight arrow has zero height
 * or width, and the model's `rectsOverlap` (positive area) would discard it.
 */
function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

/**
 * The visible area with the label's slack (the biggest piece of the arrow that can stick out of the
 * stroke box).
 */
function paddedArea(frame: ArrowsFrame): Rect {
  const area = visibleArea(frame.size, frame.viewport);
  const margin = LABEL_MAX_WIDTH / frame.viewport.scale;
  return {
    x: area.x - margin,
    y: area.y - margin,
    width: area.width + 2 * margin,
    height: area.height + 2 * margin,
  };
}

/**
 * The arrows' level of detail (decision 7 of the canvas-performance stage): the measure of each
 * arrow is kept until the project or the positions change, and each frame only checks the zoom, the
 * visible area and the exceptions (selection and mouse). The arrays repeat while the painted arrows
 * are the same, so the drawing of the strokes and halos is not redone.
 */
class DetailPlan {
  private measured: {
    readonly arrows: readonly ArrowShape[];
    readonly project: ArrowsFrame['project'];
    readonly placements: ReadonlyMap<string, Placement>;
    readonly value: readonly Measured[];
  } | null = null;
  private last: DetailSplit = NO_SPLIT;

  classify(frame: ArrowsFrame, placements: ReadonlyMap<string, Placement>): DetailSplit {
    const measured = this.measure(frame, placements);
    const zoom = frame.viewport.scale;
    const area = paddedArea(frame);
    const { arrows, markings } = exceptionsOf(frame);
    const marks = frame.view === null ? frame.review?.markings : undefined;
    const { lodMinMarking: minFull, lodHideMarking: hide } = frame.tokens;
    const always = (id: string) => markings.has(id) || marks?.has(id) === true;
    const full: ArrowShape[] = [];
    const thin: ArrowShape[] = [];
    for (const item of measured) {
      const { shape } = item;
      if (!overlaps(shape.bounds, area)) continue;
      const detail = arrowDetail({
        screenLength: item.length * zoom,
        always: arrows.has(shape.arrow.id),
        from: onScreen(item.from, zoom, always(shape.arrow.from)),
        to: onScreen(item.to, zoom, always(shape.arrow.to)),
        minFull,
        hide,
      });
      if (detail === 'full') full.push(shape);
      else if (detail === 'thin') thin.push(shape);
    }
    return this.keep(full, thin);
  }

  private keep(full: ArrowShape[], thin: ArrowShape[]): DetailSplit {
    const previous = this.last;
    const next: DetailSplit = {
      full: sameShapes(previous.full, full) ? previous.full : full,
      thin: sameShapes(previous.thin, thin) ? previous.thin : thin,
    };
    const same = next.full === previous.full && next.thin === previous.thin;
    this.last = same ? previous : next;
    return this.last;
  }

  private measure(
    frame: ArrowsFrame,
    placements: ReadonlyMap<string, Placement>,
  ): readonly Measured[] {
    const { arrows, project } = frame;
    const cached = this.measured;
    if (
      cached &&
      cached.arrows === arrows &&
      cached.project === project &&
      cached.placements === placements
    ) {
      return cached.value;
    }
    const value = measureArrows(frame, placements);
    this.measured = { arrows, project, placements, value };
    return value;
  }
}

/** The on-screen size of the marking that the head links. */
function endSize(
  frame: ArrowsFrame,
  placements: ReadonlyMap<string, Placement>,
  id: string,
): EndSize {
  const marking = frame.project
    ? projectIndex(frame.project).markings.get(id)
    : undefined;
  const placement = marking
    ? placementOfSpace(placements, marking.containerId)
    : undefined;
  if (!marking || !placement) return UNKNOWN_END;
  return {
    width: marking.rect.width * placement.scale,
    height: marking.rect.height * placement.scale,
  };
}

/** The head with the on-screen size at zoom `zoom`. */
function onScreen(end: EndSize, zoom: number, always: boolean): ArrowEnd {
  return { screenWidth: end.width * zoom, screenHeight: end.height * zoom, always };
}

function measureArrows(
  frame: ArrowsFrame,
  placements: ReadonlyMap<string, Placement>,
): readonly Measured[] {
  return frame.arrows.map((shape) => ({
    shape,
    length: arrowPathLength(shape),
    from: endSize(frame, placements, shape.arrow.from),
    to: endSize(frame, placements, shape.arrow.to),
  }));
}

/** Splits `shapes` between the ones that move (`ids`) and the still ones. */
function splitMoving(
  shapes: readonly ArrowShape[],
  ids: ReadonlySet<string>,
): { parked: ArrowShape[]; moving: ArrowShape[] } {
  const parked: ArrowShape[] = [];
  const moving: ArrowShape[] = [];
  for (const shape of shapes) (ids.has(shape.arrow.id) ? moving : parked).push(shape);
  return { parked, moving };
}

/** The whole arrows and then the short ones in a single array, the same one while both are. */
class ShapesJoin {
  private entry: {
    readonly full: readonly ArrowShape[];
    readonly thin: readonly ArrowShape[];
    readonly value: readonly ArrowShape[];
  } | null = null;

  get(full: readonly ArrowShape[], thin: readonly ArrowShape[]): readonly ArrowShape[] {
    if (thin.length === 0) return full;
    const cached = this.entry;
    if (cached && cached.full === full && cached.thin === thin) return cached.value;
    const value = [...full, ...thin];
    this.entry = { full, thin, value };
    return value;
  }
}

/** The bodies of `a` and `b` together, in the same stroke pass (the same object while both are). */
class BodiesMerge {
  private entry: {
    readonly a: ArrowStrokes;
    readonly b: ArrowStrokes;
    readonly value: ArrowStrokes;
  } | null = null;

  get(a: ArrowStrokes, b: ArrowStrokes): ArrowStrokes {
    if (b.bodies.length === 0 && b.corners.length === 0) return a;
    const cached = this.entry;
    if (cached && cached.a === a && cached.b === b) return cached.value;
    const value: ArrowStrokes = {
      bodies: [...a.bodies, ...b.bodies],
      corners: [...a.corners, ...b.corners],
      heads: a.heads,
    };
    this.entry = { a, b, value };
    return value;
  }
}

/** The drawing computed for (`shapes`, `zoom`, head): equal frames reuse it. */
class StrokeCache {
  private entry: {
    readonly shapes: readonly ArrowShape[];
    readonly zoom: number;
    readonly head: number;
    readonly value: ArrowStrokes;
  } | null = null;

  get(shapes: readonly ArrowShape[], zoom: number, head: number): ArrowStrokes {
    const cached = this.entry;
    if (
      cached &&
      cached.shapes === shapes &&
      cached.zoom === zoom &&
      cached.head === head
    ) {
      return cached.value;
    }
    const value = arrowStrokes(shapes, zoom, head);
    this.entry = { shapes, zoom, head, value };
    return value;
  }
}

/** The paint operations the drawing uses (Konva's context has them; the tests record). */
export interface ArrowPainter {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  stroke(): void;
  fill(): void;
  setAttr(attr: string, value: unknown): void;
}

interface LabelNode {
  readonly group: Konva.Group;
  readonly box: KonvaRect;
  readonly text: KonvaText;
  /** What the node shows: equal to the frame, it is already right. */
  shape: ArrowShape | null;
  zoom: number;
  tokens: CanvasTokens | null;
}

export class ArrowRenderer {
  private readonly body: Konva.Shape;
  private readonly labelsGroup = new Konva.Group({ listening: false });
  private readonly labels = new Map<string, LabelNode>();
  private known: {
    readonly arrows: readonly ArrowShape[];
    readonly ids: ReadonlySet<string>;
  } | null = null;
  /** The whole (still) arrows and the stroke-only ones, chosen by the `DetailPlan`. */
  private shapes: readonly ArrowShape[] = [];
  private thinShapes: readonly ArrowShape[] = NO_SHAPES;
  private tokens: CanvasTokens | null = null;
  private zoom = 1;
  private readonly plan = new DetailPlan();
  private readonly strokes = new StrokeCache();
  private readonly thinStrokes = new StrokeCache();
  private readonly merge = new BodiesMerge();
  private readonly parkedJoin = new ShapesJoin();
  private readonly liftedJoin = new ShapesJoin();
  private readonly dragMerge = new BodiesMerge();
  /**
   * The arrows that move in a gesture (decisions 5 and 7): they have their own body and label
   * group, in the drag group, and `shapes` keeps only the still ones (the same array while they do
   * not change, so the body of the still ones is neither redone nor repainted).
   */
  private dragIds: ReadonlySet<string> | null = null;
  private dragGroup: Konva.Group | null = null;
  private dragBody: Konva.Shape | null = null;
  private dragLabels: Konva.Group | null = null;
  private dragShapes: readonly ArrowShape[] = NO_SHAPES;
  private dragThin: readonly ArrowShape[] = NO_SHAPES;
  private readonly dragStrokes = new StrokeCache();
  private readonly dragThinStrokes = new StrokeCache();
  private wasDragging = false;

  constructor(parent: Konva.Container) {
    this.body = new Konva.Shape({
      listening: false,
      sceneFunc: (context) => this.paint(context),
    });
    parent.add(this.body, this.labelsGroup);
  }

  /** The node that paints the arrows. */
  get node(): Konva.Shape {
    return this.body;
  }

  /** The arrows painted in the last frame (whole and then stroke-only), minus the drag group. */
  get drawn(): readonly ArrowShape[] {
    return this.parkedJoin.get(this.shapes, this.thinShapes);
  }

  /** The short arrows of the last frame, painted with only the stroke (no halo, head or label). */
  get thin(): readonly ArrowShape[] {
    return this.thinShapes;
  }

  /** How many arrows are painted (minus the drag group). */
  get size(): number {
    return this.shapes.length + this.thinShapes.length;
  }

  /** How many arrows are painted, counting the drag group's (the `data-arrows`). */
  get painted(): number {
    return this.size + this.dragShapes.length + this.dragThin.length;
  }

  /** The arrows that move in a gesture, drawn in the drag group (empty outside it). */
  get liftedDrawn(): readonly ArrowShape[] {
    return this.liftedJoin.get(this.dragShapes, this.dragThin);
  }

  /** The arrow's label node (`undefined` if it has no name or is not in view). */
  label(id: string): LabelNode | undefined {
    const node = this.labels.get(id);
    return node?.group.visible() ? node : undefined;
  }

  /**
   * Takes the arrows in `ids` to the drag group on the next `render` (their body and labels
   * leave the still ones' drawing), or returns them with `null`.
   */
  setDragged(ids: ReadonlySet<string> | null, target: Konva.Container): void {
    const next = ids && ids.size > 0 ? ids : null;
    if (next && !this.dragGroup) this.mountDragGroup(target);
    if (!next && this.dragGroup) this.unmountDragGroup();
    this.dragIds = next;
  }

  /**
   * Redoes the labels and keeps what the paint passes draw. Returns what moved: with a
   * gesture in progress, the still layer only when the still arrows, the zoom or the theme change.
   */
  render(
    frame: ArrowsFrame,
    placements: ReadonlyMap<string, Placement> = NO_PLACEMENTS,
  ): ArrowChanges {
    const { tokens } = frame;
    const restyled = this.zoom !== frame.viewport.scale || this.tokens !== tokens;
    this.zoom = frame.viewport.scale;
    this.tokens = tokens;
    return this.update(frame, placements, restyled);
  }

  /**
   * Pan (and new positions): the zoom and the theme are the same, so it only checks which arrows
   * are in the visible area and at what level of detail, without touching the rest.
   */
  reveal(
    frame: ArrowsFrame,
    placements: ReadonlyMap<string, Placement> = NO_PLACEMENTS,
  ): ArrowChanges {
    return this.update(frame, placements, false);
  }

  private update(
    frame: ArrowsFrame,
    placements: ReadonlyMap<string, Placement>,
    restyled: boolean,
  ): ArrowChanges {
    const before = { shapes: this.shapes, thin: this.thinShapes };
    const dragging = this.dragIds !== null;
    this.place(this.plan.classify(frame, placements));
    const labelsMain = this.renderLabels(frame);
    // The drawing is a function of `shapes`, `zoom` and `tokens`, which Konva does not see: whoever
    // requests the frame (`CanvasController`) repaints the layer after rendering.
    const main =
      labelsMain ||
      restyled ||
      before.shapes !== this.shapes ||
      before.thin !== this.thinShapes;
    const drag = dragging || this.wasDragging;
    this.wasDragging = dragging;
    return { main, drag };
  }

  destroy(): void {
    this.body.destroy();
    this.labelsGroup.destroy();
    this.dragGroup?.destroy();
    this.dragGroup = null;
    this.labels.clear();
  }

  /**
   * Paints all the arrows: the halos (strokes and heads), the strokes and the heads, each pass in a
   * single path. The thickness, the halo and the head are on-screen, divided by the zoom.
   */
  paint(painter: ArrowPainter): void {
    this.paintShapes(painter, this.shapes, this.thinShapes, {
      full: this.strokes,
      thin: this.thinStrokes,
      merge: this.merge,
    });
  }

  /** Paints the arrows that move (the drag group's body). */
  paintDragged(painter: ArrowPainter): void {
    this.paintShapes(painter, this.dragShapes, this.dragThin, {
      full: this.dragStrokes,
      thin: this.dragThinStrokes,
      merge: this.dragMerge,
    });
  }

  /**
   * The whole ones get halo, stroke and head; the short ones (`thin`) only enter the stroke pass,
   * together with the bodies of the whole ones: no halo and no head.
   */
  private paintShapes(
    painter: ArrowPainter,
    shapes: readonly ArrowShape[],
    thin: readonly ArrowShape[],
    caches: { full: StrokeCache; thin: StrokeCache; merge: BodiesMerge },
  ): void {
    const tokens = this.tokens;
    if (!tokens || (shapes.length === 0 && thin.length === 0)) return;
    const zoom = this.zoom;
    const { arrow: style } = tokens;
    const strokes =
      shapes.length > 0 ? caches.full.get(shapes, zoom, style.head) : NO_STROKES;
    const slim = thin.length > 0 ? caches.thin.get(thin, zoom, 0) : NO_STROKES;
    painter.setAttr('lineCap', 'round');
    if (shapes.length > 0) {
      // Halo: the wider stroke and the head with an outline, in the halo color.
      strokeBodies(painter, strokes, tokens.halo, (style.width + 2 * HALO_WIDTH) / zoom);
      painter.beginPath();
      for (const head of strokes.heads) polyline(painter, head, true);
      painter.setAttr('fillStyle', tokens.halo);
      painter.setAttr('strokeStyle', tokens.halo);
      painter.setAttr('lineWidth', (2 * HALO_WIDTH) / zoom);
      painter.fill();
      painter.stroke();
    }
    // Stroke (of the whole and the short ones) and head in the arrow's color.
    strokeBodies(
      painter,
      caches.merge.get(strokes, slim),
      style.stroke,
      style.width / zoom,
    );
    if (shapes.length === 0) return;
    painter.beginPath();
    for (const head of strokes.heads) polyline(painter, head, true);
    painter.setAttr('fillStyle', style.stroke);
    painter.fill();
  }

  /** Keeps the painted arrows; the still ones keep the array if none changed. */
  private place(detail: DetailSplit): void {
    const ids = this.dragIds;
    if (!ids) {
      this.shapes = detail.full;
      this.thinShapes = detail.thin;
      this.dragShapes = NO_SHAPES;
      this.dragThin = NO_SHAPES;
      return;
    }
    const full = splitMoving(detail.full, ids);
    const thin = splitMoving(detail.thin, ids);
    if (!sameShapes(this.shapes, full.parked)) this.shapes = full.parked;
    if (!sameShapes(this.thinShapes, thin.parked)) this.thinShapes = thin.parked;
    this.dragShapes = full.moving;
    this.dragThin = thin.moving;
  }

  private mountDragGroup(target: Konva.Container): void {
    const group = new Konva.Group({ listening: false });
    this.dragBody = new Konva.Shape({
      listening: false,
      sceneFunc: (context) => this.paintDragged(context),
    });
    this.dragLabels = new Konva.Group({ listening: false });
    group.add(this.dragBody, this.dragLabels);
    target.add(group);
    this.dragGroup = group;
  }

  /** Returns the labels to the usual group and undoes the drag group. */
  private unmountDragGroup(): void {
    for (const node of this.labels.values()) {
      if (node.group.getParent() === this.dragLabels) this.labelsGroup.add(node.group);
    }
    this.dragGroup?.destroy();
    this.dragGroup = null;
    this.dragBody = null;
    this.dragLabels = null;
    this.dragShapes = NO_SHAPES;
    this.dragThin = NO_SHAPES;
  }

  /**
   * Labels: one node per named arrow, reused. The one of an arrow that stopped being whole (short,
   * invisible or outside the visible area) is only hidden, so pan does not recreate nodes; the one
   * of an arrow that left the project is destroyed. The one of the arrow that moves stays in the
   * drag group. Returns `true` if it touched a label of the still ones.
   */
  private renderLabels(frame: ArrowsFrame): boolean {
    const { tokens } = frame;
    const zoom = this.zoom;
    const seen = new Set<string>();
    let main = false;
    // Only the whole ones have a label (the short ones and the ones that disappear do not).
    for (const shapes of [this.shapes, this.dragShapes]) {
      for (const shape of shapes) {
        const name = shape.arrow.name;
        if (name === null || name === '') continue;
        seen.add(shape.arrow.id);
        if (this.syncLabel(shape, name, zoom, tokens)) main = true;
      }
    }
    if (this.labels.size > seen.size && this.retireLabels(frame, seen)) main = true;
    return main;
  }

  /**
   * Hides the labels of the arrows that stay in view without a label and destroys those of the ones
   * that left.
   */
  private retireLabels(frame: ArrowsFrame, seen: ReadonlySet<string>): boolean {
    const known = this.knownIds(frame.arrows);
    let changed = false;
    for (const [id, node] of this.labels) {
      if (seen.has(id)) continue;
      if (!known.has(id)) {
        node.group.destroy();
        this.labels.delete(id);
        changed = true;
      } else if (node.group.visible()) {
        node.group.visible(false);
        changed = true;
      }
    }
    return changed;
  }

  /** The ids of the arrows in view (any level or position), kept by array. */
  private knownIds(arrows: readonly ArrowShape[]): ReadonlySet<string> {
    if (this.known?.arrows !== arrows) {
      this.known = { arrows, ids: new Set(arrows.map((shape) => shape.arrow.id)) };
    }
    return this.known.ids;
  }

  /** The label group: the drag one if the arrow moves, else the usual one. */
  private labelHome(id: string): Konva.Group {
    const lifted = this.dragIds?.has(id) === true;
    return lifted && this.dragLabels ? this.dragLabels : this.labelsGroup;
  }

  /**
   * Puts the arrow's label in the right group and redoes it if it changed. `true` if it touched a
   * label of the still ones.
   */
  private syncLabel(
    shape: ArrowShape,
    name: string,
    zoom: number,
    tokens: CanvasTokens,
  ): boolean {
    const id = shape.arrow.id;
    const home = this.labelHome(id);
    const node = this.labels.get(id) ?? this.createLabel(id, home);
    const moved = node.group.getParent() !== home;
    if (moved) node.group.moveTo(home);
    const revealed = !node.group.visible();
    if (revealed) node.group.visible(true);
    const same = node.shape === shape && node.zoom === zoom && node.tokens === tokens;
    if (!same) this.updateLabel(node, shape, name, zoom, tokens);
    return moved || ((!same || revealed) && home === this.labelsGroup);
  }

  private createLabel(id: string, home: Konva.Group): LabelNode {
    const group = new Konva.Group({ listening: false, name: `arrow-label:${id}` });
    const box = new KonvaRect({ listening: false });
    const text = new KonvaText({ listening: false, wrap: 'none', ellipsis: true });
    group.add(box, text);
    home.add(group);
    const node: LabelNode = { group, box, text, shape: null, zoom: 0, tokens: null };
    this.labels.set(id, node);
    return node;
  }

  /** Label in the middle of the stroke, centered, at on-screen size. */
  private updateLabel(
    node: LabelNode,
    shape: ArrowShape,
    name: string,
    zoom: number,
    tokens: CanvasTokens,
  ): void {
    const { size, line, weight } = tokens.type.name;
    const height = line + 2 * HALO_WIDTH;
    node.text.setAttrs({
      text: name,
      fontSize: size,
      fontFamily: tokens.fontFamily,
      fontStyle: fontStyle(weight),
      fill: tokens.arrow.label,
      x: LABEL_PADDING,
      y: (height - size) / 2,
      width: undefined,
    });
    const width = Math.min(node.text.width() + 2 * LABEL_PADDING, LABEL_MAX_WIDTH);
    node.text.width(width - 2 * LABEL_PADDING);
    node.text.height(size);
    node.box.setAttrs({
      width,
      height,
      fill: tokens.arrow.labelBg,
      stroke: tokens.arrow.stroke,
      strokeWidth: HALO_WIDTH,
      cornerRadius: tokens.radius.sm,
    });
    node.group.setAttrs({
      x: shape.label.x - width / 2 / zoom,
      y: shape.label.y - height / 2 / zoom,
      scaleX: 1 / zoom,
      scaleY: 1 / zoom,
    });
    node.shape = shape;
    node.zoom = zoom;
    node.tokens = tokens;
  }
}

/**
 * Traces the arrows' bodies in one color and thickness: the stroke with a round join (straight and
 * curve) and, then, the `elbow` arrows' one with a mitered join, so the bend comes out sharp.
 * Leaves the round join at the end (the heads' one).
 */
function strokeBodies(
  painter: ArrowPainter,
  strokes: ArrowStrokes,
  color: string,
  width: number,
): void {
  painter.setAttr('lineJoin', 'round');
  painter.beginPath();
  for (const body of strokes.bodies) polyline(painter, body, false);
  painter.setAttr('strokeStyle', color);
  painter.setAttr('lineWidth', width);
  painter.stroke();
  if (strokes.corners.length === 0) return;
  painter.setAttr('lineJoin', 'miter');
  painter.beginPath();
  for (const body of strokes.corners) polyline(painter, body, false);
  painter.setAttr('strokeStyle', color);
  painter.setAttr('lineWidth', width);
  painter.stroke();
  painter.setAttr('lineJoin', 'round');
}

/** Adds the flat list of points to the path (`closed` closes the head's triangle). */
function polyline(painter: ArrowPainter, flat: readonly number[], closed: boolean): void {
  const x0 = flat[0];
  const y0 = flat[1];
  if (x0 === undefined || y0 === undefined) return;
  painter.moveTo(x0, y0);
  for (let i = 2; i + 1 < flat.length; i += 2) {
    painter.lineTo(flat[i] as number, flat[i + 1] as number);
  }
  // A single point (arrow smaller than the head): a round dot, so the stroke does not vanish.
  if (flat.length === 2) painter.lineTo(x0, y0);
  if (closed) painter.closePath();
}
