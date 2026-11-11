// Canvas imperativo com Konva. Orquestra: monta o quadro a partir dos signals do
// projeto, da UI e do estado derivado, agenda uma renderização por quadro e
// delega o desenho aos renderers, a entrada a `input/` e o viewport ao
// `ViewportController`. Único lugar (com `CanvasHost`) que conhece o Konva.
import { computed, effect, signal, untracked } from '@preact/signals';
import Konva from 'konva/lib/Core';
import {
  canEditImagePlacement,
  imageCanvasRect,
  isMarkingGeometryLocked,
  type Placement,
  type Project,
  type ProjectContainer,
} from '../model';
import type { EditorDerived } from '../store/derived';
import type { DisplayImages } from '../store/displayImages';
import type { ProjectStore } from '../store/history';
import type { ProjectActions } from '../store/project';
import type { ReviewState } from '../store/review';
import { locale, showArrows } from '../store/settings';
import type { PerspectiveState } from '../store/perspectives';
import { projectInPerspective } from '../store/perspectiveShown';
import { textMeasurer } from '../store/textMeasure';
import { selectionCanvasBounds } from './selectionBounds';
import { formatSelectionBox, formatViewport, selectionScreenBox } from './selectionBox';
import {
  formatArrowHandles,
  formatContainerBoxes,
  formatSelection,
} from './hostAttributes';
import { composingAnchor, selectedThreadId } from '../store/threadUi';
import {
  itemsOf,
  peekSelectedItems,
  resolveSelection,
  type EditorUi,
  type SelectionItem,
} from '../store/ui';
import {
  ARROW_KEYS,
  COMPONENT_KEYS,
  IMAGE_KEYS,
  OVERLAY_KEYS,
  cancelFrame,
  createInteractionState,
  requestFrame,
  sameFrame,
  visibleArea,
  type DropTarget,
  type Frame,
  type HoverLock,
  type InteractionState,
  type ViewFrame,
} from './frame';
import { arrowShape, visibleArrowShapes, type ArrowShape } from './arrowGeometry';
import { EMPTY_DRAG, dragSetOf, mergeDrag, type DragSet } from './dragSet';
import { ComponentLayerRenderer } from './components/componentLayer';
import { konvaMeasurer } from './components/konvaMeasurer';
import {
  type RemoteImageSource,
  sharedRemoteImageSource,
} from './components/remoteImages';
import { imageAt, imagesBounds } from './imageGeometry';
import { watchSpaceKey } from './input/keyboard';
import { PointerInput } from './input/pointer';
import { hitChain } from './input/intents';
import { canvasToImagePixel, markingCanvasRect } from './markingGeometry';
import { ArrowRenderer, type ArrowChanges } from './renderers/arrows';
import { ImageRenderer } from './renderers/images';
import { MarkingRenderer } from './renderers/markings';
import { OverlayRenderer } from './renderers/overlay';
import { CommentPinRenderer } from './renderers/commentPins';
import { ArrivalRenderer } from './renderers/arrivals';
import { arrivalMarks } from './arrivals';
import { ReviewRenderer } from './renderers/review';
import { pinHit, pinPlaces, pointCanvas, type PinPlace } from './commentPins';
import { proposedDisplay, reviewMarks, type ReviewCanvas } from './reviewMarks';
import { readCanvasTokens, watchTheme, type CanvasTokens } from './theme';
import { clampZoom, type Point, type Viewport } from './viewport';
import { ViewportController } from './viewportController';
import { sameCursor, type CanvasViewState } from './viewState';

export type { DropTarget } from './frame';

/** Mesmas imagens com as mesmas posições (por referência): zoom e pan não mudam isso. */
/** Escreve ou apaga (valor nulo) um `data-*` do host. */
function setDataAttr(host: HTMLElement, key: string, value: string | null): void {
  if (value === null) delete host.dataset[key];
  else host.dataset[key] = value;
}

function samePlacements(
  a: ReadonlyMap<string, Placement>,
  b: ReadonlyMap<string, Placement>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [id, placement] of a) if (b.get(id) !== placement) return false;
  return true;
}

export interface CanvasControllerOptions {
  readonly container: HTMLDivElement;
  readonly store: ProjectStore;
  readonly actions: ProjectActions;
  readonly display: DisplayImages<ImageBitmap>;
  readonly ui: EditorUi;
  readonly derived: EditorDerived;
  /** Signals que a interface lê (zoom, cursor, minimapa). */
  readonly view: CanvasViewState;
  /**
   * Revisão de propostas (etapa 4): com uma proposta aberta, o canvas desenha o projeto
   * "como ficaria" (ou o atual, na visão Atual) com as marcas de revisão.
   */
  readonly review?: ReviewState;
  /**
   * Perspectiva aberta (etapa #659, PE2): o canvas desenha o projeto à vista dela (as raízes que
   * ela mostra, onde ela as põe) e não começa o que é só da Principal. Sem ele, a Principal.
   */
  readonly perspective?: PerspectiveState;
  /**
   * Imagens remotas dos componentes (RI3): as duas portas da app e o carregador. Padrão: a fonte
   * de produção; os testes passam uma falsa.
   */
  readonly remoteImages?: RemoteImageSource;
}

/** Sem setas à vista ("Mostrar setas" desligado, ou o item Setas do modo visualização): sempre o mesmo array. */
const NO_ARROWS: readonly ArrowShape[] = [];

/** Seleção vazia (modo visualização): sempre o mesmo objeto, o quadro compara por referência. */
const NO_ITEMS: readonly SelectionItem[] = [];

/**
 * Estado de interação por cima da imagem (rascunho, trava, hover, seleção, marcas da revisão,
 * seta e retângulo de seleção). No modo visualização nada disso aparece.
 */
interface Overlays {
  readonly draft: Frame['draft'];
  readonly hoverLock: Frame['hoverLock'];
  readonly hoverMarking: Frame['hoverMarking'];
  readonly selection: Frame['selection'];
  readonly review: Frame['review'];
  readonly arrowDraft: Frame['arrowDraft'];
  readonly marquee: Frame['marquee'];
  readonly pins: Frame['pins'];
  readonly pinSelected: Frame['pinSelected'];
  readonly draftPin: Frame['draftPin'];
  readonly arrivals: Frame['arrivals'];
}
const NO_PINS: readonly PinPlace[] = [];
const NO_OVERLAYS: Overlays = {
  draft: null,
  hoverLock: null,
  hoverMarking: null,
  selection: null,
  review: null,
  arrowDraft: null,
  marquee: null,
  pins: NO_PINS,
  pinSelected: null,
  draftPin: null,
  arrivals: null,
};

