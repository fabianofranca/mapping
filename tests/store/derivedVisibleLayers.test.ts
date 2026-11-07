import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEditorDerived } from '../../src/store/derived';
import { createProjectStore } from '../../src/store/history';
import { setMarkingDisplay } from '../../src/store/settings';
import { createEditorUi, showAllLayers, toggleLayerVisible } from '../../src/store/ui';
import { sampleProject } from '../model/fixtures';

// Camadas L1 e L2; anotações A1 (M1/L1), A2 (M1/L2), A3 (M2/L1), A4 (M4/L2).
function setup() {
  const store = createProjectStore();
  store.load(sampleProject());
  const ui = createEditorUi();
  const derived = createEditorDerived(store, ui);
  return { store, ui, derived };
}

beforeEach(() => setMarkingDisplay('hide'));
afterEach(() => {
  setMarkingDisplay('all');
  localStorage.clear();
});

describe('"Marcações sem anotação" pelas camadas visíveis', () => {
  it('esconde a marcação sem anotação em nenhuma camada visível e mostra a que tem em qualquer uma', () => {
    const { store, ui, derived } = setup();
    const project = store.project.value;
    if (!project) throw new Error('projeto');
    // Todas visíveis: M2 (só L1) e M4 (só L2) têm anotação em alguma visível.
    expect(derived.markingVisibility.value.get('M2')).toBe('full');
    expect(derived.markingVisibility.value.get('M4')).toBe('full');
    // Escondendo a L1, M2 (que só tem anotação nela) some; M4 e M1 ficam pela L2.
    toggleLayerVisible(ui, 'L1');
    expect(derived.markingVisibility.value.get('M2')).toBe('hidden');
    expect(derived.markingVisibility.value.get('M4')).toBe('full');
    expect(derived.markingVisibility.value.get('M1')).toBe('full');
    // Escondendo também a L2 (a última visível), nenhuma marcação comum tem anotação visível.
    toggleLayerVisible(ui, 'L2');
    expect(derived.markingVisibility.value.get('M4')).toBe('hidden');
    expect(derived.markingVisibility.value.get('M1')).toBe('hidden');
    showAllLayers(ui);
    expect(derived.markingVisibility.value.get('M2')).toBe('full');
  });

  it('com todas escondidas não há camadas visíveis nem bolinhas', () => {
    const { store, ui, derived } = setup();
    const project = store.project.value;
    if (!project) throw new Error('projeto');
    toggleLayerVisible(ui, 'L1');
    toggleLayerVisible(ui, 'L2');
    expect(derived.visibleLayers.value).toEqual([]);
    expect(derived.layerDots.value.size).toBe(0);
  });
});
