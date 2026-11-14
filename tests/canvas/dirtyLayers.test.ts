import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Signal } from '@preact/signals';
import { CanvasController } from '../../src/canvas/CanvasController';
import { createDisplayImages } from '../../src/store/displayImages';
import { approximateMeasurer } from '../../src/model';
import { textMeasurer } from '../../src/store/textMeasure';
import { componentEditor, installFakeCanvas, layerDrawMeter, stageOf } from './harness';
import { openWholeProject, stubFrames } from './wholeProjectScenario';

const ALL = ['components', 'floating', 'images', 'markings', 'overlay'];

/** Names of the layers that the frame redrew (count > 0). */
function redrawn(counts: Record<string, number>): string[] {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([name]) => name)
    .sort();
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  textMeasurer.value = approximateMeasurer;
});

// Decision 3 of the canvas-scale stage: the frame only redraws the layers whose renderer touched
// some node; pan, zoom and size change dirty all of them.
describe('layers redrawn per frame (whole project in view, 2,000 markings)', () => {
  it('pan and zoom redraw all 5; edit, selection and hover only the ones that changed', () => {
    const s = openWholeProject(2000);
    const first = s.project.markings.find((m) => m.parentId === null);
    if (!first) throw new Error('fixture');

    s.controller.zoomBy(1.1);
    s.flush();
    expect(redrawn(s.drawnLayers())).toEqual(ALL);

    s.controller.centerOnPoint({ x: 500, y: 500 });
    s.flush();
    expect(redrawn(s.drawnLayers())).toEqual(ALL);

    // Editing the name: markings and overlays; neither the images nor the components.
    s.actions.renameMarking(first.id, 'Renamed');
    s.flush();
    const edit = redrawn(s.drawnLayers());
    expect(edit).toContain('markings');
    expect(edit).not.toContain('images');
    expect(edit).not.toContain('components');

    // Selecting: only the overlays and the markings (through the selected one border).
    s.ui.selection.value = { kind: 'marking', id: first.id };
    s.flush();
    expect(redrawn(s.drawnLayers())).toEqual(['markings', 'overlay']);

    // Hover on a marking without a component drawing: neither images nor components.
    const state = (
      s.controller as unknown as {
        state: { hoverMarking: Signal<string | null> };
      }
    ).state;
    state.hoverMarking.value = first.id;
    s.flush();
    const hover = redrawn(s.drawnLayers());
    expect(hover).not.toContain('images');
    expect(hover).not.toContain('components');
    s.destroy();
  }, 120_000);

  it('a frame without change redraws no layer', () => {
    const s = openWholeProject(500);
    s.ui.selection.value = { kind: 'marking', id: s.project.markings[0]?.id ?? '' };
    s.flush();
    s.drawnLayers();
    (s.controller as unknown as { requestRender(): void }).requestRender();
    s.flush();
    expect(redrawn(s.drawnLayers())).toEqual([]);
    s.destroy();
  });
});

describe('layers redrawn: components', () => {
  function setup() {
    installFakeCanvas();
    const flush = stubFrames();
    const editor = componentEditor();
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const controller = new CanvasController({
      container,
      display: createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
      ...editor,
    });
    flush();
    const meter = layerDrawMeter(stageOf(container));
    meter.take();
    return { ...editor, controller, container, flush, meter };
  }

  it('changing the drawing of a component redraws the components layer', () => {
    const s = setup();
    expect(s.actions.setFieldValue('A_T1', 'label', 'Other text').ok).toBe(true);
    s.flush();
    expect(redrawn(s.meter.take())).toContain('components');
    s.controller.destroy();
  });

  it('the selection does not redraw the components layer nor the images one', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'T2' };
    s.flush();
    const counts = redrawn(s.meter.take());
    expect(counts).not.toContain('components');
    expect(counts).not.toContain('images');
    s.controller.destroy();
  });
});
