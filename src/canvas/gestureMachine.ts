// Máquina de estados que classifica o gesto de um dedo/ponteiro: toque, pan,
// segurar-e-mover, redimensionar ou desenhar. Pura (sem DOM nem timers): o
// `CanvasController` a alimenta com eventos e executa os efeitos devolvidos.
import type { Point } from './viewport';

/** Tempo de pressão para "pegar" o item (ms). */
export const HOLD_MS = 400;
/** Movimento (px de tela) que, antes do tempo, cancela o "segurar" e vira pan. */
export const HOLD_CANCEL_DISTANCE = 8;
/** Movimento (px de tela) a partir do qual um toque vira arrasto. */
export const DRAG_THRESHOLD = 6;
/** Depois de pegar o item, o primeiro movimento desse tamanho começa a mover. */
export const HELD_MOVE_DISTANCE = 3;

/** O que o arrasto faz. */
export type DragMode = 'pan' | 'move' | 'resize' | 'draw';

export type GestureState =
  | { readonly phase: 'idle' }
  /** Pressionado, sem movimento suficiente para decidir. */
  | {
      readonly phase: 'pressed';
      readonly start: Point;
      readonly direct: DragMode;
      /** Ainda pode virar "segurar-e-mover" (só toque, modo Navegar, edição liberada). */
      readonly holdable: boolean;
    }
  /** Item pego: o próximo movimento o arrasta; soltar sem mover não faz nada. */
  | { readonly phase: 'held'; readonly start: Point }
  | { readonly phase: 'dragging'; readonly mode: DragMode }
  /** Dois dedos. Só termina quando todos saem da tela. */
  | { readonly phase: 'pinch' };

export type GestureEvent =
  | {
      readonly type: 'down';
      readonly point: Point;
      /** O que um arrasto imediato faria (o que o mouse faz). */
      readonly direct: DragMode;
      readonly holdable: boolean;
    }
  | { readonly type: 'move'; readonly point: Point }
  /** O tempo `HOLD_MS` passou. `hasTarget`: há um item sob o dedo para pegar. */
  | { readonly type: 'hold'; readonly hasTarget: boolean }
  | { readonly type: 'up' }
  | { readonly type: 'cancel' }
  | { readonly type: 'second-pointer' }
  | { readonly type: 'all-released' };

export type GestureEffect =
  | { readonly kind: 'none' }
  /** Item pego: sinal visual e vibração. */
  | { readonly kind: 'grab' }
  | { readonly kind: 'start-drag'; readonly mode: DragMode; readonly from: Point }
  | { readonly kind: 'tap'; readonly at: Point }
  | { readonly kind: 'end' };

export interface GestureStep {
  readonly state: GestureState;
  readonly effect: GestureEffect;
}

export const IDLE: GestureState = { phase: 'idle' };

const NONE: GestureEffect = { kind: 'none' };

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function stepGesture(state: GestureState, event: GestureEvent): GestureStep {
  const stay = (s: GestureState = state): GestureStep => ({ state: s, effect: NONE });

  switch (event.type) {
    case 'down':
      return stay({
        phase: 'pressed',
        start: event.point,
        direct: event.direct,
        holdable: event.holdable,
      });

    case 'second-pointer':
      return { state: { phase: 'pinch' }, effect: state.phase === 'idle' ? NONE : END };

    case 'all-released':
      return state.phase === 'pinch' ? stay(IDLE) : stay();

    case 'cancel':
      return { state: IDLE, effect: state.phase === 'idle' ? NONE : END };

    case 'hold':
      if (state.phase !== 'pressed' || !state.holdable) return stay();
      // Sem item para pegar, o gesto segue como pan normal.
      if (!event.hasTarget) return stay({ ...state, holdable: false });
      return {
        state: { phase: 'held', start: state.start },
        effect: { kind: 'grab' },
      };

    case 'move': {
      if (state.phase === 'pressed') {
        const moved = distance(event.point, state.start);
        if (state.holdable) {
          // Mexeu antes de completar o tempo: é pan (segurar-e-mover cancelado).
          if (moved < HOLD_CANCEL_DISTANCE) return stay();
          return dragging('pan', state.start);
        }
        return moved >= DRAG_THRESHOLD ? dragging(state.direct, state.start) : stay();
      }
      if (state.phase === 'held') {
        return distance(event.point, state.start) >= HELD_MOVE_DISTANCE
          ? dragging('move', state.start)
          : stay();
      }
      return stay();
    }

    case 'up':
      if (state.phase === 'pressed') {
        return { state: IDLE, effect: { kind: 'tap', at: state.start } };
      }
      // Segurar e soltar sem arrastar não faz nada.
      return { state: IDLE, effect: state.phase === 'idle' ? NONE : END };
  }
}

const END: GestureEffect = { kind: 'end' };

function dragging(mode: DragMode, from: Point): GestureStep {
  return {
    state: { phase: 'dragging', mode },
    effect: { kind: 'start-drag', mode, from },
  };
}
