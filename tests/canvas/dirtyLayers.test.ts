import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Signal } from '@preact/signals';
import { CanvasController } from '../../src/canvas/CanvasController';
import { createDisplayImages } from '../../src/store/displayImages';
import { approximateMeasurer } from '../../src/model';
import { textMeasurer } from '../../src/store/textMeasure';
import { componentEditor, installFakeCanvas, layerDrawMeter, stageOf } from './harness';
import { openWholeProject, stubFrames } from './wholeProjectScenario';

const ALL = ['components', 'floating', 'images', 'markings', 'overlay'];

/** Nomes das camadas que o quadro redesenhou (contagem > 0). */
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

// Decisão 3 da etapa canvas-escala: o quadro só redesenha as camadas cujo renderizador mexeu em
// algum nó; pan, zoom e mudança de tamanho sujam todas.
describe('camadas redesenhadas por quadro (projeto inteiro à vista, 2.000 marcações)', () => {
  it('pan e zoom redesenham as 5; edição, seleção e hover só as que mudaram', () => {
    const s = openWholeProject(2000);
    const first = s.project.markings.find((m) => m.parentId === null);
    if (!first) throw new Error('fixture');

    s.controller.zoomBy(1.1);
    s.flush();
    expect(redrawn(s.drawnLayers())).toEqual(ALL);

    s.controller.centerOnPoint({ x: 500, y: 500 });
    s.flush();
    expect(redrawn(s.drawnLayers())).toEqual(ALL);

    // Editar o nome: marcações e sobreposições; nem as imagens nem os componentes.
    s.actions.renameMarking(first.id, 'Renomeada');
    s.flush();
    const edit = redrawn(s.drawnLayers());
    expect(edit).toContain('markings');
    expect(edit).not.toContain('images');
    expect(edit).not.toContain('components');

    // Selecionar: só as sobreposições e as marcações (pela borda da selecionada).
    s.ui.selection.value = { kind: 'marking', id: first.id };
    s.flush();
    expect(redrawn(s.drawnLayers())).toEqual(['markings', 'overlay']);

    // Hover numa marcação sem desenho de componente: nem imagens nem componentes.
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

  it('um quadro sem mudança não redesenha nenhuma camada', () => {
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

describe('camadas redesenhadas: componentes', () => {
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

  it('mudar o desenho de um componente redesenha a camada dos componentes', () => {
    const s = setup();
    expect(s.actions.setFieldValue('A_T1', 'label', 'Outro texto').ok).toBe(true);
    s.flush();
    expect(redrawn(s.meter.take())).toContain('components');
    s.controller.destroy();
  });

  it('a seleção não redesenha a camada dos componentes nem a das imagens', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'T2' };
    s.flush();
    const counts = redrawn(s.meter.take());
    expect(counts).not.toContain('components');
    expect(counts).not.toContain('images');
    s.controller.destroy();
  });
});
