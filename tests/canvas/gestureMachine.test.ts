import { describe, expect, it } from 'vitest';
import {
  DRAG_THRESHOLD,
  IDLE,
  stepGesture,
  type GestureEvent,
  type GestureState,
  type GestureEffect,
  type DragMode,
} from '../../src/canvas/gestureMachine';

const at = (x: number, y = 0) => ({ x, y });

function run(events: readonly GestureEvent[], from: GestureState = IDLE) {
  let state = from;
  const effects: GestureEffect[] = [];
  for (const event of events) {
    const step = stepGesture(state, event);
    state = step.state;
    if (step.effect.kind !== 'none') effects.push(step.effect);
  }
  return { state, effects };
}

const down = (direct: DragMode = 'pan'): GestureEvent => ({
  type: 'down',
  point: at(100, 100),
  direct,
});

describe('clique', () => {
  it('releasing without moving is a click', () => {
    const { effects, state } = run([down(), { type: 'up' }]);
    expect(effects).toEqual([{ kind: 'tap', at: at(100, 100) }]);
    expect(state).toEqual(IDLE);
  });

  it('a small tremor is still a click', () => {
    const { effects } = run([
      down(),
      { type: 'move', point: at(103, 102) },
      { type: 'up' },
    ]);
    expect(effects.map((e) => e.kind)).toEqual(['tap']);
  });
});

describe('arrastar', () => {
  it('below the threshold it does not decide yet', () => {
    const { effects, state } = run([
      down(),
      { type: 'move', point: at(100 + DRAG_THRESHOLD - 1, 100) },
    ]);
    expect(effects).toEqual([]);
    expect(state.phase).toBe('pressed');
  });

  it.each<DragMode>(['pan', 'move', 'resize', 'draw'])(
    '%s: direct drag from the threshold',
    (mode) => {
      const { effects, state } = run([
        down(mode),
        { type: 'move', point: at(100 + DRAG_THRESHOLD, 100) },
      ]);
      expect(effects).toEqual([{ kind: 'start-drag', mode, from: at(100, 100) }]);
      expect(state).toEqual({ phase: 'dragging', mode });
    },
  );

  it('releasing after dragging ends the gesture, without a click', () => {
    const { effects, state } = run([
      down('move'),
      { type: 'move', point: at(120, 100) },
      { type: 'up' },
    ]);
    expect(effects.map((e) => e.kind)).toEqual(['start-drag', 'end']);
    expect(state).toEqual(IDLE);
  });
});

describe('pinch and cancel', () => {
  it('a second pointer ends the gesture and enters pinch until all leave', () => {
    const first = run([down(), { type: 'second-pointer' }]);
    expect(first.state).toEqual({ phase: 'pinch' });
    expect(first.effects).toEqual([{ kind: 'end' }]);
    const moved = run([{ type: 'move', point: at(50) }], first.state);
    expect(moved.state).toEqual({ phase: 'pinch' });
    expect(run([{ type: 'all-released' }], first.state).state).toEqual(IDLE);
  });

  it('cancelling returns to idle, without a click', () => {
    const { effects, state } = run([down(), { type: 'cancel' }]);
    expect(effects).toEqual([{ kind: 'end' }]);
    expect(state).toEqual(IDLE);
  });
});
