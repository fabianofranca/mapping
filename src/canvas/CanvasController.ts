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
  annotationTitle,
  annotationsByMarking,
  childrenIndex,
  rawValueLines,
  layerDotsByMarking,
  imageCanvasRect,
  markingVisibility,
  markingRectLimits,
  topDown,
  type Annotation,
  type Layer,
  type LayerDot,
  type Marking,
  type MarkingVisibility,
  type Placement,
  type Project,
  type ProjectImage,
  type Rect,
} from '../model';
import type { DisplayImage, DisplayImages } from '../store/displayImages';
import type { ProjectStore } from '../store/history';
import type { ProjectActions } from '../store/project';
import { markingDisplay, semanticText } from '../store/settings';
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
import { largestFreeRect } from './freeArea';
import {
  SEMANTIC_MIN_HEIGHT,
  SEMANTIC_MIN_WIDTH,
  cardRows,
  cardSections,
  layoutCard,
  semanticMode,
  type CardInherited,
  type CardLabels,
  type CardRow,
  type SemanticMode,
} from './semanticText';
import { annotationLabel, markingLabel } from '../ui/labels';
import {
  annotationDisplayName,
  displayLines,
  issuesOf,
  projectIssues,
} from '../ui/typedText';
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
/** Alerta de anotação incompleta, depois das bolinhas (px de tela). */
const ALERT_GLYPH = '⚠';
const ALERT_SIZE = 13;
/** Largura reservada para o "+N" depois das bolinhas (px de tela). */
const MORE_WIDTH = 22;
/** Opacidade das marcações sem anotação em nenhuma camada visível. */
const DIMMED_OPACITY = 0.35;
/** Borda de contexto dos pais no modo Ocultar: esmaecida, mas legível sobre fotos. */
const OUTLINE_OPACITY = 0.75;
/** Zoom semântico: fonte e altura de linha (px de tela) e margem interna do texto. */
const TEXT_FONT_SIZE = 12;
const TEXT_LINE_HEIGHT = 15;
const TEXT_PADDING = 4;
/** Altura da linha de cabeçalho (onde ficam o alerta, as bolinhas e o nome). */
const TEXT_HEADER_HEIGHT = 2 * DOT_MARGIN + 2 * DOT_RADIUS;
/** Cartão do zoom semântico (px de tela): margem na área, padding, largura máxima. */
const CARD_MARGIN = 4;
const CARD_PADDING = 6;
const CARD_MAX_WIDTH = 300;
/** Mais estreito que isso (ex: área quase toda fora da tela), o cartão não aparece. */
const CARD_MIN_WIDTH = 120;
const CARD_RADIUS = 6;
/** Fundo semiopaco (cor de superfície do tema) e barra da camada à esquerda. */
const CARD_OPACITY = 0.88;
const CARD_BAR_WIDTH = 3;
const CARD_BAR_GAP = 6;
/** Recuo dos pares sob o nome da anotação. */
const CARD_ENTRY_INDENT = 10;
/** Herdadas: itálico e esmaecidas. */
const CARD_INHERITED_OPACITY = 0.7;
const CARD_FONT: Readonly<Record<CardRow['kind'], number>> = {
  layer: 10,
  title: 12,
  note: 10,
  entry: 12,
  separator: 0,
  more: 12,
};
const ELLIPSIS = '…';

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
  /** Alerta de anotação incompleta, depois das bolinhas. */
  readonly alert: KonvaText;
  /** Texto do zoom semântico, recortado no retângulo da marcação. */
  readonly text: Konva.Group;
  /** Nome da marcação na linha de cabeçalho, ao lado das bolinhas. */
  readonly header: KonvaText;
  /** Fundo do cartão (cor de superfície do tema, semiopaco). */
  readonly card: KonvaRect;
  /** Linhas do cartão, uma por nó. Crescem sob demanda. */
  readonly lines: KonvaText[];
  /** Barras das camadas e separadores do cartão. Crescem sob demanda. */
  readonly shapes: KonvaRect[];
}

