// Canvas imperativo com Konva. Observa os signals do projeto e da UI, desenha e
// transforma os gestos em actions. Único lugar (com `CanvasHost`) que conhece o Konva.
import { effect, signal, untracked } from '@preact/signals';
import Konva from 'konva/lib/Core';
import { Image as KonvaImage } from 'konva/lib/shapes/Image';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import { t } from '../i18n';
import {
  imageCanvasRect,
  type Placement,
  type Project,
  type ProjectImage,
} from '../model';
import type { DisplayImage, DisplayImages } from '../store/displayImages';
import type { ProjectStore } from '../store/history';
import type { ProjectActions } from '../store/project';
import type { EditorUi } from '../store/ui';
import {
  CORNERS,
  cornerAt,
  cornerPoint,
  imageAt,
  imagesBounds,
  pointInRect,
  resizeFromCorner,
  type Corner,
} from './imageGeometry';
import { readCanvasTokens, watchTheme, type CanvasTokens } from './theme';
import {
  EMPTY_CANVAS_RECT,
  fitRect,
  panBy,
  pinch,
  screenToCanvas,
  wheelZoomFactor,
  zoomAt,
  type Point,
  type Size,
  type Viewport,
} from './viewport';

/** Distância (px de tela) a partir da qual um toque vira arrasto. */
const DRAG_THRESHOLD = 6;
/** Lado visível da alça de redimensionamento (px de tela). */
const HANDLE_SIZE = 14;
/** Metade da área de toque da alça (px de tela): 22 → 44 px, acima do mínimo de 24. */
const HANDLE_HIT_RADIUS = 22;
const SELECTION_STROKE = 2;

export interface CanvasControllerOptions {
  readonly container: HTMLDivElement;
  readonly store: ProjectStore;
  readonly actions: ProjectActions;
  readonly display: DisplayImages<ImageBitmap>;
  readonly ui: EditorUi;
}

/** Posição exibida durante um gesto de imagem (segue o dedo, mesmo se inválida). */
interface ImagePreview {
  readonly imageId: string;
  readonly placement: Placement;
  readonly valid: boolean;
}

type Intent =
  | { readonly kind: 'pan' }
  | { readonly kind: 'move'; readonly imageId: string }
  | { readonly kind: 'resize'; readonly imageId: string; readonly corner: Corner };

type Gesture =
  /** Dedo pressionado, ainda sem passar do limiar de arrasto (pode ser um toque). */
  | {
      readonly kind: 'pending';
      readonly pointerId: number;
      readonly start: Point;
      readonly intent: Intent;
    }
  | { readonly kind: 'pan'; readonly pointerId: number; last: Point }
  | {
      readonly kind: 'move';
      readonly pointerId: number;
      readonly imageId: string;
      readonly startCanvas: Point;
      readonly startPlacement: Placement;
    }
  | {
      readonly kind: 'resize';
      readonly pointerId: number;
      readonly imageId: string;
      readonly corner: Corner;
      readonly startPlacement: Placement;
    }
  /** Dois dedos. Termina quando todos saem da tela. */
  | { readonly kind: 'pinch' };

interface ImageNode {
  readonly group: Konva.Group;
  readonly bitmap: KonvaImage;
  readonly placeholder: KonvaRect;
  readonly label: KonvaText;
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName))
  );
}

export class CanvasController {
  private readonly container: HTMLDivElement;
  private readonly store: ProjectStore;
  private readonly actions: ProjectActions;
  private readonly display: DisplayImages<ImageBitmap>;
  private readonly ui: EditorUi;

  private readonly viewport = signal<Viewport>({ x: 0, y: 0, scale: 1 });
  private readonly size = signal<Size>({ width: 0, height: 0 });
  private readonly preview = signal<ImagePreview | null>(null);
  private readonly tokens = signal<CanvasTokens>(readCanvasTokens());

  private readonly stage: Konva.Stage;
  private readonly imageLayer = new Konva.Layer({ listening: false });
  private readonly overlayLayer = new Konva.Layer({ listening: false });
  private readonly selectionOutline = new KonvaRect({ visible: false });
  private readonly handles = new Map<Corner, KonvaRect>();
  private readonly nodes = new Map<string, ImageNode>();

  private readonly pointers = new Map<number, Point>();
  private gesture: Gesture | null = null;
  private spaceDown = false;
  private fitted = false;
  private readonly cleanups: (() => void)[] = [];

