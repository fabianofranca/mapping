import { describe, expect, it } from 'vitest';
import {
  DRAG_THRESHOLD,
  HOLD_CANCEL_DISTANCE,
  IDLE,
  stepGesture,
  type GestureEvent,
  type GestureState,
  type GestureEffect,
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

const touchDown = (direct: 'pan' | 'resize' = 'pan'): GestureEvent => ({
  type: 'down',
  point: at(100, 100),
  direct,
  holdable: direct === 'pan',
});

describe('toque', () => {
  it('soltar sem mover é um toque', () => {
    const { effects, state } = run([touchDown(), { type: 'up' }]);
    expect(effects).toEqual([{ kind: 'tap', at: at(100, 100) }]);
    expect(state).toEqual(IDLE);
  });

  it('um tremor pequeno ainda é toque', () => {
    const { effects } = run([
      touchDown(),
      { type: 'move', point: at(103, 102) },
      { type: 'up' },
    ]);
    expect(effects.map((e) => e.kind)).toEqual(['tap']);
  });
});

describe('arrastar com o dedo', () => {
  it('sempre faz pan, mesmo antes de segurar', () => {
    const { effects } = run([
      touchDown(),
      { type: 'move', point: at(100 + HOLD_CANCEL_DISTANCE, 100) },
    ]);
    expect(effects).toEqual([{ kind: 'start-drag', mode: 'pan', from: at(100, 100) }]);
  });

  it('mexer menos que o limite de cancelamento ainda não decide', () => {
    const { effects, state } = run([
      touchDown(),
      { type: 'move', point: at(100 + HOLD_CANCEL_DISTANCE - 1, 100) },
    ]);
    expect(effects).toEqual([]);
    expect(state.phase).toBe('pressed');
  });

  it('depois de cancelado, o tempo de segurar não pega o item', () => {
    const { effects } = run([
      touchDown(),
      { type: 'move', point: at(120, 100) },
      { type: 'hold', hasTarget: true },
    ]);
    expect(effects.map((e) => e.kind)).toEqual(['start-drag']);
  });
});

describe('segurar e mover', () => {
  it('segurar pega o item e o movimento seguinte o move', () => {
    const { effects, state } = run([
      touchDown(),
      { type: 'hold', hasTarget: true },
      { type: 'move', point: at(112, 100) },
    ]);
    expect(effects).toEqual([
      { kind: 'grab' },
      { kind: 'start-drag', mode: 'move', from: at(100, 100) },
    ]);
    expect(state).toEqual({ phase: 'dragging', mode: 'move' });
  });

  it('segurar e soltar sem arrastar não faz nada (nem toque)', () => {
    const { effects, state } = run([
      touchDown(),
      { type: 'hold', hasTarget: true },
      { type: 'up' },
    ]);
    expect(effects).toEqual([{ kind: 'grab' }, { kind: 'end' }]);
    expect(state).toEqual(IDLE);
  });

  it('sem item sob o dedo, segurar não pega e o gesto segue como toque/pan', () => {
    const tap = run([touchDown(), { type: 'hold', hasTarget: false }, { type: 'up' }]);
    expect(tap.effects.map((e) => e.kind)).toEqual(['tap']);
    const pan = run([
      touchDown(),
      { type: 'hold', hasTarget: false },
      { type: 'move', point: at(100 + DRAG_THRESHOLD, 100) },
    ]);
    expect(pan.effects).toEqual([
      { kind: 'start-drag', mode: 'pan', from: at(100, 100) },
    ]);
  });

  it('o evento de segurar é ignorado se o gesto já mudou', () => {
    const { effects } = run([{ type: 'hold', hasTarget: true }]);
    expect(effects).toEqual([]);
  });
});

describe('alças, mouse e desenho', () => {
  it('alça: arrasto direto, sem segurar', () => {
    const { effects } = run([
      touchDown('resize'),
      { type: 'move', point: at(100 + DRAG_THRESHOLD, 100) },
    ]);
    expect(effects).toEqual([{ kind: 'start-drag', mode: 'resize', from: at(100, 100) }]);
  });

  it('alça: segurar não faz nada de especial', () => {
    const { effects } = run([touchDown('resize'), { type: 'hold', hasTarget: true }]);
    expect(effects).toEqual([]);
  });

  it('mouse: arrastar sobre o item move logo após o limiar', () => {
    const { effects } = run([
      { type: 'down', point: at(0), direct: 'move', holdable: false },
      { type: 'move', point: at(DRAG_THRESHOLD) },
    ]);
    expect(effects).toEqual([{ kind: 'start-drag', mode: 'move', from: at(0) }]);
  });

  it('desenhar: arrasto direto', () => {
    const { effects } = run([
      { type: 'down', point: at(0), direct: 'draw', holdable: false },
      { type: 'move', point: at(DRAG_THRESHOLD) },
    ]);
    expect(effects).toEqual([{ kind: 'start-drag', mode: 'draw', from: at(0) }]);
  });
});

describe('pinça e cancelamento', () => {
  it('um segundo dedo encerra o gesto e entra em pinça até todos saírem', () => {
    const first = run([touchDown(), { type: 'second-pointer' }]);
    expect(first.state).toEqual({ phase: 'pinch' });
    expect(first.effects).toEqual([{ kind: 'end' }]);
    const moved = run([{ type: 'move', point: at(50) }], first.state);
    expect(moved.state).toEqual({ phase: 'pinch' });
    expect(run([{ type: 'all-released' }], first.state).state).toEqual(IDLE);
  });

  it('cancelar volta a ocioso, sem toque', () => {
    const { effects, state } = run([touchDown(), { type: 'cancel' }]);
    expect(effects).toEqual([{ kind: 'end' }]);
    expect(state).toEqual(IDLE);
  });
});
