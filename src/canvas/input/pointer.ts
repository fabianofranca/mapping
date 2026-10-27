// Entrada de ponteiro e roda do canvas: eventos → `gestureMachine` → intenções
// → actions do store. Pan, zoom e pinça vão para o `ViewportController`; a
// prévia dos gestos vai para o `InteractionState`, que as sobreposições desenham.
import {
  IDENTITY_PLACEMENT,
  canEditArrow,
  fromCanvasPoint,
  imagePixelRect,
  markingCanvasRectOf,
  projectIndex,
  selectionWithContents,
  spaceOf,
  toCanvasRect,
  type ArrowSide,
  type Placement,
  type Project,
  type Rect,
} from '../../model';
import type { EditorDerived } from '../../store/derived';
import type { ProjectStore } from '../../store/history';
import type { ProjectActions } from '../../store/project';
import { showArrows } from '../../store/settings';
import {
  existingItems,
  isItemSelected,
  peekSelectedItems,
  selectItems,
  toggleSelectedItem,
  type EditorUi,
  type Selection,
} from '../../store/ui';
import {
  ABSORB_TOLERANCE,
  absorbInto,
  snapTarget,
  spaceTolerance,
  type AbsorbCandidate,
  type SnapTarget,
} from '../containment';
import {
  arrowHandleAt,
  arrowShape,
  nearestSide,
  visibleArrowShapes,
  type ArrowShape,
} from '../arrowGeometry';
import type { InteractionState } from '../frame';
import { IDLE, stepGesture, type GestureState } from '../gestureMachine';
import { resizeFromCorner } from '../imageGeometry';
import {
  canvasToImagePixel,
  isDrawableRect,
  rectFromPoints,
  resizeMarkingRect,
} from '../markingGeometry';
import { wheelZoomFactor, type Point } from '../viewport';
import type { ViewportController } from '../viewportController';
import {
  isStoreGesture,
  startGesture,
  type Gesture,
  type StoreGesture,
} from './gestures';
import {
  cursorFor,
  dragModeOf,
  hitChain,
  intentAt,
  isRepeatTap,
  tapSelection,
  type ArrowHit,
  type Intent,
  type IntentContext,
} from './intents';

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
  /** Retângulos dos nomes acima dos containers (canvas), medidos pelo renderer. */
  readonly containerTitles?: () => ReadonlyMap<string, Rect>;
}

/** Gestos que arrastam itens: o cursor é o de mover. */
const MOVE_GESTURES: ReadonlySet<Gesture['kind']> = new Set([
  'move-image',
  'move-marking',
  'move-items',
  'arrow-route',
]);

