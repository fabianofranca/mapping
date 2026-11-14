import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import { createCanvasViewState } from '../../src/canvas/viewState';
import { createEditorDerived } from '../../src/store/derived';
import { createDisplayImages } from '../../src/store/displayImages';
import { imageCanvasRect } from '../../src/model';
import { createEditorUi } from '../../src/store/ui';
import { firstImport } from '../components/review/reviewHarness';
import { openHarness } from '../store/proposalHarness';
import { installFakeCanvas } from './harness';

// Phase 8.2 (P1): the canvas derives the drawn project from `review.derived.shownProject`, and
// the cursor in image pixels (status bar) works over an image that only exists in the
// proposal, in the Proposed view. In the Current view, the image is not there and the cursor is `null`.

describe('canvas cursor in the review of a new import', () => {
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

  it('gives coordinates over the proposed image in the Proposed view and none in the Current view', async () => {
    const { base, proposal } = firstImport();
    const { session, review } = await openHarness({
      project: base,
      proposals: [proposal],
    });
    expect(review.open('P1').ok).toBe(true);
    const ui = createEditorUi();
    const view = createCanvasViewState();
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const controller = new CanvasController({
      container,
      store: session.store,
      actions: session.actions,
      display: createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
      ui,
      derived: createEditorDerived(session.store, ui, review.derived.shownProject),
      view,
      review,
    });
    flush();
    // The area of the images in view is the proposed image's (the preview gives its position).
    const image = review.derived.shownProject.value?.containers[0];
    if (!image) throw new Error('the preview has no proposed image');
    const rect = imageCanvasRect(image, image.placement);
    expect(view.bounds.value).toEqual(rect);
    controller.zoomTo(1);
    controller.centerOnPoint({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
    const move = () => {
      container.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 1,
          pointerType: 'mouse',
          clientX: 190,
          clientY: 350,
        }),
      );
      flush();
    };
    move();
    expect(view.cursor.value).toMatchObject({ containerId: 'I1' });
    expect(controller.imageIdAt(190, 350)).toBe('I1');

    // Current view: the confirmed project does not have the image.
    review.setView('current');
    move();
    expect(view.cursor.value).toBeNull();
    expect(controller.imageIdAt(190, 350)).toBeNull();
    controller.destroy();
    review.dispose();
  });
});
