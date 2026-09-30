// Canvas imperativo com Konva. Observa os signals do projeto e da UI, desenha e
// transforma os gestos em actions. Único lugar (com `CanvasHost`) que conhece o Konva.
import { effect, signal, untracked } from '@preact/signals';
import Konva from 'konva/lib/Core';
import { Circle as KonvaCircle } from 'konva/lib/shapes/Circle';
import { Image as KonvaImage } from 'konva/lib/shapes/Image';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import { t } from '../i18n';
import {
  annotatedLayersByMarking,
  annotationsByMarking,
  layerSections,
  imageCanvasRect,
  markingRectLimits,
  topDown,
  type Layer,
  type Marking,
  type Placement,
  type Project,
  type ProjectImage,
  type Rect,
} from '../model';
import type { DisplayImage, DisplayImages } from '../store/displayImages';
import type { ProjectStore } from '../store/history';
import type { ProjectActions } from '../store/project';
import { semanticText } from '../store/settings';
import {
  resolveActiveLayerId,
  resolveSelection,
  visibleLayers,
  type EditorUi,
} from '../store/ui';
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
import {
  HOLD_MS,
  IDLE,
  stepGesture,
  type DragMode,
  type GestureState,
} from './gestureMachine';
import { bodyLines, semanticMode, type SemanticMode } from './semanticText';
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

/** Distância (px de tela) em que um novo toque conta como "no mesmo ponto". */
const TAP_REPEAT_DISTANCE = 12;
/** Lado visível da alça de redimensionamento (px de tela). */
const HANDLE_SIZE = 14;
/** Metade da área de toque da alça (px de tela): 22 → 44 px, acima do mínimo de 24. */
const HANDLE_HIT_RADIUS = 22;
const SELECTION_STROKE = 2;
/** Espessura da borda das marcações (px de tela): normal e selecionada. */
const MARKING_STROKE = 1;
const MARKING_SELECTED_STROKE = 2;
/** Contorno claro em volta da borda da selecionada, para ela aparecer em fotos escuras. */
const MARKING_HALO = 0.75;
/** Sombra do item "pego" pelo segurar-e-mover (px de tela). */
const GRAB_SHADOW_BLUR = 14;
/** Vibração ao pegar o item (ms), onde o sistema oferecer (Android). */
const GRAB_VIBRATION_MS = 20;
/** Rótulo da imagem (px de tela): fonte, distância da borda e largura mínima para aparecer. */
const IMAGE_TITLE_FONT_SIZE = 12;
const IMAGE_TITLE_GAP = 4;
const IMAGE_TITLE_MIN_WIDTH = 48;
const REVIEW_BADGE_SIZE = 14;
/** Indicadores de camada: bolinhas (px de tela), no máximo `MAX_DOTS` e depois "+N". */
const DOT_RADIUS = 4;
const DOT_GAP = 3;
const DOT_MARGIN = 3;
const MAX_DOTS = 4;
/** Opacidade das marcações sem anotação em nenhuma camada visível. */
const DIMMED_OPACITY = 0.35;
/** Zoom semântico: fonte e altura de linha (px de tela) e margem interna do texto. */
const TEXT_FONT_SIZE = 12;
const TEXT_LINE_HEIGHT = 15;
const TEXT_PADDING = 4;
/** Altura da linha de cabeçalho (onde ficam o alerta, as bolinhas e o nome). */
const TEXT_HEADER_HEIGHT = 2 * DOT_MARGIN + 2 * DOT_RADIUS;

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

/** Alvo de um arrastar-e-soltar de arquivos: área vazia ou uma imagem (será trocada). */
export type DropTarget = { readonly imageId: string | null } | null;

/** Item "pego" pelo segurar-e-mover: recebe o sinal visual até soltar. */
interface Grabbed {
  readonly kind: 'image' | 'marking';
  readonly id: string;
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
      /** Vira o item pego se o dedo segurar; senão é o que o arrasto direto faria. */
      intent: Intent;
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
  /** Nome da imagem, como rótulo acima dela. */
  readonly title: KonvaText;
}

