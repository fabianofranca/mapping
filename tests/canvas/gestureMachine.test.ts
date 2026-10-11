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
  it('soltar sem mover é um clique', () => {
    const { effects, state } = run([down(), { type: 'up' }]);
    expect(effects).toEqual([{ kind: 'tap', at: at(100, 100) }]);
    expect(state).toEqual(IDLE);
  });

  it('um tremor pequeno ainda é clique', () => {
    const { effects } = run([
      down(),
      { type: 'move', point: at(103, 102) },
      { type: 'up' },
    ]);
    expect(effects.map((e) => e.kind)).toEqual(['tap']);
  });
});

describe('arrastar', () => {
  it('abaixo do limiar ainda não decide', () => {
    const { effects, state } = run([
      down(),
      { type: 'move', point: at(100 + DRAG_THRESHOLD - 1, 100) },
    ]);
    expect(effects).toEqual([]);
    expect(state.phase).toBe('pressed');
  });

  it.each<DragMode>(['pan', 'move', 'resize', 'draw'])(
    '%s: arrasto direto a partir do limiar',
    (mode) => {
      const { effects, state } = run([
        down(mode),
        { type: 'move', point: at(100 + DRAG_THRESHOLD, 100) },
      ]);
      expect(effects).toEqual([{ kind: 'start-drag', mode, from: at(100, 100) }]);
      expect(state).toEqual({ phase: 'dragging', mode });
    },
  );

  it('soltar depois de arrastar encerra o gesto, sem clique', () => {
    const { effects, state } = run([
      down('move'),
      { type: 'move', point: at(120, 100) },
      { type: 'up' },
    ]);
    expect(effects.map((e) => e.kind)).toEqual(['start-drag', 'end']);
    expect(state).toEqual(IDLE);
  });
});

describe('pinça e cancelamento', () => {
  it('um segundo ponteiro encerra o gesto e entra em pinça até todos saírem', () => {
    const first = run([down(), { type: 'second-pointer' }]);
    expect(first.state).toEqual({ phase: 'pinch' });
    expect(first.effects).toEqual([{ kind: 'end' }]);
    const moved = run([{ type: 'move', point: at(50) }], first.state);
    expect(moved.state).toEqual({ phase: 'pinch' });
    expect(run([{ type: 'all-released' }], first.state).state).toEqual(IDLE);
  });

  it('cancelar volta a ocioso, sem clique', () => {
    const { effects, state } = run([down(), { type: 'cancel' }]);
    expect(effects).toEqual([{ kind: 'end' }]);
    expect(state).toEqual(IDLE);
  });
});
