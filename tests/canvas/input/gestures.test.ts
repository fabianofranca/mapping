import { describe, expect, it, vi } from 'vitest';
import { isStoreGesture, startGesture } from '../../../src/canvas/input/gestures';
import { canvasProject } from '../harness';

const project = canvasProject();
const at = { x: 250, y: 250 };

describe('startGesture', () => {
  it('pan (ou sem projeto) não começa gesto', () => {
    const begin = vi.fn(() => true);
    expect(startGesture(project, 1, at, { kind: 'pan' }, begin)).toBeNull();
    expect(
      startGesture(null, 1, at, { kind: 'move-image', imageId: 'I1' }, begin),
    ).toBeNull();
    expect(begin).not.toHaveBeenCalled();
  });

  it('desenhar: rascunho no ponto inicial, sem abrir gesto no store', () => {
    const begin = vi.fn(() => true);
    const started = startGesture(project, 1, at, { kind: 'draw', imageId: 'I1' }, begin);
    expect(started?.gesture).toMatchObject({ kind: 'draw', startPixel: at });
    expect(started?.draft?.imageId).toBe('I1');
    expect(isStoreGesture(started?.gesture ?? null)).toBe(false);
    expect(begin).not.toHaveBeenCalled();
  });

  it('mover/redimensionar abrem um gesto no store, com o estado inicial', () => {
    const begin = vi.fn(() => true);
    const move = startGesture(
      project,
      1,
      at,
      { kind: 'move-image', imageId: 'I2' },
      begin,
    );
    expect(move?.gesture).toMatchObject({
      kind: 'move-image',
      startCanvas: at,
      startPlacement: { x: 1100, y: 0, scale: 1 },
    });
    const resize = startGesture(
      project,
      1,
      at,
      { kind: 'resize-marking', markingId: 'M2', corner: 'se' },
      begin,
    );
    expect(resize?.gesture).toMatchObject({
      kind: 'resize-marking',
      corner: 'se',
      startRect: { x: 200, y: 200, width: 100, height: 100 },
    });
    expect(begin).toHaveBeenCalledTimes(2);
    expect(isStoreGesture(resize?.gesture ?? null)).toBe(true);
    expect(resize?.draft).toBeNull();
  });

  it('item que não existe mais, ou store recusando o gesto: vira pan (null)', () => {
    expect(
      startGesture(project, 1, at, { kind: 'move-marking', markingId: 'X' }, () => true),
    ).toBeNull();
    expect(
      startGesture(
        project,
        1,
        at,
        { kind: 'move-marking', markingId: 'M1' },
        () => false,
      ),
    ).toBeNull();
  });
});

describe('startGesture: item trancado', () => {
  it('o arrasto sobre o item trancado vira um gesto "blocked", sem abrir gesto no store', () => {
    const begin = vi.fn(() => true);
    const started = startGesture(project, 7, at, { kind: 'locked' }, begin);
    expect(started).toEqual({ gesture: { kind: 'blocked', pointerId: 7 }, draft: null });
    expect(isStoreGesture(started?.gesture ?? null)).toBe(false);
    expect(begin).not.toHaveBeenCalled();
  });
});
