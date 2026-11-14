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
import { SPEC_ID } from '../model/componentFixtures';
import { componentEditor, installFakeCanvas, setOnlyScreens } from './harness';

// The component layer inside `CanvasController` (B3, P6): the drawing of each marking with a
// component, redrawn only where it changed, and the border and text rules of semantic zoom.
describe('CanvasController: components', () => {
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
    /**
     * The Konva node of a drawn marking (or `undefined` if it is not mounted). Searches the whole
     * stage: during a gesture the drawing of whoever moves sits in the drag group (overlays).
     */
    const drawing = (id: string) =>
      internals.stage.find((n: Konva.Node) => n.getAttr('markingId') === id)[0];
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

  it('measures with Konva when mounting', () => {
    expect(textMeasurer.peek()).toBe(approximateMeasurer);
    const { controller } = setup();
    expect(textMeasurer.peek()).toBe(konvaMeasurer);
    controller.destroy();
  });

  it('the component layer sits between the images and the markings, and the container draws', () => {
    const { controller, internals, componentLayer, drawing, container } = setup();
    expect(internals.stage.getLayers()).toHaveLength(5);
    expect(container.querySelectorAll('canvas')).toHaveLength(5);
    expect(componentLayer()?.listening()).toBe(false);
    // The two texts of the container; the photo one only with the option on.
    expect(drawing('T1')).toBeDefined();
    expect(drawing('T2')).toBeDefined();
    expect(drawing('TP')).toBeUndefined();
    expect(container.dataset.components).toBe('2');
    controller.destroy();
  });

  it('The (Screens only) mode hides borders and selection, and the component layer remains', () => {
    const { controller, ui, internals, drawing } = setup();
    // The marking group disappears whole (border, name and handles go with it).
    const shown = (id: string) => internals.markings.node(id)?.group.visible();
    ui.selection.value = { kind: 'marking', id: 'T1' };
    flush();
    expect(shown('T1')).toBe(true);
    setOnlyScreens(ui, true);
    flush();
    expect(shown('T1')).toBe(false);
    expect(shown('T2')).toBe(false);
    expect(drawing('T1')).toBeDefined();
    expect(drawing('T2')).toBeDefined();
    setOnlyScreens(ui, false);
    flush();
    expect(shown('T1')).toBe(true);
    controller.destroy();
  });

  it('the photo only draws with "Show components over photos"', () => {
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

  it('the container counts as a ready image, without asking for a file', () => {
    const { controller, container, ensure } = setup();
    // The photo I1 is still loading; only the container is ready.
    expect(container.dataset.images).toBe('1');
    expect(ensure.mock.calls.map(([file]) => file)).toEqual(['images/screen.png']);
    controller.destroy();
  });

  it('editing a field through the action redraws only that marking', () => {
    const { controller, drawing, actions } = setup();
    const [t1, t2] = [drawing('T1'), drawing('T2')];
    expect(actions.setFieldValue('A_T1', 'label', 'Other text').ok).toBe(true);
    flush();
    expect(drawing('T1')).not.toBe(t1);
    expect(drawing('T1')).toBeDefined();
    expect(drawing('T2')).toBe(t2);
    controller.destroy();
  });

  it('undo and redo redraw through the same path', () => {
    const { controller, drawing, actions, store } = setup();
    const t2 = drawing('T2');
    actions.setFieldValue('A_T1', 'label', 'Other text');
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

  it('the preview of a gesture redraws only the dragged marking', () => {
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

  it('resizing below the component minimum clamps to the minimum, without refusing the gesture', () => {
    const { controller, drawing, actions, store } = setup();
    actions.beginGesture();
    // The text minimum is 60×24; the pointer asks for 10×10.
    actions.previewMarkingRect('T1', { x: 20, y: 20, width: 10, height: 10 });
    flush();
    const rect = store.project.value?.markings.find((m) => m.id === 'T1')?.rect;
    expect(rect).toMatchObject({ width: 60, height: 24 });
    expect(drawing('T1')).toBeDefined();
    actions.commitGesture();
    controller.destroy();
  });

  it('reordering siblings through the action swaps who stays on top on the canvas (and undo restores)', () => {
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
    // Only the order changes: the nodes are the same.
    expect(drawing('T1')).toBe(t1);
    expect(drawing('T2')).toBe(t2);
    store.undo();
    flush();
    expect(order()).toEqual(['T1', 'T2']);
    controller.destroy();
  });

  it('pan and zoom do not rebuild the component layer', () => {
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

  it('a new theme redraws the drawings with the new colors', async () => {
    const { controller, drawing } = setup();
    const before = drawing('T1');
    document.documentElement.setAttribute('data-theme', 'dark');
    // The theme observer is asynchronous (MutationObserver).
    await new Promise((resolve) => setTimeout(resolve, 0));
    flush();
    expect(drawing('T1')).not.toBe(before);
    document.documentElement.removeAttribute('data-theme');
    controller.destroy();
  });

  describe('canvas markings and floating ones', () => {
    const markingNodes = (layer: Konva.Layer | undefined, id: string) =>
      layer?.find((n: Konva.Node) => n.getAttr('markingId') === id) ?? [];

    it('the canvas marking draws on the component layer; the floating one, on the top layer', () => {
      const { controller, actions, internals, container } = setup();
      const layers = internals.stage.getLayers();
      const regular = actions.addComponent({
        containerId: null,
        parentId: null,
        specId: SPEC_ID,
        typeId: 'text',
        center: { x: 3000, y: 100 },
      });
      const note = actions.addComponent({
        containerId: null,
        parentId: null,
        specId: SPEC_ID,
        typeId: 'text',
        center: { x: 3000, y: 400 },
      });
      if (!regular.ok || !note.ok) throw new Error('addComponent');
      expect(actions.setMarkingFloating(note.value, true).ok).toBe(true);
      // The drawings and borders are born on demand: bring both into view.
      controller.centerOnPoint({ x: 3000, y: 250 });
      flush();
      // Images, components, arrows and markings (one layer, one group for each), floating, overlays.
      expect(markingNodes(layers[1], regular.value)).toHaveLength(1);
      expect(markingNodes(layers[1], note.value)).toHaveLength(0);
      expect(markingNodes(layers[3], note.value)).toHaveLength(1);
      expect(markingNodes(layers[3], regular.value)).toHaveLength(0);
      // T1, T2 and the two canvas ones (the canvas one always draws: there is no photo underneath).
      expect(container.dataset.components).toBe('4');
      // The floating one borders sit in the top group, after its drawing.
      const floatingLayer = layers[3] as Konva.Layer;
      expect(floatingLayer.getChildren()).toHaveLength(2);
      expect(internals.markings.node(note.value)?.group.getParent()).toBe(
        floatingLayer.getChildren()[1],
      );
      // The markings group is the second of the layer shared with the arrows.
      const arrowMarkingLayer = layers[2] as Konva.Layer;
      expect(internals.markings.node(regular.value)?.group.getParent()).toBe(
        arrowMarkingLayer.getChildren()[1],
      );
      controller.destroy();
    });

    it('the floating one shows over photos even without "Show components over photos"', () => {
      const { controller, actions, internals } = setup();
      const note = actions.addComponent({
        containerId: null,
        parentId: null,
        specId: SPEC_ID,
        typeId: 'text',
        center: { x: 500, y: 400 }, // over the photo I1
      });
      if (!note.ok) throw new Error('addComponent');
      actions.setMarkingFloating(note.value, true);
      flush();
      expect(markingNodes(internals.stage.getLayers()[3], note.value)).toHaveLength(1);
      // The components inside the photo (TP) remain hidden.
      expect(markingNodes(internals.stage.getLayers()[1], 'TP')).toHaveLength(0);
      controller.destroy();
    });

    it('undo removes the drawing from the canvas', () => {
      const { controller, actions, internals, store } = setup();
      const note = actions.addComponent({
        containerId: null,
        parentId: null,
        specId: SPEC_ID,
        typeId: 'text',
        center: { x: 3000, y: 400 },
      });
      if (!note.ok) throw new Error('addComponent');
      // The drawing is born on demand: bring the marking into view.
      controller.centerOnPoint({ x: 3000, y: 400 });
      flush();
      expect(markingNodes(internals.stage.getLayers()[1], note.value)).toHaveLength(1);
      store.undo();
      flush();
      expect(markingNodes(internals.stage.getLayers()[1], note.value)).toHaveLength(0);
      controller.destroy();
    });
  });

  describe('border only on hover and selection', () => {
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

    it('hidden without hover; the mouse over the marking shows it, and outside hides it', () => {
      const { controller, border, move, container, internals } = hoverSetup();
      expect(border('T1')).toBe(false);
      expect(border('T2')).toBe(false);
      move(190, 350);
      expect(internals.state.hoverMarking.value).toBe('T1');
      expect(border('T1')).toBe(true);
      expect(border('T2')).toBe(false);
      // Outside the markings (corner of the screen).
      move(10, 10);
      expect(internals.state.hoverMarking.value).toBeNull();
      expect(border('T1')).toBe(false);
      move(190, 350);
      container.dispatchEvent(new PointerEvent('pointerleave', { pointerId: 1 }));
      flush();
      expect(border('T1')).toBe(false);
      controller.destroy();
    });

    it('selected shows the border even without the mouse', () => {
      const { controller, border, ui } = hoverSetup();
      ui.selection.value = { kind: 'marking', id: 'T2' };
      flush();
      expect(border('T2')).toBe(true);
      expect(border('T1')).toBe(false);
      controller.destroy();
    });

    it('without a drawn marking, hover is not even computed', () => {
      const { controller, move, internals, actions } = hoverSetup();
      actions.removeMarking('T1');
      actions.removeMarking('T2');
      flush();
      move(190, 350);
      expect(internals.state.hoverMarking.value).toBeNull();
      controller.destroy();
    });
  });

  it('semantic zoom: the drawn marking has no card; the photo one (without drawing) has', () => {
    const { controller, internals, store, drawing, actions } = setup();
    // The name only gets a node when it shows (parts on demand): the photo marking has a name.
    actions.renameMarking('TP', 'Perfil');
    controller.zoomTo(3);
    flush();
    const text = (id: string) =>
      internals.markings.node(id)?.text?.group.visible() ?? false;
    // The text visibility depends on fitting on the screen: fit the checked marking.
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
    // Turning on the option, the photo one is also drawn: no card.
    setShowComponentsOnPhotos(true);
    flush();
    expect(text('TP')).toBe(false);
    controller.destroy();
  });
});
