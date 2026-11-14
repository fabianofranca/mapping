// "Whole project in view" scenario (canvas-scale stage): large project with arrows,
// store + derived + CanvasController and the Fit all viewport. Reused by the
// tests of redrawn layers, level of detail, drag group and on-demand nodes.
import { vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import { createCanvasViewState } from '../../src/canvas/viewState';
import { projectIndex, projectIssues, type Project } from '../../src/model';
import { textMeasurer } from '../../src/store/textMeasure';
import { createEditorDerived } from '../../src/store/derived';
import { createDisplayImages } from '../../src/store/displayImages';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { createEditorUi } from '../../src/store/ui';
import { material3Catalog, scenarioProject } from '../model/scenarioProject';
import { componentSources, installFakeCanvas, layerDrawMeter, stageOf } from './harness';

// The queue belongs to the module: Konva keeps the queue of its frames per window (`animQueues`), so a
// frame scheduled in one test and lost by another queue would leave the layers undrawn in the next.
const frames: FrameRequestCallback[] = [];

/** Swaps `requestAnimationFrame` for a manual queue and returns the `flush` (time spent in ms; `NaN` without a frame). */
export function stubFrames(): () => number {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  // The controller frame schedules Konva's (`batchDraw`): empties the queue until it is done.
  return () => {
    const start = performance.now();
    let ran = 0;
    for (let guard = 0; frames.length > 0 && guard < 10; guard++) {
      for (const frame of frames.splice(0)) {
        frame(start);
        ran++;
      }
    }
    return ran === 0 ? Number.NaN : performance.now() - start;
  };
}

/** Measured sizes: number of markings (arrows are half). */
export type ScenarioSize = 500 | 2000 | 5000;

/** Scenario options (canvas-performance stage, CD1); with none, it is the usual scenario. */
export interface ScenarioOptions {
  /** Number of arrows; default half of the markings. */
  readonly arrows?: number;
  /** Adds, in each container, the 21 instances of the `M3_SCREEN` screen (Material 3 library). */
  readonly components?: boolean;
  /** Markings per container; default 100 (above that the recipe generates markings of width 0). */
  readonly perImage?: number;
  /** Already assembled project (the growth test assembles once and opens several); ignores the other options. */
  readonly project?: Project;
}

/** Large project with `size` markings and, by default, `size / 2` arrows between neighboring markings. */
export function wholeProject(size: number, options: ScenarioOptions = {}): Project {
  return scenarioProject({ size, ...options });
}

export interface WholeProjectScenario {
  readonly project: Project;
  readonly store: ReturnType<typeof createProjectStore>;
  readonly actions: ReturnType<typeof createProjectActions>;
  readonly ui: ReturnType<typeof createEditorUi>;
  readonly derived: ReturnType<typeof createEditorDerived>;
  readonly controller: CanvasController;
  readonly container: HTMLElement;
  /** Time of the first frame (creates the nodes; ms). */
  readonly firstFrameMs: number;
  /** Runs the scheduled frames and returns how long they took (ms); `NaN` if there was no frame. */
  flush(): number;
  /** Layers redrawn (by name) since the last call. */
  drawnLayers(): Record<string, number>;
  destroy(): void;
}

/**
 * Assembles the scenario and draws the first frame already framed (Fit all). Whoever calls
 * needs `installFakeCanvas()` and the `requestAnimationFrame` stub (see `openScenario`).
 */
export function openWholeProject(
  size: number,
  open: 'fit' | 'close' = 'fit',
  options: ScenarioOptions = {},
): WholeProjectScenario {
  installFakeCanvas();
  const flush = stubFrames();

  const project = options.project ?? wholeProject(size, options);
  const store = createProjectStore({ now: () => '2026-10-02T12:00:00.000Z' });
  store.load(project, { readOnly: false });
  // With components, the Material 3 catalog goes into the derived state sources and the actions, as the session does.
  const sources = options.components ? componentSources(material3Catalog()) : undefined;
  const actions = createProjectActions(
    store,
    sources
      ? { components: () => sources.catalog.peek(), measure: () => textMeasurer.peek() }
      : undefined,
  );
  const ui = createEditorUi();
  const derived = createEditorDerived(store, ui, undefined, sources);
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 1280 });
  Object.defineProperty(container, 'clientHeight', { value: 800 });
  document.body.append(container);
  const controller = new CanvasController({
    container,
    store,
    actions,
    display: createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
    ui,
    derived,
    view: createCanvasViewState(),
  });
  projectIndex(project);
  projectIssues(project);
  if (open === 'fit') controller.fitAll();
  else {
    controller.zoomTo(1);
    controller.centerOnPoint({ x: 0, y: 0 });
  }
  const firstFrameMs = flush();
  const meter = layerDrawMeter(stageOf(container));
  meter.take();
  return {
    project,
    store,
    actions,
    ui,
    derived,
    controller,
    container,
    firstFrameMs,
    flush,
    drawnLayers: () => meter.take(),
    destroy() {
      meter.restore();
      controller.destroy();
      container.remove();
      vi.unstubAllGlobals();
    },
  };
}
