// Images on the canvas: bitmap (or a placeholder with a notice) and the name above.
import Konva from 'konva/lib/Core';
import { Image as KonvaImage } from 'konva/lib/shapes/Image';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import { t } from '../../i18n';
import {
  imageCanvasRect,
  isBackgroundContainer,
  type Placement,
  type ProjectContainer,
  type Rect,
} from '../../model';
import type { DisplayImage } from '../../store/displayImages';
import type { Frame, ViewFrame } from '../frame';
import type { CanvasTokens } from '../theme';
import { HALO_WIDTH, fontStyle, sameInputs } from './metrics';

/** Image label (screen px): distance from the edge and minimum width (the font is `t-cv-image`). */
const IMAGE_TITLE_GAP = 4;
const IMAGE_TITLE_MIN_WIDTH = 48;

export interface ImageNode {
  readonly group: Konva.Group;
  readonly bitmap: KonvaImage;
  readonly placeholder: KonvaRect;
  readonly label: KonvaText;
  /** Image name, as a label above it. */
  readonly title: KonvaText;
  /** Inputs of the last `updateNode`: equal, the node is already right. */
  drawn: readonly unknown[] | null;
}

export type ImageFrame = Pick<
  Frame,
  'project' | 'preview' | 'bitmaps' | 'tokens' | 'viewport' | 'view' | 'locale'
>;

/** Image nodes, reused between frames (one group per image). */
export class ImageRenderer {
  private readonly layer: Konva.Layer;
  private readonly nodes = new Map<string, ImageNode>();
  private titles: ReadonlyMap<string, Rect> = new Map();

  constructor(layer: Konva.Layer) {
    this.layer = layer;
  }

  /** Node drawn for the image (or `undefined` if it is not on the canvas). */
  node(id: string): ImageNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Rectangle of each container's name text with the label visible, in canvas coordinates
   * (from the last `render`). A container whose label is hidden by zoom is not included.
   */
  titleRects(): ReadonlyMap<string, Rect> {
    return this.titles;
  }

  /** `true` if the last `render` touched any node (created, rebuilt, reordered or removed). */
  changed = false;

  /** `true` if the last `render` touched any node taken to the drag group. */
  draggedChanged = false;

  /** The images that move in a gesture and the group they stay in until release (decisions 5 and 6). */
  private dragIds: ReadonlySet<string> | null = null;
  private dragTarget: Konva.Container | null = null;

  /**
   * Takes the images in `ids` to the drag group on the next `render` (the nodes are the same,
   * moved with `moveTo`), or returns them to the layer with `null`.
   */
  setDragged(ids: ReadonlySet<string> | null, target: Konva.Container): void {
    this.dragIds = ids && ids.size > 0 ? ids : null;
    this.dragTarget = target;
  }

  /**
   * Draws the images in the project order and returns the position of each
   * (with the preview of the gesture in progress applied). `changed` says whether any node changed.
   */
  render(frame: ImageFrame): ReadonlyMap<string, Placement> {
    let changed = false;
    let draggedChanged = false;
    // Position in the layer stack: images that move in a gesture do not count (they left it).
    let position = 0;
    const images = frame.project?.containers ?? [];
    const placements = new Map<string, Placement>();
    const titles = new Map<string, Rect>();
    const seen = new Set<string>();
    images.forEach((image) => {
      seen.add(image.id);
      const one = this.renderOne(image, frame, position);
      placements.set(image.id, one.placement);
      if (one.title) titles.set(image.id, one.title);
      if (!one.dragged) position++;
      if (one.layer) changed = true;
      if (one.drag) draggedChanged = true;
    });
    this.titles = titles;
    for (const [id, node] of this.nodes) {
      if (seen.has(id)) continue;
      node.group.destroy();
      this.nodes.delete(id);
      changed = true;
    }
    this.changed = changed;
    this.draggedChanged = draggedChanged;
    return placements;
  }

  /** Where the image node sits: the drag group if it moves in a gesture, otherwise the layer. */
  private homeOf(id: string): Konva.Container {
    return this.dragTarget && this.dragIds?.has(id) ? this.dragTarget : this.layer;
  }

