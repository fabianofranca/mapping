import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Konva from 'konva';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import {
  ComponentLayerRenderer,
  type LayerDrawing,
} from '../../src/canvas/components/componentLayer';
import { renderScene } from '../../src/canvas/components/renderScene';
import * as instantiateModule from '../../src/model/components/instantiate';
import {
  type FrameNode,
  absoluteBoxes,
  baseNode,
  walk,
} from '../../src/model/components/scene';
import { createCanvasViewState } from '../../src/canvas/viewState';
import {
  approximateMeasurer,
  instantiate,
  type TextMeasurer,
} from '../../src/model/components/instantiate';
import {
  type Library,
  initialValues,
  loadLibrary,
} from '../../src/model/components/library';
import type { Instance } from '../../src/model/components/screen';
import {
  addBackgroundContainer,
  addComponentMarking,
  applySpecialization,
  createArrow,
  loadSpecComponents,
  parseSpec,
  projectIndex,
  projectIssues,
  setContainerDensity,
  type ComponentCatalog,
  type Project,
  type Rect,
} from '../../src/model';
import { signal } from '@preact/signals';
import { specFiles } from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createDisplayImages } from '../../src/store/displayImages';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { textMeasurer } from '../../src/store/textMeasure';
import { createEditorUi, setViewMode } from '../../src/store/ui';
import { setViewShow } from '../../src/store/viewMode';
import { M3_SCREEN } from '../../viewer/samples/samplesMaterial3';
import { SPEC_ID, SPEC_JSON, testCatalog } from '../model/componentFixtures';
import { emptyProject } from '../model/fixtures';
import { propose } from '../model/proposalFixtures';
import { openHarness } from '../store/proposalHarness';
import { buildLargeTypedProject } from '../model/largeTypedProject';
import { material3Spec } from '../storage/packageFixture';
import { componentSources, installFakeCanvas } from './harness';
import { openWholeProject, wholeProject } from './wholeProjectScenario';
import { expectBelow, measureBudget } from '../support/perfReport';

// Budget of one canvas render (docs/ARCHITECTURE.md, "Performance") with the large project already
// indexed: real Konva in jsdom, with a fake 2D context (nothing is painted;
// it measures the work of the controller and Konva to update the nodes).
const RENDER_BUDGET_MS = 16;
/** Off with `--coverage` (vite.config.ts): instrumented code is slower. */
const budgetIt = it.skipIf(process.env.PERF_BUDGETS === 'off');
/** One retry separates runner noise from regression (see tests/model/performance.test.ts). */
const BUDGET_OPTIONS = { retry: 1 };
/** The 3 batches of 41 samples of `measureBudget` (gc at each sample) exceed the default 5 s under the load of `npm test`. */
const BATCHES_OPTIONS = { ...BUDGET_OPTIONS, timeout: 60_000 };

describe('canvas rendering with the large project', () => {
  const frames: FrameRequestCallback[] = [];
  /** Runs the scheduled frame and returns how long it took. */
  const flush = (): number => {
    const pending = frames.splice(0);
    const start = performance.now();
    for (const frame of pending) frame(start);
    return pending.length === 0 ? Number.NaN : performance.now() - start;
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

  /** Arrows between neighboring markings of the large project: each one is drawn (ME4). */
  const ARROW_COUNT = 200;

  function setup() {
    const typed = buildLargeTypedProject();
    // 200 arrows of the large project: from marking `i` to `i + 3` (different containers, canvas).
    const project = Array.from({ length: ARROW_COUNT }).reduce<Project>((acc, _, i) => {
      const from = acc.markings[i];
      const to = acc.markings[i + 3];
      if (!from || !to) throw new Error('fixture');
      return createArrow(acc, { id: `R${i}`, from: from.id, to: to.id });
    }, typed);
    const store = createProjectStore({ now: () => '2026-10-02T12:00:00.000Z' });
    store.load(project, { readOnly: false });
    const actions = createProjectActions(store);
    const ui = createEditorUi();
    const derived = createEditorDerived(store, ui);
    const display = createDisplayImages<ImageBitmap>(() => new Promise(() => undefined));
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const controller = new CanvasController({
      container,
      store,
      actions,
      display,
      ui,
      derived,
      view: createCanvasViewState(),
    });
    // Already indexed: the budget is the drawing's, not the index's (measured in the model).
    projectIndex(project);
    projectIssues(project);
    return { project, store, actions, ui, controller, container };
  }

  it('draws the 200 arrows of the large project', () => {
    const { controller, container } = setup();
    flush();
    expect(container.dataset.arrows).toBe(String(ARROW_COUNT));
    controller.destroy();
  });

  budgetIt(
    `pan, zoom and edit of the large project (with ${ARROW_COUNT} arrows) draw in under ${RENDER_BUDGET_MS} ms`,
    BUDGET_OPTIONS,
    () => {
      const { project, actions, ui, controller, container } = setup();
      flush(); // First frame: creates the nodes.

      // Zooms in on a parent marking: semantic zoom cards on screen.
      const [first, second] = project.markings.filter((m) => m.parentId === null);
      if (!first || !second) throw new Error('fixture');
      ui.selection.value = { kind: 'marking', id: first.id };
      controller.centerSelection();
      flush();

      // One round of each metric: pan, zoom (wheel) and edit, alternating the direction.
      const round = (i: number): { pan: number; zoom: number; edit: number } => {
        // Pan: centers alternating between two neighboring markings.
        ui.selection.value = { kind: 'marking', id: (i % 2 ? first : second).id };
        controller.centerSelection();
        const pan = flush();
        container.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: i % 2 ? 40 : -40,
            clientX: 190,
            clientY: 350,
          }),
        );
        const zoom = flush();
        expect(actions.renameMarking(first.id, `Renamed ${i}`).ok).toBe(true);
        return { pan, zoom, edit: flush() };
      };
      // Warms up (JIT and collector) like the sibling budgets: the first 3 rounds do not count.
      for (let i = 0; i < 3; i++) round(i);
      const samples = Array.from({ length: 15 }, (_, i) => round(i));
      const median = (xs: number[]) =>
        [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? Number.NaN;
      // The metric in the `expect`: the failure says which one blew the budget.
      expectBelow(median(samples.map((r) => r.pan)), RENDER_BUDGET_MS, 'pan');
      expectBelow(median(samples.map((r) => r.zoom)), RENDER_BUDGET_MS, 'zoom');
      expectBelow(median(samples.map((r) => r.edit)), RENDER_BUDGET_MS, 'edit');
      controller.destroy();
    },
  );

  budgetIt(
    `view mode: switching a panel choice, pan and zoom draw in under ${RENDER_BUDGET_MS} ms`,
    BUDGET_OPTIONS,
    () => {
      const { ui, controller, container } = setup();
      setViewMode(ui, true);
      flush();
      const round = (i: number): { choice: number; pan: number; zoom: number } => {
        // One choice per round: outline and name alternate, and so do the arrows and the containers.
        setViewShow(ui, { outline: i % 2 === 0, names: i % 3 !== 0 });
        const choice = flush();
        setViewShow(ui, { arrows: i % 2 === 0, containers: i % 4 !== 0 });
        const arrows = flush();
        controller.centerOnPoint({ x: 400 + 50 * (i % 5), y: 300 });
        const pan = flush();
        container.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: i % 2 ? 40 : -40,
            clientX: 190,
            clientY: 350,
          }),
        );
        return { choice: Math.max(choice, arrows), pan, zoom: flush() };
      };
      for (let i = 0; i < 3; i++) round(i);
      const samples = Array.from({ length: 15 }, (_, i) => round(i));
      const median = (xs: number[]) =>
        [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? Number.NaN;
      expectBelow(median(samples.map((r) => r.choice)), RENDER_BUDGET_MS, 'choice');
      expectBelow(median(samples.map((r) => r.pan)), RENDER_BUDGET_MS, 'pan');
      expectBelow(median(samples.map((r) => r.zoom)), RENDER_BUDGET_MS, 'zoom');
      controller.destroy();
    },
  );

  it('several changes in the same frame produce a single render', () => {
    const { ui, controller, project } = setup();
    // Konva's `batchDraw` also uses requestAnimationFrame: empties the queue.
    while (frames.length > 0) flush();
    const [a, b] = project.markings;
    if (!a || !b) throw new Error('fixture');
    ui.selection.value = { kind: 'marking', id: a.id };
    ui.selection.value = { kind: 'marking', id: b.id };
    ui.mode.value = 'draw';
    expect(frames).toHaveLength(1);
    controller.destroy();
  });
});

