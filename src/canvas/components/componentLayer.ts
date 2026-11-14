// The canvas components layer: the drawing of each marking that has a component.
// Imperative Konva (like the other renderers in `src/canvas/`); the drawing itself comes ready
// from the model (scene instantiated in the marking's box, in image pixels).
import Konva from 'konva/lib/Core';
import { IDENTITY_PLACEMENT, type Placement, type Rect } from '../../model';
import type { ScreenAnchor } from '../../model/components/componentFormat';
import type { FrameNode } from '../../model/components/scene';
import { type RemoteImageResult, type RenderPalette, renderScene } from './renderScene';

/** What the renderer draws for each marking (the model's `ComponentDrawing` has this shape). */
export interface LayerDrawing {
  readonly markingId: string;
  /** The marking's container; `null` = canvas marking (identity `placement` space). */
  readonly containerId: string | null;
  /** Scene instantiated in the marking's rectangle, in image pixels. */
  readonly root: FrameNode;
  /**
   * Drawing in screen pixels: `root` measures the component's `size` at the origin and is anchored at
   * `anchor` in the marking's `rect` (space pixels), with a fixed size at any zoom.
   */
  readonly screen?: { readonly anchor: ScreenAnchor; readonly rect: Rect };
  /**
   * Child of a slot with `clip` (v4): the parent slot's box, in the space of `root.transform`. The
   * drawing only shows inside it. The screen-pixel drawing ignores the clip.
   */
  readonly clip?: Rect;
}

/** Fraction (of the width and height) of each anchor's point. */
const ANCHOR_FRACTION: Record<ScreenAnchor, readonly [number, number]> = {
  'top-left': [0, 0],
  top: [0.5, 0],
  'top-right': [1, 0],
  left: [0, 0.5],
  center: [0.5, 0.5],
  right: [1, 0.5],
  'bottom-left': [0, 1],
  bottom: [0.5, 1],
  'bottom-right': [1, 1],
};

export interface ComponentLayerOptions {
  /** Colors of the image placeholder and of the unknown node (they come from the theme tokens). */
  readonly placeholder?: Partial<RenderPalette>;
  /** An embedded image (`data:`) finished loading: the caller asks for a frame. */
  readonly onImageLoaded?: () => void;
  /** Resolves the URL of the component's `image` node (app gates + loader); see `renderScene`. */
  readonly remoteImage?: (url: string) => RemoteImageResult;
}

interface Mounted {
  readonly drawing: LayerDrawing;
  readonly node: Konva.Group;
  /** Remote URLs the drawing uses (to redo only it when the image changes). */
  readonly imageUrls: readonly string[];
  /** How many images (`Konva.Image`) the drawing actually has (the placeholder does not count). */
  readonly images: number;
}

type Parent = Konva.Group | Konva.Layer;

/** Which group `place` touched: the image's (the usual layer) or the drag one. */
const TOUCHED_GROUP = 1;
const TOUCHED_MIRROR = 2;

/**
 * Draws the component drawings inside a Konva group (or layer). Each space has its own
 * group, positioned by its `placement` (image pixels → canvas; the canvas, with a null
 * `containerId`, uses the identity); inside it, one node per marking. It does not listen to events
 * (`listening: false`) and does not clip the content.
 */
export class ComponentLayerRenderer {
  private readonly imageGroups = new Map<string | null, Konva.Group>();
  private readonly mounted = new Map<string, Mounted>();
  /** The markings whose drawing moves in a gesture and the group they stay in until released (decisions 5 and 6). */
  private dragIds: ReadonlySet<string> | null = null;
  private dragTarget: Konva.Container | null = null;
  /**
   * One group per container in the drag group, with the same position and scale as the image's group: the
   * drawing that moves stays in it, and the image's group (which the drawing from outside keeps using) is
   * not touched.
   */
  private readonly mirrors = new Map<string | null, Konva.Group>();
  private dragChanged = false;
  /** Stage zoom: the screen-pixel drawing shrinks by it (and by the image scale). */
  private zoom = 1;
  private placements: ReadonlyMap<string, Placement> = new Map();
  /** The spaces of the last `render`, with all the drawings that appear (mounted or yet to mount). */
  private readonly spaces = new Map<
    string | null,
    { list: readonly LayerDrawing[]; placement: Placement }
  >();

