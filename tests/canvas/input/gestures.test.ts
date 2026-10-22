import { describe, expect, it, vi } from 'vitest';
import { isStoreGesture, startGesture } from '../../../src/canvas/input/gestures';
import { createMarking, setContainerPlacement } from '../../../src/model';
import { canvasProject } from '../harness';

const project = canvasProject();
const at = { x: 250, y: 250 };

describe('startGesture', () => {
  it('pan (ou sem projeto) não começa gesto', () => {
    const begin = vi.fn(() => true);
    expect(startGesture(project, 1, at, { kind: 'pan' }, begin)).toBeNull();
    expect(
      startGesture(null, 1, at, { kind: 'move-image', containerId: 'I1' }, begin),
    ).toBeNull();
    expect(begin).not.toHaveBeenCalled();
  });

  it('desenhar: rascunho no ponto inicial, sem abrir gesto no store', () => {
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

  it('desenhar no vazio: rascunho do canvas (sem imagem), em unidades do canvas', () => {
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

  it('desenhar numa imagem: os candidatos à absorção são as marcações dela', () => {
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

  it('desenhar no canvas: candidatos são as marcações do canvas e os containers', () => {
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

  it('mover/redimensionar abrem um gesto no store, com o estado inicial', () => {
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
      // Só o container limita; as filhas e o pai não.
      limits: { outer: { x: 0, y: 0, width: 1000, height: 800 } },
      placement: { x: 0, y: 0, scale: 1 },
    });
    // Absorve o que cruza, menos ela mesma e os ancestrais (aqui, M1).
    const candidates =
      resize?.gesture.kind === 'resize-marking' ? resize.gesture.candidates : [];
    expect(candidates).toEqual([]);
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

describe('startGesture: espaços', () => {
  it('mover marcação de container usa a escala dele; a do canvas, 1', () => {
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

  it('redimensionar marcação do canvas: sem limite, com os containers entre os candidatos', () => {
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

  it('a flutuante não absorve nada ao ser redimensionada', () => {
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

  it('resize exclui os ancestrais e ela mesma dos candidatos; as filhas ficam', () => {
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

describe('startGesture: item trancado', () => {
  it('o arrasto sobre o item trancado vira um gesto "blocked", sem abrir gesto no store', () => {
    const begin = vi.fn(() => true);
    const started = startGesture(project, 7, at, { kind: 'locked' }, begin);
    expect(started).toEqual({ gesture: { kind: 'blocked', pointerId: 7 }, draft: null });
    expect(isStoreGesture(started?.gesture ?? null)).toBe(false);
    expect(begin).not.toHaveBeenCalled();
  });
});
