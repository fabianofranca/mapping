import { signal, type ReadonlySignal } from '@preact/signals';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import type { CommentPinRenderer } from '../../src/canvas/renderers/commentPins';
import {
  addLayer,
  addPerspective,
  approximateMeasurer,
  type Project,
  type Thread,
} from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createDisplayImages } from '../../src/store/displayImages';
import { createOpenPerspective } from '../../src/store/perspectiveShown';
import { textMeasurer } from '../../src/store/textMeasure';
import { createEditorUi } from '../../src/store/ui';
import { sampleThread } from '../model/threadFixtures';
import { openHarness } from '../store/proposalHarness';
import { viewOf } from '../store/perspectiveHarness';
import { canvasProject, installFakeCanvas } from './harness';
import { createCanvasViewState } from '../../src/canvas/viewState';

// O canvas com uma perspectiva aberta (etapa #659, PE2, decisões 3 e 15): desenha o projeto à
// vista (as raízes dela, onde ela as põe), os pinos das conversas num ponto do canvas só aparecem
// na Principal e pan e zoom não recalculam nada nem pedem mais de um quadro.

describe('CanvasController: perspectiva aberta', () => {
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

  /** `canvasProject` + L2 + a perspectiva V (só I2, em 0,2000). */
  function projectWithView(): Project {
    let p = addLayer(canvasProject(), { id: 'L2', name: 'Pintura', color: '#00AA00' });
    p = addPerspective(p, viewOf(p, { root: 'I2', at: { x: 0, y: 2000 } }));
    return p;
  }

  const CANVAS_POINT: Thread = sampleThread({
    id: 'tc',
    anchor: { kind: 'point', containerId: null, x: 5000, y: 5000 },
  });
  const CONTAINER_POINT: Thread = sampleThread({
    id: 'ti',
    anchor: { kind: 'point', containerId: 'I2', x: 10, y: 20 },
  });
  const OTHER_CONTAINER_POINT: Thread = sampleThread({
    id: 'to',
    anchor: { kind: 'point', containerId: 'I1', x: 10, y: 20 },
  });

  async function setup(threads: readonly Thread[] = []) {
    const harness = await openHarness({ project: projectWithView() });
    const { store, actions } = harness.session;
    const { perspective } = harness.session;
    const { review } = harness;
    const ui = createEditorUi();
    const derived = createEditorDerived(
      store,
      ui,
      review.derived.shownProject,
      review.components,
      { threads: signal(threads), copyId: null, identity: signal(null) },
      createOpenPerspective(store, perspective.id),
    );
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 1200 });
    Object.defineProperty(container, 'clientHeight', { value: 900 });
    document.body.append(container);
    const view = createCanvasViewState();
    const controller = new CanvasController({
      container,
      store,
      actions,
      display: createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
      ui,
      derived,
      view,
      review,
      perspective,
    });
    flush();
    const internals = controller as unknown as {
      drawnProject: ReadonlySignal<Project | null>;
      pinLayer: CommentPinRenderer;
      frame: { peek(): { pins: readonly unknown[]; project: Project | null } };
    };
    return {
      ...harness,
      store,
      ui,
      derived,
      perspective,
      view,
      container,
      controller,
      internals,
    };
  }

  it('desenha o projeto à vista: só as raízes da perspectiva, na posição dela', async () => {
    const { controller, perspective, view, internals } = await setup();
    expect(view.bounds.value).toEqual({ x: 0, y: 0, width: 1600, height: 800 });

    expect(perspective.open('V')).toBe(true);
    flush();
    expect(internals.frame.peek().project?.containers.map((c) => c.id)).toEqual(['I2']);
    expect(view.bounds.value).toEqual({ x: 0, y: 2000, width: 500, height: 500 });
    // A hierarquia do toque também lê a vista: a raiz está onde a perspectiva a pôs.
    expect(controller.imageIdAt(0, 0)).toBeNull();

    perspective.open(null);
    flush();
    expect(internals.frame.peek().project?.containers.map((c) => c.id)).toEqual([
      'I1',
      'I2',
    ]);
    controller.destroy();
  });

  it('a prévia do gesto aparece na vista (muda `perspectives[].items`)', async () => {
    const { controller, perspective, store, internals } = await setup();
    perspective.open('V');
    flush();
    expect(store.beginGesture().ok).toBe(true);
    store.updateGesture((p) => ({
      ...p,
      perspectives: p.perspectives.map((x) => ({
        ...x,
        items: x.items.map((i) => ({ ...i, x: 300, y: 2500 })),
      })),
    }));
    flush();
    expect(internals.drawnProject.peek()?.containers[0]?.placement).toMatchObject({
      x: 300,
      y: 2500,
    });
    store.cancelGesture();
    controller.destroy();
  });

  it('pino de conversa num ponto do canvas só aparece na Principal; o de um container segue o container', async () => {
    const { controller, perspective, ui, internals } = await setup([
      CANVAS_POINT,
      CONTAINER_POINT,
      OTHER_CONTAINER_POINT,
    ]);
    ui.commentPins.value = true;
    flush();
    expect(internals.pinLayer.size).toBe(3);

    perspective.open('V');
    flush();
    // Fica só o pino do container que a vista mostra (I2), onde a vista o põe: (0 + 10, 2000 + 20).
    expect(internals.pinLayer.size).toBe(1);
    const place = internals.frame.peek().pins[0] as { origin: { x: number; y: number } };
    expect(place.origin).toEqual({ x: 10, y: 2020 });

    perspective.open(null);
    flush();
    expect(internals.pinLayer.size).toBe(3);
    controller.destroy();
  });

  it('pan e zoom não recalculam o projeto à vista e pedem um quadro só', async () => {
    const { controller, perspective, derived, ui, internals, container } = await setup([
      CONTAINER_POINT,
    ]);
    ui.commentPins.value = true;
    perspective.open('V');
    flush();
    const drawn = internals.drawnProject.peek();
    const shown = derived.perspective.peek();
    const pins = internals.frame.peek().pins;

    rafCalls = 0;
    controller.zoomBy(2);
    expect(rafCalls).toBe(1);
    flush();
    rafCalls = 0;
    container.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -40, clientX: 600, clientY: 450 }),
    );
    controller.centerOnPoint({ x: 100, y: 2100 });
    expect(rafCalls).toBe(1);
    flush();

    expect(internals.drawnProject.peek()).toBe(drawn);
    expect(derived.perspective.peek()).toBe(shown);
    expect(internals.frame.peek().pins).toBe(pins);
    controller.destroy();
  });
});