  constructor(
    private readonly parent: Parent,
    private readonly options: ComponentLayerOptions = {},
  ) {}

  /**
   * How many drawings appear in the last frame, mounted or not (published on the container for the
   * e2e tests and the scripts: it does not depend on where the view is).
   */
  get size(): number {
    let total = 0;
    for (const { list } of this.spaces.values()) total += list.length;
    return total;
  }

  /** How many drawings are actually mounted (`renderScene`): only the ones that have been on screen. */
  get mountedCount(): number {
    return this.mounted.size;
  }

  /** How many images are actually drawn in the components (e2e test hook). */
  get imageCount(): number {
    let total = 0;
    for (const entry of this.mounted.values()) total += entry.images;
    return total;
  }

  /**
   * Takes the drawings of the markings in `ids` to the drag group on the next `render` (the nodes are
   * the same, moved with `moveTo`, never redone), or returns them to the image group with `null`.
   */
  setDragged(ids: ReadonlySet<string> | null, target: Konva.Container): void {
    this.dragIds = ids && ids.size > 0 ? ids : null;
    this.dragTarget = target;
  }

  /** `true` if any drawing in the drag group changed since the last call (and resets). */
  takeDragChanged(): boolean {
    const changed = this.dragChanged;
    this.dragChanged = false;
    return changed;
  }

  /**
   * Draws the drawings in `drawings` (the Map order is the drawing order, bottom to top)
   * that pass `visible` and whose image has a `placement`. Diff by identity: only the drawing
   * whose object changed is redone (`renderScene`); what disappeared is destroyed; the order is redone only
   * when it changes. Returns `true` if anything changed (created, redone, removed, moved or reordered).
   * `zoom` (default: the last) is the stage scale, for the screen-pixel drawings.
   */
  render(
    drawings: ReadonlyMap<string, LayerDrawing>,
    visible: (drawing: LayerDrawing) => boolean,
    placements: ReadonlyMap<string, Placement>,
    zoom: number = this.zoom,
    area: Rect | null = null,
  ): boolean {
    this.zoom = zoom;
    this.placements = placements;
    this.spaces.clear();
    const wanted = wantedBySpace(drawings, visible, placements);
    let changed = this.prune(wanted);
    const usedMirrors = new Set<string | null>();
    for (const [containerId, list] of wanted) {
      const placement = placementOf(placements, containerId);
      if (!placement) continue;
      if (this.renderSpace(containerId, list, placement, area, usedMirrors))
        changed = true;
    }
    if (this.dropMirrors(usedMirrors)) this.dragChanged = true;
    return changed;
  }

  /** Removes what is no longer in the list (or switched image); `true` if it destroyed anything. */
  private prune(wanted: ReadonlyMap<string | null, readonly LayerDrawing[]>): boolean {
    let changed = false;
    const keep = new Set<string>();
    for (const list of wanted.values()) for (const d of list) keep.add(d.markingId);
    for (const [markingId, entry] of this.mounted) {
      if (keep.has(markingId)) continue;
      entry.node.destroy();
      this.mounted.delete(markingId);
      changed = true;
    }
    for (const [containerId, group] of this.imageGroups) {
      if (wanted.has(containerId)) continue;
      group.destroy();
      this.imageGroups.delete(containerId);
      changed = true;
    }
    return changed;
  }

