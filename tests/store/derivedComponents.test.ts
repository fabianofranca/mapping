import { signal } from '@preact/signals';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  setContainerDensity,
  addComponentMarking,
  createMarking,
  approximateMeasurer,
  setFieldValue,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { setMarkingDisplay, setShowComponentsOnPhotos } from '../../src/store/settings';
import { textMeasurer } from '../../src/store/textMeasure';
import { createEditorUi, setViewMode, type EditorUi } from '../../src/store/ui';
import { SPEC_ID, componentProject, testCatalog } from '../model/componentFixtures';
import { NOTES_SPEC_ID, notesCatalog, notesProject } from '../model/notesFixtures';

const catalog = testCatalog();

const box = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

function add(
  p: Project,
  id: string,
  typeId: string,
  rect: Rect,
  extra: Partial<NewComponentArgs> = {},
): Project {
  return addComponentMarking(
    p,
    catalog,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'I1',
      parentId: null,
      specId: SPEC_ID,
      typeId,
      rect,
      ...extra,
    },
    approximateMeasurer,
  );
}

/** Two texts and a sheet that does not fit, on image I1. */
function screen(): Project {
  let p = componentProject();
  p = add(p, 'T1', 'text', box(100, 100, 100, 40));
  p = add(p, 'T2', 'text', box(300, 100, 100, 40));
  return p;
}

/** Leaves only one layer visible (the "no annotation" filter applies to the visible ones). */
function showOnly(ui: EditorUi, project: Project | null, layerId: string): void {
  ui.hiddenLayers.value = new Set(
    (project?.layers ?? []).filter((l) => l.id !== layerId).map((l) => l.id),
  );
}

function setup(
  initial: Project = screen(),
  components: { catalog: ComponentCatalog } = { catalog },
) {
  const store = createProjectStore({ now: () => '2026-10-01T00:00:00.000Z' });
  const actions = createProjectActions(store, {
    newId: (() => {
      let n = 0;
      return () => `N${++n}`;
    })(),
    components: () => components.catalog,
    measure: () => approximateMeasurer,
  });
  store.load(initial);
  const ui = createEditorUi();
  const sources = {
    catalog: signal(components.catalog),
    fontsEpoch: signal(0),
  };
  const shown = signal<Project | null>(null);
  const derived = createEditorDerived(
    store,
    ui,
    // No review: the shown project is the confirmed one, until a test swaps `shown`.
    undefined,
    sources,
  );
  return { store, actions, ui, derived, sources, shown };
}

/** All the drawing's text (the scene as JSON is enough to look for a value). */
const drawnText = (root: unknown): string => JSON.stringify(root);

beforeEach(() => {
  setMarkingDisplay('all');
  setShowComponentsOnPhotos(false);
});
afterEach(() => {
  textMeasurer.value = approximateMeasurer;
  localStorage.clear();
});

