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
} from '../model';
import type { EditorDerived } from '../store/derived';
import type { DisplayImages } from '../store/displayImages';
import type { ProjectStore } from '../store/history';
import type { ProjectActions } from '../store/project';
import type { ReviewState } from '../store/review';
import { locale, showArrows } from '../store/settings';
import { textMeasurer } from '../store/textMeasure';
import {
  itemsOf,
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
  type DropTarget,
  type Frame,
  type HoverLock,
  type InteractionState,
} from './frame';
import { arrowShape, visibleArrowShapes, type ArrowShape } from './arrowGeometry';
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
import { ArrowRenderer } from './renderers/arrows';
import { ImageRenderer } from './renderers/images';
import { MarkingRenderer } from './renderers/markings';
import { OverlayRenderer } from './renderers/overlay';
import { ReviewRenderer } from './renderers/review';
import { proposedDisplay, reviewMarks, type ReviewCanvas } from './reviewMarks';
import { readCanvasTokens, watchTheme, type CanvasTokens } from './theme';
import { clampZoom, type Point } from './viewport';
import { ViewportController } from './viewportController';
import { sameCursor, type CanvasViewState } from './viewState';

export type { DropTarget } from './frame';

/** Mesmas imagens com as mesmas posições (por referência): zoom e pan não mudam isso. */
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
   * Imagens remotas dos componentes (RI3): as duas portas da app e o carregador. Padrão: a fonte
   * de produção; os testes passam uma falsa.
   */
  readonly remoteImages?: RemoteImageSource;
}

/** Sem setas à vista ("Mostrar setas" desligado, Ver limpo): sempre o mesmo array. */
const NO_ARROWS: readonly ArrowShape[] = [];

/** Seleção vazia (Ver limpo): sempre o mesmo objeto, o quadro compara por referência. */
const NO_ITEMS: readonly SelectionItem[] = [];

/** O que move o rótulo de nome das marcações (a etiqueta da selecionada desvia do do pai). */
const LABEL_KEYS = ['visibility', 'dots', 'incomplete'] as const;