  /**
   * A space (container or canvas): puts the drawings of `list` in its group. On demand (decision 3
   * of the canvas-performance stage): a drawing not yet mounted is only born when its box crosses
   * `area` (the visible part of the canvas; `null` = everything); once mounted, it stays, and only hides outside the area.
   */
  private renderSpace(
    containerId: string | null,
    list: readonly LayerDrawing[],
    placement: Placement,
    area: Rect | null,
    usedMirrors: Set<string | null>,
  ): boolean {
    const { group, created } = this.groupOf(containerId);
    let changed = created;
    if (placeGroup(group, placement)) changed = true;
    this.spaces.set(containerId, { list, placement });
    const moving = this.movingOf(list);
    const mirror = moving.length > 0 ? this.mirrorOf(containerId, placement) : null;
    if (mirror) usedMirrors.add(containerId);
    const present: LayerDrawing[] = [];
    for (const drawing of list) {
      const dragged = mirror !== null && this.isDragged(drawing);
      const on = dragged || onScreen(drawing, placement, this.zoom, area);
      if (!on && !this.mounted.has(drawing.markingId)) continue;
      present.push(drawing);
      const home = dragged && mirror ? mirror : group;
      if (this.mountOne(drawing, home, group, placement, on)) changed = true;
    }
    const rest = present.filter((d) => !moving.includes(d));
    if (sortChildren(group, rest, this.mounted)) changed = true;
    if (
      mirror &&
      sortChildren(
        mirror,
        present.filter((d) => moving.includes(d)),
        this.mounted,
      )
    ) {
      this.dragChanged = true;
    }
    return changed;
  }

  private isDragged(drawing: LayerDrawing): boolean {
    return this.dragIds !== null && this.dragIds.has(drawing.markingId);
  }

  private movingOf(list: readonly LayerDrawing[]): LayerDrawing[] {
    return this.dragIds === null ? [] : list.filter((d) => this.isDragged(d));
  }

  /**
   * Mounts (or reuses) the drawing in `home`, adjusts the screen-pixel position and the visibility.
   * Returns `true` if it touched the usual layer (what touches the drag group goes in `dragChanged`).
   */
  private mountOne(
    drawing: LayerDrawing,
    home: Konva.Group,
    group: Konva.Group,
    placement: Placement,
    on: boolean,
  ): boolean {
    const touched = this.place(drawing, home, group);
    if ((touched & TOUCHED_MIRROR) !== 0) this.dragChanged = true;
    let changed = (touched & TOUCHED_GROUP) !== 0;
    const entry = this.mounted.get(drawing.markingId);
    if (!entry) return changed;
    const moved =
      placeScreen(entry.node, drawing, placement.scale, this.zoom) ||
      showNode(entry.node, on);
    if (moved && this.inMirror(entry.node)) this.dragChanged = true;
    else if (moved) changed = true;
    return changed;
  }

  /**
   * Pan or zoom: mounts the drawing that now crosses the screen and hides the mounted one that left it
   * (nothing is redrawn or reinstantiated). `area` is the visible part of the canvas and `zoom` the stage
   * scale. Returns `true` if any node changed.
   */
  reveal(area: Rect | null, zoom: number): boolean {
    let changed = false;
    for (const [containerId, space] of this.spaces) {
      if (this.revealSpace(containerId, space, area, zoom)) changed = true;
    }
    return changed;
  }

  private revealSpace(
    containerId: string | null,
    { list, placement }: { list: readonly LayerDrawing[]; placement: Placement },
    area: Rect | null,
    zoom: number,
  ): boolean {
    const group = this.imageGroups.get(containerId);
    if (!group) return false;
    let changed = false;
    let mountedNow = false;
    for (const drawing of list) {
      if (this.isDragged(drawing)) continue;
      const on = onScreen(drawing, placement, zoom, area);
      const entry = this.mounted.get(drawing.markingId);
      if (entry) {
        if (showNode(entry.node, on)) changed = true;
      } else if (on) {
        this.mountOne(drawing, group, group, placement, true);
        mountedNow = true;
        changed = true;
      }
    }
    if (mountedNow) {
      const present = list.filter(
        (d) => !this.isDragged(d) && this.mounted.has(d.markingId),
      );
      sortChildren(group, present, this.mounted);
    }
    return changed;
  }

  /**
   * The stage zoom changed: redoes only the position and scale of the screen-pixel drawings (nothing is
   * redrawn). Returns `true` if any node changed.
   */
  setZoom(zoom: number): boolean {
    if (zoom === this.zoom) return false;
    this.zoom = zoom;
    let changed = false;
    for (const entry of this.mounted.values()) {
      const placement = placementOf(this.placements, entry.drawing.containerId);
      if (placement && placeScreen(entry.node, entry.drawing, placement.scale, zoom)) {
        if (this.inMirror(entry.node)) this.dragChanged = true;
        else changed = true;
      }
    }
    return changed;
  }

