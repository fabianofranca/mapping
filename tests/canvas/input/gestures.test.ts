import { describe, expect, it, vi } from 'vitest';
import { isStoreGesture, startGesture } from '../../../src/canvas/input/gestures';
import { createMarking, setContainerPlacement, setImageLocked } from '../../../src/model';
import { canvasProject } from '../harness';

const project = canvasProject();
const at = { x: 250, y: 250 };

describe('startGesture', () => {
  it('pan (or without a project) does not start a gesture', () => {
    const begin = vi.fn(() => true);
    expect(startGesture(project, 1, at, { kind: 'pan' }, begin)).toBeNull();
    expect(
      startGesture(null, 1, at, { kind: 'move-image', containerId: 'I1' }, begin),
    ).toBeNull();
    expect(begin).not.toHaveBeenCalled();
  });

  it('select-rect: gesture without store, without draft; without a project it does not start', () => {
    const begin = vi.fn(() => true);
    const started = startGesture(project, 7, at, { kind: 'select-rect' }, begin);
    expect(started?.gesture).toEqual({
      kind: 'select-rect',
      pointerId: 7,
      startCanvas: at,
    });
    expect(started?.draft).toBeNull();
    expect(isStoreGesture(started?.gesture ?? null)).toBe(false);
    expect(startGesture(null, 7, at, { kind: 'select-rect' }, begin)).toBeNull();
    expect(begin).not.toHaveBeenCalled();
  });

  it('draw: draft at the initial point, without opening a gesture in the store', () => {
    const begin = vi.fn(() => true);
    const started = startGesture(
      project,
      1,
      at,
      { kind: 'draw', containerId: 'I1' },
      begin,
    );
    expect(started?.gesture).toMatchObject({ kind: 'draw', startPixel: at });
    expect(started?.draft?.containerId).toBe('I1');
    expect(isStoreGesture(started?.gesture ?? null)).toBe(false);
    expect(begin).not.toHaveBeenCalled();
  });

  it('draw on empty space: canvas draft (no image), in canvas units', () => {
    const begin = vi.fn(() => true);
    const empty = { x: 1050.4, y: 900.6 };
    const started = startGesture(
      project,
      1,
      empty,
      { kind: 'draw', containerId: null },
      begin,
    );
    expect(started?.gesture).toMatchObject({
      kind: 'draw',
      image: null,
      startPixel: empty,
    });
    expect(started?.draft).toEqual({
      containerId: null,
      rect: { x: 1050, y: 901, width: 0, height: 0 },
    });
    expect(begin).not.toHaveBeenCalled();
  });

  it('draw on an image: the absorption candidates are its markings', () => {
    const started = startGesture(
      project,
      1,
      at,
      { kind: 'draw', containerId: 'I1' },
      () => true,
    );
    const gesture = started?.gesture;
    expect(gesture?.kind === 'draw' && gesture.candidates.map((c) => c.id)).toEqual([
      'M1',
      'M2',
    ]);
  });

  it('draw on the canvas: candidates are the canvas markings and the containers', () => {
    const q = createMarking(project, {
      id: 'C1',
      containerId: null,
      rect: { x: 3000, y: 3000, width: 100, height: 100 },
    });
    const started = startGesture(
      q,
      1,
      { x: 2000, y: 2000 },
      { kind: 'draw', containerId: null },
      () => true,
    );
    const gesture = started?.gesture;
    expect(gesture?.kind === 'draw' && gesture.candidates.map((c) => c.id)).toEqual([
      'C1',
      'I1',
      'I2',
    ]);
  });

  it('move/resize open a gesture in the store, with the initial state', () => {
    const begin = vi.fn(() => true);
    const move = startGesture(
      project,
      1,
      at,
      { kind: 'move-image', containerId: 'I2' },
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
      // Only the container limits; the children and the parent do not.
      limits: { outer: { x: 0, y: 0, width: 1000, height: 800 } },
      placement: { x: 0, y: 0, scale: 1 },
    });
    // Absorbs what crosses, except itself and the ancestors (here, M1).
    const candidates =
      resize?.gesture.kind === 'resize-marking' ? resize.gesture.candidates : [];
    expect(candidates).toEqual([]);
    expect(begin).toHaveBeenCalledTimes(2);
    expect(isStoreGesture(resize?.gesture ?? null)).toBe(true);
    expect(resize?.draft).toBeNull();
  });

  it('item that no longer exists, or store refusing the gesture: becomes pan (null)', () => {
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

describe('startGesture: spaces', () => {
  it('moving a container marking uses its scale; the canvas one, 1', () => {
    const scaled = setContainerPlacement(project, 'I2', { x: 1100, y: 0, scale: 0.5 });
    const inContainer = startGesture(
      scaled,
      1,
      at,
      { kind: 'move-marking', markingId: 'M3' },
      () => true,
    );
    expect(inContainer?.gesture).toMatchObject({
      kind: 'move-marking',
      scale: 0.5,
      dx: 0,
      dy: 0,
    });
    const q = createMarking(scaled, {
      id: 'C1',
      containerId: null,
      rect: { x: 3000, y: 3000, width: 100, height: 100 },
    });
    const onCanvas = startGesture(
      q,
      1,
      at,
      { kind: 'move-marking', markingId: 'C1' },
      () => true,
    );
    expect(onCanvas?.gesture).toMatchObject({ kind: 'move-marking', scale: 1 });
  });

  it('resizing a canvas marking: no limit, with the containers among the candidates', () => {
    const q = createMarking(project, {
      id: 'C1',
      containerId: null,
      rect: { x: -100, y: -100, width: 1800, height: 1000 },
    });
    const started = startGesture(
      q,
      1,
      at,
      { kind: 'resize-marking', markingId: 'C1', corner: 'se' },
      () => true,
    );
    const gesture = started?.gesture;
    expect(gesture).toMatchObject({
      kind: 'resize-marking',
      limits: { outer: null },
      placement: { x: 0, y: 0, scale: 1 },
    });
    expect(
      gesture?.kind === 'resize-marking' && gesture.candidates.map((c) => c.id),
    ).toEqual(['I1', 'I2']);
  });

  it('the floating one absorbs nothing when resized', () => {
    const q = createMarking(project, {
      id: 'N1',
      containerId: null,
      rect: { x: -500, y: -500, width: 100, height: 100 },
      floating: true,
    });
    const started = startGesture(
      q,
      1,
      at,
      { kind: 'resize-marking', markingId: 'N1', corner: 'se' },
      () => true,
    );
    const gesture = started?.gesture;
    expect(gesture?.kind === 'resize-marking' && gesture.candidates).toEqual([]);
  });

  it('resize excludes the ancestors and itself from the candidates; the children stay', () => {
    const started = startGesture(
      project,
      1,
      at,
      { kind: 'resize-marking', markingId: 'M1', corner: 'se' },
      () => true,
    );
    const gesture = started?.gesture;
    expect(
      gesture?.kind === 'resize-marking' && gesture.candidates.map((c) => c.id),
    ).toEqual(['M2']);
  });
});

describe('startGesture: locked item', () => {
  it('dragging the locked item becomes a "blocked" gesture, without opening a gesture in the store', () => {
    const begin = vi.fn(() => true);
    const started = startGesture(project, 7, at, { kind: 'locked' }, begin);
    expect(started).toEqual({ gesture: { kind: 'blocked', pointerId: 7 }, draft: null });
    expect(isStoreGesture(started?.gesture ?? null)).toBe(false);
    expect(begin).not.toHaveBeenCalled();
  });
});

describe('startGesture: joint drag (ME2)', () => {
  const items = [
    { kind: 'image', id: 'I2' },
    { kind: 'marking', id: 'M1' },
  ] as const;

  it('opens a gesture in the store with the items and the offset zeroed', () => {
    const begin = vi.fn(() => true);
    const started = startGesture(project, 3, at, { kind: 'move-items', items }, begin);
    expect(started).toEqual({
      gesture: {
        kind: 'move-items',
        pointerId: 3,
        items,
        startCanvas: at,
        dx: 0,
        dy: 0,
      },
      draft: null,
    });
    expect(begin).toHaveBeenCalledTimes(1);
    expect(isStoreGesture(started?.gesture ?? null)).toBe(true);
  });

  it('locked item among the ones that move: the gesture does not start (becomes pan)', () => {
    const begin = vi.fn(() => true);
    const locked = setImageLocked(project, 'I2', true);
    expect(startGesture(locked, 1, at, { kind: 'move-items', items }, begin)).toBeNull();
    expect(begin).not.toHaveBeenCalled();
  });

  it('the items that vanished leave the gesture; with none, or with the store refusing, it is pan', () => {
    const begin = vi.fn(() => true);
    const partial = startGesture(
      project,
      1,
      at,
      {
        kind: 'move-items',
        items: [{ kind: 'marking', id: 'X' }, ...items],
      },
      begin,
    );
    expect(partial?.gesture).toMatchObject({ kind: 'move-items', items });
    expect(
      startGesture(
        project,
        1,
        at,
        { kind: 'move-items', items: [{ kind: 'image', id: 'X' }] },
        begin,
      ),
    ).toBeNull();
    expect(startGesture(project, 1, at, { kind: 'move-items', items }, () => false)).toBe(
      null,
    );
  });
});