interface MarkingNode {
  readonly group: Konva.Group;
  readonly halo: KonvaRect;
  readonly border: KonvaRect;
  readonly badge: KonvaText;
  /** Bolinhas das camadas visíveis com anotação, recortadas no retângulo da marcação. */
  readonly indicators: Konva.Group;
  readonly dots: readonly KonvaCircle[];
  readonly more: KonvaText;
  /** Texto do zoom semântico, recortado no retângulo da marcação. */
  readonly text: Konva.Group;
  /** Uma linha por nó; o cabeçalho é a primeira. Cresce sob demanda. */
  readonly lines: KonvaText[];
}

function intersectRects(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName))
  );
}

function dragModeOf(intent: Intent): DragMode {
  if (intent.kind === 'pan' || intent.kind === 'draw') return intent.kind;
  return intent.kind === 'move-image' || intent.kind === 'move-marking'
    ? 'move'
    : 'resize';
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
  private readonly dropTarget = signal<DropTarget>(null);
  private readonly grabbed = signal<Grabbed | null>(null);
  private readonly tokens = signal<CanvasTokens>(readCanvasTokens());

  private readonly stage: Konva.Stage;
  private readonly imageLayer = new Konva.Layer({ listening: false });
  private readonly markingLayer = new Konva.Layer({ listening: false });
  private readonly overlayLayer = new Konva.Layer({ listening: false });
  private readonly selectionOutline = new KonvaRect({ visible: false });
  private readonly draftRect = new KonvaRect({ visible: false });
  private readonly dropRect = new KonvaRect({ visible: false });
  private readonly grabRect = new KonvaRect({ visible: false });
  private readonly handles = new Map<Corner, KonvaRect>();
  private readonly nodes = new Map<string, ImageNode>();
  private readonly markingNodes = new Map<string, MarkingNode>();

  private readonly pointers = new Map<number, Point>();
  private gesture: Gesture | null = null;
  /** Classificação do gesto em andamento (toque / pan / segurar-e-mover / …). */
  private gestureState: GestureState = IDLE;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
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
    this.overlayLayer.add(
      this.selectionOutline,
      this.draftRect,
      this.dropRect,
      this.grabRect,
    );
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
    this.onResize(); // O canvas pode ter acabado de reaparecer (aba Lista → Canvas).
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

  /** Ponto do canvas (unidades do canvas) sob uma coordenada de tela da página. */
  canvasPointAt(clientX: number, clientY: number): Point {
    return this.toCanvas(this.screenPoint({ clientX, clientY }));
  }

  /** Centro da área visível, em unidades do canvas. */
  viewportCenter(): Point {
    this.onResize();
    const size = this.size.peek();
    return this.toCanvas({ x: size.width / 2, y: size.height / 2 });
  }

  /** Id da imagem sob uma coordenada de tela da página, ou `null` em área vazia. */
  imageIdAt(clientX: number, clientY: number): string | null {
    const images = this.store.project.peek()?.images ?? [];
    return imageAt(images, this.canvasPointAt(clientX, clientY))?.id ?? null;
  }

  /** Destaca o alvo de um arrastar-e-soltar (`null` remove o destaque). */
  setDropTarget(target: DropTarget): void {
    this.dropTarget.value = target;
  }

  /** Cancela o gesto de mover/redimensionar/desenhar em andamento. `true` se havia um. */
  cancelInteraction(): boolean {
    const g = this.gesture;
    if (!isStoreGesture(g) && g?.kind !== 'draw') return false;
    if (isStoreGesture(g)) this.actions.cancelGesture();
    this.preview.value = null;
    this.draft.value = null;
    this.grabbed.value = null;
    this.gesture = { kind: 'pinch' }; // Ignora o resto do arrasto até soltar.
    this.gestureState = { phase: 'pinch' };
    return true;
  }

  destroy(): void {
    this.clearHold();
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
      if (node.group.zIndex() !== index) node.group.zIndex(index);
    });
    for (const [id, node] of this.nodes) {
      if (seen.has(id)) continue;
      node.group.destroy();
      this.nodes.delete(id);
    }

    const activeLayerId = resolveActiveLayerId(project, this.ui.activeLayer.value);
    const shown = visibleLayers(project, this.ui.hiddenLayers.value, activeLayerId);
    const annotated = project ? annotatedLayersByMarking(project, shown) : new Map();
    this.renderMarkings(project, shown, placements, annotated, tokens, v.scale);
    this.renderDraft(placements, tokens, v.scale);
    this.renderSelection(project, preview, placements, tokens, v.scale);
    this.renderDropTarget(project, tokens, v.scale);
    this.stage.batchDraw();
  }

  private createNode(id: string): ImageNode {
    const node: ImageNode = {
      group: new Konva.Group(),
      bitmap: new KonvaImage({ image: undefined }),
      placeholder: new KonvaRect(),
      label: new KonvaText({ align: 'center', verticalAlign: 'middle', wrap: 'char' }),
      title: new KonvaText({ wrap: 'none', ellipsis: true, fontStyle: 'bold' }),
    };
    node.group.add(node.placeholder, node.bitmap, node.label, node.title);
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

    this.updateTitle(node, image, rect.width, tokens, zoom);

    const message =
      state?.status === 'missing'
        ? t('canvas.imageMissing')
        : state?.status === 'error'
          ? t('canvas.imageError')
          : null;
    const padding = Math.min(rect.width, rect.height) * 0.05;
    if (message === null) {
      node.label.visible(false);
      return;
    }
    node.label.setAttrs({
      visible: true,
      text: `⚠ ${message}\n${image.file}`,
      x: padding,
      y: padding,
      width: Math.max(0, rect.width - 2 * padding),
      height: Math.max(0, rect.height - 2 * padding),
      fontSize: Math.max(Math.min(rect.width, rect.height) * 0.06, 12 / zoom),
      fill: broken ? tokens.warning : tokens.textMuted,
    });
  }

  /** Rótulo com o nome da imagem (ou do arquivo) logo acima dela. */
  private updateTitle(
    node: ImageNode,
    image: ProjectImage,
    width: number,
    tokens: CanvasTokens,
    zoom: number,
  ): void {
    // Tela pequena demais para caber um rótulo legível: esconde.
    if (width * zoom < IMAGE_TITLE_MIN_WIDTH) {
      node.title.visible(false);
      return;
    }
    const fontSize = IMAGE_TITLE_FONT_SIZE / zoom;
    node.title.setAttrs({
      visible: true,
      text: image.name ?? image.file,
      x: 0,
      y: -(IMAGE_TITLE_FONT_SIZE + IMAGE_TITLE_GAP) / zoom,
      width,
      height: fontSize * 1.2,
      fontSize,
      fill: image.name === null ? tokens.textMuted : tokens.text,
    });
  }

  /** Marcações de cima para baixo na hierarquia: as filhas ficam por cima dos pais. */
  private renderMarkings(
    project: Project | null,
    shown: readonly Layer[],
    placements: ReadonlyMap<string, Placement>,
    annotated: ReadonlyMap<string, readonly Layer[]>,
    tokens: CanvasTokens,
    zoom: number,
  ): void {
    const markings = project?.markings ?? [];
    const selection = this.ui.selection.value;
    const semantic = semanticText.value;
    const parents = new Set(markings.map((m) => m.parentId));
    const size = this.size.value;
    const vp = this.viewport.value;
    /** Parte do canvas visível na tela, em coordenadas do canvas. */
    const view: Rect = {
      x: -vp.x / vp.scale,
      y: -vp.y / vp.scale,
      width: size.width / vp.scale,
      height: size.height / vp.scale,
    };
    const byMarking = project && semantic ? annotationsByMarking(project) : new Map();
    const seen = new Set<string>();
    let index = 0;
    for (const marking of topDown(markings)) {
      const placement = placements.get(marking.imageId);
      if (!placement) continue;
      seen.add(marking.id);
      const node =
        this.markingNodes.get(marking.id) ?? this.createMarkingNode(marking.id);
      const markingRect = markingCanvasRect(placement, marking.rect);
      // Fora da tela: nem atualiza nem desenha (a camada não recebe toques, então é seguro).
      const onScreen = intersectRects(markingRect, view) !== null;
      node.group.visible(onScreen);
      // Reordenar custa caro no Konva: só quando a posição na pilha mudou.
      if (node.group.zIndex() !== index) node.group.zIndex(index);
      index++;
      if (!onScreen) continue;
      const selected = selection?.kind === 'marking' && selection.id === marking.id;
      this.updateMarkingNode(
        node,
        marking,
        placement,
        selected,
        annotated.get(marking.id) ?? [],
        tokens,
        zoom,
      );
      const mode = semanticMode({
        enabled: semantic,
        screenWidth: marking.rect.width * placement.scale * zoom,
        screenHeight: marking.rect.height * placement.scale * zoom,
        hasChildren: parents.has(marking.id),
      });
      this.updateSemanticText(
        node,
        marking,
        markingRect,
        view,
        mode,
        layerSections(byMarking, marking.id, shown),
        tokens,
        zoom,
      );
    }
    for (const [id, node] of this.markingNodes) {
      if (seen.has(id)) continue;
      node.group.destroy();
      this.markingNodes.delete(id);
    }
  }

  private createMarkingNode(id: string): MarkingNode {
    const dots = Array.from({ length: MAX_DOTS }, () => new KonvaCircle());
    const node: MarkingNode = {
      group: new Konva.Group(),
      halo: new KonvaRect(),
      border: new KonvaRect(),
      badge: new KonvaText({ text: '⚠', fontStyle: 'bold' }),
      indicators: new Konva.Group(),
      dots,
      more: new KonvaText({ fontStyle: 'bold' }),
      text: new Konva.Group(),
      lines: [],
    };
    node.indicators.add(...dots, node.more);
    node.group.add(node.halo, node.border, node.badge, node.indicators, node.text);
    this.markingLayer.add(node.group);
    this.markingNodes.set(id, node);
    return node;
  }

  private updateMarkingNode(
    node: MarkingNode,
    marking: Marking,
    placement: Placement,
    selected: boolean,
    layers: readonly Layer[],
    tokens: CanvasTokens,
    zoom: number,
  ): void {
    const rect = markingCanvasRect(placement, marking.rect);
    // Sem anotação nas camadas visíveis: esmaecida (a selecionada, nunca).
    node.group.opacity(selected || layers.length > 0 ? 1 : DIMMED_OPACITY);
    const stroke = (selected ? MARKING_SELECTED_STROKE : MARKING_STROKE) / zoom;
    const dash = marking.needsReview ? [6 / zoom, 4 / zoom] : [];
    // Contorno claro só na selecionada; as demais ficam com a linha de 1 px.
    node.halo.setAttrs({
      ...rect,
      visible: selected,
      stroke: tokens.surface,
      strokeWidth: stroke + (2 * MARKING_HALO) / zoom,
      opacity: 0.7,
    });
    node.border.setAttrs({ ...rect, stroke: tokens.marking, strokeWidth: stroke, dash });
    // Texto do Konva remede a cada mudança de atributo: só mexe nos que aparecem.
    if (marking.needsReview) {
      const badge = REVIEW_BADGE_SIZE / zoom;
      node.badge.setAttrs({
        visible: true,
        x: rect.x + badge / 3,
        y: rect.y + badge / 3,
        fontSize: badge,
        fill: tokens.warning,
        stroke: tokens.surface,
        strokeWidth: 3 / zoom,
        fillAfterStrokeEnabled: true,
      });
    } else {
      node.badge.visible(false);
    }
    this.updateIndicators(node, marking, rect, layers, tokens, zoom);
  }

  /** Bolinhas coloridas no canto superior esquerdo, uma por camada visível com anotação. */
  private updateIndicators(
    node: MarkingNode,
    marking: Marking,
    rect: Rect,
    layers: readonly Layer[],
    tokens: CanvasTokens,
    zoom: number,
  ): void {
    if (layers.length === 0) {
      node.indicators.visible(false);
      return;
    }
    node.indicators.setAttrs({
      visible: true,
      clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    });
    const radius = DOT_RADIUS / zoom;
    const step = (2 * DOT_RADIUS + DOT_GAP) / zoom;
    // Com o alerta de revisão no canto, as bolinhas começam depois dele.
    const left = marking.needsReview ? (REVIEW_BADGE_SIZE + DOT_MARGIN) / zoom : 0;
    const x0 = rect.x + left + (DOT_MARGIN + DOT_RADIUS) / zoom;
    const cy = rect.y + (DOT_MARGIN + DOT_RADIUS) / zoom;
    const shown = Math.min(layers.length, MAX_DOTS);
    node.dots.forEach((dot, i) => {
      if (i >= shown) {
        dot.visible(false);
        return;
      }
      dot.setAttrs({
        visible: true,
        x: x0 + i * step,
        y: cy,
        radius,
        fill: layers[i]?.color ?? tokens.marking,
        stroke: tokens.surface,
        strokeWidth: 1 / zoom,
      });
    });
    const extra = layers.length - MAX_DOTS;
    if (extra <= 0) {
      node.more.visible(false);
      return;
    }
    const fontSize = 11 / zoom;
    node.more.setAttrs({
      visible: true,
      text: `+${extra}`,
      x: x0 + shown * step - radius,
      y: cy - fontSize / 2,
      fontSize,
      fill: tokens.marking,
      stroke: tokens.surface,
      strokeWidth: 3 / zoom,
      fillAfterStrokeEnabled: true,
    });
  }

  /**
   * Zoom semântico: no cabeçalho, o nome (ao lado das bolinhas); nas folhas,
   * também o nome e os pares `chave: valor` de cada camada visível, na cor
   * dela. Marcações com filhas só têm o cabeçalho, para não cobrir as filhas.
   * O texto é recortado no retângulo e só as linhas que cabem viram nós.
   */
  private updateSemanticText(
    node: MarkingNode,
    marking: Marking,
    markingRect: Rect,
    view: Rect,
    mode: SemanticMode,
    sections: ReturnType<typeof layerSections>,
    tokens: CanvasTokens,
    zoom: number,
  ): void {
    // Com zoom alto o canto da marcação sai da tela: o texto fica ancorado na
    // parte visível dela (e recortado nela).
    const rect = intersectRects(markingRect, view);
    if (mode === 'none' || !rect) {
      node.text.visible(false);
      return;
    }
    const px = (n: number) => n / zoom;
    const left = rect.x + px(TEXT_PADDING);
    node.text.setAttrs({
      visible: true,
      clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    });
    // Alerta e bolinhas só ocupam o cabeçalho se o canto da marcação estiver visível.
    const atCorner = rect.x === markingRect.x && rect.y === markingRect.y;

    const layers = sections.map((s) => s.layer);
    const shown = Math.min(layers.length, MAX_DOTS);
    const extra = layers.length - MAX_DOTS;
    // O nome começa depois do alerta de revisão e das bolinhas.
    const before = atCorner && marking.needsReview ? REVIEW_BADGE_SIZE + DOT_MARGIN : 0;
    const dots =
      atCorner && shown > 0 ? shown * (2 * DOT_RADIUS + DOT_GAP) + DOT_MARGIN : 0;
    const more = atCorner && extra > 0 ? 22 : 0;
    const headerX =
      rect.x + px(before + dots + more + (dots + more > 0 ? 0 : TEXT_PADDING));

    type Line = { text: string; color: string; bold: boolean; x: number; y: number };
    const lines: Line[] = [];
    if (marking.name !== null) {
      lines.push({
        text: marking.name,
        color: tokens.marking,
        bold: true,
        x: headerX,
        y: rect.y + px((TEXT_HEADER_HEIGHT - TEXT_FONT_SIZE) / 2),
      });
    }
    if (mode === 'full') {
      const top =
        marking.name !== null || atCorner ? TEXT_HEADER_HEIGHT + 2 : TEXT_PADDING;
      const fit = Math.floor((rect.height * zoom - top) / TEXT_LINE_HEIGHT);
      bodyLines(sections)
        .slice(0, Math.max(0, fit))
        .forEach((line, i) => {
          lines.push({
            text: line.text,
            color: line.color,
            bold: line.bold,
            x: left,
            y: rect.y + px(top + i * TEXT_LINE_HEIGHT),
          });
        });
    }

    while (node.lines.length < lines.length) {
      const line = new KonvaText({
        wrap: 'none',
        ellipsis: true,
        fillAfterStrokeEnabled: true,
      });
      node.lines.push(line);
      node.text.add(line);
    }
    node.lines.forEach((textNode, i) => {
      const line = lines[i];
      if (!line) {
        textNode.visible(false);
        return;
      }
      textNode.setAttrs({
        visible: true,
        text: line.text,
        x: line.x,
        y: line.y,
        width: Math.max(0, rect.x + rect.width - line.x - px(TEXT_PADDING)),
        height: px(TEXT_LINE_HEIGHT),
        fontSize: px(TEXT_FONT_SIZE),
        fontStyle: line.bold ? 'bold' : 'normal',
        fill: line.color,
        stroke: tokens.surface,
        strokeWidth: 2.5 / zoom,
      });
    });
  }

  private renderDropTarget(
    project: Project | null,
    tokens: CanvasTokens,
    zoom: number,
  ): void {
    const target = this.dropTarget.value;
    this.container.classList.toggle('canvas-host--drop', target?.imageId === null);
    const image = target?.imageId
      ? project?.images.find((i) => i.id === target.imageId)
      : undefined;
    if (!image) {
      this.dropRect.visible(false);
      return;
    }
    this.dropRect.setAttrs({
      ...imageCanvasRect(image, image.placement),
      visible: true,
      stroke: tokens.accent,
      strokeWidth: (3 * SELECTION_STROKE) / zoom,
      dash: [10 / zoom, 6 / zoom],
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
    const grabbed = this.grabbed.value;
    // Alças só no modo Navegar (em Desenhar, arrastar sempre desenha).
    const showHandles = !this.store.readOnly.value && this.ui.mode.value === 'navigate';
    const hide = () => {
      this.grabRect.visible(false);
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

    const selectedId =
      selected.kind === 'image' ? selected.image.id : selected.marking.id;
    const isGrabbed = grabbed?.kind === selected.kind && grabbed.id === selectedId;
    this.grabRect.setAttrs({
      ...rect,
      visible: isGrabbed,
      fill: tokens.accent,
      opacity: 0.25,
      stroke: tokens.accent,
      strokeWidth: (2 * SELECTION_STROKE) / zoom,
      shadowColor: tokens.accent,
      shadowBlur: GRAB_SHADOW_BLUR / zoom,
      shadowOpacity: 0.8,
    });

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
      this.clearHold();
      this.grabbed.value = null;
      this.gesture = { kind: 'pinch' };
      this.gestureState = stepGesture(this.gestureState, {
        type: 'second-pointer',
      }).state;
      return;
    }
    const intent: Intent = e.button === 1 ? { kind: 'pan' } : this.intentAt(p);
    // No toque, arrastar sempre faz pan; para mover um item é preciso segurar antes.
    // Alças (resize) e o modo Desenhar continuam diretos, e o mouse não muda.
    const holdable =
      e.pointerType === 'touch' &&
      (intent.kind === 'pan' ||
        intent.kind === 'move-marking' ||
        intent.kind === 'move-image') &&
      this.canGrab();
    this.gesture = {
      kind: 'pending',
      pointerId: e.pointerId,
      start: p,
      intent: holdable ? { kind: 'pan' } : intent,
    };
    this.gestureState = stepGesture(IDLE, {
      type: 'down',
      point: p,
      direct: dragModeOf(intent),
      holdable,
    }).state;
    this.clearHold();
    if (holdable) {
      const pointerId = e.pointerId;
      this.holdTimer = setTimeout(() => this.onHold(pointerId), HOLD_MS);
    }
  }

  /** Segurar-e-mover só existe no modo Navegar, com a edição liberada. */
  private canGrab(): boolean {
    return (
      !this.spaceDown &&
      !this.store.readOnly.peek() &&
      this.store.project.peek() !== null &&
      this.ui.mode.peek() === 'navigate'
    );
  }

  private clearHold(): void {
    if (this.holdTimer === null) return;
    clearTimeout(this.holdTimer);
    this.holdTimer = null;
  }

  /** O dedo ficou parado por `HOLD_MS`: pega o item sob ele, se houver. */
  private onHold(pointerId: number): void {
    this.holdTimer = null;
    const g = this.gesture;
    if (g?.kind !== 'pending' || g.pointerId !== pointerId) return;
    const intent = this.grabIntentAt(g.start);
    const step = stepGesture(this.gestureState, {
      type: 'hold',
      hasTarget: intent !== null,
    });
    this.gestureState = step.state;
    if (step.effect.kind !== 'grab' || !intent) return;
    g.intent = intent;
    if (intent.kind === 'move-marking') {
      this.ui.selection.value = { kind: 'marking', id: intent.markingId };
      this.grabbed.value = { kind: 'marking', id: intent.markingId };
    } else if (intent.kind === 'move-image') {
      this.ui.selection.value = { kind: 'image', id: intent.imageId };
      this.grabbed.value = { kind: 'image', id: intent.imageId };
    }
    try {
      navigator.vibrate?.(GRAB_VIBRATION_MS);
    } catch {
      // Sem vibração (iOS, permissões): fica só o sinal visual.
    }
  }

  /**
   * Item que o segurar-e-mover pega em `p` (tela): a marcação selecionada, se o
   * dedo estiver nela; senão a mais interna sob o dedo; senão a imagem.
   */
  private grabIntentAt(p: Point): Intent | null {
    const project = this.store.project.peek();
    if (!project) return null;
    const c = this.toCanvas(p);
    const image = imageAt(project.images, c);
    if (!image) return null;
    const chain = markingChainAt(
      project.markings,
      image.id,
      canvasToImagePixel(image.placement, c),
    );
    const selection = this.ui.selection.peek();
    const picked =
      chain.find((m) => selection?.kind === 'marking' && selection.id === m.id) ??
      chain[0];
    return picked
      ? { kind: 'move-marking', markingId: picked.id }
      : { kind: 'move-image', imageId: image.id };
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
      case 'pending': {
        const step = stepGesture(this.gestureState, { type: 'move', point: p });
        this.gestureState = step.state;
        if (step.effect.kind === 'start-drag') {
          this.clearHold();
          // Mexeu antes de segurar: pan. Depois de segurar, move o item pego.
          const intent: Intent = step.effect.mode === 'pan' ? { kind: 'pan' } : g.intent;
          this.startDrag(g.pointerId, g.start, intent);
          this.onPointerMove(e);
        }
        return;
      }
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
      if (this.pointers.size === 0) {
        this.gesture = null;
        this.gestureState = stepGesture(this.gestureState, {
          type: 'all-released',
        }).state;
      }
      return;
    }
    if (g.pointerId !== e.pointerId) return;
    this.gesture = null;
    this.clearHold();
    this.grabbed.value = null;
    const step = stepGesture(this.gestureState, { type: cancelled ? 'cancel' : 'up' });
    this.gestureState = step.state;
    if (g.kind === 'pending' && step.effect.kind === 'tap') this.tap(step.effect.at);
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