// Budget of component drawing (B3): instantiating (pure engine, approximate measurer) and
// drawing (`renderScene`, Konva in jsdom with a fake context) the Material 3 of the example package.
// Measured (jsdom, development machine): one instance 0.03 to 0.9 ms (average of the 15
// components ~0.25 ms); the settings screen (21 instances) 3.5 to 7 ms, with peaks of
// ~15 ms from the garbage collector at the start. The instance budget is ~1 ms (4x headroom over the
// average); the screen's is the frame's, with the median of several repetitions.
const INSTANCE_BUDGET_MS = 1;
const MATERIAL3_DIR = join(__dirname, '../../tests/fixtures/material3');

function loadMaterial3(): Library {
  const components = join(MATERIAL3_DIR, 'components');
  const files = [
    {
      path: 'material3.spec.json',
      text: readFileSync(join(MATERIAL3_DIR, 'material3.spec.json'), 'utf8'),
    },
    ...readdirSync(components)
      .filter((name) => name.endsWith('.json'))
      .map((name) => ({
        path: `components/${name}`,
        text: readFileSync(join(components, name), 'utf8'),
      })),
  ];
  return loadLibrary(files);
}

/** Count, per key, of what the new layout uses in the fixture components (raw JSON, without the parse). */
interface LayoutKeys {
  /** Frames or slots `none` with `align` or `justify`: the aligned overlap. */
  alignedNone: number;
  grid: number;
  /** `weight` on a template node (not the font's `weight`, which lives in `font`). */
  weight: number;
  /** `"max-content"` in `width`, `height` or `sizing`. */
  maxContent: number;
  /** Components in `formatVersion` 4, the only one where the new keys apply. */
  v4Files: number;
}

function layoutKeysOf(dir: string): LayoutKeys {
  const keys: LayoutKeys = {
    alignedNone: 0,
    grid: 0,
    weight: 0,
    maxContent: 0,
    v4Files: 0,
  };
  const node = (value: unknown): void => {
    if (typeof value !== 'object' || value === null) return;
    const n = value as Record<string, unknown>;
    const layout = n.layout as Record<string, unknown> | undefined;
    if (
      layout?.type === 'none' &&
      (layout.align !== undefined || layout.justify !== undefined)
    )
      keys.alignedNone++;
    if (layout?.type === 'grid') keys.grid++;
    if (n.weight !== undefined) keys.weight++;
    if (n.width === 'max-content') keys.maxContent++;
    if (n.height === 'max-content') keys.maxContent++;
    for (const child of (n.children as unknown[] | undefined) ?? []) node(child);
    const repeat = n.repeat as { template?: unknown } | undefined;
    if (repeat?.template !== undefined) node(repeat.template);
  };
  for (const name of readdirSync(join(dir, 'components')).filter((f) =>
    f.endsWith('.json'),
  )) {
    const file = JSON.parse(readFileSync(join(dir, 'components', name), 'utf8')) as {
      formatVersion?: number;
      sizing?: Record<string, unknown>;
      template: unknown;
    };
    if (file.formatVersion === 4) keys.v4Files++;
    if (file.sizing?.width === 'max-content') keys.maxContent++;
    if (file.sizing?.height === 'max-content') keys.maxContent++;
    node(file.template);
  }
  return keys;
}

/** The whole-screen budgets only apply to the new layout (decision 23 of #1078): checks before measuring. */
function expectNewLayout(): void {
  const keys = layoutKeysOf(MATERIAL3_DIR);
  expect(keys.v4Files, 'components in formatVersion 4').toBe(15);
  expect(keys.alignedNone, 'none alinhado').toBeGreaterThan(0);
  expect(keys.grid, 'grid').toBeGreaterThan(0);
  expect(keys.weight, 'weight').toBeGreaterThan(0);
  expect(keys.maxContent, 'max-content').toBeGreaterThan(0);
}

