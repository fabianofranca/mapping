import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import { createDisplayImages } from '../../src/store/displayImages';
import type { InteractionState } from '../../src/canvas/frame';
import { editorFor, installFakeCanvas } from './harness';

describe('CanvasController', () => {
  const frames: FrameRequestCallback[] = [];
  const flush = () => {
    while (frames.length > 0) for (const frame of frames.splice(0)) frame(0);
  };

  beforeAll(() => {
    installFakeCanvas();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterAll(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function setup() {
    const editor = editorFor();
    const ensure = vi.fn();
    const display = {
      ...createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
      ensure,
    };
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const controller = new CanvasController({ container, display, ...editor });
    return { ...editor, container, controller, ensure };
  }

  it('monta o stage com as três camadas e pede os bitmaps das imagens', () => {
    const { container, controller, ensure } = setup();
    flush();
    const canvases = container.querySelectorAll('canvas');
    expect(canvases).toHaveLength(3);
    expect(ensure.mock.calls.map(([file]) => file)).toEqual([
      'images/a.jpg',
      'images/b.jpg',
    ]);
    controller.destroy();
    expect(container.querySelectorAll('canvas')).toHaveLength(0);
  });

  it('comandos do editor: enquadrar, centralizar, ponto e imagem sob o dedo', () => {
    const { controller, ui } = setup();
    controller.fitAll();
    const center = controller.viewportCenter();
    expect(center.x).toBeCloseTo(800);
    expect(center.y).toBeCloseTo(400);
    ui.selection.value = { kind: 'image', id: 'I2' };
    controller.focusSelection();
    expect(controller.viewportCenter().x).toBeCloseTo(1350);
    expect(controller.imageIdAt(190, 350)).toBe('I2');
    const p = controller.canvasPointAt(190, 350);
    expect(p.x).toBeCloseTo(1350);
    controller.destroy();
  });

  it('alvo de soltar na área vazia marca o container no próximo quadro', () => {
    const { container, controller } = setup();
    flush();
    controller.setDropTarget({ imageId: null });
    expect(container.classList.contains('canvas-host--drop')).toBe(false);
    flush();
    expect(container.classList.contains('canvas-host--drop')).toBe(true);
    controller.setDropTarget(null);
    flush();
    expect(container.classList.contains('canvas-host--drop')).toBe(false);
    controller.destroy();
  });

  it('marca no container os enquadramentos e as imagens prontas já desenhados (e2e)', async () => {
    const editor = editorFor();
    const display = createDisplayImages<ImageBitmap>(
      async () => ({ width: 10, height: 10, close: () => undefined }) as ImageBitmap,
    );
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const controller = new CanvasController({ container, display, ...editor });
    flush();
    // O primeiro enquadramento acontece ao medir o container; os bitmaps ainda carregam.
    expect(container.dataset.fits).toBe('1');
    expect(container.dataset.images).toBe('0');
    await Promise.resolve();
    await Promise.resolve();
    flush();
    expect(container.dataset.images).toBe('2');
    // Só o quadro seguinte ao enquadramento o publica.
    controller.fitAll();
    expect(container.dataset.fits).toBe('1');
    flush();
    expect(container.dataset.fits).toBe('2');
    controller.destroy();
  });

  it('publica zoom, área das imagens e cursor em pixels da imagem (B8, P3 e P4)', () => {
    const { container, controller, view } = setup();
    flush();
    // O viewport e a área das imagens chegam à interface (barra de status, minimapa).
    expect(view.size.value).toEqual({ width: 380, height: 700 });
    expect(view.bounds.value).toEqual({ x: 0, y: 0, width: 1600, height: 800 });

    controller.zoomTo(1);
    expect(view.viewport.value.scale).toBeCloseTo(1);
    controller.zoomBy(2);
    expect(view.viewport.value.scale).toBeCloseTo(2);
    controller.zoomTo(1);
    controller.centerOnPoint({ x: 500, y: 400 });
    expect(controller.viewportCenter().x).toBeCloseTo(500);
    expect(controller.viewportCenter().y).toBeCloseTo(400);

    // O cursor só muda no quadro seguinte (uma escrita por quadro, HANDOFF seção 6).
    container.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 1,
        pointerType: 'mouse',
        clientX: 10,
        clientY: 20,
      }),
    );
    expect(view.cursor.value).toBeNull();
    flush();
    const canvasPoint = controller.canvasPointAt(10, 20);
    expect(view.cursor.value).toEqual({
      imageId: 'I1',
      x: Math.floor(canvasPoint.x),
      y: Math.floor(canvasPoint.y),
    });

    container.dispatchEvent(new PointerEvent('pointerleave', { pointerId: 1 }));
    flush();
    expect(view.cursor.value).toBeNull();
    controller.destroy();
  });

  it('depois de destruído, não escuta mais o ponteiro', () => {
    const { container, controller, ui } = setup();
    controller.destroy();
    container.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 }),
    );
    container.dispatchEvent(
      new PointerEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 10 }),
    );
    expect(ui.selection.value).toBeNull();
    expect(controller.cancelInteraction()).toBe(false);
  });

  it('cadeado sob o mouse: só em itens trancados, escrito uma vez por quadro', () => {
    const { container, controller, actions } = setup();
    const hover = () =>
      (controller as unknown as { state: InteractionState }).state.hoverLock.value;
    const move = (x: number, y: number) => {
      container.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 1,
          pointerType: 'mouse',
          clientX: x,
          clientY: y,
        }),
      );
      flush();
    };
    flush();
    controller.zoomTo(1);
    controller.centerOnPoint({ x: 250, y: 250 }); // o centro de M2 fica no centro da tela
    const [x, y] = [190, 350];

    move(x, y);
    expect(hover()).toBeNull(); // projeto sem trava: nem calcula

    actions.setMarkingLocked('M2', true);
    move(x, y);
    expect(hover()).toEqual({ kind: 'marking', id: 'M2' });

    // Sobre a marcação livre (o pai, fora da filha): sem cadeado.
    controller.centerOnPoint({ x: 150, y: 150 });
    move(x, y);
    expect(hover()).toBeNull();

    // Pai trancado: a filha herda e o cadeado aparece nela.
    actions.setMarkingLocked('M1', true);
    controller.centerOnPoint({ x: 250, y: 250 });
    move(x, y);
    expect(hover()).toEqual({ kind: 'marking', id: 'M2' });

    // Imagem trancada, fora das marcações.
    actions.setMarkingLocked('M1', false);
    actions.setMarkingLocked('M2', false);
    actions.setImageLocked('I1', true);
    controller.centerOnPoint({ x: 900, y: 700 });
    move(x, y);
    expect(hover()).toEqual({ kind: 'image', id: 'I1' });

    container.dispatchEvent(new PointerEvent('pointerleave', { pointerId: 1 }));
    flush();
    expect(hover()).toBeNull();
    controller.destroy();
  });
});
