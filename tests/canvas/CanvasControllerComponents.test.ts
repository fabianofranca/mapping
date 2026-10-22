import type Konva from 'konva/lib/Core';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import { ComponentLayerRenderer } from '../../src/canvas/components/componentLayer';
import { konvaMeasurer } from '../../src/canvas/components/konvaMeasurer';
import type { InteractionState } from '../../src/canvas/frame';
import type { MarkingRenderer } from '../../src/canvas/renderers/markings';
import { markingCanvasRect } from '../../src/canvas/markingGeometry';
import { approximateMeasurer } from '../../src/model';
import { createDisplayImages } from '../../src/store/displayImages';
import { setShowComponentsOnPhotos } from '../../src/store/settings';
import { textMeasurer } from '../../src/store/textMeasure';
import { componentEditor, installFakeCanvas } from './harness';

// A camada de componentes dentro do `CanvasController` (B3, P6): o desenho de cada marcação com
// componente, redesenhado só no que mudou, e as regras de borda e de texto do zoom semântico.
describe('CanvasController: componentes', () => {
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
  beforeEach(() => setShowComponentsOnPhotos(false));
  afterEach(() => {
    textMeasurer.value = approximateMeasurer;
    vi.clearAllMocks();
    localStorage.clear();
  });

  function setup() {
    const editor = componentEditor();
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const ensure = vi.fn();
    const display = {
      ...createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
      ensure,
    };
    const controller = new CanvasController({ container, display, ...editor });
    const internals = controller as unknown as {
      stage: Konva.Stage;
      state: InteractionState;
      markings: MarkingRenderer;
    };
    const componentLayer = () => internals.stage.getLayers()[1];
    /** O nó do Konva de uma marcação desenhada (ou `undefined` se não está montado). */
    const drawing = (id: string) =>
      componentLayer()?.find((n: Konva.Node) => n.getAttr('markingId') === id)[0];
    const border = (id: string) => internals.markings.node(id)?.border.visible();
    flush();
    return {
      ...editor,
      container,
      controller,
      ensure,
      internals,
      componentLayer,
      drawing,
      border,
    };
  }

  it('mede com o Konva ao montar', () => {
    expect(textMeasurer.peek()).toBe(approximateMeasurer);
    const { controller } = setup();
    expect(textMeasurer.peek()).toBe(konvaMeasurer);
    controller.destroy();
  });

  it('a camada de componentes fica entre as imagens e as marcações, e o container desenha', () => {
    const { controller, internals, componentLayer, drawing, container } = setup();
    expect(internals.stage.getLayers()).toHaveLength(4);
    expect(container.querySelectorAll('canvas')).toHaveLength(4);
    expect(componentLayer()?.listening()).toBe(false);
    // Os dois textos do container; o da foto só com a opção ligada.
    expect(drawing('T1')).toBeDefined();
    expect(drawing('T2')).toBeDefined();
    expect(drawing('TP')).toBeUndefined();
    expect(container.dataset.components).toBe('2');
    controller.destroy();
  });

  it('Ver limpo esconde bordas e seleção, e a camada de componentes continua', () => {
    const { controller, ui, internals, drawing } = setup();
    // O grupo da marcação some inteiro (borda, nome e alças vão com ele).
    const shown = (id: string) => internals.markings.node(id)?.group.visible();
    ui.selection.value = { kind: 'marking', id: 'T1' };
    flush();
    expect(shown('T1')).toBe(true);
    ui.cleanView.value = true;
    flush();
    expect(shown('T1')).toBe(false);
    expect(shown('T2')).toBe(false);
    expect(drawing('T1')).toBeDefined();
    expect(drawing('T2')).toBeDefined();
    ui.cleanView.value = false;
    flush();
    expect(shown('T1')).toBe(true);
    controller.destroy();
  });

  it('a foto só desenha com "Mostrar componentes sobre fotos"', () => {
    const { controller, drawing, container } = setup();
    setShowComponentsOnPhotos(true);
    flush();
    expect(drawing('TP')).toBeDefined();
    expect(container.dataset.components).toBe('3');
    setShowComponentsOnPhotos(false);
    flush();
    expect(drawing('TP')).toBeUndefined();
    expect(container.dataset.components).toBe('2');
    controller.destroy();
  });

  it('o container conta como imagem pronta, sem pedir arquivo', () => {
    const { controller, container, ensure } = setup();
    // A foto I1 ainda carrega; só o container está pronta.
    expect(container.dataset.images).toBe('1');
    expect(ensure.mock.calls.map(([file]) => file)).toEqual(['images/tela.png']);
    controller.destroy();
  });

  it('editar um campo pela action redesenha só aquela marcação', () => {
    const { controller, drawing, actions } = setup();
    const [t1, t2] = [drawing('T1'), drawing('T2')];
    expect(actions.setFieldValue('A_T1', 'label', 'Outro texto').ok).toBe(true);
    flush();
    expect(drawing('T1')).not.toBe(t1);
    expect(drawing('T1')).toBeDefined();
    expect(drawing('T2')).toBe(t2);
    controller.destroy();
  });

  it('desfazer e refazer redesenham pelo mesmo caminho', () => {
    const { controller, drawing, actions, store } = setup();
    const t2 = drawing('T2');
    actions.setFieldValue('A_T1', 'label', 'Outro texto');
    flush();
    const edited = drawing('T1');
    store.undo();
    flush();
    const undone = drawing('T1');
    expect(undone).not.toBe(edited);
    store.redo();
    flush();
    expect(drawing('T1')).not.toBe(undone);
    expect(drawing('T2')).toBe(t2);
    controller.destroy();
  });

  it('a prévia de um gesto redesenha só a marcação arrastada', () => {
    const { controller, drawing, actions } = setup();
    const [t1, t2] = [drawing('T1'), drawing('T2')];
    actions.beginGesture();
    actions.previewMarkingMove('T1', 30, 0);
    flush();
    expect(drawing('T1')).not.toBe(t1);
    expect(drawing('T2')).toBe(t2);
    const moved = drawing('T1');
    actions.cancelGesture();
    flush();
    expect(drawing('T1')).not.toBe(moved);
    expect(drawing('T2')).toBe(t2);
    controller.destroy();
  });

  it('redimensionar abaixo do mínimo do componente prende no mínimo, sem recusar o gesto', () => {
    const { controller, drawing, actions, store } = setup();
    actions.beginGesture();
    // O mínimo do texto é 60×24; o ponteiro pede 10×10.
    actions.previewMarkingRect('T1', { x: 20, y: 20, width: 10, height: 10 });
    flush();
    const rect = store.project.value?.markings.find((m) => m.id === 'T1')?.rect;
    expect(rect).toMatchObject({ width: 60, height: 24 });
    expect(drawing('T1')).toBeDefined();
    actions.commitGesture();
    controller.destroy();
  });

  it('reordenar irmãs pela action troca quem fica por cima no canvas (e desfazer devolve)', () => {
    const { controller, drawing, componentLayer, actions, store } = setup();
    const order = () =>
      (componentLayer()?.getChildren()[0] as Konva.Group)
        .getChildren()
        .map((n: Konva.Node) => n.getAttr('markingId') as string);
    expect(order()).toEqual(['T1', 'T2']);
    const [t1, t2] = [drawing('T1'), drawing('T2')];
    expect(actions.reorderMarking('T1', 1).ok).toBe(true);
    flush();
    expect(order()).toEqual(['T2', 'T1']);
    // Só a ordem muda: os nós são os mesmos.
    expect(drawing('T1')).toBe(t1);
    expect(drawing('T2')).toBe(t2);
    store.undo();
    flush();
    expect(order()).toEqual(['T1', 'T2']);
    controller.destroy();
  });

  it('pan e zoom não refazem a camada de componentes', () => {
    const { controller } = setup();
    const render = vi.spyOn(ComponentLayerRenderer.prototype, 'render');
    controller.zoomBy(1.5);
    flush();
    controller.fitAll();
    flush();
    controller.centerOnPoint({ x: 100, y: 100 });
    flush();
    expect(render).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('um tema novo refaz os desenhos com as cores novas', async () => {
    const { controller, drawing } = setup();
    const before = drawing('T1');
    document.documentElement.setAttribute('data-theme', 'dark');
    // O observador do tema é assíncrono (MutationObserver).
    await new Promise((resolve) => setTimeout(resolve, 0));
    flush();
    expect(drawing('T1')).not.toBe(before);
    document.documentElement.removeAttribute('data-theme');
    controller.destroy();
  });

  describe('borda só em hover e seleção', () => {
    function hoverSetup() {
      const made = setup();
      const { controller, container, store } = made;
      const placement = store.project.value?.containers.find(
        (i) => i.id === 'B1',
      )?.placement;
      const t1 = store.project.value?.markings.find((m) => m.id === 'T1');
      if (!placement || !t1) throw new Error('fixture');
      controller.zoomTo(1);
      const center = markingCanvasRect(placement, t1.rect);
      controller.centerOnPoint({
        x: center.x + center.width / 2,
        y: center.y + center.height / 2,
      });
      flush();
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
      return { ...made, move };
    }

    it('escondida sem hover; o mouse sobre a marcação mostra, e fora esconde', () => {
      const { controller, border, move, container, internals } = hoverSetup();
      expect(border('T1')).toBe(false);
      expect(border('T2')).toBe(false);
      move(190, 350);
      expect(internals.state.hoverMarking.value).toBe('T1');
      expect(border('T1')).toBe(true);
      expect(border('T2')).toBe(false);
      // Fora das marcações (canto da tela).
      move(10, 10);
      expect(internals.state.hoverMarking.value).toBeNull();
      expect(border('T1')).toBe(false);
      move(190, 350);
      container.dispatchEvent(new PointerEvent('pointerleave', { pointerId: 1 }));
      flush();
      expect(border('T1')).toBe(false);
      controller.destroy();
    });

    it('selecionada mostra a borda mesmo sem o mouse', () => {
      const { controller, border, ui } = hoverSetup();
      ui.selection.value = { kind: 'marking', id: 'T2' };
      flush();
      expect(border('T2')).toBe(true);
      expect(border('T1')).toBe(false);
      controller.destroy();
    });

    it('sem marcação desenhada, o hover nem é calculado', () => {
      const { controller, move, internals, actions } = hoverSetup();
      actions.removeMarking('T1');
      actions.removeMarking('T2');
      flush();
      move(190, 350);
      expect(internals.state.hoverMarking.value).toBeNull();
      controller.destroy();
    });
  });

  it('zoom semântico: a marcação desenhada não tem cartão; a da foto (sem desenho) tem', () => {
    const { controller, internals, store, drawing } = setup();
    controller.zoomTo(3);
    flush();
    const text = (id: string) => internals.markings.node(id)?.text.group.visible();
    // A visibilidade do texto depende de caber na tela: enquadra a marcação conferida.
    const focus = (id: string) => {
      const marking = store.project.value?.markings.find((m) => m.id === id);
      const placement = store.project.value?.containers.find(
        (i) => i.id === marking?.containerId,
      )?.placement;
      if (!marking || !placement) throw new Error('fixture');
      const rect = markingCanvasRect(placement, marking.rect);
      controller.centerOnPoint({
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
      });
      flush();
    };
    focus('T1');
    expect(drawing('T1')).toBeDefined();
    expect(text('T1')).toBe(false);
    focus('TP');
    expect(text('TP')).toBe(true);
    // Ligando a opção, a da foto também passa a ser desenhada: sem cartão.
    setShowComponentsOnPhotos(true);
    flush();
    expect(text('TP')).toBe(false);
    controller.destroy();
  });
});