describe('component drawing (Material 3)', () => {
  const library = loadMaterial3();
  const typeOf = new Map(library.types.map((type) => [type.id, type]));

  /** Instantiates the whole settings screen: one drawing per instance, in array order. */
  function instantiateScreen(): Map<string, LayerDrawing> {
    const drawings = new Map<string, LayerDrawing>();
    for (const instance of M3_SCREEN.instances) {
      const component = typeOf.get(instance.typeId)?.component;
      if (!component) throw new Error(`fixture: no component ${instance.typeId}`);
      const { root } = instantiate(component, instance.values, instance.box, {
        measure: approximateMeasurer,
        idPrefix: instance.id,
      });
      drawings.set(instance.id, { markingId: instance.id, containerId: 'screen', root });
    }
    return drawings;
  }

  beforeAll(() => installFakeCanvas());
  afterAll(() => vi.restoreAllMocks());

  it('the example library loads with the 15 components and the screen has 21 instances', () => {
    expect(library.problems).toEqual([]);
    expect(library.types.filter((type) => type.component)).toHaveLength(15);
    expect(M3_SCREEN.instances).toHaveLength(21);
  });

  it('the fixture is in the new layout: aligned none, grid, weight and max-content present', () => {
    expectNewLayout();
  });

  /** Instantiates a fixture component with the initial values and the `size` box. */
  function drawnFixture(id: string, values: Record<string, string | number> = {}) {
    const type = typeOf.get(id);
    const component = type?.component;
    if (!type || !component) throw new Error(`fixture: no component ${id}`);
    const { root, warnings } = instantiate(
      component,
      { ...initialValues(type), ...values },
      { x: 0, y: 0, ...component.size },
      { measure: approximateMeasurer },
    );
    return { nodes: [...walk(root)], boxes: absoluteBoxes(root), warnings };
  }

  it("the fixture's aligned none centers the glyph and the navigation bar grid splits into equal columns", () => {
    const center = (box: { x: number; y: number; width: number; height: number }) => ({
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    });
    // checkbox: the 14 `check` sits at the center of the 18 box (`none` with align and justify `center`).
    // pt-BR kept: shared fixture data asserted by tests/model (tests/fixtures/material3 node names and values)
    const checkbox = drawnFixture('m3-checkbox', { checked: 'sim' });
    // pt-BR kept: shared fixture data asserted by tests/model (m3-checkbox node name)
    const boxNode = checkbox.nodes.find((n) => n.name === 'caixa');
    const check = checkbox.nodes.find((n) => n.name === 'check');
    const boxBox = boxNode && checkbox.boxes.get(boxNode.id);
    const checkBox = check && checkbox.boxes.get(check.id);
    if (!boxBox || !checkBox) throw new Error('fixture: checkbox without box or check');
    // The `path` node keeps the viewBox box (24) and the scale goes in the matrix: the top-left corner
    // of the 14 glyph inside the 18 box sits at 2.
    expect(checkBox.x).toBeCloseTo(boxBox.x + (boxBox.width - 14) / 2, 6);
    expect(checkBox.y).toBeCloseTo(boxBox.y + (boxBox.height - 14) / 2, 6);

    // navigation bar: 3 destinations of equal width, (412 − 2 × 8) / 3 = 132, and the icon centered on the indicator.
    const bar = drawnFixture('m3-navigation-bar');
    // pt-BR kept: shared fixture data asserted by tests/model (tests/fixtures/material3 node names)
    const destinations = bar.nodes.filter((n) => /^destino \d$/.test(n.name ?? ''));
    expect(destinations).toHaveLength(3);
    expect(destinations.map((n) => bar.boxes.get(n.id)?.x)).toEqual([8, 140, 272]);
    expect(destinations.every((n) => Math.abs(n.width - 132) < 1e-6)).toBe(true);
    // pt-BR kept: shared fixture data asserted by tests/model (m3-navigation-bar node names)
    const indicator = bar.nodes.find((n) => n.name === 'indicador');
    // pt-BR kept: shared fixture data asserted by tests/model (m3-navigation-bar node name)
    const icon = indicator && [...walk(indicator)].find((n) => n.name === 'ícone');
    const indicatorBox = indicator && bar.boxes.get(indicator.id);
    const iconBox = icon && bar.boxes.get(icon.id);
    if (!indicatorBox || !iconBox)
      throw new Error('fixture: navigation bar without indicator');
    expect(center(iconBox).x).toBeCloseTo(center(indicatorBox).x, 6);
    expect(center(iconBox).y).toBeCloseTo(center(indicatorBox).y, 6);
    for (const id of ['m3-checkbox', 'm3-navigation-bar', 'm3-top-app-bar', 'm3-box']) {
      expect(drawnFixture(id).warnings, id).toEqual([]);
    }
  });

  it('each distinct (text, font, limit) is measured once: 26 calls across the 15 components and 40 on the screen', () => {
    const counted = (): { measure: typeof approximateMeasurer; calls: string[] } => {
      const calls: string[] = [];
      const measure: typeof approximateMeasurer = (text, font, maxWidth) => {
        calls.push(JSON.stringify([text, font, maxWidth]));
        return approximateMeasurer(text, font, maxWidth);
      };
      return { measure, calls };
    };
    let total = 0;
    for (const type of library.types) {
      const component = type.component;
      if (!component) continue;
      const { measure, calls } = counted();
      instantiate(
        component,
        initialValues(type),
        { x: 0, y: 0, ...component.size },
        { measure },
      );
      expect(calls.length, component.id).toBe(new Set(calls).size);
      total += calls.length;
    }
    expect(total).toBe(26);
    const screen = counted();
    for (const instance of M3_SCREEN.instances) {
      const component = typeOf.get(instance.typeId)?.component;
      if (!component) throw new Error(`fixture: no component ${instance.typeId}`);
      instantiate(component, instance.values, instance.box, {
        measure: screen.measure,
        idPrefix: instance.id,
      });
    }
    expect(screen.calls).toHaveLength(40);
  });

  budgetIt(
    `instantiating and drawing one instance takes ~${INSTANCE_BUDGET_MS} ms on average`,
    BUDGET_OPTIONS,
    () => {
      const perComponent: number[] = [];
      for (const type of library.types) {
        const component = type.component;
        if (!component) continue;
        const values = initialValues(type);
        const box = { x: 0, y: 0, ...component.size };
        const once = () =>
          renderScene({
            root: instantiate(component, values, box, { measure: approximateMeasurer })
              .root,
            warnings: [],
          });
        for (let i = 0; i < 20; i++) once(); // Warm-up (JIT and first use of Konva).
        const runs = 60;
        const start = performance.now();
        for (let i = 0; i < runs; i++) once();
        perComponent.push((performance.now() - start) / runs);
      }
      const mean = perComponent.reduce((sum, ms) => sum + ms, 0) / perComponent.length;
      expectBelow(mean, INSTANCE_BUDGET_MS, 'average of the 15');
      // No single component exceeds four times the budget (the largest measures ~0.9 ms).
      expectBelow(Math.max(...perComponent), INSTANCE_BUDGET_MS * 4, 'pior componente');
    },
  );

  budgetIt(
    `a screen of 21 instances (instantiate and draw) fits in ${RENDER_BUDGET_MS} ms`,
    BUDGET_OPTIONS,
    () => {
      expectNewLayout();
      const placements = new Map([['screen', { x: 0, y: 0, scale: 1 }]]);
      const once = (): number => {
        const start = performance.now();
        const layer = new ComponentLayerRenderer(new Konva.Group());
        layer.render(instantiateScreen(), () => true, placements);
        const elapsed = performance.now() - start;
        layer.destroy();
        return elapsed;
      };
      for (let i = 0; i < 5; i++) once(); // Warm-up.
      const times = Array.from({ length: 15 }, once);
      const median = [...times].sort((a, b) => a - b)[7] ?? Number.NaN;
      expectBelow(median, RENDER_BUDGET_MS);
    },
  );

  budgetIt(
    'changing the value of an instance redoes only its drawing, well below the frame',
    BUDGET_OPTIONS,
    () => {
      const parent = new Konva.Group();
      const layer = new ComponentLayerRenderer(parent);
      const placements = new Map([['screen', { x: 0, y: 0, scale: 1 }]]);
      let drawings = instantiateScreen();
      layer.render(drawings, () => true, placements);

      const target: Instance | undefined = M3_SCREEN.instances[1];
      const component = target && typeOf.get(target.typeId)?.component;
      if (!target || !component) throw new Error('fixture');
      const times: number[] = [];
      for (let i = 0; i < 20; i++) {
        const next = new Map(drawings);
        const { root } = instantiate(
          component,
          { ...target.values, title: `Title ${i}` },
          target.box,
          { measure: approximateMeasurer, idPrefix: target.id },
        );
        next.set(target.id, { markingId: target.id, containerId: 'screen', root });
        const start = performance.now();
        expect(layer.render(next, () => true, placements)).toBe(true);
        times.push(performance.now() - start);
        drawings = next;
      }
      const median = [...times.slice(5)].sort((a, b) => a - b)[7] ?? Number.NaN;
      expectBelow(median, RENDER_BUDGET_MS / 4);
      layer.destroy();
    },
  );
});