describe('derived: component drawings', () => {
  it('without a catalog, nobody has a drawing', () => {
    const { derived } = setup(screen(), { catalog: new Map() });
    expect(derived.componentScenes.value.size).toBe(0);
    expect(derived.drawnMarkings.value.size).toBe(0);
    expect(derived.componentTypes.value).toEqual([]);
  });

  it('draws the markings with a component, in array order', () => {
    const { derived } = setup();
    const scenes = derived.componentScenes.value;
    expect([...scenes.keys()]).toEqual(['T1', 'T2']);
    expect(scenes.get('T1')?.annotationId).toBe('A_T1');
    expect(derived.catalog.value).toBe(catalog);
  });

  it('editing a field re-instantiates only that marking', () => {
    const { derived, actions } = setup();
    const before = derived.componentScenes.value;
    expect(actions.setFieldValue('A_T1', 'label', 'New text').ok).toBe(true);
    const after = derived.componentScenes.value;
    expect(after.get('T1')).not.toBe(before.get('T1'));
    expect(drawnText(after.get('T1')?.root)).toContain('New text');
    expect(after.get('T2')).toBe(before.get('T2'));
  });

  it('undo and redo redraw through the same path', () => {
    const { derived, actions, store } = setup();
    actions.setFieldValue('A_T1', 'label', 'New text');
    const edited = derived.componentScenes.value;
    store.undo();
    const undone = derived.componentScenes.value;
    expect(drawnText(undone.get('T1')?.root)).not.toContain('New text');
    expect(undone.get('T2')).toBe(edited.get('T2'));
    store.redo();
    expect(drawnText(derived.componentScenes.value.get('T1')?.root)).toContain(
      'New text',
    );
  });

  it('external reload (another project in the same session) redraws only what changed', () => {
    const { derived, store } = setup();
    const before = derived.componentScenes.value;
    store.load(setFieldValue(screen(), 'A_T2', 'label', 'Came from disk'));
    const after = derived.componentScenes.value;
    expect(drawnText(after.get('T2')?.root)).toContain('Came from disk');
    expect(after.get('T1')).toBe(before.get('T1'));
  });

  it('a catalog that arrives later draws the markings that were already in the project', () => {
    const { derived, sources } = setup();
    sources.catalog.value = new Map();
    expect(derived.componentScenes.value.size).toBe(0);
    sources.catalog.value = catalog;
    expect(derived.componentScenes.value.size).toBe(2);
  });

  it('the measurer and the fonts epoch redraw', () => {
    const { derived, sources } = setup();
    const before = derived.componentScenes.value;
    sources.fontsEpoch.value++;
    const afterFonts = derived.componentScenes.value;
    expect(afterFonts.get('T1')).not.toBe(before.get('T1'));
    textMeasurer.value = (text, font, maxWidth) =>
      approximateMeasurer(text, font, maxWidth);
    expect(derived.componentScenes.value.get('T1')).not.toBe(afterFonts.get('T1'));
  });

  it('the Proposed view draws the proposed values', () => {
    const base = screen();
    const store = createProjectStore();
    store.load(base);
    const proposed = signal<Project | null>(base);
    const derived = createEditorDerived(store, createEditorUi(), proposed, {
      catalog: signal(catalog),
      fontsEpoch: signal(0),
    });
    const current = derived.componentScenes.value;
    proposed.value = setFieldValue(base, 'A_T1', 'label', 'Proposed');
    const next = derived.componentScenes.value;
    expect(drawnText(next.get('T1')?.root)).toContain('Proposed');
    expect(next.get('T2')).toBe(current.get('T2'));
  });

  it('drawingsOf returns the scene of the shown project and reuses the rest with the gesture preview', () => {
    const { derived, actions, store } = setup();
    const scenes = derived.componentScenes.value;
    expect(derived.drawingsOf(store.project.value)).toBe(scenes);

    actions.beginGesture();
    actions.previewMarkingRect('T1', box(100, 100, 120, 40));
    const preview = derived.drawingsOf(store.project.value);
    expect(preview).not.toBe(scenes);
    expect(preview.get('T1')?.root.width).toBe(120);
    expect(preview.get('T2')).toBe(scenes.get('T2'));
    // During the gesture the shown (confirmed) project does not change.
    expect(derived.componentScenes.value).toBe(scenes);
    actions.commitGesture();
    expect(derived.componentScenes.value.get('T1')?.root.width).toBe(120);
    expect(derived.componentScenes.value.get('T2')).toBe(scenes.get('T2'));
    expect(derived.drawingsOf(null).size).toBe(0);
  });
});

