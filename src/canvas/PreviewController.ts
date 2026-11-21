// Read-only preview of a cross-page reference (stage #883, PG3, decision 13): a Konva stage of its
// own, with no gestures, that draws one root group of the project (already cut by the model) framed
// on one item. It reuses the drawers of the main canvas and owns nothing global: the bitmaps come
// from the shared `display` (it only calls `ensure`, never `retain`) and the drawings from the host.
import { effect } from '@preact/signals';
import Konva from 'konva/lib/Core';
import {
  projectIndex,
  structuralMarkingIds,
  type ComponentDrawings,
  type Project,
} from '../model';
import { drawnIds, fullVisibility } from '../store/derived';
import type { DisplayImages } from '../store/displayImages';
import { locale, showComponentsOnPhotos } from '../store/settings';
import type { SelectionItem } from '../store/ui';
import { visibleArrowShapes } from './arrowGeometry';
import { ComponentLayerRenderer } from './components/componentLayer';
import {
  sharedRemoteImageSource,
  type RemoteImageSource,
} from './components/remoteImages';
import type { PackageImages } from '../storage/packageImages';
import { cancelFrame, requestFrame, visibleArea, type Frame } from './frame';
import { previewSelection, previewViewport } from './previewFrame';
import { ArrowRenderer } from './renderers/arrows';
import { ImageRenderer } from './renderers/images';
import { MarkingRenderer } from './renderers/markings';
import { readCanvasTokens, watchTheme, type CanvasTokens } from './theme';
import type { Size, Viewport } from './viewport';

export interface PreviewControllerOptions {
  readonly container: HTMLElement;
  /** Already cut to the root group (`refPreviewProject(p, itemId)`). */
  readonly project: Project;
  /** Marking, container or arrow to frame and highlight. */
  readonly itemId: string;
  /** Shared bitmaps: the preview only asks for the cut project's files (`ensure`), never `retain`. */
  readonly display: DisplayImages<ImageBitmap>;
  /** Drawings of the cut project (the host computes them with its own cache). */
  readonly drawings: ComponentDrawings;
  readonly remoteImages?: RemoteImageSource;
  /** The package images of the applied libraries (decision 18 of stage #1903); absent = placeholder. */
  readonly packageImages?: PackageImages;
}

const NO_ITEMS: readonly SelectionItem[] = [];
const NO_INCOMPLETE: ReadonlySet<string> = new Set();
const NO_PLACEMENTS_FRAME: readonly never[] = [];

export class PreviewController {
  private readonly container: HTMLElement;
  private readonly display: DisplayImages<ImageBitmap>;
  private readonly remoteImages: RemoteImageSource;
  private readonly packageImages: PackageImages | null;
  /** Keys of the package images that finished since the last frame. */
  private readonly changedPackageKeys = new Set<string>();
  private project: Project;
  private itemId: string;
  private drawings: ComponentDrawings;
  private tokens: CanvasTokens = readCanvasTokens();
  private size: Size = { width: 1, height: 1 };
  private viewportValue: Viewport = { x: 0, y: 0, scale: 1 };

  private readonly stage: Konva.Stage;
  private readonly layers: {
    readonly images: Konva.Layer;
    readonly components: Konva.Layer;
    readonly markings: Konva.Layer;
    readonly floating: Konva.Layer;
  };
  private readonly floatingDrawings: Konva.Group;
  private readonly images: ImageRenderer;
  private readonly markings: MarkingRenderer;
  private readonly arrows: ArrowRenderer;
  private componentLayer: ComponentLayerRenderer;
  private floatingLayer: ComponentLayerRenderer;
  private componentPalette: CanvasTokens['component'];

  /** What depends only on the project, the item and the drawings: the same objects between frames. */
  private derived: Pick<
    Frame,
    'visibility' | 'drawn' | 'floating' | 'arrows' | 'selection' | 'items'
  > | null = null;
  private frame: Frame | null = null;
  private changedImageUrls = new Set<string>();
  private allImagesChanged = false;
  private frameRequest: number | null = null;
  private destroyed = false;
  private readonly cleanups: (() => void)[] = [];

