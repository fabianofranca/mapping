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
  markingRectLimits,
  topDown,
  type Marking,
  type Placement,
  type Project,
  type ProjectImage,
  type Rect,
} from '../model';
import type { DisplayImage, DisplayImages } from '../store/displayImages';
import type { ProjectStore } from '../store/history';
import type { ProjectActions } from '../store/project';
import { resolveSelection, type EditorUi } from '../store/ui';
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
import {
  canvasToImagePixel,
  handleHitRadius,
  isDrawableRect,
  markingCanvasRect,
  markingChainAt,
  nextInChain,
  rectFromPoints,
  resizeMarkingRect,
  type RectLimits,
} from './markingGeometry';
import { readCanvasTokens, watchTheme, type CanvasTokens } from './theme';
import {
  EMPTY_CANVAS_RECT,
  centerOn,
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
/** Distância (px de tela) em que um novo toque conta como "no mesmo ponto". */
const TAP_REPEAT_DISTANCE = 12;
/** Lado visível da alça de redimensionamento (px de tela). */
const HANDLE_SIZE = 14;
/** Metade da área de toque da alça (px de tela): 22 → 44 px, acima do mínimo de 24. */
const HANDLE_HIT_RADIUS = 22;
const SELECTION_STROKE = 2;
/** Espessura da borda das marcações (px de tela): normal e selecionada. */
const MARKING_STROKE = 1.5;
const MARKING_SELECTED_STROKE = 3;
/** Contorno claro em volta da borda, para ela aparecer em fotos escuras e claras. */
const MARKING_HALO = 2;
const REVIEW_BADGE_SIZE = 14;

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

/** Retângulo sendo desenhado (modo Desenhar), em pixels da imagem. */
interface Draft {
  readonly imageId: string;
  readonly rect: Rect;
}

type Intent =
  | { readonly kind: 'pan' }
  | { readonly kind: 'move-image'; readonly imageId: string }
  | { readonly kind: 'resize-image'; readonly imageId: string; readonly corner: Corner }
  | { readonly kind: 'move-marking'; readonly markingId: string }
  | {
      readonly kind: 'resize-marking';
      readonly markingId: string;
      readonly corner: Corner;
    }
  | { readonly kind: 'draw'; readonly imageId: string };

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
      readonly kind: 'move-image';
      readonly pointerId: number;
      readonly imageId: string;
      readonly startCanvas: Point;
      readonly startPlacement: Placement;
    }
  | {
      readonly kind: 'resize-image';
      readonly pointerId: number;
      readonly imageId: string;
      readonly corner: Corner;
      readonly startPlacement: Placement;
    }
  | {
      readonly kind: 'move-marking';
      readonly pointerId: number;
      readonly markingId: string;
      readonly startCanvas: Point;
      /** Escala da imagem: converte o deslocamento do canvas em pixels. */
      readonly scale: number;
    }
  | {
      readonly kind: 'resize-marking';
      readonly pointerId: number;
      readonly markingId: string;
      readonly corner: Corner;
      readonly placement: Placement;
      readonly startRect: Rect;
      readonly limits: RectLimits;
    }
  | {
      readonly kind: 'draw';
      readonly pointerId: number;
      readonly image: ProjectImage;
      readonly startPixel: Point;
    }
  /** Dois dedos. Termina quando todos saem da tela. */
  | { readonly kind: 'pinch' };

/** Gestos que usam `beginGesture/commitGesture` do store. */
type StoreGesture = Extract<
  Gesture,
  { kind: 'move-image' | 'resize-image' | 'move-marking' | 'resize-marking' }
>;

function isStoreGesture(g: Gesture | null): g is StoreGesture {
  return (
    g?.kind === 'move-image' ||
    g?.kind === 'resize-image' ||
    g?.kind === 'move-marking' ||
    g?.kind === 'resize-marking'
  );
}

interface ImageNode {
  readonly group: Konva.Group;
  readonly bitmap: KonvaImage;
  readonly placeholder: KonvaRect;
  readonly label: KonvaText;
}