// Grid with text (decision 23 of #1078, L3): 4 columns and 6 rows of 24 texts of 2 lines, `fill` on the
// cell and `hug` on the height, instantiated and drawn in Konva.
// Ceiling measured on the runner (stage #1765): the CI runner comes in two machine classes (on the
// fast jobs the grid measures ~2.5 ms; on the slow ones, ~4.1 to 4.5 ms; locally, ~2.2 ms) and `retry: 1` runs
// on the same machine. Computation (decision 7 of #1698): largest 1st measurement on CI × 1.25 = 4.469 × 1.25 = 5.59,
// rounded up to 0.5 ms = 6 ms. Source: 90 `build` jobs of CI and Deploy, from
// 2026-11-12T17:44Z to 2026-11-13T09:00Z (largest value between this one and the plan's, 4.446 ms).
describe('grid with text', () => {
  const GRID_BUDGET_MS = 6;
  const BOX = { x: 0, y: 0, width: 400, height: 300 };
  const cells = Array.from({ length: 24 }, (_, i) => ({
    type: 'text',
    name: 'cell',
    text: `aaaaa bbbbb c${String(i).padStart(2, '0')}cc`,
    width: 'fill',
  }));
  const component = {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'grade',
    name: 'Grade',
    size: { width: 400, height: 300 },
    template: {
      type: 'frame',
      name: 'raiz',
      layout: { type: 'column' },
      children: [
        {
          type: 'frame',
          name: 'grade',
          width: 'fill',
          height: 'hug',
          layout: { type: 'grid', columns: 4, gap: 8, lineGap: 8 },
          children: cells,
        },
      ],
    },
  } as never;

  beforeAll(() => installFakeCanvas());
  afterAll(() => vi.restoreAllMocks());

  function drawn() {
    return instantiate(component, {}, BOX, { measure: approximateMeasurer });
  }

  it('the grid geometry: 4 equal columns, 6 rows and the hug height is their sum', () => {
    const { root, warnings } = drawn();
    const boxes = absoluteBoxes(root);
    const nodes = [...walk(root)];
    const grid = nodes.find((n) => n.name === 'grade');
    const texts = nodes.filter((n) => n.name === 'cell');
    expect(texts).toHaveLength(24);
    // (400 − 3 × 8) / 4 = 94 per column; each row has 2 text lines of 16.8.
    const xs = [...new Set(texts.map((n) => boxes.get(n.id)?.x))];
    const ys = [...new Set(texts.map((n) => boxes.get(n.id)?.y))];
    expect(xs).toEqual([0, 102, 204, 306]);
    expect(ys).toHaveLength(6);
    expect(texts.every((n) => Math.abs(n.width - 94) < 1e-6)).toBe(true);
    expect(texts.every((n) => Math.abs(n.height - 33.6) < 1e-6)).toBe(true);
    expect(grid?.width).toBeCloseTo(400, 6);
    expect(grid?.height).toBeCloseTo(6 * 33.6 + 5 * 8, 6);
    expect(warnings).toEqual([]);
  });

  budgetIt(
    `a grid of 4 × 6 texts of 2 lines (instantiate and draw) fits in ${GRID_BUDGET_MS} ms`,
    BATCHES_OPTIONS,
    () => {
      const run = (): void => {
        renderScene({ root: drawn().root, warnings: [] });
      };
      expectBelow(measureBudget(run).median, GRID_BUDGET_MS);
    },
  );
});

