import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import { createDisplayImages } from '../../src/store/displayImages';
import type { InteractionState } from '../../src/canvas/frame';
import type { OverlayRenderer } from '../../src/canvas/renderers/overlay';
import { selectItems, setCleanView, type SelectionItem } from '../../src/store/ui';
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

  it('monta o stage com as seis camadas (imagens, componentes, setas, marcações, flutuantes, sobreposições) e pede os bitmaps das imagens', () => {
    const { container, controller, ensure } = setup();
    flush();
    const canvases = container.querySelectorAll('canvas');
    expect(canvases).toHaveLength(6);
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
    controller.centerSelection();
    expect(controller.viewportCenter().x).toBeCloseTo(1350);
    expect(controller.imageIdAt(190, 350)).toBe('I2');
    const p = controller.canvasPointAt(190, 350);
    expect(p.x).toBeCloseTo(1350);
    controller.destroy();
  });

  it('seleção múltipla: contorno secundário nos não primários, vazio no Ver limpo, e o pan não refaz a lista', () => {
    const { controller, ui } = setup();
    const internals = controller as unknown as {
      overlay: OverlayRenderer;
      frame: { peek(): { items: readonly SelectionItem[] } };
    };
    const lit = () =>
      internals.overlay
        .secondaryHighlights()
        .filter((r) => r.visible())
        .map((r) => r.getAttrs());
    flush();
    expect(lit()).toHaveLength(0);

    selectItems(ui, [
      { kind: 'image', id: 'I2' },
      { kind: 'marking', id: 'M3' },
      { kind: 'marking', id: 'M2' },
    ]);
    flush();
    expect(lit()).toHaveLength(2);
    const items = internals.frame.peek().items;
    expect(items.map((i) => i.id)).toEqual(['I2', 'M3', 'M2']);

    // Pan e zoom refazem o quadro, mas a lista de itens é o mesmo objeto.
    controller.zoomBy(1.5);
    flush();
    expect(internals.frame.peek().items).toBe(items);

    // Ver limpo esconde a seleção inteira, como esconde a primária.
    setCleanView(ui, true);
    flush();
    expect(lit()).toHaveLength(0);
    setCleanView(ui, false);
    flush();
    expect(lit()).toHaveLength(2);

    // Um clique simples volta a um item só.
    ui.selection.value = { kind: 'marking', id: 'M1' };
    flush();
    expect(lit()).toHaveLength(0);
    controller.destroy();
  });

  it('alvo de soltar na área vazia marca o container no próximo quadro', () => {
    const { container, controller } = setup();
    flush();
    controller.setDropTarget({ containerId: null });
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

  // Achado 10: `InvalidStateError: drawImage … The image source is detached`. O `retain`
  // fechava o bitmap na hora, enquanto o nó do Konva ainda o referenciava e um desenho
  // pendente (o `batchDraw` do quadro anterior) ainda ia usá-lo.
  it('o bitmap de uma imagem que sai do projeto só fecha depois do quadro que deixa de desenhá-lo', async () => {
    const editor = editorFor();
    const bitmaps = new Map<string, { closed: boolean }>();
    const display = createDisplayImages<ImageBitmap>(async (path) => {
      const bitmap = {
        width: 10,
        height: 10,
        closed: false,
        close() {
          this.closed = true;
        },
      };
      bitmaps.set(path, bitmap);
      return bitmap as unknown as ImageBitmap;
    });
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const controller = new CanvasController({ container, display, ...editor });
    flush();
    await Promise.resolve();
    await Promise.resolve();
    flush();
    expect(container.dataset.images).toBe('2');
    const b = bitmaps.get('images/b.jpg');
    if (!b) throw new Error('bitmap de b.jpg');

    // A imagem sai do projeto: o mapa de exibição a solta na hora, mas o bitmap continua
    // aberto até o quadro seguinte (que tira a referência do nó) ser desenhado.
    editor.actions.removeContainer('I2');
    expect(display.images.value.has('images/b.jpg')).toBe(false);
    expect(b.closed).toBe(false);
    flush();
    expect(container.dataset.images).toBe('1');
    expect(b.closed).toBe(true);
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
      containerId: 'I1',
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

  describe('marcações do canvas (ME1)', () => {
    /** Uma marcação do canvas em volta das duas imagens e uma flutuante sobre a Porta. */
    function spatial() {
      const ctx = setup();
      const created = ctx.actions.createMarking(null, {
        x: -100,
        y: -100,
        width: 1800,
        height: 1000,
      });
      const id = created.ok ? created.value : '';
      return { ...ctx, id };
    }

    it('publica no container quantas marcações do canvas há (e2e)', () => {
      const { container, controller, actions } = setup();
      flush();
      expect(container.dataset.canvasMarkings).toBe('0');
      actions.createMarking(null, { x: 2000, y: 0, width: 100, height: 100 });
      flush();
      expect(container.dataset.canvasMarkings).toBe('1');
      // As de container não contam, e a flutuante conta (vive no canvas).
      actions.createMarking('I1', { x: 10, y: 10, width: 20, height: 20 });
      const note = actions.createMarking(null, { x: 2300, y: 0, width: 50, height: 50 });
      if (note.ok) actions.setMarkingFloating(note.value, true);
      flush();
      expect(container.dataset.canvasMarkings).toBe('2');
      controller.destroy();
    });

    it('Enquadrar tudo e o minimapa incluem as marcações do canvas', () => {
      const { controller, view, actions } = setup();
      flush();
      expect(view.bounds.value).toEqual({ x: 0, y: 0, width: 1600, height: 800 });
      actions.createMarking(null, { x: -500, y: -300, width: 200, height: 100 });
      flush();
      expect(view.bounds.value).toEqual({ x: -500, y: -300, width: 2100, height: 1100 });
      controller.fitAll();
      const center = controller.viewportCenter();
      expect(center.x).toBeCloseTo(550);
      expect(center.y).toBeCloseTo(250);
      controller.destroy();
    });

    it('centraliza na marcação do canvas selecionada (espaço identidade)', () => {
      const { controller, ui, id } = spatial();
      flush();
      ui.selection.value = { kind: 'marking', id };
      controller.centerSelection();
      const center = controller.viewportCenter();
      expect(center.x).toBeCloseTo(800);
      expect(center.y).toBeCloseTo(400);
      controller.destroy();
    });

    it('o container que receberia a marcação arrastada acende como alvo de soltar', () => {
      const { container, controller } = setup();
      const internals = controller as unknown as {
        state: InteractionState;
        overlay: { dropRect: { visible(): boolean; width(): number } };
      };
      flush();
      internals.state.moveTarget.value = 'I2';
      flush();
      expect(internals.overlay.dropRect.visible()).toBe(true);
      expect(internals.overlay.dropRect.width()).toBe(500);
      // O alvo de soltar um arquivo tem a vez enquanto existir.
      controller.setDropTarget({ containerId: 'I1' });
      flush();
      expect(internals.overlay.dropRect.width()).toBe(1000);
      controller.setDropTarget(null);
      internals.state.moveTarget.value = null;
      flush();
      expect(internals.overlay.dropRect.visible()).toBe(false);
      expect(container.classList.contains('canvas-host--drop')).toBe(false);
      controller.destroy();
    });

    it('os itens a absorver acendem no overlay e apagam quando o gesto acaba', () => {
      const { controller } = setup();
      const internals = controller as unknown as {
        state: InteractionState;
        overlay: { absorbHighlights(): readonly { visible(): boolean }[] };
      };
      flush();
      internals.state.absorb.value = [{ x: 10, y: 10, width: 50, height: 50 }];
      flush();
      expect(
        internals.overlay.absorbHighlights().filter((r) => r.visible()),
      ).toHaveLength(1);
      internals.state.absorb.value = [];
      flush();
      expect(
        internals.overlay.absorbHighlights().filter((r) => r.visible()),
      ).toHaveLength(0);
      controller.destroy();
    });

    it('cadeado sob o mouse: a flutuante tem a vez; o container herda a trava da marcação do canvas', () => {
      const { container, controller, actions, id } = spatial();
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
      controller.centerOnPoint({ x: 900, y: 700 });
      const [x, y] = [190, 350]; // o ponto do canvas (900, 700), dentro de I1 e sem marcação de I1

      // A flutuante nasce antes de trancar (virar flutuante é geometria e a trava impede).
      const note = actions.createMarking(null, {
        x: 1000,
        y: 250,
        width: 100,
        height: 100,
      });
      if (note.ok) actions.setMarkingFloating(note.value, true);

      // Marcação do canvas trancada: o container dentro dela herda (e a área entre as imagens também).
      actions.setMarkingLocked(id, true);
      move(x, y);
      expect(hover()).toEqual({ kind: 'image', id: 'I1' });
      controller.centerOnPoint({ x: 1050, y: 100 }); // entre as imagens, fora da flutuante
      move(x, y);
      expect(hover()).toEqual({ kind: 'marking', id });

      // A flutuante livre sobre a área trancada tem a vez e não mostra o cadeado.
      controller.centerOnPoint({ x: 1050, y: 300 });
      move(x, y);
      expect(hover()).toBeNull();
      controller.destroy();
    });
  });
});
