import Konva from 'konva';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import { PointerInput } from '../../src/canvas/input/pointer';
import { PreviewController } from '../../src/canvas/PreviewController';
import { readCanvasTokens } from '../../src/canvas/theme';
import { createCanvasViewState } from '../../src/canvas/viewState';
import {
  NO_DRAWINGS,
  approximateMeasurer,
  createArrow,
  createMarking,
  type Project,
} from '../../src/model';
import { projectInPerspective } from '../../src/store/perspectiveShown';
import { createDisplayImages } from '../../src/store/displayImages';
import { textMeasurer } from '../../src/store/textMeasure';
import { pagesProject } from '../store/pageHarness';
import { editorFor, installFakeCanvas } from './harness';

// Read-only preview of a cross-page reference (stage #883, PG3, decision 13): a Konva stage of its
// own that draws one root group of the project framed on one item, with no gestures.

describe('PreviewController', () => {
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
    document.body.replaceChildren();
  });

  /** Page 2 of the pages project, plus a second marking in I3 and an arrow between the two. */
  function cutProject(): Project {
    let p = pagesProject();
    p = createMarking(p, {
      id: 'M6',
      containerId: 'I3',
      rect: { x: 300, y: 300, width: 100, height: 100 },
    });
    p = createArrow(p, { id: 'AR1', from: 'M5', to: 'M6' });
    const cut = projectInPerspective(p, null, 'PG2');
    if (!cut) throw new Error('no cut');
    return cut;
  }

  function mount(itemId = 'M5', project = cutProject()) {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 800 });
    Object.defineProperty(container, 'clientHeight', { value: 600 });
    document.body.append(container);
    const display = createDisplayImages<ImageBitmap>(() => new Promise(() => undefined));
    const controller = new PreviewController({
      container,
      project,
      itemId,
      display,
      drawings: NO_DRAWINGS,
    });
    flush();
    const internals = controller as unknown as {
      stage: Konva.Stage;
      markings: { node(id: string): unknown };
      arrows: { painted: number };
      frame: { tokens: unknown } | null;
    };
    return { container, display, controller, internals, project };
  }

  it('draws the root and what is inside, and nothing from the other page', () => {
    const { internals } = mount();
    for (const id of ['M5', 'M6']) expect(internals.markings.node(id)).toBeDefined();
    for (const id of ['M1', 'M2', 'M3', 'M4']) {
      expect(internals.markings.node(id)).toBeUndefined();
    }
    expect(internals.arrows.painted).toBe(1);
    const images = internals.stage.getLayers()[0]?.getChildren() ?? [];
    expect(images).toHaveLength(1);
  });

  it('frames the item: it is centered and the scale never goes above 1', () => {
    const { controller } = mount('M5');
    const v = controller.viewport;
    // M5 is (0,0,100,100) on I3 at the origin.
    expect(v.x + 50 * v.scale).toBeCloseTo(400);
    expect(v.y + 50 * v.scale).toBeCloseTo(300);
    expect(v.scale).toBe(1);
  });

  it('a large item is fitted between the group fit and 1', () => {
    const { controller } = mount('I3');
    const v = controller.viewport;
    expect(v.scale).toBeLessThan(1);
    expect(v.scale).toBeGreaterThan(0.13);
    expect(v.x + 500 * v.scale).toBeCloseTo(400);
    expect(v.y + 500 * v.scale).toBeCloseTo(300);
  });

  it('frames an arrow by its stroke box and follows update()', () => {
    const { controller, project } = mount('AR1');
    expect(controller.viewport.scale).toBeLessThanOrEqual(1);
    controller.update({ itemId: 'M6', project });
    flush();
    const v = controller.viewport;
    expect(v.x + 350 * v.scale).toBeCloseTo(400);
    expect(v.y + 350 * v.scale).toBeCloseTo(300);
  });

  it('is read-only: nothing listens and no pointer or wheel handling exists', () => {
    const add = vi.spyOn(HTMLElement.prototype, 'addEventListener');
    const bind = vi.spyOn(PointerInput.prototype, 'bind');
    const { container, internals } = mount();
    const types = add.mock.calls
      .filter((_, i) => add.mock.contexts[i] === container)
      .map(([type]) => type as string);
    add.mockRestore();
    bind.mockRestore();
    expect(internals.stage.listening()).toBe(false);
    for (const layer of internals.stage.getLayers())
      expect(layer.listening()).toBe(false);
    expect(bind).not.toHaveBeenCalled();
    expect(types).not.toContain('pointerdown');
    expect(types).not.toContain('wheel');
    const before = internals.stage.getLayers().map((l) => l.getChildren().length);
    container.dispatchEvent(new Event('wheel'));
    container.dispatchEvent(new Event('pointerdown'));
    flush();
    expect(internals.stage.getLayers().map((l) => l.getChildren().length)).toEqual(
      before,
    );
  });

  it('leaves nothing behind: no stage, no retain, main canvas untouched', () => {
    const editor = editorFor();
    const mainHost = document.createElement('div');
    Object.defineProperty(mainHost, 'clientWidth', { value: 800 });
    Object.defineProperty(mainHost, 'clientHeight', { value: 600 });
    document.body.append(mainHost);
    const display = createDisplayImages<ImageBitmap>(() => new Promise(() => undefined));
    const main = new CanvasController({
      container: mainHost,
      store: editor.store,
      actions: editor.actions,
      display,
      ui: editor.ui,
      derived: editor.derived,
      view: createCanvasViewState(),
    });
    flush();
    const mainStage = (main as unknown as { stage: Konva.Stage }).stage;
    const layersBefore = mainStage.getLayers().length;
    const stagesBefore = Konva.stages.length;
    const measurerBefore = textMeasurer.peek();
    const retain = vi.spyOn(display, 'retain');

    const host = document.createElement('div');
    Object.defineProperty(host, 'clientWidth', { value: 400 });
    Object.defineProperty(host, 'clientHeight', { value: 300 });
    document.body.append(host);
    const preview = new PreviewController({
      container: host,
      project: cutProject(),
      itemId: 'M5',
      display,
      drawings: NO_DRAWINGS,
    });
    flush();
    expect(Konva.stages.length).toBe(stagesBefore + 1);
    expect(mainStage.getLayers()).toHaveLength(layersBefore);
    preview.destroy();
    flush();

    expect(host.children).toHaveLength(0);
    expect(Konva.stages.length).toBe(stagesBefore);
    expect(retain).not.toHaveBeenCalled();
    expect(textMeasurer.peek()).toBe(measurerBefore);
    expect(mainStage.getLayers()).toHaveLength(layersBefore);
    expect(layersBefore).toBe(5);
    main.destroy();
  });

  it('reads the theme tokens from readCanvasTokens()', () => {
    const { internals } = mount();
    expect(internals.frame?.tokens).toEqual(readCanvasTokens());
  });
});