  /**
   * Draws an image: puts the node in the right group (the layer, or the drag group if it moves),
   * rebuilds it if the inputs changed and fixes the position in the layer stack. Returns its position
   * (with the gesture preview), the name rectangle and what moved.
   */
  private renderOne(
    image: ProjectContainer,
    frame: ImageFrame,
    position: number,
  ): OneImage {
    const placement = placementOfImage(image, frame.preview);
    const fresh = !this.nodes.has(image.id);
    const node = this.nodes.get(image.id) ?? this.createNode(image.id);
    const home = this.homeOf(image.id);
    const dragged = home !== this.layer;
    // Leaves one and enters the other: both are redrawn.
    const moved = node.group.getParent() !== home;
    if (moved) node.group.moveTo(home);
    const redrawn = refreshNode(node, image, placement, frame);
    const reordered = !dragged && node.group.zIndex() !== position;
    if (reordered) node.group.zIndex(position);
    const title = titleRect(node, image, placement);
    return {
      placement,
      title,
      dragged,
      ...touchedBy(dragged, fresh, moved, redrawn, reordered),
    };
  }

  private createNode(id: string): ImageNode {
    const node: ImageNode = {
      group: new Konva.Group(),
      bitmap: new KonvaImage({ image: undefined }),
      placeholder: new KonvaRect(),
      label: new KonvaText({ align: 'center', verticalAlign: 'middle', wrap: 'char' }),
      title: new KonvaText({ wrap: 'none', ellipsis: true }),
      drawn: null,
    };
    node.group.add(node.placeholder, node.bitmap, node.label, node.title);
    this.layer.add(node.group);
    this.nodes.set(id, node);
    return node;
  }
}

/** What `renderOne` returns for an image. */
interface OneImage {
  readonly placement: Placement;
  readonly title: Rect | null;
  readonly dragged: boolean;
  /** The images layer moved. */
  readonly layer: boolean;
  /** The drag group moved. */
  readonly drag: boolean;
}

/** Image position: the gesture preview's, if it is its own, or the project's. */
function placementOfImage(
  image: ProjectContainer,
  preview: ImageFrame['preview'],
): Placement {
  return preview?.containerId === image.id ? preview.placement : image.placement;
}

/** Rebuilds the node if the inputs changed; `true` if it rebuilt. */
function refreshNode(
  node: ImageNode,
  image: ProjectContainer,
  placement: Placement,
  frame: ImageFrame,
): boolean {
  const zoom = frame.viewport.scale;
  const state = image.file === null ? undefined : frame.bitmaps.get(image.file);
  const inputs = [image, placement, state, frame.tokens, zoom, frame.view, frame.locale];
  if (sameInputs(node.drawn, inputs)) return false;
  node.drawn = inputs;
  updateNode(node, image, placement, state, frame.tokens, zoom, frame.view);
  return true;
}

/** Which group moved: the layer (new, swapped, rebuilt or reordered node) and/or the drag one. */
function touchedBy(
  dragged: boolean,
  fresh: boolean,
  moved: boolean,
  redrawn: boolean,
  reordered: boolean,
): { layer: boolean; drag: boolean } {
  return {
    layer: fresh || reordered || moved || (redrawn && !dragged),
    drag: moved || (redrawn && dragged),
  };
}

/** Name text rectangle (canvas), or `null` with the label hidden by zoom. */
function titleRect(
  node: ImageNode,
  image: ProjectContainer,
  placement: Placement,
): Rect | null {
  if (!node.title.visible()) return null;
  const rect = imageCanvasRect(image, placement);
  return {
    x: rect.x,
    y: rect.y + node.title.y(),
    width: Math.min(node.title.getTextWidth(), rect.width),
    height: node.title.height(),
  };
}

/**
 * A closed `ImageBitmap` (`close()`) ends up with zero width and height; drawing it throws
 * `InvalidStateError`. The node never receives one, even if the display map brings it.
 */
function isClosed(bitmap: ImageBitmap): boolean {
  return bitmap.width === 0 && bitmap.height === 0;
}

function updateNode(
  node: ImageNode,
  image: ProjectContainer,
  placement: Placement,
  state: DisplayImage<ImageBitmap> | undefined,
  tokens: CanvasTokens,
  zoom: number,
  view: ViewFrame | null,
): void {
  const rect = imageCanvasRect(image, placement);
  node.group.position({ x: rect.x, y: rect.y });
  const box = { width: rect.width, height: rect.height };
  // View mode: Containers turns on the container name and outline; Images, the bitmap.
  const containers = view?.containers ?? true;
  if (isBackgroundContainer(image)) {
    updateBackground(node, image, box, tokens, zoom, containers);
  } else {
    updatePhoto(node, image, box, state, tokens, zoom, view?.images ?? true);
  }
  updateTitle(node, image, rect.width, tokens, zoom, containers);
}

