import type Konva from 'konva/lib/Core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import type { InteractionState } from '../../src/canvas/frame';
import type { ArrowRenderer } from '../../src/canvas/renderers/arrows';
import type { ImageRenderer } from '../../src/canvas/renderers/images';
import type { MarkingRenderer } from '../../src/canvas/renderers/markings';
import type { OverlayRenderer } from '../../src/canvas/renderers/overlay';
import { approximateMeasurer, renameMarking } from '../../src/model';
import { createDisplayImages } from '../../src/store/displayImages';
import { setShowArrows, setShowComponentsOnPhotos } from '../../src/store/settings';
import { textMeasurer } from '../../src/store/textMeasure';
import { setViewMode } from '../../src/store/ui';
import {
  hideViewDrawingLayer,
  onlyScreens,
  setViewShow,
  showEverything,
  toggleViewDrawingLayer,
} from '../../src/store/viewMode';
import { withArrow } from '../model/arrowFixtures';
import { viewCatalog, viewLayerIds, viewProject } from '../store/viewModeFixtures';
import { editorFor, installFakeCanvas } from './harness';
import { componentSources } from './harness';

// View mode in CanvasController (stage #656, VZ2): what each item of the choice turns on
// and off, the selection and the indicators that disappear, and what the mode does not make the canvas recompute.
describe('CanvasController: view mode', () => {
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
  afterEach(() => {
    textMeasurer.value = approximateMeasurer;
    setShowArrows(true);
    setShowComponentsOnPhotos(false);
    localStorage.clear();
  });

  // The marking P has a name: the name only gets a node when it shows (parts on demand).
  function setup(
    project = renameMarking(withArrow(viewProject(), 'R1', 'TA', 'P'), 'P', 'Door'),
  ) {
    const sources = componentSources(viewCatalog());
    const editor = editorFor(project, false, sources);
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const controller = new CanvasController({
      container,
      display: createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
      ...editor,
    });
    const internals = controller as unknown as {
      stage: Konva.Stage;
      state: InteractionState;
      markings: MarkingRenderer;
      images: ImageRenderer;
      arrows: ArrowRenderer;
      overlay: OverlayRenderer;
    };
    flush();
    const ids = viewLayerIds(project);
    const drawing = (id: string) =>
      internals.stage
        .getLayers()[1]
        ?.find((n: Konva.Node) => n.getAttr('markingId') === id)[0];
    const marking = (id: string) => internals.markings.node(id);
    const image = (id: string) => internals.images.node(id);
    return {
      ...editor,
      container,
      controller,
      internals,
      ids,
      drawing,
      marking,
      image,
    };
  }

  it('selecting and hovering do not show up: without selection, handles, hover nor indicators', () => {
    const { controller, ui, internals, marking, derived } = setup();
    ui.selection.value = { kind: 'marking', id: 'P' };
    flush();
    expect(internals.overlay.handles.get('nw')?.visible()).toBe(true);
    setViewMode(ui, true);
    setViewShow(ui, { outline: true });
    internals.state.hoverMarking.value = 'TA';
    internals.state.draft.value = {
      containerId: 'B1',
      rect: { x: 0, y: 0, width: 10, height: 10 },
    };
    flush();
    for (const handle of internals.overlay.handles.values()) {
      expect(handle.visible()).toBe(false);
    }
    const node = marking('P');
    expect(node?.border.visible()).toBe(true);
    // Without the selection, the border is not the selection one; without indicators (⚠, alert).
    expect(node?.border.stroke()).not.toBe(internals.overlay.handles.get('nw')?.stroke());
    expect(node?.alertClip?.visible() ?? false).toBe(false);
    expect(node?.badge?.visible() ?? false).toBe(false);
    // The touch reaches nothing: no marking is visible to the touch.
    expect(
      [...derived.markingVisibility.peek().values()].every((v) => v === 'hidden'),
    ).toBe(true);
    controller.destroy();
  });

  it('Containers: the name above and the outline of the container without a file; the background stays', () => {
    const { controller, ui, image } = setup();
    setViewMode(ui, true);
    flush();
    expect(image('B1')?.title.visible()).toBe(true);
    expect(image('B1')?.placeholder.stroke()).toBeTruthy();
    expect(image('B1')?.placeholder.fill()).toBe('#FFFFFF');
    setViewShow(ui, { containers: false });
    flush();
    expect(image('B1')?.title.visible()).toBe(false);
    expect(image('B1')?.placeholder.visible()).toBe(true);
    expect(image('B1')?.placeholder.fill()).toBe('#FFFFFF');
    expect(image('B1')?.placeholder.strokeEnabled()).toBe(false);
    // The photo name also follows Containers.
    expect(image('I1')?.title.visible()).toBe(false);
    setViewShow(ui, { containers: true });
    flush();
    expect(image('B1')?.placeholder.strokeEnabled()).toBe(true);
    expect(image('I1')?.title.visible()).toBe(true);
    controller.destroy();
  });

  it('Images: the bitmap of the photos (without Images the photo does not appear, the name follows Containers)', () => {
    const { controller, ui, image } = setup();
    setViewMode(ui, true);
    flush();
    // Without a ready bitmap the placeholder appears, as outside the mode.
    expect(image('I1')?.placeholder.visible()).toBe(true);
    setViewShow(ui, { images: false });
    flush();
    expect(image('I1')?.bitmap.visible()).toBe(false);
    expect(image('I1')?.placeholder.visible()).toBe(false);
    expect(image('I1')?.title.visible()).toBe(true);
    // The container without a file is not a photo: it stays up.
    expect(image('B1')?.placeholder.visible()).toBe(true);
    controller.destroy();
  });

  it('Marking outlines and Marking names: the border and the header, each on its own', () => {
    const { controller, ui, marking } = setup();
    controller.zoomTo(1);
    controller.centerOnPoint({ x: 1600, y: 300 });
    setViewMode(ui, true);
    flush();
    // Starts without the outline and with the name.
    expect(marking('P')?.group.visible()).toBe(true);
    expect(marking('P')?.border.visible()).toBe(false);
    expect(marking('P')?.text?.group.visible()).toBe(true);
    setViewShow(ui, { outline: true, names: false });
    flush();
    expect(marking('P')?.border.visible()).toBe(true);
    expect(marking('P')?.halo?.visible()).toBe(true);
    expect(marking('P')?.text?.group.visible() ?? false).toBe(false);
    // Neither outline nor name: the marking is gone entirely.
    setViewShow(ui, { outline: false });
    flush();
    expect(marking('P')?.group.visible()).toBe(false);
    controller.destroy();
  });

  it('the marking with a drawing stays without a header, and the border only comes if the drawing disappeared', () => {
    const { controller, ui, marking, ids } = setup();
    setViewMode(ui, true);
    setViewShow(ui, { outline: true });
    flush();
    expect(marking('TA')?.border.visible()).toBe(false);
    expect(marking('TA')?.text?.group.visible() ?? false).toBe(false);
    hideViewDrawingLayer(ui, ids.a);
    flush();
    expect(marking('TA')?.border.visible()).toBe(true);
    controller.destroy();
  });

  it('Arrows: turn the arrows on and off, without depending on "Show arrows"', () => {
    const { controller, ui, container } = setup();
    expect(container.dataset.arrows).toBe('1');
    setViewMode(ui, true);
    flush();
    expect(container.dataset.arrows).toBe('1');
    setViewShow(ui, { arrows: false });
    flush();
    expect(container.dataset.arrows).toBe('0');
    setViewShow(ui, { arrows: true });
    setShowArrows(false);
    flush();
    expect(container.dataset.arrows).toBe('1');
    setViewMode(ui, false);
    flush();
    expect(container.dataset.arrows).toBe('0');
    controller.destroy();
  });

  it('Outline unchecked and Arrows checked: the arrows appear', () => {
    const { controller, ui, container, marking } = setup();
    setViewMode(ui, true);
    setViewShow(ui, { outline: false, names: false, arrows: true });
    flush();
    expect(marking('TA')?.group.visible()).toBe(false);
    expect(marking('P')?.group.visible()).toBe(false);
    expect(container.dataset.arrows).toBe('1');
    controller.destroy();
  });

  it('the "Markings without annotations" filter does not apply in the mode', () => {
    const { controller, ui, container } = setup();
    ui.hiddenLayers.value = new Set(viewProject().layers.map((l) => l.id));
    flush();
    setViewMode(ui, true);
    flush();
    expect(container.dataset.arrows).toBe('1');
    controller.destroy();
  });

  it('a layer with a drawing unchecked: its drawings disappear and the other one stays', () => {
    const { controller, ui, drawing, container, ids } = setup();
    setViewMode(ui, true);
    flush();
    expect(drawing('TA')).toBeDefined();
    expect(drawing('TB')).toBeDefined();
    toggleViewDrawingLayer(ui, ids.a);
    flush();
    expect(drawing('TA')).toBeUndefined();
    expect(drawing('TB')).toBeDefined();
    expect(container.dataset.components).toBe('1');
    toggleViewDrawingLayer(ui, ids.a);
    flush();
    expect(drawing('TA')).toBeDefined();
    controller.destroy();
  });

  it('Screens only gives the frame of the old Clean view: no marking, arrow, selection nor handle', () => {
    const { controller, ui, marking, container, drawing, internals, image } = setup();
    ui.selection.value = { kind: 'marking', id: 'P' };
    flush();
    onlyScreens(ui);
    setViewMode(ui, true);
    flush();
    expect(marking('P')?.group.visible()).toBe(false);
    expect(marking('TA')?.group.visible()).toBe(false);
    expect(container.dataset.arrows).toBe('0');
    expect(drawing('TA')).toBeDefined();
    expect(image('B1')?.title.visible()).toBe(true);
    for (const handle of internals.overlay.handles.values()) {
      expect(handle.visible()).toBe(false);
    }
    controller.destroy();
  });

  it('Show all shows the outline of all the markings', () => {
    const { controller, ui, marking } = setup();
    controller.zoomTo(1);
    controller.centerOnPoint({ x: 1600, y: 300 });
    setViewMode(ui, true);
    onlyScreens(ui);
    flush();
    expect(marking('P')?.group.visible()).toBe(false);
    showEverything(ui);
    flush();
    expect(marking('P')?.border.visible()).toBe(true);
    expect(marking('P')?.text?.group.visible()).toBe(true);
    controller.destroy();
  });

  it('switching the choice does not redo the drawings nor the images; pan and zoom, nothing of the mode', () => {
    const { controller, ui, derived, store, internals } = setup();
    setViewMode(ui, true);
    flush();
    const scenes = derived.drawingsOf(store.project.value);
    const imagesRender = vi.spyOn(internals.images, 'render');
    const arrowsRender = vi.spyOn(internals.arrows, 'render');
    // Pan and zoom: the images only redo with the scale; the arrows too (the thickness is screen based).
    controller.zoomBy(1.2);
    flush();
    imagesRender.mockClear();
    arrowsRender.mockClear();
    controller.centerOnPoint({ x: 900, y: 400 });
    flush();
    expect(imagesRender).not.toHaveBeenCalled();
    expect(arrowsRender).not.toHaveBeenCalled();
    // Another choice: the drawings are the same objects.
    setViewShow(ui, { outline: true, names: false });
    flush();
    expect(derived.drawingsOf(store.project.value)).toBe(scenes);
    controller.destroy();
  });
});
