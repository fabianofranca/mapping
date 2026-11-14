import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEditorDerived } from '../../src/store/derived';
import { createProjectStore } from '../../src/store/history';
import { setMarkingDisplay } from '../../src/store/settings';
import { createEditorUi, showAllLayers, toggleLayerVisible } from '../../src/store/ui';
import { sampleProject } from '../model/fixtures';

// Layers L1 and L2; annotations A1 (M1/L1), A2 (M1/L2), A3 (M2/L1), A4 (M4/L2).
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

describe('"Markings without annotation" by the visible layers', () => {
  it('hides the marking without an annotation in any visible layer and shows the one that has one in any', () => {
    const { store, ui, derived } = setup();
    const project = store.project.value;
    if (!project) throw new Error('project');
    // All visible: M2 (only L1) and M4 (only L2) have an annotation in some visible one.
    expect(derived.markingVisibility.value.get('M2')).toBe('full');
    expect(derived.markingVisibility.value.get('M4')).toBe('full');
    // Hiding L1, M2 (which only has an annotation in it) goes away; M4 and M1 stay through L2.
    toggleLayerVisible(ui, 'L1');
    expect(derived.markingVisibility.value.get('M2')).toBe('hidden');
    expect(derived.markingVisibility.value.get('M4')).toBe('full');
    expect(derived.markingVisibility.value.get('M1')).toBe('full');
    // Hiding L2 too (the last visible), no plain marking has a visible annotation.
    toggleLayerVisible(ui, 'L2');
    expect(derived.markingVisibility.value.get('M4')).toBe('hidden');
    expect(derived.markingVisibility.value.get('M1')).toBe('hidden');
    showAllLayers(ui);
    expect(derived.markingVisibility.value.get('M2')).toBe('full');
  });

  it('with all hidden there are no visible layers nor dots', () => {
    const { store, ui, derived } = setup();
    const project = store.project.value;
    if (!project) throw new Error('project');
    toggleLayerVisible(ui, 'L1');
    toggleLayerVisible(ui, 'L2');
    expect(derived.visibleLayers.value).toEqual([]);
    expect(derived.layerDots.value.size).toBe(0);
  });
});