/**
 * Container without a file: a filled rectangle with the background color, always ready. Never the
 * "loading" placeholder: there is no bitmap to wait for. Without Containers (view mode) the outline
 * goes away
 * and the background stays: it is the screen.
 */
function updateBackground(
  node: ImageNode,
  image: ProjectContainer,
  box: { readonly width: number; readonly height: number },
  tokens: CanvasTokens,
  zoom: number,
  outline: boolean,
): void {
  node.bitmap.setAttrs({ ...box, visible: false, image: undefined });
  node.placeholder.setAttrs({
    ...box,
    visible: true,
    fill: image.background ?? tokens.surface,
    stroke: tokens.border,
    strokeEnabled: outline,
    strokeWidth: 1 / zoom,
    dash: [],
  });
  node.label.visible(false);
}

/**
 * Photo: the bitmap, or the placeholder with the "loading" notice or the missing-file one. Without
 * Images (view mode) the photo does not appear, nor the placeholder.
 */
function updatePhoto(
  node: ImageNode,
  image: ProjectContainer,
  box: { readonly width: number; readonly height: number },
  state: DisplayImage<ImageBitmap> | undefined,
  tokens: CanvasTokens,
  zoom: number,
  shown: boolean,
): void {
  const ready = shown && state?.status === 'ready' && !isClosed(state.bitmap);
  node.bitmap.setAttrs({
    ...box,
    visible: ready,
    image: ready ? state.bitmap : undefined,
  });

  const broken = state?.status === 'missing' || state?.status === 'error';
  node.placeholder.setAttrs({
    ...box,
    visible: shown && !ready,
    fill: tokens.surface,
    stroke: broken ? tokens.warningText : tokens.border,
    strokeEnabled: true,
    strokeWidth: (broken ? 2 : 1) / zoom,
    dash: broken ? [8 / zoom, 6 / zoom] : [],
  });

  const message =
    state?.status === 'missing'
      ? t('canvas.imageMissing')
      : state?.status === 'error'
        ? t('canvas.imageError')
        : null;
  const padding = Math.min(box.width, box.height) * 0.05;
  if (!shown || message === null) {
    node.label.visible(false);
    return;
  }
  node.label.setAttrs({
    visible: true,
    text: `⚠ ${message}\n${image.file ?? ''}`,
    x: padding,
    y: padding,
    width: Math.max(0, box.width - 2 * padding),
    height: Math.max(0, box.height - 2 * padding),
    fontSize: Math.max(
      Math.min(box.width, box.height) * 0.06,
      tokens.type.image.size / zoom,
    ),
    fontFamily: tokens.fontFamily,
    fill: broken ? tokens.warningText : tokens.textMuted,
  });
}

/** Label with the image name (or the file's) right above it. */
function updateTitle(
  node: ImageNode,
  image: ProjectContainer,
  width: number,
  tokens: CanvasTokens,
  zoom: number,
  shown: boolean,
): void {
  // Screen too small to fit a legible label (or without Containers in view mode): hides.
  if (!shown || width * zoom < IMAGE_TITLE_MIN_WIDTH) {
    node.title.visible(false);
    return;
  }
  const { size, line, weight } = tokens.type.image;
  node.title.setAttrs({
    visible: true,
    text: image.name ?? image.file ?? t('image.containerUntitled'),
    x: 0,
    y: -(line + IMAGE_TITLE_GAP) / zoom,
    width,
    height: line / zoom,
    fontSize: size / zoom,
    fontFamily: tokens.fontFamily,
    fontStyle: fontStyle(weight),
    fill: image.name === null ? tokens.textMuted : tokens.text,
    // Outline in the surface color (like the marking-name halo): the title reads over
    // an image from another root in both themes. Thickness in screen px.
    stroke: tokens.surface,
    strokeWidth: (2 * HALO_WIDTH) / zoom,
    fillAfterStrokeEnabled: true,
  });
}
