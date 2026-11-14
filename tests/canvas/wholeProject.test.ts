import { afterEach, describe, expect, it, vi } from 'vitest';
import Konva from 'konva';
import {
  canvasProject,
  editorFor,
  installFakeCanvas,
  layerDrawMeter,
  stageOf,
  visibleShapesByLayer,
} from './harness';
import { CanvasController } from '../../src/canvas/CanvasController';
import { createDisplayImages } from '../../src/store/displayImages';
import {
  openWholeProject,
  stubFrames,
  type ScenarioOptions,
  type ScenarioSize,
} from './wholeProjectScenario';

const LAYERS = ['images', 'components', 'markings', 'floating', 'overlay'];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('medidores do harness (palco pequeno)', () => {
  function smallStage() {
    installFakeCanvas();
    const flush = stubFrames();
    const editor = editorFor(canvasProject());
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const controller = new CanvasController({
      container,
      store: editor.store,
      actions: editor.actions,
      display: createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
      ui: editor.ui,
      derived: editor.derived,
      view: editor.view,
    });
    flush();
    return { controller, container, flush, editor };
  }

  it('the 5 layers of the stage have a name', () => {
    const { controller, container } = smallStage();
    expect(
      stageOf(container)
        .getLayers()
        .map((l) => l.name()),
    ).toEqual(['images', 'components', 'markings', 'floating', 'overlay']);
    controller.destroy();
  });

  it('o medidor conta as camadas redesenhadas: pan redesenha as 5 hoje', () => {
    const { controller, container, flush } = smallStage();
    const meter = layerDrawMeter(stageOf(container));
    meter.take();
    controller.zoomBy(1.1);
    flush();
    const counts = meter.take();
    expect(Object.keys(counts).sort()).toEqual([...LAYERS].sort());
    for (const name of LAYERS) expect(counts[name], name).toBeGreaterThanOrEqual(1);
    // Without a scheduled frame, nothing is redrawn.
    flush();
    expect(Object.values(meter.take()).every((n) => n === 0)).toBe(true);
    meter.restore();
    controller.destroy();
  });

  it('the meter adds up the drawScene time of each layer and resets on each reading', () => {
    const { controller, container, flush } = smallStage();
    const meter = layerDrawMeter(stageOf(container));
    meter.takeMs();
    controller.zoomBy(1.1);
    const total = flush();
    const times = meter.takeMs();
    expect(Object.keys(times).sort()).toEqual([...LAYERS].sort());
    for (const name of LAYERS) expect(times[name], name).toBeGreaterThanOrEqual(0);
    const sum = Object.values(times).reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(0);
    // The drawing of the layers is part of the frame, never more than it.
    expect(sum).toBeLessThanOrEqual(total);
    // Read once, the sum goes back to zero until the next frame.
    expect(Object.values(meter.takeMs()).every((ms) => ms === 0)).toBe(true);
    meter.restore();
    controller.destroy();
  });

  it('the visible shapes meter ignores hidden nodes and those of a hidden ancestor', () => {
    const { controller, container } = smallStage();
    const stage = stageOf(container);
    const layer = stage.findOne<Konva.Layer>('.markings');
    expect(layer).toBeDefined();
    const before = visibleShapesByLayer(stage).markings ?? 0;
    expect(before).toBeGreaterThan(0);
    const group = new Konva.Group({ visible: false });
    group.add(new Konva.Rect({ width: 1, height: 1 }));
    layer?.add(group);
    expect(visibleShapesByLayer(stage).markings).toBe(before);
    group.visible(true);
    expect(visibleShapesByLayer(stage).markings).toBe(before + 1);
    controller.destroy();
  });
});

// Baseline: only records today's counts and times, without asserting a goal (the goals and the
// budgets are in renderPerformance.test.ts). 5,000 only with BASELINE_5000=1 (takes ~1 min);
// run with `--silent=false` to see the printed lines.
const SIZES: ScenarioSize[] = process.env.BASELINE_5000 ? [500, 2000, 5000] : [500, 2000];

interface Step {
  /** Whole frame (ms): `CanvasController.render` plus the drawing of the layers. */
  readonly ms: number;
  /** Sum of the `drawScene` of the layers (ms); `render` is the difference. */
  readonly draw: number;
  /** `render` alone (ms): the frame minus the drawing of the layers. */
  readonly render: number;
  readonly layers: Record<string, number>;
  /** `drawScene` por camada (ms). */
  readonly layerMs: Record<string, number>;
}

const round = (x: number): number => Math.round(x * 10) / 10;

/** Runs `act`, the scheduled frame and returns its time apart from the per-layer `drawScene`. */
function stepOf(
  s: ReturnType<typeof openWholeProject>,
  meter: ReturnType<typeof layerDrawMeter>,
  act: () => void,
): Step {
  meter.take();
  meter.takeMs();
  act();
  const ms = s.flush();
  const layers = meter.take();
  const layerMs = Object.fromEntries(
    Object.entries(meter.takeMs()).map(([name, value]) => [name, round(value)]),
  );
  const draw = Object.values(layerMs).reduce((sum, value) => sum + value, 0);
  return { ms: round(ms), draw: round(draw), render: round(ms - draw), layers, layerMs };
}