// Intrinsic nested in 3 levels (decision 23 of #1078, L4): `row` `max-content` › 4 `column`
// `min-content` › 3 `row` with 2 texts each, instantiated and drawn in Konva and with at most one
// measurer call per distinct (text, limit).
// Ceiling measured on the runner (stage #1765): two machine classes on the runner (on the fast jobs the
// nested one measures ~2.9 ms; on the slow ones, ~4.7 to 5.1 ms; locally, ~2.4 ms). Computation (decision 7 of
// #1698): largest 1st measurement on CI × 1.25 = 5.124 × 1.25 = 6.41, rounded up to 0.5 ms =
// 6.5 ms. Source: 87 `build` jobs of CI and Deploy, from 2026-11-12T17:44Z to 2026-11-13T09:00Z.
describe('intrinsic nested in 3 levels', () => {
  const NESTED_BUDGET_MS = 6.5;
  const BOX = { x: 0, y: 0, width: 800, height: 300 };
  const inner = (i: number, j: number) => ({
    type: 'frame',
    name: 'linha',
    width: 'fill',
    layout: { type: 'row', gap: 4 },
    children: [
      { type: 'text', name: 'a', text: `aaaa bbbbbbbb c${i}${j}` },
      { type: 'text', name: 'b', text: `xx yy z${j}` },
    ],
  });
  const column = (i: number) => ({
    type: 'frame',
    name: 'coluna',
    width: 'min-content',
    height: 'hug',
    layout: { type: 'column', gap: 4 },
    children: [inner(i, 0), inner(i, 1), inner(i, 2)],
  });
  const component = {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'intrinsic',
    name: 'Intrinsic',
    size: { width: 800, height: 300 },
    template: {
      type: 'frame',
      name: 'raiz',
      layout: { type: 'column' },
      children: [
        {
          type: 'frame',
          name: 'externa',
          width: 'max-content',
          height: 'hug',
          layout: { type: 'row', gap: 8 },
          children: [0, 1, 2, 3].map(column),
        },
      ],
    },
  } as never;

  beforeAll(() => installFakeCanvas());
  afterAll(() => vi.restoreAllMocks());

  function drawn(measure: TextMeasurer = approximateMeasurer) {
    return instantiate(component, {}, BOX, { measure });
  }

  it('the geometry: the column equals the row min-content and the outer row sums the 4', () => {
    const { root } = drawn();
    const nodes = [...walk(root)];
    const columns = nodes.filter((n) => n.name === 'coluna');
    const outer = nodes.find((n) => n.name === 'externa');
    expect(columns).toHaveLength(4);
    // Widest words at 14 px (7.7 per character): "bbbbbbbb" (61.6) and "yy" (15.4) + gap 4.
    const column = 61.6 + 4 + 15.4;
    expect(columns.every((n) => Math.abs(n.width - column) < 1e-6)).toBe(true);
    expect(outer?.width).toBeCloseTo(4 * column + 3 * 8, 6);
  });

  it('measures each distinct (text, limit) at most once', () => {
    const calls = new Map<string, number>();
    const spy: TextMeasurer = (text, font, maxWidth) => {
      const key = `${text}|${maxWidth ?? ''}`;
      calls.set(key, (calls.get(key) ?? 0) + 1);
      return approximateMeasurer(text, font, maxWidth);
    };
    drawn(spy);
    expect(calls.size).toBeGreaterThan(0);
    expect([...calls.values()].every((count) => count === 1)).toBe(true);
  });

  budgetIt(
    `row max-content › 4 column min-content › 3 row × 2 texts (instantiate and draw) fits in ${NESTED_BUDGET_MS} ms`,
    BATCHES_OPTIONS,
    () => {
      const run = (): void => {
        renderScene({ root: drawn().root, warnings: [] });
      };
      expectBelow(measureBudget(run).median, NESTED_BUDGET_MS);
    },
  );
});

// Remote images (RI3): when an image finishes loading, only its markings are redone
// (and a changed consent redoes all those that use an image); both fit in a frame.
describe('redoing markings with a remote image', () => {
  const IMAGE_COUNT = 30;
  const drawings = new Map<string, LayerDrawing>();
  const image = { width: 64, height: 64 } as unknown as CanvasImageSource;
  const placements = new Map([['screen', { x: 0, y: 0, scale: 1 }]]);

  beforeAll(() => {
    installFakeCanvas();
    for (let i = 0; i < IMAGE_COUNT; i++) {
      const id = `m${i}`;
      const avatar = {
        ...baseNode({ id: `${id}-avatar`, name: 'avatar', width: 48, height: 48 }),
        type: 'rect' as const,
        cornerRadius: 24,
        fills: [
          {
            type: 'image' as const,
            url: `https://img.test/${i}.png`,
            fit: 'cover' as const,
          },
        ],
      };
      const root: FrameNode = {
        ...baseNode({ id, name: id, width: 200, height: 60 }),
        type: 'frame',
        clip: false,
        cornerRadius: 0,
        fills: [{ type: 'solid', color: '#eeeeee' }],
        children: [avatar],
      };
      drawings.set(id, { markingId: id, containerId: 'screen', root });
    }
  });

  budgetIt(
    `redoing 1 of ${IMAGE_COUNT} markings with an image fits in the frame; redoing all of them, in 1.5x`,
    BUDGET_OPTIONS,
    () => {
      const layer = new ComponentLayerRenderer(new Konva.Group(), {
        remoteImage: () => ({ state: 'loaded', image, width: 64, height: 64 }),
      });
      layer.render(drawings, () => true, placements);
      const median = (run: () => void): number => {
        for (let i = 0; i < 5; i++) run(); // Warm-up.
        const times = Array.from({ length: 15 }, () => {
          const start = performance.now();
          run();
          return performance.now() - start;
        });
        return [...times].sort((a, b) => a - b)[7] ?? Number.NaN;
      };
      const one = median(() => layer.refreshImages(new Set(['https://img.test/3.png'])));
      const all = median(() => layer.refreshImages(null));
      expectBelow(one, RENDER_BUDGET_MS / 4, 'one marking');
      expectBelow(all, RENDER_BUDGET_MS * 1.5, 'todas');
      layer.destroy();
    },
  );
});