  /**
   * Redoes only the drawings that use any of the `urls` (the image finished loading, failed or
   * left the cache), or all those that use any remote image when `urls` is `null` (the
   * consent or a switch changed). The new node takes the old one's place in the order.
   * Returns `true` if any was redone.
   */
  refreshImages(urls: ReadonlySet<string> | null): boolean {
    let changed = false;
    for (const [markingId, entry] of this.mounted) {
      if (entry.imageUrls.length === 0) continue;
      if (urls !== null && !entry.imageUrls.some((url) => urls.has(url))) continue;
      const parent = entry.node.getParent();
      const index = entry.node.zIndex();
      entry.node.destroy();
      const { node, imageUrls, images } = this.draw(entry.drawing);
      if (parent) {
        parent.add(node);
        node.zIndex(index);
        const placement = placementOf(this.placements, entry.drawing.containerId);
        if (placement) placeScreen(node, entry.drawing, placement.scale, this.zoom);
      }
      this.mounted.set(markingId, { drawing: entry.drawing, node, imageUrls, images });
      if (parent && this.isMirror(parent)) this.dragChanged = true;
      else changed = true;
    }
    return changed;
  }

  /** Destroys everything the renderer created (the received group is left to whoever created it). */
  destroy(): void {
    for (const group of this.imageGroups.values()) group.destroy();
    for (const mirror of this.mirrors.values()) mirror.destroy();
    this.imageGroups.clear();
    this.mirrors.clear();
    this.mounted.clear();
  }

  private groupOf(containerId: string | null): { group: Konva.Group; created: boolean } {
    const existing = this.imageGroups.get(containerId);
    if (existing) return { group: existing, created: false };
    const group = new Konva.Group({ listening: false, name: 'component-layer-image' });
    group.setAttr('containerId', containerId ?? '');
    this.parent.add(group);
    this.imageGroups.set(containerId, group);
    return { group, created: true };
  }

  /** The container's group inside the drag group, with the position and scale of the image's group. */
  private mirrorOf(containerId: string | null, placement: Placement): Konva.Group {
    let mirror = this.mirrors.get(containerId);
    if (!mirror) {
      mirror = new Konva.Group({ listening: false, name: 'component-layer-drag' });
      this.dragTarget?.add(mirror);
      this.mirrors.set(containerId, mirror);
      this.dragChanged = true;
    }
    if (placeGroup(mirror, placement)) this.dragChanged = true;
    return mirror;
  }

  /** Destroys the drag groups of the containers that no longer have a drawing moving. */
  private dropMirrors(used: ReadonlySet<string | null>): boolean {
    let dropped = false;
    for (const [containerId, mirror] of this.mirrors) {
      if (used.has(containerId)) continue;
      mirror.destroy();
      this.mirrors.delete(containerId);
      dropped = true;
    }
    return dropped;
  }

  private isMirror(parent: Konva.Container): boolean {
    for (const mirror of this.mirrors.values()) if (mirror === parent) return true;
    return false;
  }

  private inMirror(node: Konva.Node): boolean {
    const parent = node.getParent();
    return parent !== null && this.isMirror(parent);
  }

  /**
   * Puts the `drawing` in `home` (the image group or the drag one): the node that already exists and
   * is right only changes group (`moveTo`, the same node); the one with a new object is redone. Returns which
   * group it touched (`TOUCHED_*`), so the frame redraws the right layer.
   */
  private place(drawing: LayerDrawing, home: Konva.Group, group: Konva.Group): number {
    const current = this.mounted.get(drawing.markingId);
    const parent = current?.node.getParent() ?? null;
    const into = this.touchedBy(home, group);
    const reused = current ? this.reuse(current, drawing, home, group) : null;
    if (reused !== null) return reused;
    current?.node.destroy();
    const { node, imageUrls, images } = this.draw(drawing);
    home.add(node);
    this.mounted.set(drawing.markingId, { drawing, node, imageUrls, images });
    return parent === null ? into : this.touchedBy(parent, group) | into;
  }