  constructor(options: CanvasControllerOptions) {
    this.container = options.container;
    this.store = options.store;
    this.actions = options.actions;
    this.display = options.display;
    this.ui = options.ui;

    this.stage = new Konva.Stage({ container: this.container, width: 1, height: 1 });
    this.stage.add(this.imageLayer, this.overlayLayer);
    this.overlayLayer.add(this.selectionOutline);
    for (const corner of CORNERS) {
      const handle = new KonvaRect({ visible: false });
      this.handles.set(corner, handle);
      this.overlayLayer.add(handle);
    }

    this.bindEvents();
    this.cleanups.push(
      watchTheme(() => (this.tokens.value = readCanvasTokens())),
      effect(() => this.loadBitmaps()),
      effect(() => this.render()),
    );
  }

  /** Enquadra todas as imagens (ou uma área padrão, com o canvas vazio). */
  fitAll(): void {
    const size = this.size.peek();
    if (size.width === 0) return;
    const images = this.store.project.peek()?.images ?? [];
    this.viewport.value = fitRect(imagesBounds(images) ?? EMPTY_CANVAS_RECT, size);
  }

  /** Cancela o gesto de mover/redimensionar em andamento. `true` se havia um. */
  cancelInteraction(): boolean {
    const g = this.gesture;
    if (g?.kind !== 'move' && g?.kind !== 'resize') return false;
    this.actions.cancelGesture();
    this.preview.value = null;
    this.gesture = { kind: 'pinch' }; // Ignora o resto do arrasto até soltar.
    return true;
  }

  destroy(): void {
    if (this.gesture?.kind === 'move' || this.gesture?.kind === 'resize') {
      this.actions.cancelGesture();
    }
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.stage.destroy();
  }

  // ---- Renderização ----

  private loadBitmaps(): void {
    const images = this.store.project.value?.images ?? [];
    untracked(() => {
      for (const image of images) this.display.ensure(image.file);
    });
  }

  private render(): void {
    const project = this.store.project.value;
    const bitmaps = this.display.images.value;
    const preview = this.preview.value;
    const tokens = this.tokens.value;
    const size = this.size.value;
    const v = this.viewport.value;

    this.stage.size({ width: Math.max(1, size.width), height: Math.max(1, size.height) });
    this.stage.position({ x: v.x, y: v.y });
    this.stage.scale({ x: v.scale, y: v.scale });

    const images = project?.images ?? [];
    const seen = new Set<string>();
    images.forEach((image, index) => {
      seen.add(image.id);
      const placement =
        preview?.imageId === image.id ? preview.placement : image.placement;
      const node = this.nodes.get(image.id) ?? this.createNode(image.id);
      this.updateNode(node, image, placement, bitmaps.get(image.file), tokens, v.scale);
      node.group.zIndex(index);
    });
    for (const [id, node] of this.nodes) {
      if (seen.has(id)) continue;
      node.group.destroy();
      this.nodes.delete(id);
    }

    this.renderSelection(project, preview, tokens, v.scale);
    this.stage.batchDraw();
  }

  private createNode(id: string): ImageNode {
    const node: ImageNode = {
      group: new Konva.Group(),
      bitmap: new KonvaImage({ image: undefined }),
      placeholder: new KonvaRect(),
      label: new KonvaText({ align: 'center', verticalAlign: 'middle', wrap: 'char' }),
    };
    node.group.add(node.placeholder, node.bitmap, node.label);
    this.imageLayer.add(node.group);
    this.nodes.set(id, node);
    return node;
  }

  private updateNode(
    node: ImageNode,
    image: ProjectImage,
    placement: Placement,
    state: DisplayImage<ImageBitmap> | undefined,
    tokens: CanvasTokens,
    zoom: number,
  ): void {
    const rect = imageCanvasRect(image, placement);
    node.group.position({ x: rect.x, y: rect.y });
    const box = { width: rect.width, height: rect.height };

    const ready = state?.status === 'ready';
    node.bitmap.setAttrs({
      ...box,
      visible: ready,
      image: ready ? state.bitmap : undefined,
    });

    const broken = state?.status === 'missing' || state?.status === 'error';
    node.placeholder.setAttrs({
      ...box,
      visible: !ready,
      fill: tokens.surface,
      stroke: broken ? tokens.warning : tokens.border,
      strokeWidth: (broken ? 2 : 1) / zoom,
      dash: broken ? [8 / zoom, 6 / zoom] : [],
    });

    const message =
      state?.status === 'missing'
        ? t('canvas.imageMissing')
        : state?.status === 'error'
          ? t('canvas.imageError')
          : null;
    const padding = Math.min(rect.width, rect.height) * 0.05;
    node.label.setAttrs({
      visible: message !== null,
      text: message ? `⚠ ${message}\n${image.file}` : '',
      x: padding,
      y: padding,
      width: Math.max(0, rect.width - 2 * padding),
      height: Math.max(0, rect.height - 2 * padding),
      fontSize: Math.max(Math.min(rect.width, rect.height) * 0.06, 12 / zoom),
      fill: broken ? tokens.warning : tokens.textMuted,
    });
  }

