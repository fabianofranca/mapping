// Entrada de ponteiro e roda do canvas: eventos → `gestureMachine` → intenções
// → actions do store. Pan, zoom e pinça vão para o `ViewportController`; a
// prévia dos gestos vai para o `InteractionState`, que as sobreposições desenham.
import { projectIndex, type Placement, type Project } from '../../model';
import type { EditorDerived } from '../../store/derived';
import type { ProjectStore } from '../../store/history';
import type { ProjectActions } from '../../store/project';
import type { EditorUi } from '../../store/ui';
import type { InteractionState } from '../frame';
import { HOLD_MS, IDLE, stepGesture, type GestureState } from '../gestureMachine';
import { resizeFromCorner } from '../imageGeometry';
import {
  canvasToImagePixel,
  isDrawableRect,
  rectFromPoints,
  resizeMarkingRect,
} from '../markingGeometry';
import { wheelZoomFactor, type Point } from '../viewport';
import type { ViewportController } from '../viewportController';
import { isStoreGesture, startGesture, type Gesture } from './gestures';
import {
  canGrab,
  cursorFor,
  dragModeOf,
  grabIntentAt,
  intentAt,
  isRepeatTap,
  tapSelection,
  type Intent,
  type IntentContext,
} from './intents';

/** Vibração ao pegar o item (ms), onde o sistema oferecer (Android). */
const GRAB_VIBRATION_MS = 20;

export interface PointerInputOptions {
  readonly container: HTMLElement;
  readonly store: ProjectStore;
  readonly actions: ProjectActions;
  readonly ui: EditorUi;
  readonly derived: EditorDerived;
  readonly viewport: ViewportController;
  readonly state: InteractionState;
  /** Espaço pressionado (arrastar faz pan). */
  readonly spaceDown: () => boolean;
  /** Projeto desenhado (o "como ficaria" na revisão); padrão: o do store. */
  readonly project?: () => Project | null;
  /** Revisão aberta: tudo é somente leitura e o menu de contexto não abre. */
  readonly reviewing?: () => boolean;
}

export class PointerInput {
  private readonly o: PointerInputOptions;
  private readonly pointers = new Map<number, Point>();
  private gesture: Gesture | null = null;
  /** Classificação do gesto em andamento (toque / pan / segurar-e-mover / …). */
  private gestureState: GestureState = IDLE;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  /** Último toque (canvas), para o ciclo "tocar de novo sobe para o pai". */
  private lastTap: Point | null = null;
  /** Tipo do último ponteiro apertado: o `contextmenu` do toque longo não é do mouse. */
  private lastPointerType = 'mouse';

  constructor(options: PointerInputOptions) {
    this.o = options;
  }

  /** Projeto em que o toque procura os itens (o desenhado). */
  private project(): Project | null {
    return this.o.project ? this.o.project() : this.o.store.project.peek();
  }

  /** Escuta os eventos do container. Devolve a função que para de escutar. */
  bind(): () => void {
    const el = this.o.container;
    const cleanups: (() => void)[] = [];
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      handler: (e: HTMLElementEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      el.addEventListener(type, handler, options);
      cleanups.push(() => el.removeEventListener(type, handler, options));
    };
    on('pointerdown', (e) => this.onPointerDown(e));
    on('pointermove', (e) => this.onPointerMove(e));
    on('pointerup', (e) => this.onPointerUp(e, false));
    on('pointercancel', (e) => this.onPointerUp(e, true));
    on('wheel', (e) => this.onWheel(e), { passive: false });
    on('contextmenu', (e) => {
      e.preventDefault();
      this.openContextMenu(e);
    });
    return () => {
      for (const cleanup of cleanups.splice(0)) cleanup();
    };
  }

  /** Cancela o gesto de mover/redimensionar/desenhar em andamento. `true` se havia um. */
  cancelInteraction(): boolean {
    const g = this.gesture;
    if (!isStoreGesture(g) && g?.kind !== 'draw') return false;
    if (isStoreGesture(g)) this.o.actions.cancelGesture();
    const { state } = this.o;
    state.preview.value = null;
    state.draft.value = null;
    state.grabbed.value = null;
    this.gesture = { kind: 'pinch' }; // Ignora o resto do arrasto até soltar.
    this.gestureState = { phase: 'pinch' };
    return true;
  }

  /** Para o timer do segurar e desfaz um gesto do store pela metade. */
  destroy(): void {
    this.clearHold();
    if (isStoreGesture(this.gesture)) this.o.actions.cancelGesture();
  }