  /**
   * The mounted node is usable if it is of the same drawing object and sits in one of this renderer's
   * groups: it only changes group. `null` if it needs to be redone.
   */
  private reuse(
    current: Mounted,
    drawing: LayerDrawing,
    home: Konva.Group,
    group: Konva.Group,
  ): number | null {
    const parent = current.node.getParent();
    if (current.drawing !== drawing || parent === null) return null;
    if (parent === home) return 0;
    if (parent !== group && !this.isMirror(parent)) return null;
    current.node.moveTo(home);
    return this.touchedBy(parent, group) | this.touchedBy(home, group);
  }

  private touchedBy(parent: Konva.Container, group: Konva.Group): number {
    return parent === group ? TOUCHED_GROUP : TOUCHED_MIRROR;
  }

  private draw(drawing: LayerDrawing): {
    node: Konva.Group;
    imageUrls: readonly string[];
    images: number;
  } {
    const { root, imageUrls } = renderScene(
      { root: drawing.root, warnings: [] },
      {
        palette: this.options.placeholder,
        showSlots: false,
        onImageLoaded: this.options.onImageLoaded,
        // The main canvas does not read pixels: an `opaque` image (no CORS) shows up.
        pixelSafe: false,
        ...(this.options.remoteImage ? { remoteImage: this.options.remoteImage } : {}),
      },
    );
    root.listening(false);
    const node = drawing.clip && !drawing.screen ? clipped(root, drawing.clip) : root;
    node.setAttr('markingId', drawing.markingId);
    return { node, imageUrls, images: root.find('Image').length };
  }
}

/**
 * Wraps the scene in a group (no transform, in the container's space) clipped by the slot's
 * box: the `root` matrix does not enter the computation, the clip applies in the space where `clip` was measured.
 */
function clipped(root: Konva.Group, { x, y, width, height }: Rect): Konva.Group {
  const wrapper = new Konva.Group({ listening: false, name: root.name() });
  wrapper.clipFunc((ctx) => {
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.closePath();
  });
  wrapper.add(root);
  return wrapper;
}

/** The drawings that appear, per space, in drawing order (only the ones that have a position). */
function wantedBySpace(
  drawings: ReadonlyMap<string, LayerDrawing>,
  visible: (drawing: LayerDrawing) => boolean,
  placements: ReadonlyMap<string, Placement>,
): Map<string | null, LayerDrawing[]> {
  const wanted = new Map<string | null, LayerDrawing[]>();
  for (const drawing of drawings.values()) {
    if (placementOf(placements, drawing.containerId) === undefined || !visible(drawing)) {
      continue;
    }
    const list = wanted.get(drawing.containerId);
    if (list) list.push(drawing);
    else wanted.set(drawing.containerId, [drawing]);
  }
  return wanted;
}

/** The space's position: the container's or, on the canvas (`null`), the identity. */
function placementOf(
  placements: ReadonlyMap<string, Placement>,
  containerId: string | null,
): Placement | undefined {
  return containerId === null ? IDENTITY_PLACEMENT : placements.get(containerId);
}

/**
 * Screen-pixel drawing: shrinks the node by the image scale and the zoom (fixed size on
 * screen) and places it so the drawing's anchor point lands on the same point of the marking's
 * rectangle. Returns `true` if anything changed; a drawing without `screen` is not touched.
 */
function placeScreen(
  node: Konva.Group,
  { screen, root }: LayerDrawing,
  imageScale: number,
  zoom: number,
): boolean {
  if (!screen) return false;
  const k = 1 / (zoom * imageScale);
  const [fx, fy] = ANCHOR_FRACTION[screen.anchor];
  const x = screen.rect.x + fx * (screen.rect.width - root.width * k);
  const y = screen.rect.y + fy * (screen.rect.height - root.height * k);
  if (node.x() === x && node.y() === y && node.scaleX() === k && node.scaleY() === k) {
    return false;
  }
  node.setAttrs({ x, y, scaleX: k, scaleY: k });
  return true;
}