/** Pan, zoom, edit, selection and a drag step, as `perf:canvas` measures. */
function recordSteps(
  s: ReturnType<typeof openWholeProject>,
  firstId: string,
): Record<string, Step> {
  const meter = layerDrawMeter(stageOf(s.container));
  const steps: Record<string, Step> = {};
  steps.zoom = stepOf(s, meter, () => s.controller.zoomBy(1.1));
  steps.pan = stepOf(s, meter, () => s.controller.centerOnPoint({ x: 500, y: 500 }));
  steps.edit = stepOf(s, meter, () => s.actions.renameMarking(firstId, 'Renomeada'));
  steps.selection = stepOf(s, meter, () => {
    s.ui.selection.value = { kind: 'marking', id: firstId };
  });
  steps.drag = stepOf(s, meter, () => {
    s.store.beginGesture();
    s.actions.previewMarkingMove(firstId, 10, 10);
  });
  meter.restore();
  return steps;
}

describe.each<ScenarioSize>(SIZES)('whole project in view, %i markings', (size) => {
  it('records redrawn layers, visible shapes and created nodes', () => {
    const s = openWholeProject(size);
    const stage = stageOf(s.container);
    const nodes = stage.find('Group, Shape').length;
    const first = s.project.markings.find((m) => m.parentId === null);
    if (!first) throw new Error('fixture');
    const first_ms = round(s.firstFrameMs);
    const steps = recordSteps(s, first.id);

    const visible = visibleShapesByLayer(stage);
    console.log(
      `[baseline ${size}]`,
      JSON.stringify({ nodes, visible, first: first_ms, steps }),
    );
    expect(Object.keys(visible).sort()).toEqual([...LAYERS].sort());
    expect(nodes).toBeGreaterThan(size);
    s.destroy();
  }, 120_000);
});

// Weight of arrows and components (CD1, decision 1): 2,000 markings with 0, 500 and 1,000 arrows and with the 21
// instances of the Material 3 screen in each container. Only records, for the starting measure.
describe('whole project in view, 2,000 markings: arrows and components', () => {
  const cases: { label: string; options: ScenarioOptions }[] = [
    { label: '0 setas', options: { arrows: 0 } },
    { label: '500 setas', options: { arrows: 500 } },
    { label: '1.000 setas', options: { arrows: 1000 } },
    { label: 'com componentes', options: { components: true } },
  ];
  it.each(cases)(
    'registra o quadro com $label',
    ({ label, options }) => {
      const s = openWholeProject(2000, 'fit', options);
      const first = s.project.markings.find((m) => m.parentId === null);
      if (!first) throw new Error('fixture');
      const first_ms = round(s.firstFrameMs);
      const steps = recordSteps(s, first.id);
      console.log(
        `[setas e componentes 2000 ${label}]`,
        JSON.stringify({
          markings: s.project.markings.length,
          arrows: s.project.arrows.length,
          first: first_ms,
          steps,
        }),
      );
      if (options.arrows !== undefined) {
        expect(s.project.arrows.length).toBeLessThanOrEqual(options.arrows);
      }
      if (options.components) {
        expect(s.project.markings.length).toBeGreaterThan(2000 + 21 * 20 - 1);
        expect(s.container.dataset.components).toBeDefined();
      }
      s.destroy();
    },
    120_000,
  );
});

// Level of detail (DA3, decision 4): with the whole project in view, the markings layer has at
// most one visible shape per marking and none on those smaller than 2 px.
describe('level of detail with the whole project in view (2,000 markings)', () => {
  it('at most one visible shape per marking; those smaller than 2 px have none', () => {
    const s = openWholeProject(2000);
    const stage = stageOf(s.container);
    const layer = stage.findOne<Konva.Layer>('.markings');
    if (!layer) throw new Error('markings layer');
    const scale = stage.scaleX();
    // The layer has the markings group (one group per marking) and the arrows one.
    const stack = (layer.getChildren() as Konva.Group[]).find(
      (g) => g.getChildren().length === s.project.markings.length,
    );
    if (!stack) throw new Error('markings group');
    const groups = stack.getChildren() as Konva.Group[];
    expect(groups.length).toBe(s.project.markings.length);
    let hidden = 0;
    for (const group of groups) {
      if (!group.isVisible()) {
        hidden++;
        continue;
      }
      expect(visibleShapes(group)).toBeLessThanOrEqual(1);
      expect(biggestSide(group) * scale).toBeGreaterThanOrEqual(2);
    }
    expect(hidden).toBe(0);
    // Zooming out to the zoom minimum, the small markings (and those that get smaller than 2 px) disappear.
    s.controller.zoomBy(0.0001);
    s.flush();
    const far = stage.scaleX();
    let still = 0;
    for (const group of groups) {
      if (!group.isVisible()) continue;
      still++;
      expect(biggestSide(group) * far).toBeGreaterThanOrEqual(2);
    }
    expect(still).toBeGreaterThan(0);
    expect(still).toBeLessThan(groups.length);
    expect(visibleShapes(stack)).toBeLessThanOrEqual(groups.length - hidden);
    s.destroy();
  }, 120_000);
});

function visibleShapes(node: Konva.Node): number {
  if (!node.isVisible()) return 0;
  if (node instanceof Konva.Shape) return 1;
  if (node instanceof Konva.Container) {
    return node.getChildren().reduce((sum, child) => sum + visibleShapes(child), 0);
  }
  return 0;
}

/** Longest side (canvas px) of the visible rectangles of the marking group (border, halo, ...). */
function biggestSide(group: Konva.Group): number {
  return Math.max(
    0,
    ...group
      .getChildren()
      .filter((c) => c.isVisible() && c instanceof Konva.Rect)
      .map((c) => Math.max(c.width(), c.height())),
  );
}