  /** Cursor do mouse: o do gesto em andamento ou o da intenção sob `p` (tela). */
  updateCursor(p: Point | null): void {
    const g = this.gesture;
    let cursor = '';
    if (g?.kind === 'pan') cursor = 'grabbing';
    else if (g?.kind === 'move-image' || g?.kind === 'move-marking') cursor = 'move';
    else if (g?.kind === 'draw') cursor = 'crosshair';
    else if (g?.kind === 'blocked') cursor = 'not-allowed';
    else if (this.o.spaceDown()) cursor = 'grab';
    else if (p) cursor = cursorFor(this.intentAt(p));
    this.o.container.style.cursor = cursor;
  }

  private context(): IntentContext {
    const { store, ui } = this.o;
    return {
      project: this.project(),
      readOnly: store.readOnly.peek() || (this.o.reviewing?.() ?? false),
      mode: ui.mode.peek(),
      selection: ui.selection.peek(),
      zoom: this.o.viewport.scale,
      spaceDown: this.o.spaceDown(),
    };
  }

  /** Intenção de um arrasto começando em `p` (tela). */
  private intentAt(p: Point): Intent {
    return intentAt(this.context(), this.o.viewport.toCanvas(p));
  }

  private onPointerDown(e: PointerEvent): void {
    this.lastPointerType = e.pointerType;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    const p = this.o.viewport.screenPoint(e);
    this.pointers.set(e.pointerId, p);
    try {
      this.o.container.setPointerCapture(e.pointerId);
    } catch {
      // Sem captura, o gesto termina se o ponteiro sair do canvas.
    }

    if (this.pointers.size >= 2) {
      this.cancelInteraction();
      this.clearHold();
      this.o.state.grabbed.value = null;
      this.gesture = { kind: 'pinch' };
      this.gestureState = stepGesture(this.gestureState, {
        type: 'second-pointer',
      }).state;
      return;
    }
    let intent: Intent = e.button === 1 ? { kind: 'pan' } : this.intentAt(p);
    // No toque, arrastar sobre o item trancado faz pan (o mouse fica sem efeito).
    if (intent.kind === 'locked' && e.pointerType === 'touch') intent = { kind: 'pan' };
    // No toque, arrastar sempre faz pan; para mover um item é preciso segurar antes.
    // Alças (resize) e o modo Desenhar continuam diretos, e o mouse não muda.
    const holdable =
      e.pointerType === 'touch' &&
      (intent.kind === 'pan' ||
        intent.kind === 'move-marking' ||
        intent.kind === 'move-image') &&
      canGrab(this.context());
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
    const { ui, derived, state } = this.o;
    const intent = grabIntentAt(
      this.project(),
      ui.selection.peek(),
      derived.markingVisibility.peek(),
      this.o.viewport.toCanvas(g.start),
    );
    const step = stepGesture(this.gestureState, {
      type: 'hold',
      hasTarget: intent !== null,
    });
    this.gestureState = step.state;
    if (step.effect.kind !== 'grab' || !intent) return;
    g.intent = intent;
    if (intent.kind === 'move-marking') {
      ui.selection.value = { kind: 'marking', id: intent.markingId };
      state.grabbed.value = { kind: 'marking', id: intent.markingId };
    } else if (intent.kind === 'move-image') {
      ui.selection.value = { kind: 'image', id: intent.imageId };
      state.grabbed.value = { kind: 'image', id: intent.imageId };
    }
    try {
      navigator.vibrate?.(GRAB_VIBRATION_MS);
    } catch {
      // Sem vibração (iOS, permissões): fica só o sinal visual.
    }
  }