// The Material 3 settings screen (21 instances) in a container, inside the
// `CanvasController`: the whole frame (all drawings re-instantiated and redone), editing a
// field (just one marking) and the zoom (the layer is not redone). Measured (jsdom, development
// machine, approximate measurer): whole frame ~11 ms (10 to 13; up to ~20 with the machine
// busy), edit ~2 to 5 ms, zoom ~2 to 3 ms. The edit and the zoom get the frame budget; the
// whole frame (which only happens on loading fonts or switching the measurer) gets 1.5x, because it
// re-instantiates and redoes the 21 drawings at once. Always the median of several repetitions.
const FULL_FRAME_BUDGET_MS = RENDER_BUDGET_MS * 1.5;
describe('components screen inside the CanvasController (Material 3)', () => {
  const frames: FrameRequestCallback[] = [];
  const flush = (): void => {
    for (const frame of frames.splice(0)) frame(performance.now());
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
    textMeasurer.value = approximateMeasurer;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Catalog of the example package, read from disk as the session reads it from the project folder. */
  function m3Catalog(): ComponentCatalog {
    const loaded = loadSpecComponents(
      material3Spec(),
      'specs/material3/material3.spec.json',
      1,
      (path) => {
        try {
          return readFileSync(
            join(MATERIAL3_DIR, path.slice('specs/material3/'.length)),
            'utf8',
          );
        } catch {
          return undefined;
        }
      },
    );
    if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
    return new Map([['material3', loaded]]);
  }

  /** The screen in the container with `density`: the rectangles and the container in pixels (× density). */
  function m3Project(catalog: ComponentCatalog, density = 1): Project {
    let p = applySpecialization(emptyProject(), material3Spec(), {
      newId: (() => {
        let n = 0;
        return () => `S${++n}`;
      })(),
      packageSpecName: 'material3.spec.json',
    });
    p = addBackgroundContainer(p, {
      id: 'screen',
      width: M3_SCREEN.width * density,
      height: M3_SCREEN.height * density,
      background: M3_SCREEN.background,
    });
    p = setContainerDensity(p, 'screen', density);
    const scaled = (box: Rect): Rect => ({
      x: box.x * density,
      y: box.y * density,
      width: box.width * density,
      height: box.height * density,
    });
    for (const instance of M3_SCREEN.instances) {
      p = addComponentMarking(
        p,
        catalog,
        {
          markingId: instance.id,
          annotationId: `A_${instance.id}`,
          containerId: 'screen',
          parentId: instance.parentId ?? null,
          specId: 'material3',
          typeId: instance.typeId,
          rect: scaled(instance.box),
          values: Object.fromEntries(
            Object.entries(instance.values).flatMap(([key, value]) =>
              typeof value === 'string' || typeof value === 'number'
                ? [[key, value]]
                : [],
            ),
          ),
        },
        approximateMeasurer,
      );
    }
    return p;
  }

  function setup(density = 1) {
    const catalog = m3Catalog();
    const project = m3Project(catalog, density);
    const store = createProjectStore({ now: () => '2026-10-02T12:00:00.000Z' });
    store.load(project, { readOnly: false });
    const sources = { catalog: signal(catalog), fontsEpoch: signal(0) };
    const actions = createProjectActions(store, {
      components: () => sources.catalog.peek(),
      measure: () => textMeasurer.peek(),
    });
    const ui = createEditorUi();
    const derived = createEditorDerived(store, ui, undefined, sources);
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 412 });
    Object.defineProperty(container, 'clientHeight', { value: 917 });
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
    flush();
    return { actions, controller, container, derived, sources };
  }

  /** Median of `runs` measurements of `run`, which returns the time spent (ms). */
  const medianOf = (runs: number, run: () => number): number => {
    const times = Array.from({ length: runs }, run);
    return [...times].sort((a, b) => a - b)[Math.floor(runs / 2)] ?? Number.NaN;
  };

  it('draws the 21 instances of the settings screen', () => {
    const { controller, container, derived } = setup();
    expect(derived.drawnMarkings.value.size).toBe(21);
    expect(container.dataset.components).toBe('21');
    controller.destroy();
  });

  budgetIt(
    `the whole frame (21 drawings re-instantiated and redone) fits in ${FULL_FRAME_BUDGET_MS} ms`,
    BUDGET_OPTIONS,
    () => {
      expectNewLayout();
      const { controller, sources } = setup();
      const whole = (): number => {
        const start = performance.now();
        sources.fontsEpoch.value++; // Re-instantiates all the drawings.
        flush();
        return performance.now() - start;
      };
      for (let i = 0; i < 4; i++) whole(); // Warm-up.
      expectBelow(medianOf(15, whole), FULL_FRAME_BUDGET_MS);
      controller.destroy();
    },
  );

  budgetIt(
    `editing a field and redrawing fits in ${RENDER_BUDGET_MS} ms`,
    BUDGET_OPTIONS,
    () => {
      const { controller, actions, container } = setup();
      let n = 0;
      const edit = (): number => {
        const start = performance.now();
        const result = actions.setFieldValue('A_m-search', 'label', `Busca ${n++}`);
        flush();
        const elapsed = performance.now() - start;
        expect(result.ok).toBe(true);
        return elapsed;
      };
      for (let i = 0; i < 4; i++) edit();
      expectBelow(medianOf(15, edit), RENDER_BUDGET_MS);
      expect(container.dataset.components).toBe('21');
      controller.destroy();
    },
  );

  it('20 frames of pan and zoom of the screen in the new layout make 0 instantiations (decision 22)', () => {
    expectNewLayout();
    const { controller, derived, sources } = setup();
    const before = new Map(derived.componentScenes.value);
    expect(before.size).toBe(21);
    const instantiated = vi.spyOn(instantiateModule, 'instantiate');
    const render = vi.spyOn(ComponentLayerRenderer.prototype, 'render');
    try {
      for (let step = 0; step < 20; step++) {
        controller.zoomBy(step % 2 === 0 ? 1.1 : 1 / 1.1);
        controller.centerOnPoint({ x: 200 + step * 3, y: 400 });
        flush();
      }
      expect(instantiated).not.toHaveBeenCalled();
      expect(render).not.toHaveBeenCalled();
      const after = derived.componentScenes.value;
      for (const [id, drawing] of before) expect(after.get(id)).toBe(drawing);
      // Control: the two spies see a real re-instantiation (the fonts changed).
      sources.fontsEpoch.value++;
      flush();
      expect(instantiated).toHaveBeenCalled();
      expect(render).toHaveBeenCalled();
    } finally {
      instantiated.mockRestore();
      render.mockRestore();
      controller.destroy();
    }
  });

  // Variant with `density` 3 on the container (#1085, decision 12): the scale at the scene root does not
  // change the cost, so the same budgets apply.
  it('with density 3 the screen also draws the 21 instances, with the scale at the root', () => {
    const { controller, container, derived } = setup(3);
    expect(derived.drawnMarkings.value.size).toBe(21);
    expect(container.dataset.components).toBe('21');
    for (const drawing of derived.componentScenes.value.values()) {
      expect(drawing.root.transform[0]).toBe(3);
      expect(drawing.root.transform[3]).toBe(3);
    }
    controller.destroy();
  });

  budgetIt(
    `with density 3: editing a field and redrawing fits in ${RENDER_BUDGET_MS} ms`,
    BUDGET_OPTIONS,
    () => {
      const { controller, actions, container } = setup(3);
      let n = 0;
      const edit = (): number => {
        const start = performance.now();
        const result = actions.setFieldValue('A_m-search', 'label', `Busca ${n++}`);
        flush();
        const elapsed = performance.now() - start;
        expect(result.ok).toBe(true);
        return elapsed;
      };
      for (let i = 0; i < 4; i++) edit();
      expectBelow(medianOf(15, edit), RENDER_BUDGET_MS);
      expect(container.dataset.components).toBe('21');
      controller.destroy();
    },
  );

  budgetIt(
    `with density 3: the screen zoom fits in ${RENDER_BUDGET_MS} ms`,
    BUDGET_OPTIONS,
    () => {
      const { controller } = setup(3);
      const zoom = (): number => {
        const start = performance.now();
        controller.zoomBy(1.1);
        flush();
        return performance.now() - start;
      };
      for (let i = 0; i < 3; i++) zoom();
      expectBelow(medianOf(15, zoom), RENDER_BUDGET_MS);
      controller.destroy();
    },
  );

  it('with density 3: 20 frames of pan and zoom make 0 instantiations', () => {
    const { controller, derived } = setup(3);
    const before = new Map(derived.componentScenes.value);
    expect(before.size).toBe(21);
    const instantiated = vi.spyOn(instantiateModule, 'instantiate');
    try {
      for (let step = 0; step < 20; step++) {
        controller.zoomBy(step % 2 === 0 ? 1.1 : 1 / 1.1);
        controller.centerOnPoint({ x: 200 + step * 3, y: 400 });
        flush();
      }
      expect(instantiated).not.toHaveBeenCalled();
      for (const [id, drawing] of before)
        expect(derived.componentScenes.value.get(id)).toBe(drawing);
    } finally {
      instantiated.mockRestore();
      controller.destroy();
    }
  });

  budgetIt(
    `the screen zoom (without redoing the drawings) fits in ${RENDER_BUDGET_MS} ms`,
    BUDGET_OPTIONS,
    () => {
      const { controller } = setup();
      const zoom = (): number => {
        const start = performance.now();
        controller.zoomBy(1.1);
        flush();
        return performance.now() - start;
      };
      for (let i = 0; i < 3; i++) zoom();
      expectBelow(medianOf(15, zoom), RENDER_BUDGET_MS);
      controller.destroy();
    },
  );
});

