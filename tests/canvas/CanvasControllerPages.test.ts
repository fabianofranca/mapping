import { signal, type ReadonlySignal } from '@preact/signals';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import type { CommentPinRenderer } from '../../src/canvas/renderers/commentPins';
import { createCanvasViewState } from '../../src/canvas/viewState';
import {
  approximateMeasurer,
  renameMarking,
  type Project,
  type Thread,
} from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createDisplayImages } from '../../src/store/displayImages';
import { createOpenPerspective } from '../../src/store/perspectiveShown';
import { textMeasurer } from '../../src/store/textMeasure';
import { createEditorUi } from '../../src/store/ui';
import { propose } from '../model/proposalFixtures';
import { sampleThread } from '../model/threadFixtures';
import { pagesProject } from '../store/pageHarness';
import { openHarness } from '../store/proposalHarness';
import { installFakeCanvas } from './harness';

// The canvas with several pages (stage #883, PG2, decisions 5, 8 and 16): it draws the project cut by
// the open page (and then by the perspective), publishes the page on the host, fits the page's
// content on every switch and the point pins of a conversation only appear in the Completa of the
// point's page. Pan and zoom recompute nothing.

describe('CanvasController: pages', () => {
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

  const POINT_PG1: Thread = sampleThread({
    id: 'p1',
    anchor: { kind: 'point', containerId: 'I1', x: 10, y: 20 },
  });
  const POINT_PG2: Thread = sampleThread({
    id: 'p2',
    anchor: { kind: 'point', containerId: 'I3', x: 10, y: 20 },
  });
  const POINT_CANVAS: Thread = sampleThread({
    id: 'pc',
    anchor: { kind: 'point', containerId: null, x: 5000, y: 5000 },
  });
  const ON_M5: Thread = sampleThread({
    id: 'tm5',
    anchor: { kind: 'marking', id: 'M5' },
  });

  async function setup(
    threads: readonly Thread[] = [],
    options: Parameters<typeof openHarness>[0] = {},
  ) {
    const harness = await openHarness({ project: pagesProject(), ...options });
    const { store, actions, perspective, page } = harness.session;
    const { review } = harness;
    const ui = createEditorUi();
    const derived = createEditorDerived(
      store,
      ui,
      review.derived.shownProject,
      review.components,
      {
        threads: signal(threads),
        copyId: null,
        identity: signal(null),
        project: review.derived.shownAcrossPages,
      },
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
      page,
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
      page,
      view,
      container,
      controller,
      internals,
    };
  }

  const ids = (p: Project | null | undefined) => ({
    containers: p?.containers.map((c) => c.id),
    markings: p?.markings.map((m) => m.id).sort(),
  });

  it('draws only the open page and follows the switch (drawn project and bounds)', async () => {
    const { controller, page, view, internals } = await setup();
    expect(ids(internals.frame.peek().project).containers).toEqual(['I1', 'I2']);
    const bounds1 = view.bounds.value;

    expect(page.open('PG2')).toBe(true);
    flush();
    expect(ids(internals.frame.peek().project)).toEqual({
      containers: ['I3'],
      markings: ['K', 'M5'],
    });
    expect(ids(internals.drawnProject.peek()).containers).toEqual(['I3']);
    expect(view.bounds.value).not.toEqual(bounds1);
    expect(view.bounds.value).toMatchObject({ x: 0, y: 0 });

    page.open('PG3');
    flush();
    expect(ids(internals.frame.peek().project)).toEqual({ containers: [], markings: [] });
    controller.destroy();
  });

  it('the perspective cuts what is left of the page: V shows I1 on PG1 and I3 on PG2', async () => {
    const { controller, page, perspective, internals } = await setup();
    perspective.open('V');
    flush();
    expect(ids(internals.drawnProject.peek()).containers).toEqual(['I1']);
    page.open('PG2');
    flush();
    expect(ids(internals.drawnProject.peek()).containers).toEqual(['I3']);
    perspective.open('W');
    flush();
    expect(ids(internals.drawnProject.peek()).containers).toEqual([]);
    controller.destroy();
  });

  it('`data-page` on the host holds the open page and follows the switch', async () => {
    const { controller, page, container } = await setup();
    expect(container.dataset.page).toBe('PG1');
    page.open('PG3');
    flush();
    expect(container.dataset.page).toBe('PG3');
    controller.destroy();
  });

  it('switching page fits the content of the new page', async () => {
    const { controller, page, container } = await setup();
    const fits = Number(container.dataset.fits);
    page.open('PG2');
    flush();
    expect(Number(container.dataset.fits)).toBe(fits + 1);
    const viewport = container.dataset.viewport;
    page.open('PG1');
    flush();
    expect(Number(container.dataset.fits)).toBe(fits + 2);
    expect(container.dataset.viewport).not.toBe(viewport);
    // The same page again (no change): nothing refits.
    page.open('PG1');
    flush();
    expect(Number(container.dataset.fits)).toBe(fits + 2);
    controller.destroy();
  });

  it('pins of a point appear only on the page of the point (and never those of other pages)', async () => {
    const { controller, page, ui, internals } = await setup([POINT_PG1, POINT_PG2]);
    ui.commentPins.value = true;
    flush();
    expect(internals.pinLayer.size).toBe(1);
    const first = internals.frame.peek().pins[0] as { group: { hostKey: string } };

    page.open('PG2');
    flush();
    expect(internals.pinLayer.size).toBe(1);
    const second = internals.frame.peek().pins[0] as { group: { hostKey: string } };
    expect(second.group.hostKey).not.toBe(first.group.hostKey);

    page.open('PG3');
    flush();
    expect(internals.pinLayer.size).toBe(0);
    controller.destroy();
  });

  it('a pin of a marking on another page does not draw; on its page it does', async () => {
    const { controller, page, ui, internals } = await setup([ON_M5]);
    ui.commentPins.value = true;
    flush();
    expect(internals.pinLayer.size).toBe(0);
    page.open('PG2');
    flush();
    expect(internals.pinLayer.size).toBe(1);
    controller.destroy();
  });

  it('a point pin only appears in the Completa of its page, not in a perspective', async () => {
    const { controller, page, perspective, ui, internals } = await setup([
      POINT_PG1,
      POINT_PG2,
      POINT_CANVAS,
    ]);
    ui.commentPins.value = true;
    perspective.open('V');
    flush();
    // V shows I1 on PG1: the pin of the container's point follows it; the canvas point does not.
    expect(internals.pinLayer.size).toBe(1);
    perspective.open(null);
    flush();
    // Completa of PG1: the container's point and the canvas point (which has no page: the first).
    expect(internals.pinLayer.size).toBe(2);
    page.open('PG2');
    flush();
    expect(internals.pinLayer.size).toBe(1);
    controller.destroy();
  });

  it('pan and zoom recompute nothing of the page and ask for a single frame', async () => {
    const { controller, page, derived, ui, internals } = await setup([POINT_PG2]);
    ui.commentPins.value = true;
    page.open('PG2');
    flush();
    const drawn = internals.drawnProject.peek();
    const shown = derived.perspective.peek();
    const pins = internals.frame.peek().pins;

    rafCalls = 0;
    controller.zoomBy(2);
    expect(rafCalls).toBe(1);
    flush();
    controller.centerOnPoint({ x: 10, y: 10 });
    flush();
    expect(internals.drawnProject.peek()).toBe(drawn);
    expect(derived.perspective.peek()).toBe(shown);
    expect(internals.frame.peek().pins).toBe(pins);
    controller.destroy();
  });

  it('the review draws the open page in the Current and Proposed views (the preview is not mistaken for the project)', async () => {
    const base = pagesProject();
    const after = renameMarking(
      renameMarking(base, 'M5', 'Renamed on page 2'),
      'M1',
      'Renamed on page 1',
    );
    const { controller, page, review, internals } = await setup([], {
      project: base,
      proposals: [propose(base, after, { id: 'P1' })],
    });
    expect(review.open('P1').ok).toBe(true);
    flush();
    const nameOf = (id: string) =>
      internals.drawnProject.peek()?.markings.find((m) => m.id === id)?.name;

    // Proposed view, page 1: only the page's containers, with the proposed name.
    expect(review.view.value).toBe('proposed');
    expect(ids(internals.drawnProject.peek()).containers).toEqual(['I1', 'I2']);
    expect(nameOf('M1')).toBe('Renamed on page 1');

    page.open('PG2');
    flush();
    expect(ids(internals.drawnProject.peek()).containers).toEqual(['I3']);
    expect(nameOf('M5')).toBe('Renamed on page 2');

    // Current view: the same page, the confirmed names.
    review.setView('current');
    flush();
    expect(ids(internals.drawnProject.peek()).containers).toEqual(['I3']);
    expect(nameOf('M5')).not.toBe('Renamed on page 2');
    controller.destroy();
  });
});