  private onPointerMove(e: PointerEvent): void {
    const { viewport, actions } = this.o;
    const p = viewport.screenPoint(e);
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
      viewport.pinch(a0, b0, a1, b1);
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
          this.gesture = this.startDrag(g.pointerId, g.start, intent);
          this.onPointerMove(e);
        }
        return;
      }
      case 'pan':
        viewport.panBy(p.x - g.last.x, p.y - g.last.y);
        g.last = p;
        return;
      case 'blocked':
        return;
      case 'move-image': {
        const c = viewport.toCanvas(p);
        const { startPlacement: s, startCanvas } = g;
        this.previewPlacement(g.imageId, {
          x: s.x + c.x - startCanvas.x,
          y: s.y + c.y - startCanvas.y,
          scale: s.scale,
        });
        return;
      }
      case 'resize-image': {
        const project = this.o.store.project.peek();
        const image = project && projectIndex(project).images.get(g.imageId);
        if (!image) return;
        const placement = resizeFromCorner(
          image,
          g.startPlacement,
          g.corner,
          viewport.toCanvas(p),
        );
        this.previewPlacement(g.imageId, placement);
        return;
      }
      case 'move-marking': {
        const c = viewport.toCanvas(p);
        actions.previewMarkingMove(
          g.markingId,
          (c.x - g.startCanvas.x) / g.scale,
          (c.y - g.startCanvas.y) / g.scale,
        );
        return;
      }
      case 'resize-marking': {
        const pixel = canvasToImagePixel(g.placement, viewport.toCanvas(p));
        actions.previewMarkingRect(
          g.markingId,
          resizeMarkingRect(g.startRect, g.corner, pixel, g.limits),
        );
        return;
      }
      case 'draw': {
        const pixel = canvasToImagePixel(g.image.placement, viewport.toCanvas(p));
        this.o.state.draft.value = {
          imageId: g.image.id,
          rect: rectFromPoints(g.startPixel, pixel, g.image),
        };
        return;
      }
    }
  }

  /** Gesto do arrasto; se a intenção não se aplica mais, pan. */
  private startDrag(pointerId: number, start: Point, intent: Intent): Gesture {
    const { store, actions, viewport, state } = this.o;
    const started = startGesture(
      store.project.peek(),
      pointerId,
      viewport.toCanvas(start),
      intent,
      () => actions.beginGesture().ok,
    );
    if (!started) return { kind: 'pan', pointerId, last: start };
    if (started.draft) state.draft.value = started.draft;
    return started.gesture;
  }

  private previewPlacement(imageId: string, placement: Placement): void {
    const result = this.o.actions.previewImagePlacement(imageId, placement);
    this.o.state.preview.value = { imageId, placement, valid: result.ok };
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
    const { actions, state } = this.o;
    this.gesture = null;
    this.clearHold();
    state.grabbed.value = null;
    const step = stepGesture(this.gestureState, { type: cancelled ? 'cancel' : 'up' });
    this.gestureState = step.state;
    if (g.kind === 'pending' && step.effect.kind === 'tap') this.tap(step.effect.at);
    if (isStoreGesture(g)) {
      // Volta para a última posição válida (a do projeto) e grava uma entrada.
      if (cancelled) actions.cancelGesture();
      else actions.commitGesture();
      state.preview.value = null;
    }
    if (g.kind === 'draw') this.finishDraw(cancelled);
    if (e.pointerType === 'mouse') this.updateCursor(this.o.viewport.screenPoint(e));
  }

  private finishDraw(cancelled: boolean): void {
    const { draft } = this.o.state;
    const drawn = draft.peek();
    draft.value = null;
    if (cancelled || !drawn || !isDrawableRect(drawn.rect)) return;
    const result = this.o.actions.createMarking(drawn.imageId, drawn.rect);
    if (result.ok) this.o.ui.selection.value = { kind: 'marking', id: result.value };
  }

  /** Seleciona pelo toque em `p` (tela); tocar de novo no mesmo ponto sobe para o pai. */
  private tap(p: Point): void {
    const { ui, derived, viewport } = this.o;
    const c = viewport.toCanvas(p);
    const repeat = isRepeatTap(this.lastTap, c, viewport.scale);
    this.lastTap = c;
    ui.selection.value = tapSelection(
      this.project(),
      ui.selection.peek(),
      derived.markingVisibility.peek(),
      c,
      repeat,
    );
  }

  /**
   * Botão direito do mouse: seleciona o item sob o cursor (a marcação mais interna, ou a
   * imagem) e abre o menu de contexto dele. Um toque longo também dispara `contextmenu`, mas
   * é o "segurar e mover": não abre o menu (no celular, as ações ficam na Árvore e em Detalhes).
   */
  private openContextMenu(e: MouseEvent): void {
    const { ui, derived, viewport } = this.o;
    ui.canvasMenu.value = null;
    if (this.lastPointerType === 'touch' || this.gesture !== null) return;
    // Na revisão o menu (copiar, trancar) não vale: o projeto está somente leitura.
    if (this.o.reviewing?.()) return;
    const picked = tapSelection(
      this.project(),
      ui.selection.peek(),
      derived.markingVisibility.peek(),
      viewport.toCanvas(viewport.screenPoint(e)),
      false,
    );
    if (!picked) return;
    ui.selection.value = picked;
    ui.canvasMenu.value = {
      x: e.clientX,
      y: e.clientY,
      target: { kind: picked.kind === 'image' ? 'i' : 'm', id: picked.id },
    };
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = wheelZoomFactor(e.deltaY, e.deltaMode, e.ctrlKey);
    this.o.viewport.zoomAt(this.o.viewport.screenPoint(e), factor);
  }
}