/** Gestos de seta que puxam uma linha até uma marcação: o cursor é o de mirar. */
const AIM_GESTURES: ReadonlySet<Gesture['kind']> = new Set(['arrow-link', 'arrow-end']);

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export class PointerInput {
  private readonly o: PointerInputOptions;
  private readonly pointers = new Map<number, Point>();
  private gesture: Gesture | null = null;
  /** Classificação do gesto em andamento (clique / pan / mover / …). */
  private gestureState: GestureState = IDLE;
  /** Último clique (canvas), para o ciclo "clicar de novo sobe para o pai". */
  private lastTap: Point | null = null;
  /** Tipo do último ponteiro apertado: o `contextmenu` de um toque demorado não é do mouse. */
  private lastPointerType = 'mouse';
  /** Shift estava apertado quando o ponteiro desceu: o toque (sem arrasto) alterna o item. */
  private pressShift = false;
  /**
   * Seleção primária de antes do último toque. O segundo toque de um duplo clique, por cair no
   * mesmo ponto, já subiu um degrau na cadeia; o alvo do duplo clique é o que o primeiro toque
   * selecionou, ou seja, a seleção de antes do segundo.
   */
  private selectionBeforeTap: Selection = null;

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
    on('dblclick', (e) => this.onDoubleClick(e));
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
    if (!isStoreGesture(g) && g?.kind !== 'draw' && g?.kind !== 'arrow-link')
      return false;
    if (isStoreGesture(g)) this.o.actions.cancelGesture();
    this.clearTransient();
    this.gesture = { kind: 'pinch' }; // Ignora o resto do arrasto até soltar.
    this.gestureState = { phase: 'pinch' };
    return true;
  }

  /** Apaga a prévia, o rascunho e os destaques do gesto (destino do encaixe, itens a absorver). */
  private clearTransient(): void {
    const { state } = this.o;
    state.preview.value = null;
    state.draft.value = null;
    state.moveTarget.value = null;
    if (state.arrowDraft.peek() !== null) state.arrowDraft.value = null;
    if (state.absorb.peek().length > 0) state.absorb.value = [];
  }

  /** Desfaz um gesto do store pela metade. */
  destroy(): void {
    if (isStoreGesture(this.gesture)) this.o.actions.cancelGesture();
  }

  /** Cursor do mouse: o do gesto em andamento ou o da intenção sob `p` (tela). */
  updateCursor(p: Point | null): void {
    const g = this.gesture;
    let cursor = '';
    if (g?.kind === 'pan') cursor = 'grabbing';
    else if (g && MOVE_GESTURES.has(g.kind)) cursor = 'move';
    else if (g?.kind === 'draw' || (g && AIM_GESTURES.has(g.kind))) cursor = 'crosshair';
    else if (g?.kind === 'blocked') cursor = 'not-allowed';
    else if (this.o.spaceDown()) cursor = 'grab';
    else if (p) cursor = cursorFor(this.intentAt(p));
    this.o.container.style.cursor = cursor;
  }

  private context(): IntentContext {
    const { store, ui, derived } = this.o;
    const project = this.project();
    return {
      project,
      readOnly: store.readOnly.peek() || (this.o.reviewing?.() ?? false),
      // Ver limpo nunca desenha, mesmo que o modo ainda seja Desenhar.
      mode: ui.cleanView.peek() ? 'navigate' : ui.mode.peek(),
      selection: ui.selection.peek(),
      items: existingItems(project, peekSelectedItems(ui)),
      visibility: derived.markingVisibility.peek(),
      arrows: this.arrowShapes(project),
      titles: this.o.containerTitles?.(),
      zoom: this.o.viewport.scale,
      spaceDown: this.o.spaceDown(),
    };
  }

  /** As setas que o toque alcança: as desenhadas ("Mostrar setas" ligado, fora do Ver limpo). */
  private arrowShapes(project: Project | null): readonly ArrowShape[] {
    if (this.o.ui.cleanView.peek() || !showArrows.peek()) return [];
    return visibleArrowShapes(project, this.o.derived.markingVisibility.peek());
  }

  /** As setas e o zoom para a cadeia do toque (`hitChain`). */
  private arrowHit(project: Project | null): ArrowHit {
    return { shapes: this.arrowShapes(project), zoom: this.o.viewport.scale };
  }

  /** Intenção de um arrasto começando em `p` (tela). */
  private intentAt(p: Point): Intent {
    return intentAt(this.context(), this.o.viewport.toCanvas(p));
  }

  private onPointerDown(e: PointerEvent): void {
    this.lastPointerType = e.pointerType;
    this.pressShift = e.shiftKey;
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
      this.gesture = { kind: 'pinch' };
      this.gestureState = stepGesture(this.gestureState, {
        type: 'second-pointer',
      }).state;
      return;
    }
    let intent: Intent = e.button === 1 ? { kind: 'pan' } : this.intentAt(p);
    // Numa tela de toque, arrastar sobre um item (livre ou trancado) faz pan, como rolar a
    // página; alças (resize) e o modo Desenhar continuam diretos, e o mouse não muda.
    if (
      e.pointerType === 'touch' &&
      (intent.kind === 'locked' ||
        intent.kind === 'move-marking' ||
        intent.kind === 'move-image' ||
        intent.kind === 'move-items')
    ) {
      intent = { kind: 'pan' };
    }
    this.gesture = { kind: 'pending', pointerId: e.pointerId, start: p, intent };
    this.gestureState = stepGesture(IDLE, {
      type: 'down',
      point: p,
      direct: dragModeOf(intent),
    }).state;
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
          this.gesture = this.startDrag(g.pointerId, g.start, g.intent);
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
        this.previewPlacement(g.containerId, {
          x: s.x + c.x - startCanvas.x,
          y: s.y + c.y - startCanvas.y,
          scale: s.scale,
        });
        return;
      }
      case 'move-items': {
        // Deslocamento em unidades do canvas, sem arredondar (o modelo arredonda o que precisa).
        // Tudo ou nada: se algum item não pode ir, a prévia fica na última posição válida e é
        // essa posição que `dx`, `dy` guardam para o soltar.
        const c = viewport.toCanvas(p);
        const dx = c.x - g.startCanvas.x;
        const dy = c.y - g.startCanvas.y;
        if (actions.previewItemsMove(g.items, dx, dy).ok) {
          g.dx = dx;
          g.dy = dy;
        }
        return;
      }
      case 'resize-image': {
        const project = this.o.store.project.peek();
        const image = project && projectIndex(project).containers.get(g.containerId);
        if (!image) return;
        const placement = resizeFromCorner(
          image,
          g.startPlacement,
          g.corner,
          viewport.toCanvas(p),
        );
        this.previewPlacement(g.containerId, placement);
        return;
      }
      case 'move-marking': {
        // O deslocamento do canvas vira unidades do espaço da marcação; nada prende a marcação
        // ao container (o espaço novo é decidido ao soltar).
        const c = viewport.toCanvas(p);
        g.dx = Math.round((c.x - g.startCanvas.x) / g.scale);
        g.dy = Math.round((c.y - g.startCanvas.y) / g.scale);
        actions.previewMarkingMove(g.markingId, g.dx, g.dy);
        this.updateMoveTarget(g);
        return;
      }
      case 'resize-marking': {
        const pixel = canvasToImagePixel(g.placement, viewport.toCanvas(p));
        actions.previewMarkingRect(
          g.markingId,
          resizeMarkingRect(g.startRect, g.corner, pixel, g.limits),
        );
        const marking = this.markingNow(g.markingId);
        if (marking) {
          this.updateAbsorb(marking.rect, g.candidates, g.placement, g.limits.outer);
        }
        return;
      }
      case 'arrow-link': {
        const c = viewport.toCanvas(p);
        this.o.state.arrowDraft.value = {
          line: { from: g.origin, to: c },
          target: this.markingUnder(c, g.markingId),
        };
        return;
      }
      case 'arrow-route': {
        // O ponto vai para onde o ponteiro está, no espaço dos pontos (pixels do container
        // arredondados, ou unidades do canvas): um ponto novo (`mid`) entra na posição `index`.
        const at = fromCanvasPoint(g.placement, viewport.toCanvas(p));
        const point = { x: Math.round(at.x), y: Math.round(at.y) };
        if (g.mode === 'segment') {
          // O segmento anda em paralelo: só a coordenada perpendicular a ele segue o ponteiro.
          actions.previewArrowRoute(
            g.arrowId,
            g.base.map((q, i) =>
              i !== g.index
                ? q
                : g.axis === 'x'
                  ? { x: point.x, y: q.y }
                  : { x: q.x, y: point.y },
            ),
          );
          return;
        }
        actions.previewArrowRoute(
          g.arrowId,
          g.mode === 'mid'
            ? [...g.base.slice(0, g.index), point, ...g.base.slice(g.index)]
            : g.base.map((q, i) => (i === g.index ? point : q)),
        );
        return;
      }
      case 'arrow-end':
        this.moveArrowEnd(g, viewport.toCanvas(p));
        return;
      case 'draw': {
        const c = viewport.toCanvas(p);
        const pixel = g.image ? canvasToImagePixel(g.image.placement, c) : c;
        const rect = rectFromPoints(g.startPixel, pixel, g.image);
        this.o.state.draft.value = { containerId: g.image?.id ?? null, rect };
        this.updateAbsorb(
          isDrawableRect(rect) ? rect : null,
          g.candidates,
          g.image?.placement ?? IDENTITY_PLACEMENT,
          g.image ? imagePixelRect(g.image) : null,
        );
        return;
      }
    }
  }

  /**
   * A marcação sob o ponto do canvas que receberia a ponta de uma seta: a primeira da cadeia do
   * toque (flutuantes antes, as ocultas de fora), sem a própria `except`. `null` no vazio.
   */
  private markingUnder(c: Point, except: string | null): string | null {
    const project = this.project();
    if (!project) return null;
    const first = hitChain(project, this.o.derived.markingVisibility.peek(), c).find(
      (item) => item.kind === 'marking',
    );
    return first && first.id !== except ? first.id : null;
  }

  /**
   * Arrastar uma ponta da seta: sobre outra marcação (que não a outra ponta) a prévia a liga nela
   * (lado automático); sobre a mesma, no lado mais perto do ponteiro; no vazio, a seta volta ao que
   * era, mostra a linha provisória e soltar cancela.
   */
  private moveArrowEnd(g: Extract<Gesture, { kind: 'arrow-end' }>, c: Point): void {
    const { actions, state } = this.o;
    const project = this.o.store.project.peek();
    const target = this.markingUnder(c, g.fixed);
    const marking =
      target && project ? projectIndex(project).markings.get(target) : undefined;
    if (!target || !project || !marking) {
      actions.previewArrowEndpoint(
        g.arrowId,
        g.end,
        g.original.markingId,
        g.original.side,
      );
      g.valid = false;
      state.arrowDraft.value = { line: { from: g.fixedAnchor, to: c }, target: null };
      return;
    }
    let side: ArrowSide | null = null;
    if (target === g.original.markingId) {
      // Perto de outro lado da mesma marcação troca o lado; no mesmo, não muda nada (o lado
      // automático fica automático).
      const nearest = nearestSide(markingCanvasRectOf(project, marking), c);
      side = nearest === g.currentSide ? g.original.side : nearest;
    }
    g.valid = actions.previewArrowEndpoint(g.arrowId, g.end, target, side).ok;
    state.arrowDraft.value = { line: null, target };
  }

  /** A marcação no projeto atual do store (com a prévia do gesto). */
  private markingNow(id: string) {
    const project = this.o.store.project.peek();
    return project ? projectIndex(project).markings.get(id) : undefined;
  }

  /**
   * Para onde a marcação arrastada iria se fosse solta agora: o container que a contém ou a
   * recebe pelo encaixe (`snapTarget`), com o deslocamento extra. A flutuante nunca encaixa.
   */
  private moveSnap(g: Extract<Gesture, { kind: 'move-marking' }>): {
    readonly snap: SnapTarget | null;
    readonly origin: string | null;
  } {
    const project = this.o.store.project.peek();
    const marking = this.markingNow(g.markingId);
    if (!project || !marking) return { snap: null, origin: null };
    if (marking.floating) return { snap: null, origin: marking.containerId };
    const space = spaceOf(project, marking);
    const snap = snapTarget(
      toCanvasRect(space.placement, marking.rect),
      space.placement,
      project.containers,
      ABSORB_TOLERANCE / this.o.viewport.scale,
    );
    return { snap, origin: marking.containerId };
  }

  /** Acende o container de destino enquanto a marcação é arrastada (se não é o de origem). */
  private updateMoveTarget(g: Extract<Gesture, { kind: 'move-marking' }>): void {
    const { snap, origin } = this.moveSnap(g);
    const next = snap && snap.containerId !== origin ? snap.containerId : null;
    if (this.o.state.moveTarget.peek() !== next) this.o.state.moveTarget.value = next;
  }

  /**
   * Acende os itens que `rect` absorveria se o gesto terminasse agora (`null` = nenhum). Só
   * escreve o signal quando o conjunto muda.
   */
  private updateAbsorb(
    rect: Rect | null,
    candidates: readonly AbsorbCandidate[],
    placement: Placement,
    limit: Rect | null,
  ): void {
    const tolerance = spaceTolerance(this.o.viewport.scale, placement.scale);
    const next = rect
      ? absorbInto(rect, candidates, tolerance, limit).absorbed.map((a) =>
          toCanvasRect(placement, a.rect),
        )
      : [];
    const current = this.o.state.absorb.peek();
    if (
      current.length === next.length &&
      current.every((r, i) => sameRect(r, next[i] as Rect))
    ) {
      return;
    }
    this.o.state.absorb.value = next;
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

  private previewPlacement(containerId: string, placement: Placement): void {
    const result = this.o.actions.previewImagePlacement(containerId, placement);
    this.o.state.preview.value = {
      containerId: containerId,
      placement,
      valid: result.ok,
    };
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
    const { actions } = this.o;
    this.gesture = null;
    const step = stepGesture(this.gestureState, { type: cancelled ? 'cancel' : 'up' });
    this.gestureState = step.state;
    if (g.kind === 'pending' && step.effect.kind === 'tap') {
      this.tap(step.effect.at, this.pressShift);
    } else {
      // Um arrasto (ou cancelamento) no meio de um duplo clique o desfaz.
      this.selectionBeforeTap = null;
    }
    if (isStoreGesture(g)) {
      // Cancelado: volta ao projeto de antes do gesto. Senão, a operação final repete a mesma
      // operação com os valores finais (encaixe, absorção) e assenta o pertencimento; só então
      // grava uma entrada.
      // Uma ponta solta fora de uma marcação cancela, como Esc.
      if (cancelled || (g.kind === 'arrow-end' && !g.valid)) actions.cancelGesture();
      else {
        this.finishStoreGesture(g);
        actions.commitGesture();
      }
      this.clearTransient();
    }
    if (g.kind === 'draw') this.finishDraw(g, cancelled);
    if (g.kind === 'arrow-link') this.finishArrowLink(g, cancelled);
    if (e.pointerType === 'mouse') this.updateCursor(this.o.viewport.screenPoint(e));
  }

  /** A operação final de um gesto do store, com tudo o que a interação acrescenta ao soltar. */
  private finishStoreGesture(g: StoreGesture): void {
    const { actions } = this.o;
    switch (g.kind) {
      case 'move-image':
      case 'resize-image':
        actions.finishImagePlacement(g.containerId);
        return;
      case 'move-items':
        // Sem encaixe e sem absorção: cada item vai pelo mesmo deslocamento da última prévia
        // válida, e o pertencimento é assentado uma vez sobre o resultado inteiro.
        actions.finishItemsMove(g.items, g.dx, g.dy);
        return;
      case 'move-marking': {
        // Encaixe: quase inteira num container, a marcação é levada para dentro dele.
        const { snap } = this.moveSnap(g);
        actions.finishMarkingMove(
          g.markingId,
          g.dx + (snap?.dx ?? 0),
          g.dy + (snap?.dy ?? 0),
        );
        return;
      }
      case 'arrow-route':
      case 'arrow-end':
        // A prévia já é o resultado: o ponto ou a ponta fica onde o ponteiro foi solto.
        return;
      case 'resize-marking': {
        // Absorção: o retângulo cresce até envolver o que cruza dentro da tolerância.
        const marking = this.markingNow(g.markingId);
        if (!marking) return;
        // Terminou onde começou (a alça não chegou a mudar nada): não é um redimensionamento.
        if (sameRect(marking.rect, g.startRect)) {
          actions.finishMarkingRect(g.markingId, g.startRect);
          return;
        }
        const tolerance = spaceTolerance(this.o.viewport.scale, g.placement.scale);
        const { rect } = absorbInto(
          marking.rect,
          g.candidates,
          tolerance,
          g.limits.outer,
        );
        actions.finishMarkingRect(g.markingId, rect);
        return;
      }
    }
  }

  /** Soltou a alça de ligação: sobre uma marcação, cria a seta (uma entrada) e a seleciona. */
  private finishArrowLink(
    g: Extract<Gesture, { kind: 'arrow-link' }>,
    cancelled: boolean,
  ): void {
    const target = this.o.state.arrowDraft.peek()?.target ?? null;
    this.clearTransient();
    if (cancelled || target === null) return;
    const result = this.o.actions.addArrow(g.markingId, target);
    if (result.ok) this.o.ui.selection.value = { kind: 'arrow', id: result.value };
  }

  private finishDraw(g: Extract<Gesture, { kind: 'draw' }>, cancelled: boolean): void {
    const { draft } = this.o.state;
    const drawn = draft.peek();
    this.clearTransient();
    if (cancelled || !drawn || !isDrawableRect(drawn.rect)) return;
    const tolerance = spaceTolerance(
      this.o.viewport.scale,
      g.image?.placement.scale ?? 1,
    );
    const { rect } = absorbInto(
      drawn.rect,
      g.candidates,
      tolerance,
      g.image ? imagePixelRect(g.image) : null,
    );
    const result = this.o.actions.createMarking(drawn.containerId, rect);
    if (result.ok) this.o.ui.selection.value = { kind: 'marking', id: result.value };
  }

  /**
   * Seleciona pelo clique em `p` (tela); clicar de novo no mesmo ponto sobe para o pai. Com Shift
   * (`shift`), alterna o primeiro item sob o ponto na seleção (sem o ciclo de subir para o pai);
   * no vazio, Shift não muda nada. Na revisão, Shift+clique é um clique simples.
   */
  private tap(p: Point, shift: boolean): void {
    const { ui, derived, viewport } = this.o;
    const c = viewport.toCanvas(p);
    this.selectionBeforeTap = ui.selection.peek();
    // Um clique numa alça (de ligação ou da seta selecionada) não troca a seleção: o clique
    // duplo num ponto de passagem o remove, e o primeiro clique não pode tirar a seta da seleção.
    // Com Shift o clique é da seleção múltipla, mesmo sobre uma alça.
    const onHandle = this.intentAt(p).kind;
    if (!shift && (onHandle === 'arrow-link' || onHandle === 'arrow-handle')) {
      this.lastTap = null;
      return;
    }
    if (shift && !(this.o.reviewing?.() ?? false)) {
      this.lastTap = null; // Um clique simples depois não continua o ciclo.
      const project = this.project();
      const first =
        project &&
        hitChain(
          project,
          derived.markingVisibility.peek(),
          c,
          this.arrowHit(project),
          this.o.containerTitles?.(),
        )[0];
      if (first) toggleSelectedItem(ui, first);
      return;
    }
    const repeat = isRepeatTap(this.lastTap, c, viewport.scale);
    this.lastTap = c;
    ui.selection.value = tapSelection(
      this.project(),
      ui.selection.peek(),
      derived.markingVisibility.peek(),
      c,
      repeat,
      this.arrowHit(this.project()),
      this.o.containerTitles?.(),
    );
  }

  /**
   * Duplo clique (Navegar, mouse): seleciona a marcação com o conteúdo dela (as marcações que a
   * cobrem e, numa marcação do canvas, os containers membros com as marcações deles), com a
   * marcação como primária. Num container, só devolve a seleção a ele (o segundo toque do duplo
   * clique já tinha subido um degrau na cadeia). O próximo clique recomeça o ciclo.
   */
  private onDoubleClick(e: MouseEvent): void {
    const { ui } = this.o;
    this.lastTap = null;
    const project = this.project();
    const target = this.selectionBeforeTap;
    if (e.shiftKey || this.lastPointerType === 'touch' || !project || !target) return;
    if (this.o.reviewing?.()) return;
    if (!ui.cleanView.peek() && ui.mode.peek() !== 'navigate') return;
    const index = projectIndex(project);
    if (target.kind === 'arrow') {
      this.removeWaypointAt(e, project, target.id);
      return;
    }
    if (target.kind === 'marking') {
      if (index.markings.has(target.id)) {
        selectItems(ui, selectionWithContents(project, target.id));
      }
    } else if (index.containers.has(target.id)) {
      ui.selection.value = { kind: 'image', id: target.id };
    }
  }

  /**
   * Clique duplo num ponto de passagem da seta `arrowId`: remove o ponto (uma entrada) e deixa a
   * seta selecionada (o segundo toque pode tê-la trocado). Num segmento do meio de uma seta
   * `elbow`, volta à rota padrão (`points` vazio). Fora de um ponto ou segmento, ou com a seta
   * trancada ou o projeto somente leitura, não faz nada.
   */
  private removeWaypointAt(e: MouseEvent, project: Project, arrowId: string): void {
    const { viewport, actions, store, ui } = this.o;
    const arrow = projectIndex(project).arrows.get(arrowId);
    const shape = arrow && arrowShape(project, arrow);
    if (!arrow || !shape || store.readOnly.peek() || !canEditArrow(project, arrowId))
      return;
    const handle = arrowHandleAt(
      shape,
      viewport.toCanvas(viewport.screenPoint(e)),
      viewport.scale,
    );
    if (handle?.kind !== 'point' && handle?.kind !== 'segment') return;
    const result = actions.setArrowRoute(
      arrowId,
      handle.kind === 'segment' ? [] : arrow.points.filter((_, i) => i !== handle.index),
    );
    if (result.ok) ui.selection.value = { kind: 'arrow', id: arrowId };
  }

  /**
   * Botão direito do mouse: seleciona o item sob o cursor (a marcação mais interna, ou a
   * imagem) e abre o menu de contexto dele. Um item que já está na seleção múltipla não a
   * desfaz: o menu abre para ele e a seleção fica. Numa tela de toque, um toque demorado também
   * dispara `contextmenu`; ele não abre o menu (as ações ficam na Árvore e em Detalhes).
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
      this.arrowHit(this.project()),
      this.o.containerTitles?.(),
    );
    if (!picked) return;
    if (!isItemSelected(peekSelectedItems(ui), picked)) ui.selection.value = picked;
    ui.canvasMenu.value = {
      x: e.clientX,
      y: e.clientY,
      target: {
        kind: picked.kind === 'image' ? 'i' : picked.kind === 'arrow' ? 'arrow' : 'm',
        id: picked.id,
      },
    };
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = wheelZoomFactor(e.deltaY, e.deltaMode, e.ctrlKey);
    this.o.viewport.zoomAt(this.o.viewport.screenPoint(e), factor);
  }
}