/** Margin (screen px) around the drawing's box: shadow, stroke and whatever exceeds the box. */
const ON_SCREEN_MARGIN = 64;

/**
 * Does the drawing's box cross the visible part of the canvas? Only to decide whether the drawing is born and
 * shows; `area` `null` = everything in view. The box comes from the scene itself (matrix and `root` size) or,
 * for the screen-pixel drawing, from the anchor in the marking's rectangle.
 */
function onScreen(
  drawing: LayerDrawing,
  placement: Placement,
  zoom: number,
  area: Rect | null,
): boolean {
  if (area === null) return true;
  const { root, screen } = drawing;
  let box: Rect;
  if (screen) {
    const k = 1 / (zoom * placement.scale);
    const [fx, fy] = ANCHOR_FRACTION[screen.anchor];
    const width = root.width * k;
    const height = root.height * k;
    box = {
      x: screen.rect.x + fx * (screen.rect.width - width),
      y: screen.rect.y + fy * (screen.rect.height - height),
      width,
      height,
    };
  } else {
    const visible = cachedVisibleBox(drawing);
    // Child entirely outside the slot's box: there is nothing to show.
    if (visible === null) return false;
    box = visible;
  }
  const margin = ON_SCREEN_MARGIN / zoom;
  const x = placement.x + box.x * placement.scale;
  const y = placement.y + box.y * placement.scale;
  return (
    x + box.width * placement.scale + margin > area.x &&
    x - margin < area.x + area.width &&
    y + box.height * placement.scale + margin > area.y &&
    y - margin < area.y + area.height
  );
}

/** Visible box of the drawing: the scene's, reduced by the child's slot `clip` (if it has one). */
const visibleBoxes = new WeakMap<LayerDrawing, Rect | null>();

function cachedVisibleBox(drawing: LayerDrawing): Rect | null {
  const scene = cachedSceneBox(drawing.root);
  if (!drawing.clip) return scene;
  let box = visibleBoxes.get(drawing);
  if (box === undefined) {
    box = intersectRects(scene, drawing.clip);
    visibleBoxes.set(drawing, box);
  }
  return box;
}

/** Intersection of two rectangles; `null` if they do not touch (touching still counts). */
function intersectRects(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right < x || bottom < y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

/** The box only depends on the scene (project data): pan and zoom do not recompute it. */
const sceneBoxes = new WeakMap<FrameNode, Rect>();

function cachedSceneBox(root: FrameNode): Rect {
  let box = sceneBoxes.get(root);
  if (!box) {
    box = sceneBox(root);
    sceneBoxes.set(root, box);
  }
  return box;
}

/** Box (marking space) of a scene with matrix `[a, b, c, d, e, f]` and size `width × height`. */
function sceneBox({ transform, width, height }: FrameNode): Rect {
  const [a, b, c, d, e, f] = transform;
  const xs = [e, a * width + e, c * height + e, a * width + c * height + e];
  const ys = [f, b * width + f, d * height + f, b * width + d * height + f];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Hides or shows the node; `true` if it changed. */
function showNode(node: Konva.Group, show: boolean): boolean {
  if (node.visible() === show) return false;
  node.visible(show);
  return true;
}

/** Positions the image group; `true` if anything changed. */
function placeGroup(group: Konva.Group, { x, y, scale }: Placement): boolean {
  if (group.x() === x && group.y() === y && group.scaleX() === scale) return false;
  group.position({ x, y });
  group.scale({ x: scale, y: scale });
  return true;
}

/** Leaves the group's children in the order of `list`; `true` if it had to touch anything. */
function sortChildren(
  group: Konva.Group,
  list: readonly LayerDrawing[],
  mounted: ReadonlyMap<string, Mounted>,
): boolean {
  const children = group.getChildren();
  const sameOrder = list.every(
    (drawing, index) => children[index] === mounted.get(drawing.markingId)?.node,
  );
  if (sameOrder) return false;
  list.forEach((drawing, index) => {
    mounted.get(drawing.markingId)?.node.zIndex(index);
  });
  return true;
}