// Proposed view with 60 new components (PC1): switching to Proposed instantiates the 60 new scenes
// at once (like the whole frame of the components screen: 1.5x the frame); pan and zoom
// afterwards re-instantiate nothing and fit in the frame. Test text is lighter than Material 3,
// so the limit is the same as the whole frame's, with headroom.
const PROPOSED_COUNT = 60;
describe('Proposed view with 60 new components', () => {
  const frames: FrameRequestCallback[] = [];
  const flush = (): void => {
    for (const frame of frames.splice(0)) frame(performance.now());
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
    textMeasurer.value = approximateMeasurer;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function setup() {
    const catalog = testCatalog();
    const parsed = parseSpec(SPEC_JSON);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    let n = 0;
    let base = applySpecialization(emptyProject(), parsed.spec, {
      newId: () => `LS${++n}`,
      packageSpecName: 'test.spec.json',
    });
    base = addBackgroundContainer(base, {
      id: 'B1',
      width: 2000,
      height: 2000,
      background: '#FFFFFF',
      center: { x: 1000, y: 1000 },
    });
    let after = base;
    for (let i = 0; i < PROPOSED_COUNT; i++) {
      after = addComponentMarking(
        after,
        catalog,
        {
          markingId: `N${i}`,
          annotationId: `A_N${i}`,
          containerId: 'B1',
          parentId: null,
          specId: SPEC_ID,
          typeId: 'text',
          rect: {
            x: 20 + (i % 10) * 150,
            y: 20 + Math.floor(i / 10) * 60,
            width: 100,
            height: 40,
          },
          values: { label: `Novo ${i}` },
        },
        approximateMeasurer,
      );
    }
    const { session, review } = await openHarness({
      project: base,
      proposals: [propose(base, after)],
      files: Object.fromEntries(specFiles(base)),
    });
    review.open('P1');
    review.setView('current');
    const sources = componentSources(catalog);
    const ui = createEditorUi();
    const derived = createEditorDerived(
      session.store,
      ui,
      review.derived.shownProject,
      sources,
    );
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
      derived,
      view: createCanvasViewState(),
      review,
    });
    flush();
    return { controller, container, review, derived };
  }

  const medianOf = (runs: number, run: () => number): number => {
    const times = Array.from({ length: runs }, run);
    return [...times].sort((a, b) => a - b)[Math.floor(runs / 2)] ?? Number.NaN;
  };

  it('switching to Proposed draws the 60 new scenes and Current draws none', async () => {
    const { controller, container, review } = await setup();
    expect(container.dataset.components).toBe('0');
    review.setView('proposed');
    flush();
    expect(container.dataset.components).toBe(String(PROPOSED_COUNT));
    review.setView('current');
    flush();
    expect(container.dataset.components).toBe('0');
    controller.destroy();
  });

  budgetIt(
    `switching to Proposed (${PROPOSED_COUNT} new scenes) fits in ${FULL_FRAME_BUDGET_MS} ms`,
    BUDGET_OPTIONS,
    async () => {
      const { controller, review } = await setup();
      const toggle = (): number => {
        review.setView('current');
        flush();
        const start = performance.now();
        review.setView('proposed'); // Re-instantiates the 60 scenes (Current discarded their cache).
        flush();
        return performance.now() - start;
      };
      for (let i = 0; i < 3; i++) toggle(); // Warm-up.
      expectBelow(medianOf(11, toggle), FULL_FRAME_BUDGET_MS);
      controller.destroy();
    },
  );

  budgetIt(
    `pan and zoom in Proposed fit in ${RENDER_BUDGET_MS} ms and do not re-instantiate scenes`,
    BUDGET_OPTIONS,
    async () => {
      const { controller, review, derived } = await setup();
      review.setView('proposed');
      flush();
      const shown = (): ReturnType<typeof derived.drawingsOf> =>
        derived.drawingsOf(review.derived.shownProject.value);
      const before = new Map(shown());
      expect(before.size).toBe(PROPOSED_COUNT);
      const render = vi.spyOn(ComponentLayerRenderer.prototype, 'render');
      let step = 0;
      const frame = (): number => {
        const start = performance.now();
        controller.zoomBy(step++ % 2 === 0 ? 1.1 : 1 / 1.1);
        controller.centerOnPoint({ x: 500 + step * 3, y: 500 });
        flush();
        return performance.now() - start;
      };
      for (let i = 0; i < 3; i++) frame();
      expectBelow(medianOf(15, frame), RENDER_BUDGET_MS);
      expect(render).not.toHaveBeenCalled();
      for (const [id, scene] of before) expect(shown().get(id)).toBe(scene);
      render.mockRestore();
      controller.destroy();
    },
  );
});