  private renderSelection(
    project: Project | null,
    preview: ImagePreview | null,
    tokens: CanvasTokens,
    zoom: number,
  ): void {
    const selection = this.ui.selection.value;
    const image =
      selection?.kind === 'image'
        ? project?.images.find((i) => i.id === selection.id)
        : undefined;
    const readOnly = this.store.readOnly.value;
    if (!image) {
      this.selectionOutline.visible(false);
      for (const handle of this.handles.values()) handle.visible(false);
      return;
    }
    const placement = preview?.imageId === image.id ? preview.placement : image.placement;
    const color =
      preview?.imageId === image.id && !preview.valid ? tokens.danger : tokens.accent;
    const rect = imageCanvasRect(image, placement);
    this.selectionOutline.setAttrs({
      ...rect,
      visible: true,
      stroke: color,
      strokeWidth: (SELECTION_STROKE * (preview && !preview.valid ? 2 : 1)) / zoom,
    });
    const side = HANDLE_SIZE / zoom;
    for (const [corner, handle] of this.handles) {
      const c = cornerPoint(rect, corner);
      handle.setAttrs({
        visible: !readOnly,
        x: c.x - side / 2,
        y: c.y - side / 2,
        width: side,
        height: side,
        fill: tokens.surface,
        stroke: color,
        strokeWidth: SELECTION_STROKE / zoom,
      });
    }
  }

  // ---- Entrada (ponteiro, roda, teclado) ----

