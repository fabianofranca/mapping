import { type ReadonlySignal } from '@preact/signals';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import { createCanvasViewState } from '../../src/canvas/viewState';
import type { ArrivalRenderer } from '../../src/canvas/renderers/arrivals';
import {
  addPerspective,
  approximateMeasurer,
  type Arrival,
  type Project,
} from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createDisplayImages } from '../../src/store/displayImages';
import { createOpenPerspective } from '../../src/store/perspectiveShown';
import { textMeasurer } from '../../src/store/textMeasure';
import { createEditorUi, setViewMode } from '../../src/store/ui';
import { viewOf } from '../store/perspectiveHarness';
import { openHarness } from '../store/proposalHarness';
import { canvasProject, installFakeCanvas } from './harness';

// As marcas de chegada no CanvasController (PE3, decisão 8): só na Principal, enquanto houver marca,
// no quadro de sempre, sem recalcular nada com pan e zoom.

describe('CanvasController: marcas de chegada', () => {
  const frames: FrameRequestCallback[] = [];
  let rafCalls = 0;
  const flush = () => {
    while (frames.length > 0) for (const frame of frames.splice(0)) frame(0);
  };

  beforeAll(() => {
    installFakeCanvas();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCalls++;
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
    localStorage.clear();
  });

  /** `canvasProject` com a perspectiva V (só I2) e I2 marcada como vinda de "Frente". */
  function projectWithArrival(): Project {
    const p = addPerspective(
      canvasProject(),
      viewOf(canvasProject(), { root: 'I2', at: { x: 0, y: 2000 } }),
    );
    return { ...p, arrivals: [{ root: 'I2', from: 'V', fromName: 'Frente' } as Arrival] };
  }

  async function setup() {
    const harness = await openHarness({ project: projectWithArrival() });
    const { store, actions, perspective, perspectiveActions } = harness.session;
    const { review } = harness;
    const ui = createEditorUi();
    const derived = createEditorDerived(
      store,
      ui,
      review.derived.shownProject,
      review.components,
      undefined,
      createOpenPerspective(store, perspective.id),
    );
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 1200 });
    Object.defineProperty(container, 'clientHeight', { value: 900 });
    document.body.append(container);
    const controller = new CanvasController({
      container,
      store,
      actions,
      display: createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
      ui,
      derived,
      view: createCanvasViewState(),
      review,
      perspective,
    });
    flush();
    const internals = controller as unknown as {
      arrivalLayer: ArrivalRenderer;
      frame: ReadonlySignal<{ arrivals?: unknown }>;
    };
    return { ui, perspective, perspectiveActions, controller, internals };
  }

  it('na Principal, com marca: o selo na raiz e a faixa', async () => {
    const { controller, internals } = await setup();
    expect(internals.arrivalLayer.badgeCount).toBe(1);
    expect(internals.arrivalLayer.bandVisible).toBe(true);
    controller.destroy();
  });

  it('com uma perspectiva aberta não desenha selo nem faixa; ao voltar, desenha', async () => {
    const { controller, perspective, internals } = await setup();
    perspective.open('V');
    flush();
    expect(internals.arrivalLayer.badgeCount).toBe(0);
    expect(internals.arrivalLayer.bandVisible).toBe(false);
    perspective.open(null);
    flush();
    expect(internals.arrivalLayer.badgeCount).toBe(1);
    controller.destroy();
  });

  it('dispensar a marca tira o selo e a faixa', async () => {
    const { controller, perspectiveActions, internals } = await setup();
    expect(perspectiveActions.dismissArrival('I2').ok).toBe(true);
    flush();
    expect(internals.arrivalLayer.badgeCount).toBe(0);
    expect(internals.arrivalLayer.bandVisible).toBe(false);
    controller.destroy();
  });

  it('somem no modo visualização', async () => {
    const { controller, ui, internals } = await setup();
    setViewMode(ui, true);
    flush();
    expect(internals.arrivalLayer.badgeCount).toBe(0);
    setViewMode(ui, false);
    flush();
    expect(internals.arrivalLayer.badgeCount).toBe(1);
    controller.destroy();
  });

  it('pan e zoom não recalculam as marcas, só escalam o selo, e pedem um quadro só', async () => {
    const { controller, internals } = await setup();
    const marks = internals.frame.peek().arrivals;
    expect(marks).toBeTruthy();
    const badge = internals.arrivalLayer.badge('I2');
    const before = badge?.group.scaleX() ?? 0;
    rafCalls = 0;
    controller.zoomBy(2);
    expect(rafCalls).toBe(1);
    flush();
    expect(internals.frame.peek().arrivals).toBe(marks);
    expect(badge?.group.scaleX()).toBeCloseTo(before / 2);
    controller.destroy();
  });
});