// Decisions 3, 4 and 9 of the canvas-scale stage: the edit frame with the whole project in view only
// redraws the layers that changed (markings and overlays) and, from afar, each marking draws
// only the border and hangs on the group only what is visible (level of detail). The goal of decision 9 is
// `RENDER_BUDGET_MS` (16 ms), but in jsdom the edit frame measures ~16 to 24 ms (median of 15; the
// markings' `drawScene` dropped from ~21 to ~9 ms, from 18 thousand to 4 thousand nodes, and ~6 ms remain from
// `CanvasController.render` and the overlays): the ceiling below guards against regression. Final check
// (CD5 of the canvas-performance stage): with 16 ms the budget passed only 6 of 10 consecutive runs, so the
// ceiling stays 35 ms; the 16 ms goal is met in Chromium (edit 9.8 ms with 2,000).
const EDIT_FRAME_CEILING_MS = 35;

// Decisions 5 to 7 and 9 of the canvas-scale stage: after the frame that takes the nodes to the drag group, each
// `pointermove` only redraws the overlays layer; the cost depends on what is dragged, not on the
// project. Goal of decision 9: 16 ms in the 2,000-marking scenario (jsdom, median of 15).
describe('drag frame with the whole project in view (2,000 markings)', () => {
  budgetIt(
    `dragging a marking fits in ${RENDER_BUDGET_MS} ms per pointermove`,
    { ...BUDGET_OPTIONS, timeout: 120_000 },
    () => {
      const s = openWholeProject(2000);
      const target = s.project.markings.find((m) => m.parentId === null);
      if (!target) throw new Error('fixture');
      s.actions.beginGesture();
      let step = 0;
      const move = (): number => {
        step++;
        s.actions.previewMarkingMove(target.id, step, step);
        return s.flush();
      };
      move(); // The frame that takes the nodes to the drag group does not count.
      for (let i = 0; i < 3; i++) move(); // Warm-up.
      const times = Array.from({ length: 15 }, move);
      s.actions.cancelGesture();
      s.flush();
      const median = [...times].sort((a, b) => a - b)[7] ?? Number.NaN;
      expectBelow(median, RENDER_BUDGET_MS);
      s.destroy();
    },
  );
});

// Decision 5 of the canvas-performance stage: `createNode` creates only the group and the border; the first frame in
// Fit all (2,000 markings, jsdom) fits in half of the 223 ms of DA1.
describe('first frame in Fit all (2,000 markings)', () => {
  budgetIt(
    'opening in Fit all fits in 111.5 ms',
    { ...BUDGET_OPTIONS, timeout: 120_000 },
    () => {
      const times: number[] = [];
      for (let i = 0; i < 5; i++) {
        const s = openWholeProject(2000, 'fit');
        times.push(s.firstFrameMs);
        s.destroy();
      }
      const median = [...times].sort((a, b) => a - b)[2] ?? Number.NaN;
      expectBelow(median, 111.5);
    },
  );
});

// Decision 7 of the canvas-performance stage: from afar a short arrow is only the stroke and has no label, and the one outside the
// visible area is not painted. With the 1,000 named arrows, pan and zoom in Fit all and zoomed in
// fit in the goal of decision 10 (33 ms; jsdom, median of 15).
describe('pan and zoom with 2,000 markings and 1,000 named arrows', () => {
  budgetIt(
    'fit in 33 ms, from afar and zoomed in',
    { ...BUDGET_OPTIONS, timeout: 120_000 },
    () => {
      const base = wholeProject(2000);
      const project = {
        ...base,
        arrows: base.arrows.map((a, i) => ({ ...a, name: `Seta ${i}` })),
      };
      const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[7] ?? Number.NaN;
      for (const open of ['fit', 'close'] as const) {
        const s = openWholeProject(2000, open, { project });
        let step = 0;
        const round = (): { pan: number; zoom: number } => {
          step++;
          s.controller.centerOnPoint({ x: 500 + 20 * (step % 5), y: 500 });
          const pan = s.flush();
          s.controller.zoomBy(step % 2 ? 1.1 : 1 / 1.1);
          return { pan, zoom: s.flush() };
        };
        for (let i = 0; i < 3; i++) round();
        const samples = Array.from({ length: 15 }, round);
        expectBelow(median(samples.map((r) => r.pan)), 33, `pan (${open})`);
        expectBelow(median(samples.map((r) => r.zoom)), 33, `zoom (${open})`);
        s.destroy();
      }
    },
  );
});

describe('edit frame with the whole project in view (2,000 markings)', () => {
  budgetIt(
    `editing the name of a marking fits in ${EDIT_FRAME_CEILING_MS} ms (goal: ${RENDER_BUDGET_MS} ms)`,
    { ...BUDGET_OPTIONS, timeout: 120_000 },
    () => {
      const s = openWholeProject(2000);
      const target = s.project.markings.find((m) => m.parentId === null);
      if (!target) throw new Error('fixture');
      let step = 0;
      const edit = (): number => {
        s.actions.renameMarking(target.id, `Nome ${step++}`);
        return s.flush();
      };
      for (let i = 0; i < 3; i++) edit(); // Warm-up.
      const times = Array.from({ length: 15 }, edit);
      const median = [...times].sort((a, b) => a - b)[7] ?? Number.NaN;
      expectBelow(median, EDIT_FRAME_CEILING_MS);
      s.destroy();
    },
  );

  budgetIt(
    `pan and zoom with the whole project in view fit in 33 ms`,
    { ...BUDGET_OPTIONS, timeout: 120_000 },
    () => {
      const s = openWholeProject(2000);
      let step = 0;
      const round = (): { pan: number; zoom: number } => {
        step++;
        s.controller.centerOnPoint({ x: 500 + 20 * (step % 5), y: 500 });
        const pan = s.flush();
        s.controller.zoomBy(step % 2 ? 1.1 : 1 / 1.1);
        return { pan, zoom: s.flush() };
      };
      for (let i = 0; i < 3; i++) round();
      const samples = Array.from({ length: 15 }, round);
      const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[7] ?? Number.NaN;
      // Goal of decision 9: 33 ms.
      expectBelow(median(samples.map((r) => r.pan)), 33, 'pan');
      expectBelow(median(samples.map((r) => r.zoom)), 33, 'zoom');
      s.destroy();
    },
  );
});