  private bindEvents(): void {
    const el = this.container;
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      handler: (e: HTMLElementEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      el.addEventListener(type, handler, options);
      this.cleanups.push(() => el.removeEventListener(type, handler, options));
    };
    on('pointerdown', (e) => this.onPointerDown(e));
    on('pointermove', (e) => this.onPointerMove(e));
    on('pointerup', (e) => this.onPointerUp(e, false));
    on('pointercancel', (e) => this.onPointerUp(e, true));
    on('wheel', (e) => this.onWheel(e), { passive: false });
    on('contextmenu', (e) => e.preventDefault());

    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isEditable(e.target)) return;
      this.spaceDown = e.type === 'keydown';
      e.preventDefault();
      this.updateCursor(null);
    };
    const onBlur = () => (this.spaceDown = false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    this.cleanups.push(() => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
    });

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => this.onResize());
      observer.observe(el);
      this.cleanups.push(() => observer.disconnect());
    }
    this.onResize();
  }

  private onResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.size.value = { width, height };
    if (!this.fitted && width > 0 && height > 0) {
      this.fitted = true;
      this.fitAll();
    }
  }

  private screenPoint(e: { clientX: number; clientY: number }): Point {
    const box = this.container.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  }

  private toCanvas(p: Point): Point {
    return screenToCanvas(this.viewport.peek(), p);
  }

  private selectedImage(): ProjectImage | null {
    const selection = this.ui.selection.peek();
    if (selection?.kind !== 'image') return null;
    return this.store.project.peek()?.images.find((i) => i.id === selection.id) ?? null;
  }

  /** O que um arrasto começando em `p` (tela) faria. */
  private intentAt(p: Point): Intent {
    const image = this.selectedImage();
    if (this.spaceDown || !image || this.store.readOnly.peek()) return { kind: 'pan' };
    const rect = imageCanvasRect(image, image.placement);
    const zoom = this.viewport.peek().scale;
    const canvasPoint = this.toCanvas(p);
    const corner = cornerAt(rect, canvasPoint, HANDLE_HIT_RADIUS / zoom);
    if (corner) return { kind: 'resize', imageId: image.id, corner };
    if (pointInRect(canvasPoint, rect)) return { kind: 'move', imageId: image.id };
    return { kind: 'pan' };
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    const p = this.screenPoint(e);
    this.pointers.set(e.pointerId, p);
    try {
      this.container.setPointerCapture(e.pointerId);
    } catch {
      // Sem captura, o gesto termina se o ponteiro sair do canvas.
    }

    if (this.pointers.size >= 2) {
      this.cancelInteraction();
      this.gesture = { kind: 'pinch' };
      return;
    }
    const intent: Intent = e.button === 1 ? { kind: 'pan' } : this.intentAt(p);
    this.gesture = { kind: 'pending', pointerId: e.pointerId, start: p, intent };
  }

  private onPointerMove(e: PointerEvent): void {
    const p = this.screenPoint(e);
    const previous = this.pointers.get(e.pointerId);
    if (!previous) {
      if (e.pointerType === 'mouse') this.updateCursor(p);
      return;
    }
    this.pointers.set(e.pointerId, p);
    const g = this.gesture;
    if (!g) return;

    if (g.kind === 'pinch') {
      const [first, second] = [...this.pointers.entries()];
      if (!first || !second) return;
      const [idA, a1] = first;
      const [idB, b1] = second;
      const a0 = idA === e.pointerId ? previous : a1;
      const b0 = idB === e.pointerId ? previous : b1;
      this.viewport.value = pinch(this.viewport.peek(), a0, b0, a1, b1);
      return;
    }
    if (g.pointerId !== e.pointerId) return;

    switch (g.kind) {
      case 'pending':
        if (Math.hypot(p.x - g.start.x, p.y - g.start.y) >= DRAG_THRESHOLD) {
          this.startDrag(g.pointerId, g.start, g.intent);
          this.onPointerMove(e);
        }
        return;
      case 'pan':
        this.viewport.value = panBy(this.viewport.peek(), p.x - g.last.x, p.y - g.last.y);
        g.last = p;
        return;
      case 'move': {
        const c = this.toCanvas(p);
        const { startPlacement: s, startCanvas } = g;
        this.previewPlacement(g.imageId, {
          x: s.x + c.x - startCanvas.x,
          y: s.y + c.y - startCanvas.y,
          scale: s.scale,
        });
        return;
      }
      case 'resize': {
        const image = this.store.project.peek()?.images.find((i) => i.id === g.imageId);
        if (!image) return;
        const placement = resizeFromCorner(
          image,
          g.startPlacement,
          g.corner,
          this.toCanvas(p),
        );
        this.previewPlacement(g.imageId, placement);
        return;
      }
    }
  }

  private startDrag(pointerId: number, start: Point, intent: Intent): void {
    if (intent.kind !== 'pan') {
      const image = this.store.project
        .peek()
        ?.images.find((i) => i.id === intent.imageId);
      if (image && this.actions.beginGesture().ok) {
        this.gesture =
          intent.kind === 'move'
            ? {
                kind: 'move',
                pointerId,
                imageId: image.id,
                startCanvas: this.toCanvas(start),
                startPlacement: image.placement,
              }
            : {
                kind: 'resize',
                pointerId,
                imageId: image.id,
                corner: intent.corner,
                startPlacement: image.placement,
              };
        return;
      }
    }
    this.gesture = { kind: 'pan', pointerId, last: start };
  }

  private previewPlacement(imageId: string, placement: Placement): void {
    const result = this.actions.previewImagePlacement(imageId, placement);
    this.preview.value = { imageId, placement, valid: result.ok };
  }

  private onPointerUp(e: PointerEvent, cancelled: boolean): void {
    if (!this.pointers.delete(e.pointerId)) return;
    const g = this.gesture;
    if (!g) return;
    if (g.kind === 'pinch') {
      if (this.pointers.size === 0) this.gesture = null;
      return;
    }
    if (g.pointerId !== e.pointerId) return;
    this.gesture = null;
    if (g.kind === 'pending' && !cancelled) this.tap(g.start);
    if (g.kind === 'move' || g.kind === 'resize') {
      // Volta para a última posição válida (a do projeto) e grava uma entrada.
      if (cancelled) this.actions.cancelGesture();
      else this.actions.commitGesture();
      this.preview.value = null;
    }
    if (e.pointerType === 'mouse') this.updateCursor(this.screenPoint(e));
  }

  private tap(p: Point): void {
    const images = this.store.project.peek()?.images ?? [];
    const image = imageAt(images, this.toCanvas(p));
    this.ui.selection.value = image ? { kind: 'image', id: image.id } : null;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = wheelZoomFactor(e.deltaY, e.deltaMode, e.ctrlKey);
    this.viewport.value = zoomAt(this.viewport.peek(), this.screenPoint(e), factor);
  }

  private updateCursor(p: Point | null): void {
    const g = this.gesture;
    let cursor = '';
    if (g?.kind === 'pan') cursor = 'grabbing';
    else if (g?.kind === 'move') cursor = 'move';
    else if (this.spaceDown) cursor = 'grab';
    else if (p) {
      const intent = this.intentAt(p);
      if (intent.kind === 'move') cursor = 'move';
      if (intent.kind === 'resize')
        cursor =
          intent.corner === 'nw' || intent.corner === 'se'
            ? 'nwse-resize'
            : 'nesw-resize';
    }
    this.container.style.cursor = cursor;
  }
}