  constructor(options: PreviewControllerOptions) {
    this.container = options.container;
    this.display = options.display;
    this.remoteImages = options.remoteImages ?? sharedRemoteImageSource();
    this.packageImages = options.packageImages ?? null;
    this.project = options.project;
    this.itemId = options.itemId;
    this.drawings = options.drawings;

    this.stage = new Konva.Stage({
      container: this.container as HTMLDivElement,
      width: 1,
      height: 1,
      listening: false,
    });
    const imageLayer = new Konva.Layer({ listening: false, name: 'images' });
    const componentGroup = new Konva.Layer({ listening: false, name: 'components' });
    const arrowMarkingLayer = new Konva.Layer({ listening: false, name: 'markings' });
    const arrowGroup = new Konva.Group({ listening: false });
    const markingGroup = new Konva.Group({ listening: false });
    arrowMarkingLayer.add(arrowGroup, markingGroup);
    const floatingTop = new Konva.Layer({ listening: false, name: 'floating' });
    this.stage.add(imageLayer, componentGroup, arrowMarkingLayer, floatingTop);
    this.layers = {
      images: imageLayer,
      components: componentGroup,
      markings: arrowMarkingLayer,
      floating: floatingTop,
    };
    this.images = new ImageRenderer(imageLayer);
    this.componentPalette = this.tokens.component;
    this.componentLayer = this.newComponentLayer(componentGroup);
    this.floatingDrawings = new Konva.Group({ listening: false });
    const floatingMarkings = new Konva.Group({ listening: false });
    floatingTop.add(this.floatingDrawings, floatingMarkings);
    this.floatingLayer = this.newComponentLayer(this.floatingDrawings);
    this.markings = new MarkingRenderer(markingGroup, floatingMarkings);
    this.arrows = new ArrowRenderer(arrowGroup);

    this.cleanups.push(
      watchTheme(() => {
        this.tokens = readCanvasTokens();
        this.requestRender();
      }),
      // Bitmaps arriving, the option of drawings on photos and the remote-image gates redraw.
      effect(() => {
        void this.display.images.value;
        this.requestRender();
      }),
      effect(() => {
        void locale.value;
        this.requestRender();
      }),
      effect(() => {
        void showComponentsOnPhotos.value;
        this.derived = null;
        this.requestRender();
      }),
      effect(() => {
        void this.remoteImages.gate.value;
        this.allImagesChanged = true;
        this.requestRender();
      }),
      this.remoteImages.subscribe((url) => {
        if (this.destroyed) return;
        this.changedImageUrls.add(url);
        this.requestRender();
      }),
      this.packageImages?.subscribe((key) => {
        if (this.destroyed) return;
        this.changedPackageKeys.add(key);
        this.requestRender();
      }) ?? (() => undefined),
      this.observeSize(),
    );
    this.ensureBitmaps();
    this.measure();
    this.requestRender();
  }

  /** Current viewport (for tests). */
  get viewport(): Viewport {
    return this.viewportValue;
  }

  update(
    next: Partial<Pick<PreviewControllerOptions, 'project' | 'itemId' | 'drawings'>>,
  ): void {
    if (this.destroyed) return;
    if (next.project !== undefined) this.project = next.project;
    if (next.itemId !== undefined) this.itemId = next.itemId;
    if (next.drawings !== undefined) this.drawings = next.drawings;
    this.derived = null;
    this.ensureBitmaps();
    this.viewportValue = previewViewport(this.project, this.itemId, this.size);
    this.requestRender();
  }

  /** Re-reads the container size (also done by the `ResizeObserver`). */
  resize(): void {
    this.measure();
  }

  destroy(): void {
    this.destroyed = true;
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    if (this.frameRequest !== null) cancelFrame(this.frameRequest);
    this.frameRequest = null;
    this.componentLayer.destroy();
    this.floatingLayer.destroy();
    this.arrows.destroy();
    this.markings.destroy();
    this.stage.destroy();
  }

  private newComponentLayer(parent: Konva.Group | Konva.Layer): ComponentLayerRenderer {
    return new ComponentLayerRenderer(parent, {
      placeholder: this.componentPalette,
      onImageLoaded: () => {
        if (!this.destroyed) this.requestRender();
      },
      remoteImage: (url) => this.remoteImages.resolve(url),
      ...(this.packageImages
        ? {
            packageImage: (specId: string, asset: string) =>
              this.packageImages?.resolve(specId, asset) ?? { state: 'loading' as const },
          }
        : {}),
    });
  }

  /** The cut project's bitmaps start loading (the shared display keeps them; nothing is retained here). */
  private ensureBitmaps(): void {
    for (const image of this.project.containers) {
      if (image.file !== null) this.display.ensure(image.file);
    }
  }

  private observeSize(): () => void {
    if (typeof ResizeObserver === 'undefined') return () => undefined;
    const observer = new ResizeObserver(() => this.measure());
    observer.observe(this.container);
    return () => observer.disconnect();
  }

