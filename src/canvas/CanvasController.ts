// Canvas imperativo com Konva. Orquestra: monta o quadro a partir dos signals do
// projeto, da UI e do estado derivado, agenda uma renderização por quadro e
// delega o desenho aos renderers, a entrada a `input/` e o viewport ao
// `ViewportController`. Único lugar (com `CanvasHost`) que conhece o Konva.
import { computed, effect, signal, untracked } from '@preact/signals';
import Konva from 'konva/lib/Core';
import { imageCanvasRect, type Placement } from '../model';
import type { EditorDerived } from '../store/derived';
import type { DisplayImages } from '../store/displayImages';
import type { ProjectStore } from '../store/history';
import type { ProjectActions } from '../store/project';
import { locale, semanticText } from '../store/settings';
import { resolveSelection, type EditorUi } from '../store/ui';
import {
  IMAGE_KEYS,
  OVERLAY_KEYS,
  cancelFrame,
  requestFrame,
  sameFrame,
  type Draft,
  type DropTarget,
  type Frame,
  type Grabbed,
  type ImagePreview,
  type InteractionState,
} from './frame';
import { imageAt } from './imageGeometry';
import { watchSpaceKey } from './input/keyboard';
import { PointerInput } from './input/pointer';
import { markingCanvasRect } from './markingGeometry';
import { ImageRenderer } from './renderers/images';
import { MarkingRenderer } from './renderers/markings';
import { OverlayRenderer } from './renderers/overlay';
import { cardCache } from './renderers/cards';
import { readCanvasTokens, watchTheme, type CanvasTokens } from './theme';
import type { Point } from './viewport';
import { ViewportController } from './viewportController';

export type { DropTarget } from './frame';

export interface CanvasControllerOptions {
  readonly container: HTMLDivElement;
  readonly store: ProjectStore;
  readonly actions: ProjectActions;
  readonly display: DisplayImages<ImageBitmap>;
  readonly ui: EditorUi;
  readonly derived: EditorDerived;
}

export class CanvasController {
  private readonly store: ProjectStore;
  private readonly display: DisplayImages<ImageBitmap>;
  private readonly ui: EditorUi;
  private readonly derived: EditorDerived;

  private readonly state: InteractionState = {
    preview: signal<ImagePreview | null>(null),
    draft: signal<Draft | null>(null),
    grabbed: signal<Grabbed | null>(null),
  };
  private readonly dropTarget = signal<DropTarget>(null);
  private readonly tokens = signal<CanvasTokens>(readCanvasTokens());

  private readonly stage: Konva.Stage;
  private readonly view: ViewportController;
  private readonly pointer: PointerInput;
  private readonly images: ImageRenderer;
  private readonly markings: MarkingRenderer;
  private readonly overlay: OverlayRenderer;

  /** Cartões do zoom semântico; refeitos só quando o projeto, as camadas ou o idioma mudam. */
  private readonly cards = computed(() => {
    // `t()` dos rótulos lê o idioma só quando o cartão é montado: assina aqui.
    void locale.value;
    return cardCache(
      this.store.project.value,
      this.derived.visibleLayers.value,
      this.derived.annotationsByMarking.value,
    );
  });
  /** Entradas do quadro: projeto, UI, dados derivados e viewport. */
  private readonly frame = computed((): Frame => ({
    project: this.store.project.value,
    readOnly: this.store.readOnly.value,
    bitmaps: this.display.images.value,
    preview: this.state.preview.value,
    draft: this.state.draft.value,
    dropTarget: this.dropTarget.value,
    grabbed: this.state.grabbed.value,
    tokens: this.tokens.value,
    size: this.view.size.value,
    viewport: this.view.viewport.value,
    selection: this.ui.selection.value,
    mode: this.ui.mode.value,
    semantic: semanticText.value,
    locale: locale.value,
    shown: this.derived.visibleLayers.value,
    dots: this.derived.layerDots.value,
    incomplete: this.derived.incompleteMarkings.value,
    visibility: this.derived.markingVisibility.value,
    card: this.cards.value,
  }));
  /** Último quadro desenhado: o que não mudou desde ele não é redesenhado. */
  private drawn: Frame | null = null;
  /** Placements do último quadro (com a prévia do gesto aplicada). */
  private placements: ReadonlyMap<string, Placement> = new Map();
  private frameRequest: number | null = null;
  private readonly cleanups: (() => void)[] = [];

  constructor(options: CanvasControllerOptions) {
    const { container } = options;
    this.store = options.store;
    this.display = options.display;
    this.ui = options.ui;
    this.derived = options.derived;

    this.stage = new Konva.Stage({ container, width: 1, height: 1 });
    const imageLayer = new Konva.Layer({ listening: false });
    const markingLayer = new Konva.Layer({ listening: false });
    const overlayLayer = new Konva.Layer({ listening: false });
    this.stage.add(imageLayer, markingLayer, overlayLayer);
    this.images = new ImageRenderer(imageLayer);
    this.markings = new MarkingRenderer(markingLayer);
    this.overlay = new OverlayRenderer(overlayLayer, container);

    this.view = new ViewportController(
      container,
      () => this.store.project.peek()?.images ?? [],
    );
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
    });

    this.cleanups.push(
      this.pointer.bind(),
      space.dispose,
      this.view.observe(),
      watchTheme(() => (this.tokens.value = readCanvasTokens())),
      effect(() => this.loadBitmaps()),
      // O effect só agenda: várias mudanças no mesmo quadro geram um desenho só.
      effect(() => {
        void this.frame.value;
        this.requestRender();
      }),
      () => {
        if (this.frameRequest !== null) cancelFrame(this.frameRequest);
        this.frameRequest = null;
      },
    );
  }

  /** Enquadra todas as imagens (ou uma área padrão, com o canvas vazio). */
  fitAll(): void {
    this.view.fitAll();
  }

  /** Centraliza o canvas no item selecionado (ajustando o zoom se ele for grande ou pequeno demais). */
  focusSelection(): void {
    this.view.measure(); // O canvas pode ter acabado de reaparecer (aba Lista → Canvas).
    const selected = resolveSelection(
      this.store.project.peek(),
      this.ui.selection.peek(),
    );
    if (!selected) return;
    const { image } = selected;
    this.view.centerOn(
      selected.kind === 'marking'
        ? markingCanvasRect(image.placement, selected.marking.rect)
        : imageCanvasRect(image, image.placement),
    );
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
    const images = this.store.project.peek()?.images ?? [];
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
    this.pointer.destroy();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.stage.destroy();
  }

  private loadBitmaps(): void {
    const images = this.store.project.value?.images ?? [];
    untracked(() => {
      for (const image of images) this.display.ensure(image.file);
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

    if (scaleChanged || !sameFrame(last, frame, IMAGE_KEYS)) {
      this.placements = this.images.render(frame);
    }
    this.markings.render(frame, this.placements);
    if (scaleChanged || !sameFrame(last, frame, OVERLAY_KEYS)) {
      this.overlay.render(frame, this.placements);
    }
    this.stage.batchDraw();
  }
}
