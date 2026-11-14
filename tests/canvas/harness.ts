// Support for the canvas tests: Konva in jsdom with a fake 2D context, a small
// project with known positions and the frame built from the real state.
import { signal, type Signal } from '@preact/signals';
import Konva from 'konva';
import { vi } from 'vitest';
import {
  approximateMeasurer,
  addAnnotation,
  addBackgroundContainer,
  addComponentMarking,
  type ComponentCatalog,
  addContainer,
  createMarking,
  createProject,
  setContainerPlacement,
  type Project,
} from '../../src/model';
import { visibleArrowShapes } from '../../src/canvas/arrowGeometry';
import type { Frame } from '../../src/canvas/frame';
import type { CanvasTokens } from '../../src/canvas/theme';
import { createCanvasViewState } from '../../src/canvas/viewState';
import { createEditorDerived, type ComponentSources } from '../../src/store/derived';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { locale } from '../../src/store/settings';
import { textMeasurer } from '../../src/store/textMeasure';
import { createEditorUi, itemsOf, setViewMode, type EditorUi } from '../../src/store/ui';
import { onlyScreens } from '../../src/store/viewMode';
import { SPEC_ID, componentProject, testCatalog } from '../model/componentFixtures';

/** 2D context that accepts any call; `measureText` estimates by the number of letters. */
export function fakeContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const state: Record<string | symbol, unknown> = { canvas };
  return new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'measureText') {
        return (text: string) => ({ width: text.length * 6 });
      }
      if (key === 'getImageData' || key === 'createImageData') {
        return () => ({ data: new Uint8ClampedArray(4) });
      }
      // Konva reads the current matrix when isolating a shape (the review stamps): identity.
      if (key === 'getTransform') {
        return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      }
      if (key === 'createLinearGradient' || key === 'createRadialGradient') {
        return () => ({ addColorStop: () => undefined });
      }
      return () => undefined;
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** Replaces jsdom's `getContext` (which does not draw) with the fake context. */
export function installFakeCanvas(): void {
  const getContext = function (this: HTMLCanvasElement) {
    return fakeContext(this);
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    getContext as unknown as typeof HTMLCanvasElement.prototype.getContext,
  );
}

/** Test values distinct from one another, so the assertions know which token a color came from. */
export const TOKENS: CanvasTokens = {
  line: '#fefefe',
  halo: 'rgba(1, 2, 3, 0.7)',
  select: '#0057b8',
  selectFill: 'rgba(0, 87, 184, 0.15)',
  selectSecondary: '#3b7ad8',
  invalid: '#cc0000',
  canvasMarking: '#5a3fc1',
  absorb: '#0a8a5d',
  absorbFill: 'rgba(10, 138, 93, 0.2)',
  warning: '#ffc247',
  nameTag: '#0057b9',
  nameTagText: '#010203',
  badge: '#0a0c10',
  component: {
    placeholderFill: 'rgba(120, 121, 122, 0.25)',
    placeholderLine: 'rgba(120, 121, 122, 0.8)',
    unknownLine: '#d81b61',
    unknownFill: 'rgba(216, 27, 97, 0.06)',
    slotOpacity: 0.6,
    labelFontSize: 12,
    labelFontFamily: 'system-ui, sans-serif',
  },
  surface: '#ffffff',
  card: 'rgba(250, 250, 250, 0.9)',
  border: '#cccccc',
  borderControl: '#7d7e80',
  text: '#111111',
  textMuted: '#666666',
  warningText: '#b26a00',
  opacity: { dimmed: 0.3, ancestor: 0.7, inherited: 0.65 },
  fontFamily: 'TestSans, sans-serif',
  type: {
    name: { size: 11, line: 16, weight: 600 },
    image: { size: 12, line: 16, weight: 600 },
  },
  handleSize: 10,
  lodMinMarking: 24,
  lodHideMarking: 2,
  arrow: {
    stroke: '#0f766f',
    select: '#0057bb',
    label: '#111112',
    labelBg: 'rgba(250, 250, 251, 0.9)',
    width: 2,
    widthSelected: 3,
    head: 10,
  },
  lock: { fill: '#0057ba', glyph: '#010204', size: 20 },
  pin: {
    human: '#ffb020',
    agent: '#5eead4',
    resolved: '#b4bcc7',
    text: '#0b1220',
    halo: 'rgba(10, 12, 16, 0.72)',
    selected: '#0057bb',
    unread: '#ff6b6b',
    height: 20,
    pad: 8,
    glyph: 12,
    glyphGap: 2,
    charWidth: 7,
  },
  arrival: { height: 20, pad: 8, gap: 4, gapBelow: 10, nameBand: 24, charWidth: 7 },
  radius: { sm: 4, md: 6 },
};