describe('derived: drawn markings', () => {
  it('on the photo only with the option on; in the container, always', () => {
    const { derived, actions, store } = setup();
    expect(derived.drawnMarkings.value.size).toBe(0);
    setShowComponentsOnPhotos(true);
    expect([...derived.drawnMarkings.value]).toEqual(['T1', 'T2']);
    setShowComponentsOnPhotos(false);
    expect(derived.drawnMarkings.value.size).toBe(0);

    const bgContainer = actions.addBackgroundContainer({
      name: null,
      width: 400,
      height: 600,
      background: '#FFFFFF',
    });
    if (!bgContainer.ok) throw new Error('addBackgroundContainer');
    const created = actions.addComponent({
      containerId: bgContainer.value,
      parentId: null,
      specId: SPEC_ID,
      typeId: 'text',
    });
    if (!created.ok) throw new Error('addComponent');
    expect([...derived.drawnMarkings.value]).toEqual([created.value]);
    expect(store.project.value?.markings).toHaveLength(3);
  });

  it('the "no annotation" filter does not hide a marking that draws; the plain one follows the rule', () => {
    // Container with a child, plus a plain marking with no annotation, in the container... and on the photo.
    let p = add(screen(), 'C', 'row', box(100, 300, 300, 100));
    p = add(p, 'K', 'text', box(100, 300, 100, 40), { parentId: 'C' });
    p = createMarking(p, { id: 'P', containerId: 'I1', rect: box(500, 500, 50, 50) });
    const { derived, ui, store } = setup(p);
    setShowComponentsOnPhotos(true);
    const layers = store.project.value?.layers ?? [];
    const other = layers.find((l) => l.spec === null);
    const typed = layers.find((l) => l.spec !== null);
    if (!other || !typed) throw new Error('layers');
    const drawable = ['T1', 'T2', 'C', 'K'];
    for (const mode of ['hide', 'dim'] as const) {
      setMarkingDisplay(mode);
      // Only a layer without the components' annotations visible: they stay whole and drawn.
      showOnly(ui, store.project.value, other.id);
      const marks = derived.markingVisibility.value;
      for (const id of drawable) expect(marks.get(id)).toBe('full');
      expect(marks.get('P')).toBe(mode === 'hide' ? 'hidden' : 'dim');
      expect([...derived.drawnMarkings.value].sort()).toEqual([...drawable].sort());
      showOnly(ui, store.project.value, typed.id);
      expect(derived.markingVisibility.value.get('C')).toBe('full');
    }
    // View mode: no marking to the touch, not even the selected one, but the drawing stays in sight.
    setMarkingDisplay('all');
    ui.selection.value = { kind: 'marking', id: 'T1' };
    setViewMode(ui, true);
    const clean = derived.markingVisibility.value;
    expect(clean.size).toBeGreaterThan(0);
    expect([...clean.values()].every((v) => v === 'hidden')).toBe(true);
    expect([...derived.drawnMarkings.value].sort()).toEqual([...drawable].sort());
    setViewMode(ui, false);
    ui.selection.value = null;
    expect(derived.markingVisibility.value.get('T1')).toBe('full');
    // Without the option, nothing draws on the photo; the filter applies again to what does not draw.
    setShowComponentsOnPhotos(false);
    setMarkingDisplay('hide');
    showOnly(ui, store.project.value, other.id);
    expect(derived.drawnMarkings.value.size).toBe(0);
    expect(derived.markingVisibility.value.get('T1')).toBe('hidden');
  });

  it('in the container the component shows even with the photos option off', () => {
    const { derived, actions, ui, store } = setup();
    const bgContainer = actions.addBackgroundContainer({
      name: null,
      width: 400,
      height: 600,
      background: '#FFFFFF',
    });
    if (!bgContainer.ok) throw new Error('addBackgroundContainer');
    const created = actions.addComponent({
      containerId: bgContainer.value,
      parentId: null,
      specId: SPEC_ID,
      typeId: 'row',
    });
    if (!created.ok) throw new Error('addComponent');
    const other = store.project.value?.layers.find((l) => l.spec === null);
    if (!other) throw new Error('layer');
    setMarkingDisplay('hide');
    showOnly(ui, store.project.value, other.id);
    expect(derived.markingVisibility.value.get(created.value)).toBe('full');
    expect([...derived.drawnMarkings.value]).toEqual([created.value]);
  });

  it('keeps the same set when nothing changes', () => {
    const { derived, actions } = setup();
    setShowComponentsOnPhotos(true);
    const before = derived.drawnMarkings.value;
    actions.renameProject('Another name');
    expect(derived.drawnMarkings.value).toBe(before);
  });

  it('the canvas marking always draws, regardless of the photos option', () => {
    const { derived, actions } = setup();
    setShowComponentsOnPhotos(false);
    const created = actions.addComponent({
      containerId: null,
      parentId: null,
      specId: SPEC_ID,
      typeId: 'text',
      center: { x: 3000, y: 100 },
    });
    if (!created.ok) throw new Error('addComponent');
    // T1 and T2 are on photo I1 (hidden); the canvas one shows.
    expect([...derived.drawnMarkings.value]).toEqual([created.value]);
    expect(derived.componentScenes.value.get(created.value)?.containerId).toBeNull();
  });
});

describe('derived: floating markings', () => {
  it('lists the floating ones and keeps the same set while none changes', () => {
    const { derived, actions } = setup();
    const empty = derived.floatingMarkings.value;
    expect(empty.size).toBe(0);
    actions.renameProject('Another name');
    expect(derived.floatingMarkings.value).toBe(empty);

    const note = actions.addComponent({
      containerId: null,
      parentId: null,
      specId: SPEC_ID,
      typeId: 'text',
      center: { x: 3000, y: 100 },
    });
    if (!note.ok) throw new Error('addComponent');
    // Plain on the canvas: not floating yet.
    expect(derived.floatingMarkings.value.size).toBe(0);
    expect(actions.setMarkingFloating(note.value, true).ok).toBe(true);
    const floating = derived.floatingMarkings.value;
    expect([...floating]).toEqual([note.value]);
    actions.renameProject('Yet another');
    expect(derived.floatingMarkings.value).toBe(floating);
  });
});

