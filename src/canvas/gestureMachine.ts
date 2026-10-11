// Máquina de estados que classifica o gesto de um ponteiro: clique, pan, mover,
// redimensionar, desenhar ou pinça. Pura (sem DOM nem timers): o `CanvasController`
// a alimenta com eventos e executa os efeitos devolvidos.
import type { Point } from './viewport';

/** Movimento (px de tela) a partir do qual um clique vira arrasto. */
export const DRAG_THRESHOLD = 6;

/** O que o arrasto faz. */
export type DragMode = 'pan' | 'move' | 'resize' | 'draw';

export type GestureState =
  | { readonly phase: 'idle' }
  /** Pressionado, sem movimento suficiente para decidir. */
  | {
      readonly phase: 'pressed';
      readonly start: Point;
      readonly direct: DragMode;
    }
  | { readonly phase: 'dragging'; readonly mode: DragMode }
  /** Dois ponteiros (pinça do trackpad ou da tela). Só termina quando todos saem. */
  | { readonly phase: 'pinch' };

export type GestureEvent =
  | {
      readonly type: 'down';
      readonly point: Point;
      /** O que o arrasto faz (o que o mouse faz). */
      readonly direct: DragMode;
    }
  | { readonly type: 'move'; readonly point: Point }
  | { readonly type: 'up' }
  | { readonly type: 'cancel' }
  | { readonly type: 'second-pointer' }
  | { readonly type: 'all-released' };

export type GestureEffect =
  | { readonly kind: 'none' }
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
      return stay({ phase: 'pressed', start: event.point, direct: event.direct });

    case 'second-pointer':
      return { state: { phase: 'pinch' }, effect: state.phase === 'idle' ? NONE : END };

    case 'all-released':
      return state.phase === 'pinch' ? stay(IDLE) : stay();

    case 'cancel':
      return { state: IDLE, effect: state.phase === 'idle' ? NONE : END };

    case 'move': {
      if (state.phase !== 'pressed') return stay();
      return distance(event.point, state.start) >= DRAG_THRESHOLD
        ? dragging(state.direct, state.start)
        : stay();
    }

    case 'up':
      if (state.phase === 'pressed') {
        return { state: IDLE, effect: { kind: 'tap', at: state.start } };
      }
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