export const NOW = '2026-10-02T12:00:00.000Z';

/**
 * I1 (1000×800) at (0, 0) and I2 (500×500) at (1100, 0), both at scale 1:
 * canvas = pixels. M1 "Porta" in I1 with the child M2 "Maçaneta"; M3 without a name in
 * I2. Layer L1 with the annotation A1 (two pairs) on M1.
 */
// pt-BR kept: shared fixture data asserted by tests/canvas/renderers, tests/canvas/input and tests/app
// (layer 'Lataria', markings 'Porta' and 'Maçaneta', annotation 'Amassado' and its pairs)
export function canvasProject(): Project {
  let p = createProject({
    name: 'Canvas',
    now: NOW,
    firstLayer: { id: 'L1', name: 'Lataria', color: '#E53935' },
  });
  p = addContainer(p, { id: 'I1', file: 'images/a.jpg', width: 1000, height: 800 });
  p = addContainer(p, { id: 'I2', file: 'images/b.jpg', width: 500, height: 500 });
  p = setContainerPlacement(p, 'I1', { x: 0, y: 0, scale: 1 });
  p = setContainerPlacement(p, 'I2', { x: 1100, y: 0, scale: 1 });
  p = createMarking(p, {
    id: 'M1',
    containerId: 'I1',
    rect: { x: 100, y: 100, width: 600, height: 500 },
    name: 'Porta',
  });
  p = createMarking(p, {
    id: 'M2',
    containerId: 'I1',
    rect: { x: 200, y: 200, width: 100, height: 100 },
    name: 'Maçaneta',
  });
  p = createMarking(p, {
    id: 'M3',
    containerId: 'I2',
    rect: { x: 50, y: 50, width: 200, height: 200 },
  });
  p = addAnnotation(p, {
    id: 'A1',
    markingId: 'M1',
    layerId: 'L1',
    name: 'Amassado',
    entries: [
      { id: 'E1', key: 'tipo', value: 'amassado' },
      { id: 'E2', key: 'gravidade', value: 'média' },
    ],
  });
  return p;
}

/** Store, actions, UI and derived state of an editor with `project` open. */
export function editorFor(
  project: Project = canvasProject(),
  readOnly = false,
  components?: ComponentSources,
) {
  const store = createProjectStore({ now: () => NOW });
  store.load(project, { readOnly });
  const actions = createProjectActions(
    store,
    components
      ? {
          components: () => components.catalog.peek(),
          measure: () => textMeasurer.peek(),
        }
      : {},
  );
  const ui = createEditorUi();
  const derived = createEditorDerived(store, ui, undefined, components);
  return { store, actions, ui, derived, view: createCanvasViewState() };
}

export type Editor = ReturnType<typeof editorFor>;

/** Frame with the editor's current state (1:1 viewport on a 380×700 screen). */
export function frameOf(editor: Editor, overrides: Partial<Frame> = {}): Frame {
  const { store, ui, derived } = editor;
  return {
    project: store.project.peek(),
    readOnly: store.readOnly.peek(),
    bitmaps: new Map(),
    preview: null,
    draft: null,
    dropTarget: null,
    absorb: [],
    hoverLock: null,
    hoverMarking: null,
    tokens: TOKENS,
    size: { width: 380, height: 700 },
    viewport: { x: 0, y: 0, scale: 1 },
    selection: ui.selection.peek(),
    items: itemsOf(ui.selection.peek(), ui.selectionGroup.peek()),
    mode: ui.mode.peek(),
    locale: locale.peek(),
    incomplete: derived.incompleteMarkings.peek(),
    visibility: derived.canvasVisibility.peek(),
    drawings: derived.drawingsOf(store.project.peek()),
    drawn: derived.drawnMarkings.peek(),
    floating: derived.floatingMarkings.peek(),
    review: null,
    view: null,
    arrows: visibleArrowShapes(store.project.peek(), derived.canvasVisibility.peek()),
    arrowDraft: null,
    marquee: null,
    pins: [],
    pinSelected: null,
    draftPin: null,
    ...overrides,
  };
}