  private measure(): void {
    if (this.destroyed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    if (width === this.size.width && height === this.size.height) return;
    this.size = { width, height };
    this.viewportValue = previewViewport(this.project, this.itemId, this.size);
    this.requestRender();
  }

  private derive(): NonNullable<PreviewController['derived']> {
    if (this.derived) return this.derived;
    const project = this.project;
    const selection = previewSelection(project, this.itemId);
    const containers = projectIndex(project).containers;
    const visibility = fullVisibility(project);
    const drawn = new Set(
      drawnIds(this.drawings, containers, showComponentsOnPhotos.peek(), new Set()),
    );
    for (const id of structuralMarkingIds(project)) drawn.add(id);
    const floating = new Set(project.markings.filter((m) => m.floating).map((m) => m.id));
    this.derived = {
      visibility,
      drawn,
      floating,
      arrows: visibleArrowShapes(project, visibility),
      selection,
      items: selection ? [selection] : NO_ITEMS,
    };
    return this.derived;
  }

  private buildFrame(): Frame {
    const derived = this.derive();
    return {
      project: this.project,
      readOnly: true,
      bitmaps: this.display.images.peek(),
      preview: null,
      draft: null,
      dropTarget: null,
      absorb: NO_PLACEMENTS_FRAME,
      hoverLock: null,
      hoverMarking: null,
      tokens: this.tokens,
      size: this.size,
      viewport: this.viewportValue,
      mode: 'navigate',
      locale: locale.peek(),
      incomplete: NO_INCOMPLETE,
      drawings: this.drawings,
      review: null,
      arrowDraft: null,
      marquee: null,
      view: null,
      pins: NO_PLACEMENTS_FRAME,
      pinSelected: null,
      draftPin: null,
      arrivals: null,
      ...derived,
    };
  }

  private requestRender(): void {
    if (this.destroyed || this.frameRequest !== null) return;
    this.frameRequest = requestFrame(() => {
      this.frameRequest = null;
      if (!this.destroyed) this.render();
    });
  }

  /** Draws everything: the preview is small and static, so each frame goes through the renderers. */
  private render(): void {
    const last = this.frame;
    if (last === null)
      this.viewportValue = previewViewport(this.project, this.itemId, this.size);
    const frame = this.buildFrame();
    this.frame = frame;
    const { size, viewport: v } = frame;
    this.stage.size({ width: size.width, height: size.height });
    this.stage.setAttrs({ x: v.x, y: v.y, scaleX: v.scale, scaleY: v.scale });
    this.refreshRemoteImages();
    this.refreshPackageImages();

    const placements = this.images.render(frame);
    this.rebuildOnThemeChange(frame);
    const area = visibleArea(size, v);
    const { drawn, floating } = frame;
    this.componentLayer.render(
      frame.drawings,
      (d) => drawn.has(d.markingId) && !floating.has(d.markingId),
      placements,
      v.scale,
      area,
    );
    this.floatingLayer.render(
      frame.drawings,
      (d) => drawn.has(d.markingId) && floating.has(d.markingId),
      placements,
      v.scale,
      area,
    );
    if (last?.viewport.scale !== v.scale) {
      this.componentLayer.setZoom(v.scale);
      this.floatingLayer.setZoom(v.scale);
    }
    this.arrows.render(frame, placements);
    this.markings.render(frame, placements);
    this.stage.batchDraw();
  }

  /** The placeholder colors are fixed when a drawing is mounted: a new theme remounts them. */
  private rebuildOnThemeChange(frame: Frame): void {
    if (frame.tokens.component === this.componentPalette) return;
    this.componentLayer.destroy();
    this.floatingLayer.destroy();
    this.componentPalette = frame.tokens.component;
    this.componentLayer = this.newComponentLayer(this.layers.components);
    this.floatingLayer = this.newComponentLayer(this.floatingDrawings);
  }

  private refreshPackageImages(): void {
    if (this.changedPackageKeys.size === 0) return;
    const keys = new Set(this.changedPackageKeys);
    this.changedPackageKeys.clear();
    this.componentLayer.refreshPackageImages(keys);
    this.floatingLayer.refreshPackageImages(keys);
  }

  private refreshRemoteImages(): void {
    if (!this.allImagesChanged && this.changedImageUrls.size === 0) return;
    const urls = this.allImagesChanged ? null : new Set(this.changedImageUrls);
    this.allImagesChanged = false;
    this.changedImageUrls.clear();
    this.componentLayer.refreshImages(urls);
    this.floatingLayer.refreshImages(urls);
  }
}
