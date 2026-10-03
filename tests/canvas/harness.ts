// Apoio aos testes do canvas: Konva em jsdom com um contexto 2D falso, um
// projeto pequeno com posições conhecidas e o quadro montado do estado real.
import { vi } from 'vitest';
import {
  addAnnotation,
  addImage,
  createMarking,
  createProject,
  setImagePlacement,
  type Project,
} from '../../src/model';
import type { Frame } from '../../src/canvas/frame';
import { cardCache } from '../../src/canvas/renderers/cards';
import type { CanvasTokens } from '../../src/canvas/theme';
import { createEditorDerived } from '../../src/store/derived';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { locale } from '../../src/store/settings';
import { createEditorUi } from '../../src/store/ui';

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

export const TOKENS: CanvasTokens = {
  accent: '#0057b8',
  danger: '#c62828',
  warning: '#b26a00',
  surface: '#ffffff',
  border: '#cccccc',
  text: '#111111',
  textMuted: '#666666',
  marking: '#333333',
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
export function editorFor(project: Project = canvasProject(), readOnly = false) {
  const store = createProjectStore({ now: () => NOW });
  store.load(project, { readOnly });
  const actions = createProjectActions(store);
  const ui = createEditorUi();
  const derived = createEditorDerived(store, ui);
  return { store, actions, ui, derived };
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
    grabbed: null,
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
    ...overrides,
  };
}
