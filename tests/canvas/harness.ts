// Apoio aos testes do canvas: Konva em jsdom com um contexto 2D falso, um
// projeto pequeno com posições conhecidas e o quadro montado do estado real.
import { signal, type Signal } from '@preact/signals';
import { vi } from 'vitest';
import {
  approximateMeasurer,
  addAnnotation,
  addBlankImage,
  addComponentMarking,
  type ComponentCatalog,
  addImage,
  createMarking,
  createProject,
  setImagePlacement,
  type Project,
} from '../../src/model';
import type { Frame } from '../../src/canvas/frame';
import { cardCache } from '../../src/canvas/renderers/cards';
import type { CanvasTokens } from '../../src/canvas/theme';
import { createCanvasViewState } from '../../src/canvas/viewState';
import { createEditorDerived, type ComponentSources } from '../../src/store/derived';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { locale } from '../../src/store/settings';
import { textMeasurer } from '../../src/store/textMeasure';
import { createEditorUi } from '../../src/store/ui';
import { SPEC_ID, componentProject, testCatalog } from '../model/componentFixtures';

/** Contexto 2D que aceita qualquer chamada; `measureText` estima pela quantidade de letras. */
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
      // O Konva lê a matriz atual ao isolar uma forma (os selos da revisão): identidade.
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

/** Troca o `getContext` do jsdom (que não desenha) pelo contexto falso. */
export function installFakeCanvas(): void {
  const getContext = function (this: HTMLCanvasElement) {
    return fakeContext(this);
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    getContext as unknown as typeof HTMLCanvasElement.prototype.getContext,
  );
}

/** Valores de teste distintos entre si, para as asserções saberem de qual token veio a cor. */
export const TOKENS: CanvasTokens = {
  line: '#fefefe',
  halo: 'rgba(1, 2, 3, 0.7)',
  select: '#0057b8',
  invalid: '#cc0000',
  warning: '#ffc247',
  nameTag: '#0057b9',
  nameTagText: '#010203',
  badge: '#0a0c10',
  component: {
    placeholderFill: 'rgba(120, 121, 122, 0.25)',
    placeholderLine: 'rgba(120, 121, 122, 0.8)',
    unknownLine: '#d81b61',
  },
  surface: '#ffffff',
  card: 'rgba(250, 250, 250, 0.9)',
  border: '#cccccc',
  text: '#111111',
  textMuted: '#666666',
  warningText: '#b26a00',
  opacity: { dimmed: 0.3, ancestor: 0.7, inherited: 0.65 },
  fontFamily: 'TestSans, sans-serif',
  type: {
    name: { size: 11, line: 16, weight: 600 },
    image: { size: 12, line: 16, weight: 600 },
    card: { size: 11, line: 15, weight: 400 },
    caption: { size: 10, line: 14, weight: 400 },
  },
  handleSize: 10,
  lock: { fill: '#0057ba', glyph: '#010204', size: 20 },
  radius: { sm: 4, md: 6 },
};

export const NOW = '2026-10-02T12:00:00.000Z';

/**
 * I1 (1000×800) em (0, 0) e I2 (500×500) em (1100, 0), ambas na escala 1:
 * canvas = pixels. M1 "Porta" em I1 com a filha M2 "Maçaneta"; M3 sem nome em
 * I2. Camada L1 com a anotação A1 (dois pares) em M1.
 */
export function canvasProject(): Project {
  let p = createProject({
    name: 'Canvas',
    now: NOW,
    firstLayer: { id: 'L1', name: 'Lataria', color: '#E53935' },
  });
  p = addImage(p, { id: 'I1', file: 'images/a.jpg', width: 1000, height: 800 });
  p = addImage(p, { id: 'I2', file: 'images/b.jpg', width: 500, height: 500 });
  p = setImagePlacement(p, 'I1', { x: 0, y: 0, scale: 1 });
  p = setImagePlacement(p, 'I2', { x: 1100, y: 0, scale: 1 });
  p = createMarking(p, {
    id: 'M1',
    imageId: 'I1',
    rect: { x: 100, y: 100, width: 600, height: 500 },
    name: 'Porta',
  });
  p = createMarking(p, {
    id: 'M2',
    imageId: 'I1',
    rect: { x: 200, y: 200, width: 100, height: 100 },
    name: 'Maçaneta',
  });
  p = createMarking(p, {
    id: 'M3',
    imageId: 'I2',
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

/** Store, actions, UI e estado derivado de um editor com `project` aberto. */
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

/** Quadro com o estado atual do editor (viewport 1:1 numa tela de 380×700). */
export function frameOf(editor: Editor, overrides: Partial<Frame> = {}): Frame {
  const { store, ui, derived } = editor;
  return {
    project: store.project.peek(),
    readOnly: store.readOnly.peek(),
    bitmaps: new Map(),
    preview: null,
    draft: null,
    dropTarget: null,
    hoverLock: null,
    hoverMarking: null,
    tokens: TOKENS,
    size: { width: 380, height: 700 },
    viewport: { x: 0, y: 0, scale: 1 },
    selection: ui.selection.peek(),
    mode: ui.mode.peek(),
    semantic: true,
    locale: locale.peek(),
    shown: derived.visibleLayers.peek(),
    dots: derived.layerDots.peek(),
    incomplete: derived.incompleteMarkings.peek(),
    visibility: derived.markingVisibility.peek(),
    card: cardCache(
      store.project.peek(),
      derived.visibleLayers.peek(),
      derived.annotationsByMarking.peek(),
    ),
    drawings: derived.drawingsOf(store.project.peek()),
    drawn: derived.drawnMarkings.peek(),
    review: null,
    ...overrides,
  };
}

/** Fontes de componentes de teste: catálogo (editável) e época das fontes. */
export function componentSources(
  catalog: ComponentCatalog = testCatalog(),
): ComponentSources & { catalog: Signal<ComponentCatalog>; fontsEpoch: Signal<number> } {
  return { catalog: signal(catalog), fontsEpoch: signal(0) };
}

/** Quadro 1000×800 (foto I1) e tela em branco B1 (400×600, fundo branco) com dois textos. */
export function componentCanvasProject(): Project {
  let p = componentProject();
  p = addBlankImage(p, {
    id: 'B1',
    name: 'Tela',
    width: 400,
    height: 600,
    background: '#FFFFFF',
    center: { x: 1500, y: 300 },
  });
  const catalog = testCatalog();
  const add = (id: string, imageId: string, x: number, y: number) =>
    addComponentMarking(
      p,
      catalog,
      {
        markingId: id,
        annotationId: `A_${id}`,
        imageId,
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

/** Editor da tela de componentes (`componentCanvasProject`), com as fontes de teste. */
export function componentEditor() {
  const sources = componentSources();
  return { ...editorFor(componentCanvasProject(), false, sources), sources };
}