export class CanvasController {
  private readonly store: ProjectStore;
  private readonly display: DisplayImages<ImageBitmap>;
  private readonly ui: EditorUi;
  private readonly derived: EditorDerived;
  private readonly viewState: CanvasViewState;
  private readonly review: ReviewState | null;
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
  /** Camada das setas, entre os desenhos dos componentes e as marcações. */
  private readonly arrows: ArrowRenderer;
  private readonly overlay: OverlayRenderer;
  private readonly reviewLayer: ReviewRenderer;

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
    const shown = review?.derived.shownProject.value ?? null;
    if (!review || shown === null || shown === this.store.committed.value) {
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
    this.ui.cleanView.value
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
   * Setas desenhadas: as do projeto desenhado (com a prévia do gesto) cujas duas pontas aparecem,
   * se "Mostrar setas" está ligado e fora do Ver limpo. As rotas são guardadas por seta e por
   * projeto/visibilidade (`visibleArrowShapes`): pan e zoom não as recalculam.
   */
  private readonly arrowShapes = computed((): readonly ArrowShape[] =>
    this.ui.cleanView.value || !showArrows.value
      ? NO_ARROWS
      : visibleArrowShapes(this.drawnProject.value, this.derived.markingVisibility.value),
  );

  /** Entradas do quadro: projeto, UI, dados derivados e viewport. */
  private readonly frame = computed((): Frame => {
    // Ver limpo: nada de seleção, trava, hover ou marcas da revisão por cima da imagem.
    const clean = this.ui.cleanView.value;
    return {
      project: this.drawnProject.value,
      readOnly: this.store.locked.value,
      bitmaps: this.display.images.value,
      preview: this.state.preview.value,
      draft: this.state.draft.value,
      // O alvo de soltar um arquivo ou, ao arrastar uma marcação, o container que a receberia.
      dropTarget:
        this.dropTarget.value ??
        this.moveTargetFrame.value ??
        this.arrowTargetFrame.value,
      absorb: this.state.absorb.value,
      hoverLock: clean ? null : this.state.hoverLock.value,
      hoverMarking: clean ? null : this.state.hoverMarking.value,
      tokens: this.tokens.value,
      size: this.view.size.value,
      viewport: this.view.viewport.value,
      selection: clean ? null : this.ui.selection.value,
      items: this.selectedItems.value,
      mode: this.ui.mode.value,
      locale: locale.value,
      shown: this.derived.visibleLayers.value,
      dots: this.derived.layerDots.value,
      incomplete: this.derived.incompleteMarkings.value,
      visibility: this.derived.markingVisibility.value,
      drawings: this.drawings.value,
      drawn: this.derived.drawnMarkings.value,
      floating: this.derived.floatingMarkings.value,
      review: clean ? null : this.reviewCanvas.value,
      arrows: this.arrowShapes.value,
      arrowDraft: clean ? null : this.state.arrowDraft.value,
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
  private readonly cleanups: (() => void)[] = [];

  constructor(options: CanvasControllerOptions) {
    const { container } = options;
    this.store = options.store;
    this.display = options.display;
    this.ui = options.ui;
    this.derived = options.derived;
    this.viewState = options.view;
    this.review = options.review ?? null;
    this.remoteImages = options.remoteImages ?? sharedRemoteImageSource();

    // Os desenhos medem texto com o Konva (o layout bate com o que é pintado) e se redesenham
    // quando o medidor muda; o modelo e o store nunca importam o Konva.
    if (textMeasurer.peek() !== konvaMeasurer) textMeasurer.value = konvaMeasurer;

    this.stage = new Konva.Stage({ container, width: 1, height: 1 });
    const imageLayer = new Konva.Layer({ listening: false });
    this.componentGroup = new Konva.Layer({ listening: false });
    const arrowLayer = new Konva.Layer({ listening: false });
    const markingLayer = new Konva.Layer({ listening: false });
    const overlayLayer = new Konva.Layer({ listening: false });
    const floatingTop = new Konva.Layer({ listening: false });
    this.stage.add(
      imageLayer,
      this.componentGroup,
      arrowLayer,
      markingLayer,
      floatingTop,
      overlayLayer,
    );
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
      // Espelha o viewport para a interface (barra de status, minimapa, campo de zoom).
      effect(() => {
        this.viewState.viewport.value = this.view.viewport.value;
        this.viewState.size.value = this.view.size.value;
      }),
      effect(() => {
        // Projeto à vista, sem a prévia do gesto: um gesto em andamento não refaz o
        // minimapa a cada quadro; na visão Proposto, as imagens da prévia.
        const shown =
          this.review?.derived.shownProject.value ?? this.store.committed.value;
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
    this.arrows.destroy();
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

  private loadBitmaps(): void {
    const images = this.store.project.value?.containers ?? [];
    // Na revisão, também as imagens novas ou trocadas que esperam em `proposals/`.
    const drawn = this.drawnProject.value?.containers ?? [];
    untracked(() => {
      // Container sem arquivo (sem arquivo) não tem bitmap.
      const files = new Set<string>();
      for (const image of [...images, ...drawn]) {
        if (image.file !== null) files.add(image.file);
      }
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
   */
  private render(frame: Frame): void {
    const last = this.drawn;
    this.drawn = frame;
    const { size, viewport: v } = frame;
    const scaleChanged = last?.viewport.scale !== v.scale;

    this.stage.size({ width: Math.max(1, size.width), height: Math.max(1, size.height) });
    this.stage.position({ x: v.x, y: v.y });
    this.stage.scale({ x: v.scale, y: v.scale });

    this.refreshRemoteImages();

    let placementsChanged = last === null;
    if (scaleChanged || !sameFrame(last, frame, IMAGE_KEYS)) {
      const next = this.images.render(frame);
      placementsChanged ||= !samePlacements(this.placements, next);
      this.placements = next;
      this.readyImages =
        frame.project?.containers.filter(
          (i) => i.file === null || frame.bitmaps.get(i.file)?.status === 'ready',
        ).length ?? 0;
    }
    // Os desenhos dos componentes só se refazem quando eles, o conjunto visível, as posições
    // das imagens ou o tema mudam: pan e zoom não passam por aqui.
    if (placementsChanged || !sameFrame(last, frame, COMPONENT_KEYS)) {
      this.renderComponents(frame);
    }
    // As setas só se refazem com elas, o tema ou o zoom (a espessura e a ponta são de tela).
    if (scaleChanged || !sameFrame(last, frame, ARROW_KEYS)) {
      this.arrows.render(frame);
      this.drawnArrows = this.arrows.size;
    }
    this.markings.render(frame, this.placements);
    this.reviewLayer.render(frame, this.placements);
    // A etiqueta do nome se ancora na parte visível: acompanha pan e tamanho da tela;
    // e desvia do rótulo do pai, que muda com o zoom semântico e as camadas visíveis.
    const viewMoved =
      last?.viewport !== v || last?.size !== size || !sameFrame(last, frame, LABEL_KEYS);
    if (
      scaleChanged ||
      !sameFrame(last, frame, OVERLAY_KEYS) ||
      (viewMoved && this.overlay.followsView)
    ) {
      this.overlay.render(frame, this.placements, this.markings.headers);
    }
    this.stage.batchDraw();
    // Para os testes e2e esperarem o quadro, e não um tempo fixo: enquadramentos e
    // imagens com bitmap já desenhados (o DOM só é tocado quando eles mudam).
    const canvasMarkings = this.countCanvasMarkings(frame.project);
    const componentImages =
      this.componentLayer.imageCount + this.floatingLayer.imageCount;
    const drawn = `${this.view.fits}:${this.readyImages}:${this.drawnComponents}:${canvasMarkings}:${this.drawnArrows}:${componentImages}`;
    if (drawn !== this.published) {
      this.published = drawn;
      const host = this.stage.container();
      host.dataset.fits = String(this.view.fits);
      host.dataset.images = String(this.readyImages);
      host.dataset.components = String(this.drawnComponents);
      host.dataset.canvasMarkings = String(canvasMarkings);
      host.dataset.arrows = String(this.drawnArrows);
      host.dataset.componentImages = String(componentImages);
    }
  }

  /** Refaz as marcações cujas imagens remotas mudaram desde o último quadro. */
  private refreshRemoteImages(): void {
    if (!this.allImagesChanged && this.changedImageUrls.size === 0) return;
    const urls = this.allImagesChanged ? null : new Set(this.changedImageUrls);
    this.allImagesChanged = false;
    this.changedImageUrls.clear();
    this.componentLayer.refreshImages(urls);
    this.floatingLayer.refreshImages(urls);
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
      this.componentPalette = frame.tokens.component;
      this.componentLayer = this.newComponentLayer(this.componentGroup);
      this.floatingLayer = this.newComponentLayer(this.floatingDrawings);
    }
    const { drawn, floating } = frame;
    this.componentLayer.render(
      frame.drawings,
      (drawing) => drawn.has(drawing.markingId) && !floating.has(drawing.markingId),
      this.placements,
    );
    this.floatingLayer.render(
      frame.drawings,
      (drawing) => drawn.has(drawing.markingId) && floating.has(drawing.markingId),
      this.placements,
    );
    this.drawnComponents = this.componentLayer.size + this.floatingLayer.size;
  }
}
