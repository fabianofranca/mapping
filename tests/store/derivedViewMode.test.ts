import { signal } from '@preact/signals';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Project } from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createProjectStore } from '../../src/store/history';
import { setMarkingDisplay, setShowComponentsOnPhotos } from '../../src/store/settings';
import { createEditorUi, setViewMode, type EditorUi } from '../../src/store/ui';
import {
  hideViewDrawingLayer,
  onlyScreens,
  setViewShow,
  toggleViewDrawingLayer,
} from '../../src/store/viewMode';
import { withArrow } from '../model/arrowFixtures';
import { viewCatalog, viewLayerIds, viewProject } from './viewModeFixtures';

function setup(project: Project = viewProject()) {
  const store = createProjectStore({ now: () => '2026-01-01T00:00:00.000Z' });
  store.load(project, { readOnly: false });
  const ui = createEditorUi();
  const derived = createEditorDerived(store, ui, undefined, {
    catalog: signal(viewCatalog()),
    fontsEpoch: signal(0),
  });
  return { store, ui, derived, ids: viewLayerIds(project) };
}

function showOnlyLayer(ui: EditorUi, project: Project, layerId: string): void {
  ui.hiddenLayers.value = new Set(
    project.layers.filter((l) => l.id !== layerId).map((l) => l.id),
  );
}

const sorted = (set: ReadonlySet<string>) => [...set].sort();

beforeEach(() => {
  setMarkingDisplay('all');
  setShowComponentsOnPhotos(false);
});

describe('derived: layers with a drawing', () => {
  it('are only the layers that have a type with a component', () => {
    const { derived, ids } = setup();
    expect(derived.drawingLayers.value.map((l) => l.id)).toEqual([ids.a, ids.b]);
    expect(derived.drawingLayers.value.map((l) => l.id)).not.toContain(ids.c);
  });

  it('without any component, the list is empty (and stable)', () => {
    const { derived } = setup();
    const store = createProjectStore({ now: () => '2026-01-01T00:00:00.000Z' });
    store.load(viewProject(), { readOnly: false });
    const bare = createEditorDerived(store, createEditorUi());
    expect(bare.drawingLayers.value).toEqual([]);
    expect(bare.drawingLayers.value).toBe(bare.drawingLayers.value);
    expect(derived.drawingLayers.value.length).toBe(2);
  });

  it('the drawing knows the layer of its annotation', () => {
    const { derived, store, ids } = setup();
    const drawings = derived.drawingsOf(store.project.value);
    expect(drawings.get('TA')?.layerId).toBe(ids.a);
    expect(drawings.get('TB')?.layerId).toBe(ids.b);
  });
});

describe('derived: per-layer drawing in the mode', () => {
  it('outside the mode the choice does not apply: hiding the layer does not remove the drawing', () => {
    const { ui, derived, ids } = setup();
    const before = sorted(derived.drawnMarkings.value);
    expect(before).toEqual(['TA', 'TB']);
    hideViewDrawingLayer(ui, ids.a);
    expect(sorted(derived.drawnMarkings.value)).toEqual(before);
  });

  it('in the mode, the unchecked layer loses its drawings and the other stays', () => {
    const { ui, derived, ids } = setup();
    setViewMode(ui, true);
    expect(sorted(derived.drawnMarkings.value)).toEqual(['TA', 'TB']);
    toggleViewDrawingLayer(ui, ids.a);
    expect(sorted(derived.drawnMarkings.value)).toEqual(['TB']);
    toggleViewDrawingLayer(ui, ids.a);
    toggleViewDrawingLayer(ui, ids.b);
    expect(sorted(derived.drawnMarkings.value)).toEqual(['TA']);
    toggleViewDrawingLayer(ui, ids.a);
    expect(derived.drawnMarkings.value.size).toBe(0);
  });

  it('the choice does not rebuild the drawings cache', () => {
    const { ui, derived, store, ids } = setup();
    setViewMode(ui, true);
    const project = store.project.value;
    const before = derived.drawingsOf(project);
    toggleViewDrawingLayer(ui, ids.a);
    setViewShow(ui, { arrows: false, outline: true });
    onlyScreens(ui);
    const after = derived.drawingsOf(project);
    expect(after).toBe(before);
    expect(after.get('TB')).toBe(before.get('TB'));
  });

  it('a layer that does not exist is ignored', () => {
    const { ui, derived } = setup();
    setViewMode(ui, true);
    hideViewDrawingLayer(ui, 'does-not-exist');
    expect(sorted(derived.drawnMarkings.value)).toEqual(['TA', 'TB']);
    expect(derived.drawingLayers.value).toHaveLength(2);
  });

  it('a new layer is born checked: only the one that was unchecked goes away', () => {
    const { ui, derived, ids } = setup();
    setViewMode(ui, true);
    hideViewDrawingLayer(ui, ids.b);
    expect(sorted(derived.drawnMarkings.value)).toEqual(['TA']);
    expect(ui.viewShow.value.hiddenDrawingLayers.has(ids.a)).toBe(false);
  });

  it('the photo follows "Show components over photos", also in the mode', () => {
    const { ui, derived } = setup();
    setViewMode(ui, true);
    expect(derived.drawnMarkings.value.has('TF')).toBe(false);
    setShowComponentsOnPhotos(true);
    expect(derived.drawnMarkings.value.has('TF')).toBe(true);
  });
});

describe('derived: visibility in the mode', () => {
  it('the touch markings stay hidden (nothing is selected), as in Clean view', () => {
    const { ui, derived } = setup();
    ui.selection.value = { kind: 'marking', id: 'TA' };
    setViewMode(ui, true);
    const marks = derived.markingVisibility.value;
    expect(marks.size).toBeGreaterThan(0);
    expect([...marks.values()].every((v) => v === 'hidden')).toBe(true);
  });

  it('what the canvas draws ignores the filter: all whole, even with Hide', () => {
    const { ui, derived, store, ids } = setup();
    setMarkingDisplay('hide');
    showOnlyLayer(ui, store.project.value as Project, ids.c);
    expect(derived.canvasVisibility.value.get('P')).toBe('hidden');
    setViewMode(ui, true);
    const canvas = derived.canvasVisibility.value;
    expect(canvas.size).toBeGreaterThan(0);
    expect([...canvas.values()].every((v) => v === 'full')).toBe(true);
    setViewMode(ui, false);
    expect(derived.canvasVisibility.value).toBe(derived.markingVisibility.value);
  });

  it('hiding the outline does not hide the marking for the arrow', () => {
    const project = withArrow(viewProject(), 'R1', 'TA', 'TB');
    const { ui, derived } = setup(project);
    setViewMode(ui, true);
    setViewShow(ui, { outline: false, names: false });
    expect(derived.canvasVisibility.value.get('TA')).toBe('full');
    expect(derived.canvasVisibility.value.get('TB')).toBe('full');
  });
});