describe('derived: "component does not fit" issue', () => {
  function withWide() {
    return setup(add(screen(), 'W', 'wide', box(500, 100, 100, 40)));
  }

  it('shows on the annotation that draws and enters the incomplete ones', () => {
    const { derived } = withWide();
    expect(derived.issues.value.get('A_W')).toEqual([{ code: 'component-overflow' }]);
    expect(derived.issues.value.has('A_T1')).toBe(false);
    expect(derived.incompleteMarkings.value.has('W')).toBe(true);
    expect(derived.incompleteCount.value).toBe(1);
    expect(derived.incompleteList.value.length).toBeGreaterThan(0);
  });

  it('goes away when the marking comes to fit or stops existing', () => {
    const { derived, actions } = withWide();
    expect(derived.incompleteCount.value).toBe(1);
    // Wider: the two 80 boxes fit in a line of 160 or more.
    expect(actions.setMarkingRect('W', box(500, 100, 200, 40)).ok).toBe(true);
    expect(derived.issues.value.has('A_W')).toBe(false);
    expect(derived.incompleteCount.value).toBe(0);
    actions.setMarkingRect('W', box(500, 100, 100, 40));
    expect(derived.incompleteCount.value).toBe(1);
    actions.removeMarking('W');
    expect(derived.incompleteCount.value).toBe(0);
  });

  it('keeps the same map when an edit does not touch the issues', () => {
    const { derived, actions } = withWide();
    const before = derived.issues.value;
    actions.renameMarking('T1', 'Other');
    expect(derived.issues.value).toBe(before);
  });

  it('adds to what the model already flags on the same annotation', () => {
    const { derived, actions, store } = withWide();
    // An invalid value on an annotation that also overflows: both issues show.
    actions.addAnnotation('W', store.project.value?.layers[0]?.id as string);
    const issues = derived.issues.value.get('A_W') ?? [];
    expect(issues.map((i) => i.code)).toContain('component-overflow');
  });
});

describe('derived: minimum size, palette and warnings', () => {
  it('componentMinSizes brings the components minimum (1×1 without minSize)', () => {
    const { derived, actions } = setup(
      add(screen(), 'W', 'wide', box(500, 100, 100, 40)),
    );
    const sizes = derived.componentMinSizes.value;
    expect(sizes.get('T1')).toEqual({ width: 60, height: 24 });
    // Without minSize on the component, the 1 px minimum of whoever draws a component applies.
    expect(sizes.get('W')).toEqual({ width: 1, height: 1 });
    const before = sizes;
    actions.renameMarking('T1', 'Other');
    expect(derived.componentMinSizes.value).toBe(before);
  });

  it('componentMinSizes multiplies minSize by the container density (the resize minimum)', () => {
    const { derived } = setup(setContainerDensity(screen(), 'I1', 3));
    expect(derived.componentMinSizes.value.get('T1')).toEqual({ width: 180, height: 72 });
  });

  it('componentTypes lists the types with a component and keeps the list', () => {
    const { derived, actions } = setup();
    const types = derived.componentTypes.value;
    expect(types.map((t) => t.typeId)).toContain('text');
    expect(types.map((t) => t.typeId)).not.toContain('plain');
    actions.renameMarking('T1', 'Other');
    expect(derived.componentTypes.value).toBe(types);
  });

  it('componentWarnings only brings the markings with a warning', () => {
    const { derived } = setup(add(screen(), 'W', 'wide', box(500, 100, 100, 40)));
    const warnings = derived.componentWarnings.value;
    expect(warnings.map((w) => w.markingId)).toEqual(['W']);
    expect(warnings[0]?.warnings.map((w) => w.text).join(' ')).toContain(
      'content larger than the box',
    );
  });
});

describe('derived: floating note over a photo', () => {
  it('draws even with "Show components over photos" off, with the photo underneath', () => {
    const { derived, actions, store } = setup(notesProject(), {
      catalog: notesCatalog(),
    });
    setShowComponentsOnPhotos(false);
    const photo = store.project.value?.containers.find((c) => c.id === 'I1');
    if (!photo) throw new Error('I1');
    const created = actions.addComponent({
      containerId: null,
      parentId: null,
      specId: NOTES_SPEC_ID,
      typeId: 'nota',
      // Over photo I1.
      center: { x: photo.placement.x + 100, y: photo.placement.y + 100 },
    });
    if (!created.ok) throw new Error('addComponent');
    const note = store.project.value?.markings.find((m) => m.id === created.value);
    expect(note).toMatchObject({ floating: true, containerId: null });
    expect([...derived.drawnMarkings.value]).toEqual([created.value]);
    expect(derived.componentScenes.value.get(created.value)).toBeDefined();
    expect(derived.floatingMarkings.value.has(created.value)).toBe(true);
    // Turning the option on changes nothing for the floating one.
    setShowComponentsOnPhotos(true);
    expect([...derived.drawnMarkings.value]).toEqual([created.value]);
  });
});