/** O que move o rótulo de nome das marcações (a etiqueta da selecionada desvia do do pai). */
const LABEL_KEYS = ['visibility', 'incomplete', 'view'] as const;
/** O que muda as marcas da revisão, os pinos e as marcas de chegada (além do viewport e da tela). */
const REVIEW_KEYS = ['review', 'project', 'tokens', 'locale'] as const;
const PIN_KEYS = ['pins', 'pinSelected', 'draftPin', 'tokens', 'locale'] as const;
const ARRIVAL_KEYS = ['arrivals', 'tokens', 'locale'] as const;

/** Põe em `into` os arquivos dos containers (o de fundo, sem arquivo, não tem bitmap). */
function addFiles(
  into: Set<string>,
  containers: readonly { readonly file: string | null }[] | undefined,
): void {
  for (const image of containers ?? []) {
    if (image.file !== null) into.add(image.file);
  }
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

export class CanvasController {
  private readonly store: ProjectStore;
  private readonly display: DisplayImages<ImageBitmap>;
  private readonly ui: EditorUi;
  private readonly derived: EditorDerived;
  private readonly viewState: CanvasViewState;
  private readonly review: ReviewState | null;
  private readonly perspective: PerspectiveState | null;
  private readonly remoteImages: RemoteImageSource;
  /** URLs cujas imagens mudaram desde o último quadro (o quadro refaz só as marcações delas). */
  private readonly changedImageUrls = new Set<string>();
  /** O consentimento ou um interruptor mudou: o quadro refaz todas as marcações com imagem. */
  private allImagesChanged = false;
  /** Último ponto de tela do mouse, lido no quadro (não a cada `pointermove`). */
  private cursorPoint: Point | null = null;
  private cursorRequest: number | null = null;

  private readonly state: InteractionState = createInteractionState();
  private readonly dropTarget = signal<DropTarget>(null);
  private readonly tokens = signal<CanvasTokens>(readCanvasTokens());

  private readonly stage: Konva.Stage;
  private readonly view: ViewportController;
  private readonly pointer: PointerInput;
  private readonly images: ImageRenderer;
  /** Camada dos desenhos de componentes, entre as imagens e as marcações. */
  private readonly componentGroup: Konva.Layer;
  /** Camadas do palco por nome: o quadro redesenha só as que mudaram (`dirty`). */
  private readonly layers: {
    readonly images: Konva.Layer;
    readonly components: Konva.Layer;
    readonly markings: Konva.Layer;
    readonly floating: Konva.Layer;
    readonly overlay: Konva.Layer;
  };
  /** Camadas que algum renderizador mexeu no quadro em andamento (zeradas ao desenhar). */
  private readonly dirty = new Set<Konva.Layer>();
  /**
   * Grupo de arrasto (decisões 5 a 7): no fundo da camada de sobreposições, leva os nós do que se
   * move num gesto, cada pilha no seu subgrupo e na ordem de desenho de sempre. O palco continua
   * com 5 camadas.
   */
  private readonly dragRoot: Konva.Group;
  private readonly dragGroups: {
    readonly images: Konva.Group;
    readonly components: Konva.Group;
    readonly arrows: Konva.Group;
    readonly markings: Konva.Group;
    readonly floatingComponents: Konva.Group;
    readonly floating: Konva.Group;
  };
  /** O que se move no gesto em andamento (só cresce até soltar) e o projeto desenhado de antes dele. */
  private drag: DragSet = EMPTY_DRAG;
  private dragBase: Project | null = null;
  private componentLayer: ComponentLayerRenderer;
  /**
   * Desenhos das marcações flutuantes (v13): camada acima das marcações, para ficarem sobre
   * containers, componentes e bordas. Suas bordas ficam no grupo seguinte da mesma camada.
   */
  private readonly floatingDrawings: Konva.Group;
  private floatingLayer: ComponentLayerRenderer;
  /** Cores com que `componentLayer` foi criado: mudou o tema, ele é refeito. */
  private componentPalette: CanvasTokens['component'];
  private readonly markings: MarkingRenderer;
  /** Grupo das setas (na camada das marcações), entre os desenhos dos componentes e as marcações. */
  private readonly arrows: ArrowRenderer;
  private readonly overlay: OverlayRenderer;
  private readonly reviewLayer: ReviewRenderer;
  private readonly pinLayer: CommentPinRenderer;
  private readonly arrivalLayer: ArrivalRenderer;
  /** O minimapa mudou de tamanho: o selo de chegada se refaz no próximo quadro. */
  private arrivalsStale = false;

  /**
   * Projeto desenhado, derivado do projeto à vista (`review.derived.shownProject`, fase
   * 8.2): quando ele é o confirmado (fora da revisão ou na visão Atual), o do store, com a
   * prévia do gesto; quando é o "como ficaria" (visão Proposto), a prévia com as imagens
   * novas ou trocadas lidas de `proposals/<id>/` (`proposedDisplay`). O canvas não decide
   * Atual/Proposto: só traduz o arquivo das imagens. É também o que o toque, o cursor e o
   * enquadrar consultam.
   */
  private readonly drawnProject = computed(() => {
    const review = this.review;
    // Fora da revisão: o projeto do store (com a prévia do gesto), recortado pela perspectiva
    // aberta. A prévia muda `perspectives[].items`, então o recorte sai do projeto do store, e não
    // do confirmado. Na revisão a perspectiva é a Principal (a troca fica travada).
    if (!review || review.proposalId.value === null) {
      return projectInPerspective(
        this.store.project.value,
        this.perspective?.id.value ?? null,
      );
    }
    const shown = review.derived.shownProject.value;
    if (shown === null || shown === this.store.committed.value) {
      return this.store.project.value;
    }
    const proposal = review.derived.proposal.value;
    return proposal ? proposedDisplay(shown, proposal) : shown;
  });

  /** Marcas da revisão (tipo, conflito, inválida, fantasmas, removidas); `null` fora dela. */
  private readonly reviewCanvas = computed((): ReviewCanvas | null => {
    const review = this.review;
    if (!review || review.proposalId.value === null) return null;
    const d = review.derived;
    const proposal = d.proposal.value;
    const tree = d.tree.value;
    const current = this.store.committed.value;
    const drawn = this.drawnProject.value;
    if (!proposal || !tree || !current || !drawn) return null;
    return reviewMarks({
      proposal,
      tree,
      types: d.changeTypes.value,
      conflicts: d.conflictIds.value,
      invalid: d.invalid.value.changeIds,
      view: review.view.value,
      current,
      drawn,
    });
  });

  /**
   * Desenhos dos componentes do projeto desenhado: na prévia de um gesto só a marcação
   * arrastada é reinstanciada, e na visão Proposto são os valores propostos. O cache é o do
   * derivado (as demais marcações mantêm o mesmo objeto).
   */
  private readonly drawings = computed(() =>
    this.derived.drawingsOf(this.drawnProject.value),
  );

  /**
   * Itens selecionados (o primário por último). Um `computed` guarda o array até a seleção mudar:
   * refazer o quadro por causa de pan ou zoom não pode redesenhar a sobreposição à toa.
   */
  private readonly selectedItems = computed(() =>
    this.ui.viewMode.value
      ? NO_ITEMS
      : itemsOf(this.ui.selection.value, this.ui.selectionGroup.value),
  );

  /** Container que receberia a marcação arrastada, como alvo de soltar. */
  private readonly moveTargetFrame = computed((): DropTarget => {
    const id = this.state.moveTarget.value;
    return id === null ? null : { containerId: id };
  });

  /** Marcação que receberia a ponta da seta (criar ou trocar a ponta) como alvo de soltar. */
  private readonly arrowTargetFrame = computed((): DropTarget => {
    const id = this.state.arrowDraft.value?.target ?? null;
    return id === null ? null : { containerId: null, markingId: id };
  });

  /**
   * O que o modo visualização mostra, ou `null` fora dele. O mesmo objeto enquanto os cinco itens
   * não mudam: marcar uma camada com desenho não refaz imagens, marcações nem setas.
   */
  private lastView: ViewFrame | null = null;
  private readonly viewFrame = computed((): ViewFrame | null => {
    if (!this.ui.viewMode.value) return null;
    const { containers, images, outline, names, arrows } = this.ui.viewShow.value;
    const last = this.lastView;
    if (
      last?.containers === containers &&
      last.images === images &&
      last.outline === outline &&
      last.names === names &&
      last.arrows === arrows
    ) {
      return last;
    }
    this.lastView = { containers, images, outline, names, arrows };
    return this.lastView;
  });

  /**
   * Setas desenhadas: as do projeto desenhado (com a prévia do gesto) cujas duas pontas aparecem.
   * Fora do modo visualização, só com "Mostrar setas" ligado; no modo, só com o item Setas do
   * painel (as Configurações não valem) e sem o filtro "Marcações sem anotação". As rotas são
   * guardadas por seta e por projeto/visibilidade (`visibleArrowShapes`): pan e zoom não as
   * recalculam.
   */
  private readonly arrowShapes = computed((): readonly ArrowShape[] => {
    const view = this.viewFrame.value;
    if (!(view === null ? showArrows.value : view.arrows)) return NO_ARROWS;
    return visibleArrowShapes(
      this.drawnProject.value,
      this.derived.canvasVisibility.value,
    );
  });

  /**
   * Os pinos das conversas (decisão 24): os grupos do estado derivado postos no projeto desenhado.
   * Nenhum na revisão (a conversa fica só para leitura, decisão 26); o viewport não entra aqui.
   */
  private readonly pinPlaces = computed((): readonly PinPlace[] => {
    if (this.review?.proposalId.value != null) return NO_PINS;
    const project = this.drawnProject.value;
    const groups = this.derived.threads.pins.value;
    if (!project || groups.length === 0) return NO_PINS;
    // Conversa num ponto do canvas só aparece na Principal (decisão 15).
    const principal = (this.perspective?.id.value ?? null) === null;
    return pinPlaces(project, groups, this.derived.canvasVisibility.value, principal);
  });

  /**
   * As marcas de chegada (PE3, decisão 8): o selo "Veio de <nome>" e a faixa, só na Principal.
   * Nenhuma com uma perspectiva ou uma proposta aberta; memoizadas pelo projeto (pan e zoom não
   * entram aqui).
   */
  private readonly arrivalMarks = computed(() => {
    if (this.review?.proposalId.value != null) return null;
    if ((this.perspective?.id.value ?? null) !== null) return null;
    return arrivalMarks(this.drawnProject.value);
  });

  /** O pino tracejado do rascunho de uma conversa nova num ponto. */
  private readonly draftPin = computed((): Point | null => {
    const anchor = composingAnchor(this.ui);
    const project = this.drawnProject.value;
    if (anchor?.kind !== 'point' || !project || this.review?.proposalId.value != null) {
      return null;
    }
    return pointCanvas(project, anchor.containerId, anchor.x, anchor.y);
  });

  /** O estado de interação do quadro; vazio no modo visualização (só para ver). */
  private readonly overlays = computed((): Overlays =>
    this.viewFrame.value !== null
      ? NO_OVERLAYS
      : {
          draft: this.state.draft.value,
          hoverLock: this.state.hoverLock.value,
          hoverMarking: this.state.hoverMarking.value,
          selection: this.ui.selection.value,
          review: this.reviewCanvas.value,
          arrowDraft: this.state.arrowDraft.value,
          marquee: this.state.marquee.value,
          pins: this.pinPlaces.value,
          pinSelected: selectedThreadId(this.ui),
          draftPin: this.draftPin.value,
          arrivals: this.arrivalMarks.value,
        },
  );

  /** Entradas do quadro: projeto, UI, dados derivados e viewport. */
  private readonly frame = computed((): Frame => {
    const view = this.viewFrame.value;
    const over = this.overlays.value;
    return {
      project: this.drawnProject.value,
      readOnly: this.store.locked.value,
      bitmaps: this.display.images.value,
      preview: this.state.preview.value,
      draft: over.draft,
      // O alvo de soltar um arquivo ou, ao arrastar uma marcação, o container que a receberia.
      dropTarget:
        this.dropTarget.value ??
        this.moveTargetFrame.value ??
        this.arrowTargetFrame.value,
      absorb: this.state.absorb.value,
      hoverLock: over.hoverLock,
      hoverMarking: over.hoverMarking,
      tokens: this.tokens.value,
      size: this.view.size.value,
      viewport: this.view.viewport.value,
      selection: over.selection,
      items: this.selectedItems.value,
      mode: view === null ? this.ui.mode.value : 'navigate',
      locale: locale.value,
      incomplete: this.derived.incompleteMarkings.value,
      visibility: this.derived.canvasVisibility.value,
      drawings: this.drawings.value,
      drawn: this.derived.drawnMarkings.value,
      floating: this.derived.floatingMarkings.value,
      review: over.review,
      arrows: this.arrowShapes.value,
      arrowDraft: over.arrowDraft,
      marquee: over.marquee,
      view,
      pins: over.pins,
      pinSelected: over.pinSelected,
      draftPin: over.draftPin,
      arrivals: over.arrivals,
    };
  });
  /** Último quadro desenhado: o que não mudou desde ele não é redesenhado. */
  private drawn: Frame | null = null;
  /** Placements do último quadro (com a prévia do gesto aplicada). */
  private placements: ReadonlyMap<string, Placement> = new Map();
  private frameRequest: number | null = null;
  private destroyed = false;
  /** Imagens com bitmap pronto no último quadro e o que já foi publicado no container. */
  private readyImages = 0;
  private drawnComponents = 0;
  private drawnArrows = 0;
  private countedProject: Project | null = null;
  private canvasMarkingCount = 0;
  private published = '';
  /** `data-container-boxes`: texto guardado, array `containers` de que saiu e versão do texto. */
  private boxesText: string | null = null;
  private boxesContainers: readonly ProjectContainer[] | null = null;
  private boxesVersion = 0;
  private readonly cleanups: (() => void)[] = [];

  constructor(options: CanvasControllerOptions) {
    const { container } = options;
    this.store = options.store;
    this.display = options.display;
    this.ui = options.ui;
    this.derived = options.derived;
    this.viewState = options.view;
    this.review = options.review ?? null;
    this.perspective = options.perspective ?? null;
    this.remoteImages = options.remoteImages ?? sharedRemoteImageSource();

    // Os desenhos medem texto com o Konva (o layout bate com o que é pintado) e se redesenham
    // quando o medidor muda; o modelo e o store nunca importam o Konva.
    if (textMeasurer.peek() !== konvaMeasurer) textMeasurer.value = konvaMeasurer;

    this.stage = new Konva.Stage({ container, width: 1, height: 1 });
    // O `name` das camadas só serve para identificá-las (medidores dos testes e do perf:canvas).
    const imageLayer = new Konva.Layer({ listening: false, name: 'images' });
    this.componentGroup = new Konva.Layer({ listening: false, name: 'components' });
    // Setas e marcações dividem uma camada (o Konva avisa no console a partir de seis): elas se
    // redesenham juntas a cada edição, e um `Group` para cada mantém a ordem (setas por baixo).
    const arrowMarkingLayer = new Konva.Layer({ listening: false, name: 'markings' });
    const arrowLayer = new Konva.Group({ listening: false });
    const markingLayer = new Konva.Group({ listening: false });
    arrowMarkingLayer.add(arrowLayer, markingLayer);
    const overlayLayer = new Konva.Layer({ listening: false, name: 'overlay' });
    const floatingTop = new Konva.Layer({ listening: false, name: 'floating' });
    this.stage.add(
      imageLayer,
      this.componentGroup,
      arrowMarkingLayer,
      floatingTop,
      overlayLayer,
    );
    this.layers = {
      images: imageLayer,
      components: this.componentGroup,
      markings: arrowMarkingLayer,
      floating: floatingTop,
      overlay: overlayLayer,
    };
    this.images = new ImageRenderer(imageLayer);
    this.componentPalette = this.tokens.peek().component;
    this.componentLayer = this.newComponentLayer(this.componentGroup);
    this.floatingDrawings = new Konva.Group({ listening: false });
    const floatingMarkings = new Konva.Group({ listening: false });
    floatingTop.add(this.floatingDrawings, floatingMarkings);
    this.floatingLayer = this.newComponentLayer(this.floatingDrawings);
    this.markings = new MarkingRenderer(markingLayer, floatingMarkings);
    this.arrows = new ArrowRenderer(arrowLayer);
    this.overlay = new OverlayRenderer(overlayLayer, container);
    // As marcas da revisão ficam por baixo das sobreposições (seleção, alças).
    const reviewGroup = new Konva.Group({ listening: false });
    overlayLayer.add(reviewGroup);
    reviewGroup.moveToBottom();
    this.reviewLayer = new ReviewRenderer(reviewGroup);
    const pinGroup = new Konva.Group({ listening: false });
    overlayLayer.add(pinGroup);
    this.pinLayer = new CommentPinRenderer(pinGroup);
    // A faixa e os selos de chegada ficam por baixo das sobreposições, acima das marcas da revisão.
    const arrivalGroup = new Konva.Group({ listening: false });
    overlayLayer.add(arrivalGroup);
    arrivalGroup.moveToBottom();
    this.arrivalLayer = new ArrivalRenderer(arrivalGroup, () => {
      this.arrivalsStale = true;
      this.requestRender();
    });
    // O grupo de arrasto fica por baixo de tudo da camada (faixa de chegada, marcas da revisão,
    // pinos e alças); ao soltar, os nós voltam às camadas de onde saíram.
    this.dragRoot = new Konva.Group({ listening: false, name: 'drag' });
    const dragGroup = () => {
      const group = new Konva.Group({ listening: false });
      this.dragRoot.add(group);
      return group;
    };
    this.dragGroups = {
      images: dragGroup(),
      components: dragGroup(),
      arrows: dragGroup(),
      markings: dragGroup(),
      floatingComponents: dragGroup(),
      floating: dragGroup(),
    };
    overlayLayer.add(this.dragRoot);
    this.dragRoot.moveToBottom();

    this.view = new ViewportController(container, () => this.drawnProject.peek());
    const space = watchSpaceKey(() => this.pointer.updateCursor(null));
    this.pointer = new PointerInput({
      container,
      store: this.store,
      actions: options.actions,
      ui: this.ui,
      derived: this.derived,
      viewport: this.view,
      state: this.state,
      spaceDown: space.down,
      project: () => this.drawnProject.peek(),
      reviewing: () => this.review?.proposalId.peek() != null,
      perspectiveOpen: () => this.perspective?.openId() != null,
      pinAt: (c) => {
        const { pins, tokens } = this.frame.peek();
        return pinHit(pins, c, this.view.scale, tokens.pin);
      },
      containerTitles: () => this.images.titleRects(),
    });

    this.cleanups.push(
      this.pointer.bind(),
      space.dispose,
      this.view.observe(),
      watchTheme(() => (this.tokens.value = readCanvasTokens())),
      effect(() => this.loadBitmaps()),
      // Imagem remota que termina (ou falha, ou sai do cache): refaz só as marcações dela, num
      // quadro só (`requestRender` coalesce várias no mesmo quadro).
      this.remoteImages.subscribe((url) => {
        if (this.destroyed) return;
        this.changedImageUrls.add(url);
        this.requestRender();
      }),
      // Consentimento ou interruptor mudou: todas as marcações com imagem remota são refeitas.
      effect(() => {
        void this.remoteImages.gate.value;
        this.allImagesChanged = true;
        this.requestRender();
      }),
      // O effect só agenda: várias mudanças no mesmo quadro geram um desenho só.
      effect(() => {
        void this.frame.value;
        this.requestRender();
      }),
      // Soltar sem mudar nada não muda o quadro, mas os nós do grupo de arrasto precisam voltar.
      effect(() => {
        void this.store.gestureActive.value;
        this.requestRender();
      }),
      // Espelha o viewport para a interface (barra de status, minimapa, campo de zoom).
      effect(() => {
        this.viewState.viewport.value = this.view.viewport.value;
        this.viewState.size.value = this.view.size.value;
      }),
      effect(() => {
        // Projeto à vista, sem a prévia do gesto: um gesto em andamento não refaz o
        // minimapa a cada quadro; na visão Proposto, as imagens da prévia.
        const shown =
          this.review?.derived.shownProject.value ??
          projectInPerspective(
            this.store.committed.value,
            this.perspective?.id.value ?? null,
          );
        this.viewState.bounds.value = imagesBounds(
          shown?.containers ?? [],
          shown?.markings,
        );
      }),
      this.watchCursor(),
      () => {
        if (this.frameRequest !== null) cancelFrame(this.frameRequest);
        this.frameRequest = null;
        if (this.cursorRequest !== null) cancelFrame(this.cursorRequest);
        this.cursorRequest = null;
      },
    );
  }

  /** Enquadra todas as imagens (ou uma área padrão, com o canvas vazio). */
  fitAll(): void {
    this.view.fitAll();
  }

  /**
   * Enquadra todos os itens selecionados (zoom e centro), com a folga do `fitAll`. Só mexe na
   * vista: sem seleção, ou no modo Visualizar, não faz nada.
   */
  fitSelection(): void {
    if (this.ui.viewMode.peek()) return;
    const bounds = selectionCanvasBounds(
      this.drawnProject.peek(),
      peekSelectedItems(this.ui),
    );
    if (bounds) this.view.fitTo(bounds);
  }

  /** Aplica o zoom `factor` no centro da área visível (campo de zoom e atalhos). */
  zoomBy(factor: number): void {
    const size = this.view.size.peek();
    this.view.zoomAt({ x: size.width / 2, y: size.height / 2 }, factor);
  }

  /** Vai para um zoom exato (1 = 100%), mantendo o centro da área visível. */
  zoomTo(scale: number): void {
    const current = this.view.scale;
    if (current > 0) this.zoomBy(clampZoom(scale) / current);
  }

  /** Centraliza a vista num ponto do canvas (clique no minimapa). */
  centerOnPoint(point: Point): void {
    this.view.centerOnPoint(point);
  }

  /** Centraliza o canvas no item selecionado (ajustando o zoom se ele for grande ou pequeno demais). */
  centerSelection(): void {
    this.view.measure(); // O canvas pode ter acabado de reaparecer (aba Lista → Canvas).
    const project = this.drawnProject.peek();
    const selected = resolveSelection(project, this.ui.selection.peek());
    if (!project || !selected) return;
    if (selected.kind === 'arrow') {
      // A seta é enquadrada pela caixa do traço (a curva inclusive).
      const shape = arrowShape(project, selected.arrow);
      if (shape) this.view.centerOn(shape.bounds);
      return;
    }
    this.view.centerOn(
      selected.kind === 'marking'
        ? markingCanvasRect(selected.space.placement, selected.marking.rect)
        : imageCanvasRect(selected.image, selected.image.placement),
    );
  }

  /** Se a seleção está fora da área visível, faz o pan mínimo até ela (sem mudar o zoom). */
  revealSelection(): void {
    this.view.measure();
    const project = this.drawnProject.peek();
    const selected = resolveSelection(project, this.ui.selection.peek());
    if (project && selected?.kind === 'arrow') {
      const shape = arrowShape(project, selected.arrow);
      if (shape) this.view.reveal(shape.bounds);
      return;
    }
    if (selected?.kind !== 'marking') return;
    this.view.reveal(markingCanvasRect(selected.space.placement, selected.marking.rect));
  }

  /** Ponto do canvas (unidades do canvas) sob uma coordenada de tela da página. */
  canvasPointAt(clientX: number, clientY: number): Point {
    return this.view.toCanvas(this.view.screenPoint({ clientX, clientY }));
  }

  /** Centro da área visível, em unidades do canvas. */
  viewportCenter(): Point {
    return this.view.center();
  }

  /** Id da imagem sob uma coordenada de tela da página, ou `null` em área vazia. */
  imageIdAt(clientX: number, clientY: number): string | null {
    const images = this.drawnProject.peek()?.containers ?? [];
    return imageAt(images, this.canvasPointAt(clientX, clientY))?.id ?? null;
  }

  /** Destaca o alvo de um arrastar-e-soltar (`null` remove o destaque). */
  setDropTarget(target: DropTarget): void {
    this.dropTarget.value = target;
  }

  /** Há um gesto de ponteiro em andamento (as setas do teclado esperam). */
  isInteracting(): boolean {
    return this.pointer.isInteracting();
  }

  /** Cancela o gesto de mover/redimensionar/desenhar em andamento. `true` se havia um. */
  cancelInteraction(): boolean {
    return this.pointer.cancelInteraction();
  }

  destroy(): void {
    this.destroyed = true;
    this.pointer.destroy();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.componentLayer.destroy();
    this.floatingLayer.destroy();
    this.arrivalLayer.destroy();
    this.arrows.destroy();
    this.markings.destroy();
    this.stage.destroy();
  }

  private newComponentLayer(parent: Konva.Group | Konva.Layer): ComponentLayerRenderer {
    return new ComponentLayerRenderer(parent, {
      placeholder: this.componentPalette,
      // Uma imagem embutida terminou de carregar: pede um quadro (o nó já está atualizado).
      onImageLoaded: () => {
        if (!this.destroyed) this.requestRender();
      },
      remoteImage: (url) => this.remoteImages.resolve(url),
    });
  }

  /**
   * Cursor do mouse em pixels da imagem (B8): o evento só guarda o ponto e agenda um
   * quadro, então mover o mouse não escreve signals mais de uma vez por quadro.
   */
  private watchCursor(): () => void {
    const container = this.stage.container();
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      this.cursorPoint = { x: e.clientX, y: e.clientY };
      this.requestCursor();
    };
    const onLeave = () => {
      this.cursorPoint = null;
      this.requestCursor();
    };
    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerleave', onLeave);
    return () => {
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerleave', onLeave);
    };
  }

  private requestCursor(): void {
    if (this.cursorRequest !== null) return;
    this.cursorRequest = requestFrame(() => {
      this.cursorRequest = null;
      const point = this.cursorPoint;
      // O projeto desenhado: na visão Proposto, a imagem que só existe na proposta também
      // dá coordenadas (fase 8.2, P1).
      const project = this.drawnProject.peek();
      const canvas = point && this.canvasPointAt(point.x, point.y);
      const image = canvas && imageAt(project?.containers ?? [], canvas);
      const pixel = image && canvasToImagePixel(image.placement, canvas);
      const next =
        image && pixel
          ? { containerId: image.id, x: Math.floor(pixel.x), y: Math.floor(pixel.y) }
          : null;
      if (!sameCursor(this.viewState.cursor.peek(), next)) {
        this.viewState.cursor.value = next;
      }
      this.updateHover(project, canvas);
    });
  }

  /**
   * Item sob o mouse para o cadeado e para a borda das marcações desenhadas: o primeiro da cadeia
   * do toque (a flutuante, a marcação mais interna, o container, as marcações do canvas). Só
   * escreve os signals quando o resultado muda, e nada é calculado sem itens trancados nem
   * marcações desenhadas.
   */
  private updateHover(project: Project | null, canvas: Point | null): void {
    const locks = this.derived.hasLocks.peek();
    const drawn = this.derived.drawnMarkings.peek();
    let lock: HoverLock | null = null;
    let marking: string | null = null;
    if (project && canvas && (locks || drawn.size > 0)) {
      const top = hitChain(
        project,
        this.derived.markingVisibility.peek(),
        canvas,
        undefined,
        this.images.titleRects(),
      )[0];
      if (top?.kind === 'marking') {
        if (locks && isMarkingGeometryLocked(project, top.id)) {
          lock = { kind: 'marking', id: top.id };
        }
        if (drawn.has(top.id)) marking = top.id;
      } else if (top && locks && !canEditImagePlacement(project, top.id)) {
        lock = { kind: 'image', id: top.id };
      }
    }
    const current = this.state.hoverLock.peek();
    if (current?.id !== lock?.id || current?.kind !== lock?.kind) {
      this.state.hoverLock.value = lock;
    }
    if (this.state.hoverMarking.peek() !== marking)
      this.state.hoverMarking.value = marking;
  }

  /**
   * Os arquivos das imagens do projeto e, na revisão, das novas ou trocadas que esperam em
   * `proposals/`. Container sem arquivo (fundo) não tem bitmap. Devolve a mesma lista enquanto o
   * conteúdo é igual: um passo de gesto não muda os arquivos e não reacende o `loadBitmaps`.
   */
  private readonly bitmapFiles = computed((): ReadonlySet<string> => {
    const files = new Set<string>();
    addFiles(files, this.store.project.value?.containers);
    addFiles(files, this.drawnProject.value?.containers);
    if (this.lastBitmapFiles && sameSet(this.lastBitmapFiles, files)) {
      return this.lastBitmapFiles;
    }
    this.lastBitmapFiles = files;
    return files;
  });
  private lastBitmapFiles: ReadonlySet<string> | null = null;

  private loadBitmaps(): void {
    const files = this.bitmapFiles.value;
    untracked(() => {
      for (const file of files) this.display.ensure(file);
      // Arquivos que saíram do projeto (imagem excluída ou trocada) não ficam na memória.
      this.display.retain(files);
    });
  }

  private requestRender(): void {
    if (this.frameRequest !== null) return;
    this.frameRequest = requestFrame(() => {
      this.frameRequest = null;
      this.render(this.frame.peek());
    });
  }

  /**
   * Desenha o quadro. Pan e zoom só mudam o viewport: as imagens são refeitas só
   * quando muda a escala (espessuras e textos), e as marcações reaproveitam os
   * dados derivados e os cartões; só o recorte da parte visível é refeito.
   *
   * Camadas sujas: cada renderizador diz se mexeu em algum nó (ou só roda quando o seu quadro
   * mudou) e o quadro redesenha só as camadas assim marcadas (`dirty`), com `layer.batchDraw()`.
   * Pan, zoom e mudança de tamanho sujam todas (a transformação é do palco). O Konva também
   * agenda o desenho da camada de um nó cujo atributo mudou; a marcação explícita cobre o que ele
   * não enxerga (o traçado das setas, que sai de dados e não de atributos).
   */
  private render(frame: Frame): void {
    const last = this.drawn;
    this.drawn = frame;
    const { size, viewport: v } = frame;
    const scaleChanged = last?.viewport.scale !== v.scale;
    // Levar ou devolver nós ao grupo de arrasto: todos os renderizadores passam pelo quadro.
    const dragChanged = this.syncDrag(frame, last);

    this.stage.size({ width: Math.max(1, size.width), height: Math.max(1, size.height) });
    // Posição e escala numa chamada só: o Konva agrupa os atributos de transformação numa
    // cascata. Cada atributo separado (`scale()` sozinho são duas) limpa o cache de
    // transformação de todos os nós do stage e dispara `absoluteTransformChange` neles.
    this.stage.setAttrs({ x: v.x, y: v.y, scaleX: v.scale, scaleY: v.scale });

    // Pan, zoom e tamanho mexem na transformação do palco: todas as camadas se redesenham.
    const moved = last === null || last.viewport !== v || last.size !== size;
    this.refreshRemoteImages();

    let placementsChanged = last === null;
    if (scaleChanged || dragChanged || !sameFrame(last, frame, IMAGE_KEYS)) {
      const next = this.images.render(frame);
      this.mark(this.layers.images, this.images.changed);
      this.mark(this.layers.overlay, this.images.draggedChanged);
      placementsChanged ||= !samePlacements(this.placements, next);
      this.placements = next;
      this.readyImages =
        frame.project?.containers.filter(
          (i) => i.file === null || frame.bitmaps.get(i.file)?.status === 'ready',
        ).length ?? 0;
    }
    // Os desenhos dos componentes só se refazem quando eles, o conjunto visível, as posições
    // das imagens ou o tema mudam.
    if (placementsChanged || dragChanged || !sameFrame(last, frame, COMPONENT_KEYS)) {
      this.renderComponents(frame);
    } else if (moved) {
      // Pan e zoom: o desenho nasce sob demanda (só na tela) e se esconde fora dela.
      const area = visibleArea(size, v);
      this.mark(this.layers.components, this.componentLayer.reveal(area, v.scale));
      this.mark(this.layers.floating, this.floatingLayer.reveal(area, v.scale));
    }
    // Os desenhos em pixels de tela (`screen`) só reajustam escala e posição com o zoom.
    if (scaleChanged) {
      this.mark(this.layers.components, this.componentLayer.setZoom(v.scale));
      this.mark(this.layers.floating, this.floatingLayer.setZoom(v.scale));
    }
    // As setas só se refazem com elas, o tema ou o zoom (a espessura e a ponta são de tela), e com
    // o que decide o nível de detalhe de cada uma: a seleção e o mouse. No pan, só se confere a área
    // visível (`reveal`), como nos desenhos dos componentes.
    if (scaleChanged || dragChanged || !sameFrame(last, frame, ARROW_KEYS)) {
      this.updateArrows(this.arrows.render(frame, this.placements));
    } else if (moved || placementsChanged) {
      this.updateArrows(this.arrows.reveal(frame, this.placements));
    }
    const marked = this.markings.render(frame, this.placements);
    this.mark(this.layers.markings, marked.main);
    this.mark(this.layers.floating, marked.floating);
    this.mark(this.layers.overlay, marked.drag);
    // Os desenhos de componente que se movem também ficam no grupo de arrasto.
    this.mark(this.layers.overlay, this.componentLayer.takeDragChanged());
    this.mark(this.layers.overlay, this.floatingLayer.takeDragChanged());
    if (this.drag !== EMPTY_DRAG && this.dragRoot.zIndex() !== 0) this.dragRoot.zIndex(0);
    this.renderOverlayMarks(frame, last, moved || placementsChanged);
    // A etiqueta do nome se ancora na parte visível: acompanha pan e tamanho da tela;
    // e desvia do rótulo do pai, que muda com o zoom semântico e as camadas visíveis.
    const viewMoved =
      last?.viewport !== v || last?.size !== size || !sameFrame(last, frame, LABEL_KEYS);
    if (
      scaleChanged ||
      !sameFrame(last, frame, OVERLAY_KEYS) ||
      (viewMoved && this.overlay.followsView)
    ) {
      this.dirty.add(this.layers.overlay);
      this.overlay.render(frame, this.placements, this.markings.headers);
    }
    this.drawDirtyLayers(moved);
    this.refreshContainerBoxes(frame, placementsChanged);
    this.publishHostAttributes(frame, v);
  }

  /**
   * O texto do `data-container-boxes` (colocações desenhadas): só se refaz com outra colocação ou
   * outro array `containers` no projeto desenhado (um container redimensionado muda a largura sem
   * mudar a colocação); pan e zoom não passam por aqui. Cada texto novo sobe a versão.
   */
  private refreshContainerBoxes(frame: Frame, placementsChanged: boolean): void {
    const containers = frame.project?.containers ?? null;
    if (!placementsChanged && containers === this.boxesContainers) return;
    this.boxesContainers = containers;
    const text = containers ? formatContainerBoxes(containers, this.placements) : null;
    if (text === this.boxesText) return;
    this.boxesText = text;
    this.boxesVersion += 1;
  }

  /** O texto do `data-arrow-handles`: só com uma seta desenhada como seleção primária. */
  private arrowHandlesText(frame: Frame): string | null {
    const selection = frame.selection;
    if (selection?.kind !== 'arrow') return null;
    const shape = frame.arrows.find((s) => s.arrow.id === selection.id);
    return shape ? formatArrowHandles(shape, frame.viewport) : null;
  }

  /**
   * Os atributos `data-*` do host (só leitura, para os testes e2e esperarem o quadro em vez de um
   * tempo fixo): enquadramento, imagens com bitmap, contagens desenhadas, vista, caixa da
   * seleção, `data-selection`, `data-arrow-handles` e `data-container-boxes`. O DOM só é tocado
   * quando a chave `drawn` muda; o `data-container-boxes` entra nela só pela versão do texto.
   */
  private publishHostAttributes(frame: Frame, v: Viewport): void {
    const canvasMarkings = this.countCanvasMarkings(frame.project);
    const componentImages =
      this.componentLayer.imageCount + this.floatingLayer.imageCount;
    const pins = this.pinLayer.size;
    const pinStates = this.pinLayer.states.join(',');
    const viewportText = formatViewport(v);
    const boxText = formatSelectionBox(
      selectionScreenBox(frame.project, frame.selection, this.placements, v),
    );
    const selectionText = formatSelection(frame.project, frame.selection);
    const handlesText = this.arrowHandlesText(frame);
    const drawn = `${this.view.fits}:${this.readyImages}:${this.drawnComponents}:${canvasMarkings}:${this.drawnArrows}:${this.markings.shown}:${componentImages}:${pins}:${pinStates}:${viewportText}:${boxText ?? ''}:${selectionText ?? ''}:${handlesText ?? ''}:${this.boxesVersion}`;
    if (drawn === this.published) return;
    this.published = drawn;
    const host = this.stage.container();
    host.dataset.viewport = viewportText;
    setDataAttr(host, 'selectionBox', boxText);
    setDataAttr(host, 'selection', selectionText);
    setDataAttr(host, 'arrowHandles', handlesText);
    setDataAttr(host, 'containerBoxes', this.boxesText);
    host.dataset.fits = String(this.view.fits);
    host.dataset.images = String(this.readyImages);
    host.dataset.components = String(this.drawnComponents);
    host.dataset.canvasMarkings = String(canvasMarkings);
    host.dataset.arrows = String(this.drawnArrows);
    host.dataset.drawnMarkings = String(this.markings.shown);
    host.dataset.componentImages = String(componentImages);
    host.dataset.pins = String(pins);
    host.dataset.pinStates = pinStates;
  }

  /**
   * Gesto em andamento: o que a prévia move (comparada ao projeto desenhado de antes do gesto) vai
   * para o grupo de arrasto; ao soltar ou cancelar, tudo volta. Devolve `true` quando o conjunto
   * mudou (levou nós novos ou devolveu todos), para o quadro passar por todos os renderizadores.
   * O pertencimento e a posição final continuam do modelo: aqui só se decide onde o nó fica.
   */
  private syncDrag(frame: Frame, last: Frame | null): boolean {
    if (!this.store.gestureActive.peek()) {
      this.dragBase = null;
      if (this.drag === EMPTY_DRAG) return false;
      this.drag = EMPTY_DRAG;
      this.applyDrag(EMPTY_DRAG);
      return true;
    }
    this.dragBase ??= last?.project ?? frame.project;
    const found = dragSetOf(
      this.dragBase,
      frame.project,
      frame.preview?.containerId ?? null,
    );
    const next = mergeDrag(this.drag, found);
    if (next === this.drag) return false;
    this.drag = next;
    this.applyDrag(next);
    return true;
  }

  /** Diz a cada renderizador quais nós ficam no grupo de arrasto (o conjunto vazio devolve tudo). */
  private applyDrag(set: DragSet): void {
    const on = set !== EMPTY_DRAG;
    const groups = this.dragGroups;
    this.images.setDragged(on ? set.containers : null, groups.images);
    this.componentLayer.setDragged(on ? set.markings : null, groups.components);
    this.floatingLayer.setDragged(on ? set.markings : null, groups.floatingComponents);
    this.markings.setDragged(on ? set.markings : null, {
      main: groups.markings,
      floating: groups.floating,
    });
    this.arrows.setDragged(on ? set.arrows : null, groups.arrows);
  }

  /** Marca as camadas que as setas mexeram e guarda quantas estão pintadas (`data-arrows`). */
  private updateArrows(changes: ArrowChanges): void {
    this.mark(this.layers.markings, changes.main);
    this.mark(this.layers.overlay, changes.drag);
    this.drawnArrows = this.arrows.painted;
  }

  /** Suja a camada se o renderizador mexeu em algum nó dela. */
  private mark(layer: Konva.Layer, changed: boolean): void {
    if (changed) this.dirty.add(layer);
  }

  /**
   * As marcas da revisão, os pinos e as marcas de chegada (camada de sobreposições): só se
   * refazem quando os dados delas, a tela ou as posições das imagens mudaram.
   */
  private renderOverlayMarks(frame: Frame, last: Frame | null, stale: boolean): void {
    const redo = (keys: readonly (keyof Frame)[]) =>
      stale || !sameFrame(last, frame, keys);
    if (redo(REVIEW_KEYS)) {
      this.reviewLayer.render(frame, this.placements);
      this.dirty.add(this.layers.overlay);
    }
    if (redo(PIN_KEYS)) {
      this.pinLayer.render(frame);
      this.dirty.add(this.layers.overlay);
    }
    if (redo(ARRIVAL_KEYS) || this.arrivalsStale) {
      this.arrivalsStale = false;
      this.arrivalLayer.render(frame);
      this.dirty.add(this.layers.overlay);
    }
  }

  /** Desenha o quadro: o palco inteiro se ele se moveu, senão só as camadas sujas. */
  private drawDirtyLayers(all: boolean): void {
    if (all) this.stage.batchDraw();
    else for (const layer of this.dirty) layer.batchDraw();
    this.dirty.clear();
  }

  /** Refaz as marcações cujas imagens remotas mudaram desde o último quadro. */
  private refreshRemoteImages(): void {
    if (!this.allImagesChanged && this.changedImageUrls.size === 0) return;
    const urls = this.allImagesChanged ? null : new Set(this.changedImageUrls);
    this.allImagesChanged = false;
    this.changedImageUrls.clear();
    this.mark(this.layers.components, this.componentLayer.refreshImages(urls));
    this.mark(this.layers.floating, this.floatingLayer.refreshImages(urls));
  }

  /** Quantas marcações do canvas (sem container) o quadro tem; recontado só quando o projeto muda. */
  private countCanvasMarkings(project: Project | null): number {
    if (this.countedProject !== project) {
      this.countedProject = project;
      this.canvasMarkingCount =
        project?.markings.filter((m) => m.containerId === null).length ?? 0;
    }
    return this.canvasMarkingCount;
  }

  /**
   * Desenha os componentes das marcações à vista (um nó por marcação; só o mudado é refeito).
   * As flutuantes vão para a camada de cima, acima das bordas das demais marcações.
   */
  private renderComponents(frame: Frame): void {
    if (frame.tokens.component !== this.componentPalette) {
      // As cores do reservado são fixadas ao montar o desenho: tema novo, desenhos novos.
      this.componentLayer.destroy();
      this.floatingLayer.destroy();
      this.dirty.add(this.layers.components);
      this.dirty.add(this.layers.floating);
      this.componentPalette = frame.tokens.component;
      this.componentLayer = this.newComponentLayer(this.componentGroup);
      this.floatingLayer = this.newComponentLayer(this.floatingDrawings);
      this.applyDrag(this.drag);
    }
    const { drawn, floating } = frame;
    const zoom = frame.viewport.scale;
    const area = visibleArea(frame.size, frame.viewport);
    this.mark(
      this.layers.components,
      this.componentLayer.render(
        frame.drawings,
        (drawing) => drawn.has(drawing.markingId) && !floating.has(drawing.markingId),
        this.placements,
        zoom,
        area,
      ),
    );
    this.mark(
      this.layers.floating,
      this.floatingLayer.render(
        frame.drawings,
        (drawing) => drawn.has(drawing.markingId) && floating.has(drawing.markingId),
        this.placements,
        zoom,
        area,
      ),
    );
    this.drawnComponents = this.componentLayer.size + this.floatingLayer.size;
  }
}