interface MarkingNode {
  readonly group: Konva.Group;
  readonly halo: KonvaRect;
  readonly border: KonvaRect;
  readonly badge: KonvaText;
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName))
  );
}

function resizeCursor(corner: Corner): string {
  return corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize';
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
  private readonly draft = signal<Draft | null>(null);
  private readonly tokens = signal<CanvasTokens>(readCanvasTokens());

  private readonly stage: Konva.Stage;
  private readonly imageLayer = new Konva.Layer({ listening: false });
  private readonly markingLayer = new Konva.Layer({ listening: false });
  private readonly overlayLayer = new Konva.Layer({ listening: false });
  private readonly selectionOutline = new KonvaRect({ visible: false });
  private readonly draftRect = new KonvaRect({ visible: false });
  private readonly handles = new Map<Corner, KonvaRect>();
  private readonly nodes = new Map<string, ImageNode>();
  private readonly markingNodes = new Map<string, MarkingNode>();

  private readonly pointers = new Map<number, Point>();
  private gesture: Gesture | null = null;
  /** Último toque (canvas), para o ciclo "tocar de novo sobe para o pai". */
  private lastTap: Point | null = null;
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
    this.stage.add(this.imageLayer, this.markingLayer, this.overlayLayer);
    this.overlayLayer.add(this.selectionOutline, this.draftRect);
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

  /** Centraliza o canvas no item selecionado (ajustando o zoom se ele for grande ou pequeno demais). */
  focusSelection(): void {
    const size = this.size.peek();
    const selected = resolveSelection(
      this.store.project.peek(),
      this.ui.selection.peek(),
    );
    if (!selected || size.width === 0) return;
    const { image } = selected;
    const rect =
      selected.kind === 'marking'
        ? markingCanvasRect(image.placement, selected.marking.rect)
        : imageCanvasRect(image, image.placement);
    this.viewport.value = centerOn(this.viewport.peek(), rect, size);
  }

  /** Cancela o gesto de mover/redimensionar/desenhar em andamento. `true` se havia um. */
  cancelInteraction(): boolean {
    const g = this.gesture;
    if (!isStoreGesture(g) && g?.kind !== 'draw') return false;
    if (isStoreGesture(g)) this.actions.cancelGesture();
    this.preview.value = null;
    this.draft.value = null;
    this.gesture = { kind: 'pinch' }; // Ignora o resto do arrasto até soltar.
    return true;
  }

  destroy(): void {
    if (isStoreGesture(this.gesture)) this.actions.cancelGesture();
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
    const placements = new Map<string, Placement>();
    const seen = new Set<string>();
    images.forEach((image, index) => {
      seen.add(image.id);
      const placement =
        preview?.imageId === image.id ? preview.placement : image.placement;
      placements.set(image.id, placement);
      const node = this.nodes.get(image.id) ?? this.createNode(image.id);
      this.updateNode(node, image, placement, bitmaps.get(image.file), tokens, v.scale);
      node.group.zIndex(index);
    });
    for (const [id, node] of this.nodes) {
      if (seen.has(id)) continue;
      node.group.destroy();
      this.nodes.delete(id);
    }

    this.renderMarkings(project?.markings ?? [], placements, tokens, v.scale);
    this.renderDraft(placements, tokens, v.scale);
    this.renderSelection(project, preview, placements, tokens, v.scale);
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

  /** Marcações de cima para baixo na hierarquia: as filhas ficam por cima dos pais. */
  private renderMarkings(
    markings: readonly Marking[],
    placements: ReadonlyMap<string, Placement>,
    tokens: CanvasTokens,
    zoom: number,
  ): void {
    const selection = this.ui.selection.value;
    const seen = new Set<string>();
    let index = 0;
    for (const marking of topDown(markings)) {
      const placement = placements.get(marking.imageId);
      if (!placement) continue;
      seen.add(marking.id);
      const node =
        this.markingNodes.get(marking.id) ?? this.createMarkingNode(marking.id);
      const selected = selection?.kind === 'marking' && selection.id === marking.id;
      this.updateMarkingNode(node, marking, placement, selected, tokens, zoom);
      node.group.zIndex(index++);
    }
    for (const [id, node] of this.markingNodes) {
      if (seen.has(id)) continue;
      node.group.destroy();
      this.markingNodes.delete(id);
    }
  }

  private createMarkingNode(id: string): MarkingNode {
    const node: MarkingNode = {
      group: new Konva.Group(),
      halo: new KonvaRect(),
      border: new KonvaRect(),
      badge: new KonvaText({ text: '⚠', fontStyle: 'bold' }),
    };
    node.group.add(node.halo, node.border, node.badge);
    this.markingLayer.add(node.group);
    this.markingNodes.set(id, node);
    return node;
  }

  private updateMarkingNode(
    node: MarkingNode,
    marking: Marking,
    placement: Placement,
    selected: boolean,
    tokens: CanvasTokens,
    zoom: number,
  ): void {
    const rect = markingCanvasRect(placement, marking.rect);
    const stroke = (selected ? MARKING_SELECTED_STROKE : MARKING_STROKE) / zoom;
    const dash = marking.needsReview ? [6 / zoom, 4 / zoom] : [];
    node.halo.setAttrs({
      ...rect,
      stroke: tokens.surface,
      strokeWidth: stroke + (2 * MARKING_HALO) / zoom,
      opacity: 0.7,
    });
    node.border.setAttrs({ ...rect, stroke: tokens.marking, strokeWidth: stroke, dash });
    const badge = REVIEW_BADGE_SIZE / zoom;
    node.badge.setAttrs({
      visible: marking.needsReview,
      x: rect.x + badge / 3,
      y: rect.y + badge / 3,
      fontSize: badge,
      fill: tokens.warning,
      stroke: tokens.surface,
      strokeWidth: 3 / zoom,
      fillAfterStrokeEnabled: true,
    });
  }

  private renderDraft(
    placements: ReadonlyMap<string, Placement>,
    tokens: CanvasTokens,
    zoom: number,
  ): void {
    const draft = this.draft.value;
    const placement = draft && placements.get(draft.imageId);
    if (!draft || !placement) {
      this.draftRect.visible(false);
      return;
    }
    const valid = isDrawableRect(draft.rect);
    this.draftRect.setAttrs({
      ...markingCanvasRect(placement, draft.rect),
      visible: true,
      stroke: valid ? tokens.accent : tokens.danger,
      strokeWidth: SELECTION_STROKE / zoom,
      dash: [6 / zoom, 4 / zoom],
    });
  }

  private renderSelection(
    project: Project | null,
    preview: ImagePreview | null,
    placements: ReadonlyMap<string, Placement>,
    tokens: CanvasTokens,
    zoom: number,
  ): void {
    const selected = resolveSelection(project, this.ui.selection.value);
    // Alças só no modo Navegar (em Desenhar, arrastar sempre desenha).
    const showHandles = !this.store.readOnly.value && this.ui.mode.value === 'navigate';
    const hide = () => {
      this.selectionOutline.visible(false);
      for (const handle of this.handles.values()) handle.visible(false);
    };
    if (!selected) return hide();

    let rect: Rect;
    let color = tokens.accent;
    if (selected.kind === 'image') {
      const { image } = selected;
      const invalid = preview?.imageId === image.id && !preview.valid;
      if (invalid) color = tokens.danger;
      rect = imageCanvasRect(image, placements.get(image.id) ?? image.placement);
      this.selectionOutline.setAttrs({
        ...rect,
        visible: true,
        stroke: color,
        strokeWidth: (SELECTION_STROKE * (invalid ? 2 : 1)) / zoom,
      });
    } else {
      // A borda da marcação selecionada já fica mais grossa; aqui só as alças.
      const placement = placements.get(selected.image.id) ?? selected.image.placement;
      rect = markingCanvasRect(placement, selected.marking.rect);
      this.selectionOutline.visible(false);
    }

    const side = HANDLE_SIZE / zoom;
    for (const [corner, handle] of this.handles) {
      const c = cornerPoint(rect, corner);
      handle.setAttrs({
        visible: showHandles,
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

  /**
   * O que um arrasto começando em `p` (tela) faria. Em Navegar, as alças do
   * item selecionado redimensionam e arrastar o item o move. Em Desenhar,
   * arrastar sobre uma imagem sempre cria uma marcação (sem alças, para não
   * atrapalhar o desenho de filhas perto dos cantos do pai).
   */
  private intentAt(p: Point): Intent {
    const project = this.store.project.peek();
    if (this.spaceDown || !project || this.store.readOnly.peek()) return { kind: 'pan' };
    const zoom = this.viewport.peek().scale;
    const c = this.toCanvas(p);
    if (this.ui.mode.peek() === 'draw') {
      const image = imageAt(project.images, c);
      return image ? { kind: 'draw', imageId: image.id } : { kind: 'pan' };
    }
    const selected = resolveSelection(project, this.ui.selection.peek());
    if (selected?.kind === 'marking') {
      const rect = markingCanvasRect(selected.image.placement, selected.marking.rect);
      const radius = handleHitRadius(Math.min(rect.width, rect.height) * zoom) / zoom;
      const corner = cornerAt(rect, c, radius);
      const markingId = selected.marking.id;
      if (corner) return { kind: 'resize-marking', markingId, corner };
      if (pointInRect(c, rect)) return { kind: 'move-marking', markingId };
    }
    if (selected?.kind === 'image') {
      const { image } = selected;
      const rect = imageCanvasRect(image, image.placement);
      const corner = cornerAt(rect, c, HANDLE_HIT_RADIUS / zoom);
      if (corner) return { kind: 'resize-image', imageId: image.id, corner };
      if (pointInRect(c, rect)) return { kind: 'move-image', imageId: image.id };
    }
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
      case 'move-image': {
        const c = this.toCanvas(p);
        const { startPlacement: s, startCanvas } = g;
        this.previewPlacement(g.imageId, {
          x: s.x + c.x - startCanvas.x,
          y: s.y + c.y - startCanvas.y,
          scale: s.scale,
        });
        return;
      }
      case 'resize-image': {
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
      case 'move-marking': {
        const c = this.toCanvas(p);
        this.actions.previewMarkingMove(
          g.markingId,
          (c.x - g.startCanvas.x) / g.scale,
          (c.y - g.startCanvas.y) / g.scale,
        );
        return;
      }
      case 'resize-marking': {
        const pixel = canvasToImagePixel(g.placement, this.toCanvas(p));
        this.actions.previewMarkingRect(
          g.markingId,
          resizeMarkingRect(g.startRect, g.corner, pixel, g.limits),
        );
        return;
      }
      case 'draw': {
        const pixel = canvasToImagePixel(g.image.placement, this.toCanvas(p));
        this.draft.value = {
          imageId: g.image.id,
          rect: rectFromPoints(g.startPixel, pixel, g.image),
        };
        return;
      }
    }
  }

  private startDrag(pointerId: number, start: Point, intent: Intent): void {
    this.gesture = this.gestureFor(pointerId, start, intent) ?? {
      kind: 'pan',
      pointerId,
      last: start,
    };
  }

  /** Gesto para a intenção, ou `null` se ela não se aplica mais (vira pan). */
  private gestureFor(pointerId: number, start: Point, intent: Intent): Gesture | null {
    const project = this.store.project.peek();
    if (!project || intent.kind === 'pan') return null;
    const startCanvas = this.toCanvas(start);

    if (intent.kind === 'draw') {
      const image = project.images.find((i) => i.id === intent.imageId);
      if (!image) return null;
      const startPixel = canvasToImagePixel(image.placement, startCanvas);
      this.draft.value = {
        imageId: image.id,
        rect: rectFromPoints(startPixel, startPixel, image),
      };
      return { kind: 'draw', pointerId, image, startPixel };
    }

    if (intent.kind === 'move-image' || intent.kind === 'resize-image') {
      const image = project.images.find((i) => i.id === intent.imageId);
      if (!image || !this.actions.beginGesture().ok) return null;
      return intent.kind === 'move-image'
        ? {
            kind: 'move-image',
            pointerId,
            imageId: image.id,
            startCanvas,
            startPlacement: image.placement,
          }
        : {
            kind: 'resize-image',
            pointerId,
            imageId: image.id,
            corner: intent.corner,
            startPlacement: image.placement,
          };
    }

    const marking = project.markings.find((m) => m.id === intent.markingId);
    const image = marking && project.images.find((i) => i.id === marking.imageId);
    if (!marking || !image) return null;
    const limits = markingRectLimits(project, marking.id);
    if (!this.actions.beginGesture().ok) return null;
    return intent.kind === 'move-marking'
      ? {
          kind: 'move-marking',
          pointerId,
          markingId: marking.id,
          startCanvas,
          scale: image.placement.scale,
        }
      : {
          kind: 'resize-marking',
          pointerId,
          markingId: marking.id,
          corner: intent.corner,
          placement: image.placement,
          startRect: marking.rect,
          limits,
        };
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
    if (isStoreGesture(g)) {
      // Volta para a última posição válida (a do projeto) e grava uma entrada.
      if (cancelled) this.actions.cancelGesture();
      else this.actions.commitGesture();
      this.preview.value = null;
    }
    if (g.kind === 'draw') this.finishDraw(cancelled);
    if (e.pointerType === 'mouse') this.updateCursor(this.screenPoint(e));
  }

  private finishDraw(cancelled: boolean): void {
    const draft = this.draft.peek();
    this.draft.value = null;
    if (cancelled || !draft || !isDrawableRect(draft.rect)) return;
    const result = this.actions.createMarking(draft.imageId, draft.rect);
    if (result.ok) this.ui.selection.value = { kind: 'marking', id: result.value };
  }

  /**
   * Seleciona pelo toque: a marcação mais interna sob o ponto; tocar de novo
   * no mesmo ponto sobe para o pai. Fora das marcações, a imagem.
   */
  private tap(p: Point): void {
    const project = this.store.project.peek();
    const c = this.toCanvas(p);
    const image = project && imageAt(project.images, c);
    const last = this.lastTap;
    this.lastTap = c;
    if (!project || !image) {
      this.ui.selection.value = null;
      return;
    }
    const zoom = this.viewport.peek().scale;
    const repeat =
      last !== null &&
      Math.hypot(c.x - last.x, c.y - last.y) * zoom <= TAP_REPEAT_DISTANCE;
    const chain = markingChainAt(
      project.markings,
      image.id,
      canvasToImagePixel(image.placement, c),
    ).map((m) => m.id);
    const selection = this.ui.selection.peek();
    const next = nextInChain(
      chain,
      selection?.kind === 'marking' ? selection.id : null,
      repeat,
    );
    this.ui.selection.value = next
      ? { kind: 'marking', id: next }
      : { kind: 'image', id: image.id };
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
    else if (g?.kind === 'move-image' || g?.kind === 'move-marking') cursor = 'move';
    else if (g?.kind === 'draw') cursor = 'crosshair';
    else if (this.spaceDown) cursor = 'grab';
    else if (p) {
      const intent = this.intentAt(p);
      if (intent.kind === 'move-image' || intent.kind === 'move-marking') cursor = 'move';
      if (intent.kind === 'resize-image' || intent.kind === 'resize-marking')
        cursor = resizeCursor(intent.corner);
      if (intent.kind === 'draw') cursor = 'crosshair';
    }
    this.container.style.cursor = cursor;
  }
}
