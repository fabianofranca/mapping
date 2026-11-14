// State machine that classifies a pointer's gesture: click, pan, move,
// resize, draw or pinch. Pure (no DOM or timers): the `CanvasController`
// feeds it events and executes the returned effects.
import type { Point } from './viewport';

/** Movement (screen px) from which a click becomes a drag. */
export const DRAG_THRESHOLD = 6;

/** What the drag does. */
export type DragMode = 'pan' | 'move' | 'resize' | 'draw' | 'select';

export type GestureState =
  | { readonly phase: 'idle' }
  /** Pressed, without enough movement to decide. */
  | {
      readonly phase: 'pressed';
      readonly start: Point;
      readonly direct: DragMode;
    }
  | { readonly phase: 'dragging'; readonly mode: DragMode }
  /** Two pointers (trackpad or screen pinch). It only ends when all leave. */
  | { readonly phase: 'pinch' };

export type GestureEvent =
  | {
      readonly type: 'down';
      readonly point: Point;
      /** What the drag does (what the mouse does). */
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