/** Test component sources: catalog (editable) and sources epoch. */
export function componentSources(
  catalog: ComponentCatalog = testCatalog(),
): ComponentSources & { catalog: Signal<ComponentCatalog>; fontsEpoch: Signal<number> } {
  return { catalog: signal(catalog), fontsEpoch: signal(0) };
}

/** 1000×800 frame (photo I1) and container B1 (400×600, white background) with two texts. */
export function componentCanvasProject(): Project {
  let p = componentProject();
  p = addBackgroundContainer(p, {
    id: 'B1',
    name: 'Screen',
    width: 400,
    height: 600,
    background: '#FFFFFF',
    center: { x: 1500, y: 300 },
  });
  const catalog = testCatalog();
  const add = (id: string, containerId: string, x: number, y: number) =>
    addComponentMarking(
      p,
      catalog,
      {
        markingId: id,
        annotationId: `A_${id}`,
        containerId: containerId,
        parentId: null,
        specId: SPEC_ID,
        typeId: 'text',
        rect: { x, y, width: 100, height: 40 },
      },
      approximateMeasurer,
    );
  p = add('T1', 'B1', 20, 20);
  p = add('T2', 'B1', 20, 100);
  p = add('TP', 'I1', 100, 100);
  return p;
}

/** Editor of the components screen (`componentCanvasProject`), with the test sources. */
export function componentEditor() {
  const sources = componentSources();
  return { ...editorFor(componentCanvasProject(), false, sources), sources };
}

/**
 * Turns view mode on or off with **Screens only** (containers, images and drawings; without
 * outline, name or arrows): the canvas that the old Clean view gave.
 */
export function setOnlyScreens(ui: EditorUi, on: boolean): void {
  if (on) onlyScreens(ui);
  setViewMode(ui, on);
}

/** The Konva stage that `CanvasController` mounted in `container`. */
export function stageOf(container: HTMLElement): Konva.Stage {
  const stage = Konva.stages.find((s) => s.container() === container);
  if (!stage) throw new Error('stage not found');
  return stage;
}

/**
 * Meter of layers redrawn per frame: spies on the `drawScene` of each `Konva.Layer`
 * (identified by `name`). `take()` returns the counts since the last call and resets them;
 * `takeMs()` returns, the same way, the time (ms) spent in the `drawScene` of each layer, to separate
 * the `CanvasController.render` from the drawing of each layer.
 */
export function layerDrawMeter(stage: Konva.Stage): {
  take(): Record<string, number>;
  takeMs(): Record<string, number>;
  restore(): void;
} {
  const counts: Record<string, number> = {};
  const times: Record<string, number> = {};
  const restores: (() => void)[] = [];
  for (const layer of stage.getLayers()) {
    const name = layer.name() || `layer${layer.zIndex()}`;
    counts[name] = 0;
    times[name] = 0;
    const original = layer.drawScene.bind(layer);
    const wrapped = ((...args: Parameters<Konva.Layer['drawScene']>) => {
      counts[name] = (counts[name] ?? 0) + 1;
      const start = performance.now();
      try {
        return original(...args);
      } finally {
        times[name] = (times[name] ?? 0) + performance.now() - start;
      }
    }) as Konva.Layer['drawScene'];
    layer.drawScene = wrapped;
    restores.push(() => {
      layer.drawScene = original as Konva.Layer['drawScene'];
    });
  }
  return {
    take() {
      const out = { ...counts };
      for (const key of Object.keys(counts)) counts[key] = 0;
      return out;
    },
    takeMs() {
      const out = { ...times };
      for (const key of Object.keys(times)) times[key] = 0;
      return out;
    },
    restore() {
      for (const restore of restores) restore();
    },
  };
}

/** Visible shapes (`Konva.Shape`) with all ancestors visible, by layer name. */
export function visibleShapesByLayer(stage: Konva.Stage): Record<string, number> {
  const count = (node: Konva.Node): number => {
    if (!node.isVisible()) return 0;
    if (node instanceof Konva.Shape) return 1;
    if (node instanceof Konva.Container) {
      return node.getChildren().reduce((sum, child) => sum + count(child), 0);
    }
    return 0;
  };
  const out: Record<string, number> = {};
  for (const layer of stage.getLayers()) {
    out[layer.name() || `layer${layer.zIndex()}`] = count(layer);
  }
  return out;
}