function intersectRects(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

/** Textos do cartão do zoom semântico, no idioma atual. */
function cardLabels(project: Project | null): CardLabels {
  return {
    untitled: (n) => t('canvas.card.untitled', { n }),
    linkedTo: (owner) =>
      t('annotation.linkedTo', {
        name: project ? annotationDisplayName(project, owner) : annotationLabel(owner),
      }),
    inheritedFrom: (source) =>
      t('canvas.card.inheritedFrom', { name: markingLabel(source) }),
    describe: (a) => {
      if (!project || !a.type) return null;
      const known = displayLines(project, a, 'summary');
      const lines =
        known.length > 0 || a.values === null
          ? known.map((l) => ({
              text: `${l.label}: ${l.kind === 'value' ? l.text : ''}`,
              alert: l.alert,
            }))
          : rawValueLines(a).map((l) => ({ text: `${l.key}: ${l.text}`, alert: false }));
      const alert = issuesOf(project, a.id).length > 0;
      const title = annotationTitle(project, a) ?? '';
      return { title: alert ? `${ALERT_GLYPH} ${title}` : title, alert, lines };
    },
  };
}

/**
 * Marcações com alguma anotação incompleta nas camadas dadas (as visíveis): elas
 * ganham um pequeno alerta junto às bolinhas.
 */
function incompleteMarkings(project: Project, layers: readonly Layer[]): Set<string> {
  const shown = new Set(layers.map((l) => l.id));
  const result = new Set<string>();
  const byId = new Map(project.annotations.map((a) => [a.id, a]));
  for (const id of projectIssues(project).keys()) {
    const a = byId.get(id);
    if (a && shown.has(a.layerId)) result.add(a.markingId);
  }
  return result;
}

/**
 * Herdadas pela marcação: as `inherit: true` dos ancestrais, da raiz até o pai
 * (como `getInheritedAnnotations`, mas com os índices já montados do render).
 */
function inheritedOf(
  marking: Marking,
  byId: ReadonlyMap<string, Marking>,
  byMarking: ReadonlyMap<string, readonly Annotation[]>,
): CardInherited[] {
  const ancestors: Marking[] = [];
  let parent = marking.parentId === null ? undefined : byId.get(marking.parentId);
  while (parent && ancestors.length <= byId.size) {
    ancestors.unshift(parent);
    parent = parent.parentId === null ? undefined : byId.get(parent.parentId);
  }
  return ancestors.flatMap((source) =>
    (byMarking.get(source.id) ?? [])
      .filter((a) => a.inherit)
      .map((annotation) => ({ annotation, source })),
  );
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
  /** Visibilidade de cada marcação no último desenho (modo de exibição). */
  private visibility: ReadonlyMap<string, MarkingVisibility> = new Map();

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
    const dots = project ? layerDotsByMarking(project, shown) : new Map();
    // "Sem anotação" (esmaecer/ocultar) é medido só pela camada ativa, própria ou herdada.
    const activeLayer = shown.find((l) => l.id === activeLayerId);
    const activeDots =
      project && activeLayer ? layerDotsByMarking(project, [activeLayer]) : new Map();
    const selection = this.ui.selection.value;
    this.visibility = project
      ? markingVisibility(
          project,
          activeDots,
          markingDisplay.value,
          selection?.kind === 'marking' ? selection.id : null,
        )
      : new Map();
    const incomplete = project ? incompleteMarkings(project, shown) : new Set<string>();
    this.renderMarkings(project, shown, placements, dots, incomplete, tokens, v.scale);
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
    dots: ReadonlyMap<string, readonly LayerDot[]>,
    incomplete: ReadonlySet<string>,
    tokens: CanvasTokens,
    zoom: number,
  ): void {
    const markings = project?.markings ?? [];
    const selection = this.ui.selection.value;
    const semantic = semanticText.value;
    const size = this.size.value;
    const vp = this.viewport.value;
    /** Parte do canvas visível na tela, em coordenadas do canvas. */
    const view: Rect = {
      x: -vp.x / vp.scale,
      y: -vp.y / vp.scale,
      width: size.width / vp.scale,
      height: size.height / vp.scale,
    };
    const byMarking: ReadonlyMap<string, readonly Annotation[]> =
      project && semantic ? annotationsByMarking(project) : new Map();
    const owners = new Map(
      semantic ? (project?.annotations ?? []).map((a) => [a.id, a]) : [],
    );
    const byId = new Map(markings.map((m) => [m.id, m]));
    const children = childrenIndex(markings);
    const labels = cardLabels(project);
    const lineColors = new Map(project?.images.map((i) => [i.id, i.markingColor]));
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
      const visibility = this.visibility.get(marking.id) ?? 'full';
      const onScreen =
        visibility !== 'hidden' && intersectRects(markingRect, view) !== null;
      node.group.visible(onScreen);
      // Reordenar custa caro no Konva: só quando a posição na pilha mudou.
      if (node.group.zIndex() !== index) node.group.zIndex(index);
      index++;
      if (!onScreen) continue;
      const selected = selection?.kind === 'marking' && selection.id === marking.id;
      // Cor da borda escolhida para a imagem (sem escolha, a neutra do tema).
      const lineColor = lineColors.get(marking.imageId) ?? null;
      this.updateMarkingNode(
        node,
        marking,
        placement,
        selected,
        visibility,
        dots.get(marking.id) ?? [],
        incomplete.has(marking.id),
        lineColor ? { ...tokens, marking: lineColor } : tokens,
        zoom,
      );
      // Ancestral de contexto (modo Ocultar): só a borda, sem cartão nem nome.
      const enabled = semantic && visibility !== 'outline';
      const pxPerUnit = placement.scale * zoom;
      const screenWidth = marking.rect.width * pxPerUnit;
      const screenHeight = marking.rect.height * pxPerUnit;
      const bigEnough =
        enabled &&
        screenWidth >= SEMANTIC_MIN_WIDTH &&
        screenHeight >= SEMANTIC_MIN_HEIGHT;
      // Com filhas, o cartão vai na maior área livre delas (as ocultas não ocupam
      // espaço). Entre as áreas em que o cartão cabe, a maior.
      const kids = bigEnough
        ? (children.get(marking.id) ?? []).filter(
            (k) => this.visibility.get(k.id) !== 'hidden',
          )
        : [];
      const area = !bigEnough
        ? null
        : kids.length === 0
          ? marking.rect
          : largestFreeRect(
              marking.rect,
              kids.map((k) => k.rect),
              {
                minWidth: SEMANTIC_MIN_WIDTH / pxPerUnit,
                minHeight: SEMANTIC_MIN_HEIGHT / pxPerUnit,
              },
            );
      const mode = semanticMode({
        enabled,
        screenWidth,
        screenHeight,
        areaWidth: area ? area.width * pxPerUnit : null,
        areaHeight: area ? area.height * pxPerUnit : null,
      });
      const sections =
        mode === 'none'
          ? []
          : cardSections(
              shown,
              byMarking.get(marking.id) ?? [],
              inheritedOf(marking, byId, byMarking),
            );
      this.updateSemanticText(
        node,
        marking,
        markingRect,
        area && mode === 'full' ? markingCanvasRect(placement, area) : null,
        view,
        mode,
        cardRows(sections, owners, labels),
        sections.map((section) => section.layer),
        incomplete.has(marking.id),
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
      alert: new KonvaText({ text: ALERT_GLYPH, fontStyle: 'bold' }),
      text: new Konva.Group(),
      header: new KonvaText({
        wrap: 'none',
        ellipsis: true,
        fontStyle: 'bold',
        fillAfterStrokeEnabled: true,
      }),
      card: new KonvaRect(),
      lines: [],
      shapes: [],
    };
    node.text.add(node.card, node.header);
    node.indicators.add(...dots, node.more, node.alert);
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
    visibility: MarkingVisibility,
    dots: readonly LayerDot[],
    incomplete: boolean,
    tokens: CanvasTokens,
    zoom: number,
  ): void {
    const rect = markingCanvasRect(placement, marking.rect);
    // Sem anotação (própria ou herdada) nas camadas visíveis: esmaecida (a selecionada, nunca).
    node.group.opacity(
      visibility === 'dim'
        ? DIMMED_OPACITY
        : visibility === 'outline'
          ? OUTLINE_OPACITY
          : 1,
    );
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
    // Ancestral de contexto (modo Ocultar): só a borda, sem alerta nem bolinhas.
    const outline = visibility === 'outline';
    if (marking.needsReview && !outline) {
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
    this.updateIndicators(
      node,
      marking,
      rect,
      outline ? [] : dots,
      incomplete && !outline,
      tokens,
      zoom,
    );
  }

  /**
   * Bolinhas coloridas no canto superior esquerdo, uma por camada visível com
   * anotação, e o alerta de incompleta logo depois delas.
   */
  private updateIndicators(
    node: MarkingNode,
    marking: Marking,
    rect: Rect,
    layers: readonly LayerDot[],
    incomplete: boolean,
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
      // Só por herança: bolinha vazada (contorno na cor da camada).
      const item = layers[i];
      const hollow = item?.inheritedOnly ?? false;
      dot.setAttrs({
        visible: true,
        x: x0 + i * step,
        y: cy,
        radius: hollow ? radius - 0.5 / zoom : radius,
        fill: hollow ? tokens.surface : (item?.layer.color ?? tokens.marking),
        stroke: hollow ? (item?.layer.color ?? tokens.marking) : tokens.surface,
        strokeWidth: (hollow ? 2 : 1) / zoom,
      });
    });
    const extra = layers.length - MAX_DOTS;
    const afterDots = x0 + shown * step - radius;
    if (incomplete) {
      const size = ALERT_SIZE / zoom;
      node.alert.setAttrs({
        visible: true,
        x: afterDots + (extra > 0 ? MORE_WIDTH / zoom : 0),
        y: cy - size / 2,
        fontSize: size,
        fill: tokens.warning,
        stroke: tokens.surface,
        strokeWidth: 3 / zoom,
        fillAfterStrokeEnabled: true,
      });
    } else {
      node.alert.visible(false);
    }
    if (extra <= 0) {
      node.more.visible(false);
      return;
    }
    const fontSize = 11 / zoom;
    node.more.setAttrs({
      visible: true,
      text: `+${extra}`,
      x: afterDots,
      y: cy - fontSize / 2,
      fontSize,
      fill: tokens.marking,
      stroke: tokens.surface,
      strokeWidth: 3 / zoom,
      fillAfterStrokeEnabled: true,
    });
  }

  /**
   * Zoom semântico. No cabeçalho, o nome da marcação (ao lado das bolinhas); em
   * `full`, também o cartão com uma seção por camada visível, dentro de `area`
   * (o próprio retângulo ou, com filhas, a maior área livre delas). Em `header`
   * a área é pequena demais: o nome termina com "…". Tudo é recortado na parte
   * visível da marcação, e só as linhas que cabem viram nós.
   */
  private updateSemanticText(
    node: MarkingNode,
    marking: Marking,
    markingRect: Rect,
    area: Rect | null,
    view: Rect,
    mode: SemanticMode,
    rows: readonly CardRow[],
    sectionLayers: readonly Layer[],
    incomplete: boolean,
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
    node.text.setAttrs({
      visible: true,
      clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    });
    // Alerta e bolinhas só ocupam o cabeçalho se o canto da marcação estiver visível.
    const atCorner = rect.x === markingRect.x && rect.y === markingRect.y;
    // Uma seção por camada que chega à marcação: o mesmo número de bolinhas.
    const dotCount = atCorner ? sectionLayers.length : 0;
    const shownDots = Math.min(dotCount, MAX_DOTS);
    // O nome começa depois do alerta de revisão e das bolinhas.
    const before = atCorner && marking.needsReview ? REVIEW_BADGE_SIZE + DOT_MARGIN : 0;
    const dotsWidth =
      shownDots > 0 ? shownDots * (2 * DOT_RADIUS + DOT_GAP) + DOT_MARGIN : 0;
    const more =
      (dotCount > MAX_DOTS ? MORE_WIDTH : 0) +
      (atCorner && incomplete ? ALERT_SIZE + 2 : 0);
    const headerX =
      rect.x + px(before + dotsWidth + more + (dotsWidth + more > 0 ? 0 : TEXT_PADDING));
    const cut = mode === 'header' && rows.length > 0;
    const headerText =
      marking.name !== null
        ? cut
          ? `${marking.name} ${ELLIPSIS}`
          : marking.name
        : cut
          ? ELLIPSIS
          : '';
    if (headerText === '') {
      node.header.visible(false);
    } else {
      node.header.setAttrs({
        visible: true,
        text: headerText,
        x: headerX,
        y: rect.y + px((TEXT_HEADER_HEIGHT - TEXT_FONT_SIZE) / 2),
        width: Math.max(0, rect.x + rect.width - headerX - px(TEXT_PADDING)),
        height: px(TEXT_LINE_HEIGHT),
        fontSize: px(TEXT_FONT_SIZE),
        fill: tokens.marking,
        stroke: tokens.surface,
        strokeWidth: 2.5 / zoom,
      });
    }
    const headerUsed = headerText !== '' || before + dotsWidth > 0;
    this.updateCard(node, area, rect, headerUsed, rows, sectionLayers, tokens, zoom);
  }

  /** Cartão com fundo semiopaco: barra da camada, nomes, pares com recuo e separadores. */
  private updateCard(
    node: MarkingNode,
    area: Rect | null,
    visible: Rect,
    headerUsed: boolean,
    rows: readonly CardRow[],
    sectionLayers: readonly Layer[],
    tokens: CanvasTokens,
    zoom: number,
  ): void {
    const px = (n: number) => n / zoom;
    const hide = () => {
      node.card.visible(false);
      for (const line of node.lines) line.visible(false);
      for (const shape of node.shapes) shape.visible(false);
    };
    const box = area ? intersectRects(area, visible) : null;
    if (!box || rows.length === 0) {
      hide();
      return;
    }
    // O cartão não cobre a linha de cabeçalho da marcação.
    const headerBottom = visible.y + px(TEXT_HEADER_HEIGHT + 2);
    const top = Math.max(box.y, headerUsed ? headerBottom : box.y) + px(CARD_MARGIN);
    const bottom = box.y + box.height - px(CARD_MARGIN);
    const x = box.x + px(CARD_MARGIN);
    const width = Math.min(box.width - px(2 * CARD_MARGIN), px(CARD_MAX_WIDTH));
    const layout = layoutCard(rows, (bottom - top) * zoom - 2 * CARD_PADDING);
    if (width < px(CARD_MIN_WIDTH) || layout.rows.length === 0) {
      hide();
      return;
    }
    node.card.setAttrs({
      visible: true,
      x,
      y: top,
      width,
      height: px(layout.height + 2 * CARD_PADDING),
      fill: tokens.surface,
      opacity: CARD_OPACITY,
      cornerRadius: px(CARD_RADIUS),
      stroke: tokens.border,
      strokeWidth: px(1),
    });

    const contentX = x + px(CARD_PADDING + CARD_BAR_WIDTH + CARD_BAR_GAP);
    const contentRight = x + width - px(CARD_PADDING);
    const rowY = (y: number) => top + px(CARD_PADDING + y);

    type Shape = { x: number; y: number; width: number; height: number; fill: string };
    const shapes: Shape[] = [];
    // Barra vertical na cor da camada, do nome dela até a última linha da seção.
    const spans = new Map<number, { from: number; to: number }>();
    for (const row of layout.rows) {
      const span = spans.get(row.section);
      const to = row.y + row.height;
      spans.set(row.section, { from: span?.from ?? row.y, to });
    }
    for (const [section, { from, to }] of spans) {
      shapes.push({
        x: x + px(CARD_PADDING),
        y: rowY(from),
        width: px(CARD_BAR_WIDTH),
        height: px(to - from),
        fill: sectionLayers[section]?.color ?? tokens.marking,
      });
    }
    type Line = {
      text: string;
      x: number;
      y: number;
      height: number;
      fontSize: number;
      fontStyle: string;
      fill: string;
      opacity: number;
    };
    const lines: Line[] = [];
    for (const row of layout.rows) {
      if (row.kind === 'separator') {
        shapes.push({
          x: contentX,
          y: rowY(row.y + row.height / 2),
          width: Math.max(0, contentRight - contentX),
          height: px(1),
          fill: tokens.border,
        });
        continue;
      }
      const inherited = 'inherited' in row && row.inherited;
      const italic = inherited || (row.kind === 'title' && row.untitled);
      const bold = row.kind === 'title' && !row.untitled;
      const muted =
        row.kind === 'layer' ||
        row.kind === 'note' ||
        row.kind === 'more' ||
        (row.kind === 'title' && row.untitled);
      lines.push({
        text: row.kind === 'more' ? ELLIPSIS : row.text,
        x: contentX + (row.kind === 'entry' ? px(CARD_ENTRY_INDENT) : 0),
        y: rowY(row.y),
        height: px(row.height),
        fontSize: px(CARD_FONT[row.kind]),
        fontStyle:
          [italic ? 'italic' : '', bold ? 'bold' : ''].join(' ').trim() || 'normal',
        fill:
          'alert' in row && row.alert
            ? tokens.warning
            : muted
              ? tokens.textMuted
              : tokens.text,
        opacity: inherited ? CARD_INHERITED_OPACITY : 1,
      });
    }

    while (node.shapes.length < shapes.length) {
      const shape = new KonvaRect();
      node.shapes.push(shape);
      node.text.add(shape);
    }
    node.shapes.forEach((node, i) => {
      const shape = shapes[i];
      if (!shape) {
        node.visible(false);
        return;
      }
      node.setAttrs({ visible: true, ...shape, cornerRadius: shape.width / 2 });
    });
    while (node.lines.length < lines.length) {
      const line = new KonvaText({
        wrap: 'none',
        ellipsis: true,
        verticalAlign: 'middle',
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
        ...line,
        width: Math.max(0, contentRight - line.x),
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
      this.selectableMarkings(project),
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

  /** Marcações que aceitam toque: as ocultas pelo modo de exibição ficam de fora. */
  private selectableMarkings(project: Project): readonly Marking[] {
    return project.markings.filter((m) => this.visibility.get(m.id) !== 'hidden');
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
      this.selectableMarkings(project),
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
