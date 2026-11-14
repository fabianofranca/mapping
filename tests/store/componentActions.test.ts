import { beforeEach, describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  createMarking,
  setContainerPlacement,
  setMarkingRect,
  applySpecialization,
  addContainer,
  setFieldValue,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import { createProjectStore, type ProjectStore } from '../../src/store/history';
import { createProjectActions, clampToMinSize } from '../../src/store/project';
import { SPEC_ID, componentProject, testCatalog } from '../model/componentFixtures';
import { FIT_SPEC_ID, LONG_LABEL, fitCatalog, fitProject } from '../model/fitFixtures';
import { emptyProject, marking } from '../model/fixtures';
import { catalog as m3Catalog, spec as m3Spec } from '../support/material3Adoption';

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
  parentId: string | null = null,
  extra: Partial<NewComponentArgs> = {},
): Project {
  return addComponentMarking(
    p,
    catalog,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'I1',
      parentId,
      specId: SPEC_ID,
      typeId,
      rect,
      ...extra,
    },
    approximateMeasurer,
  );
}

function setup(initial: Project = componentProject()) {
  const store = createProjectStore({ now: () => '2026-10-01T00:00:00.000Z' });
  let n = 0;
  const actions = createProjectActions(store, {
    newId: () => `N${++n}`,
    components: () => catalog,
    measure: () => approximateMeasurer,
  });
  store.load(initial);
  return { store, actions };
}

/** How many undo entries exist (undoes everything and redoes). */
function undoDepth(store: ProjectStore): number {
  let depth = 0;
  while (store.undo()) depth++;
  for (let i = 0; i < depth; i++) store.redo();
  return depth;
}

const current = (store: ProjectStore): Project => store.project.value as Project;

describe('actions do container', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('addBackgroundContainer creates the image without a file, in one entry, and undo removes it', () => {
    const { store, actions } = ctx;
    const before = current(store);
    const result = actions.addBackgroundContainer({
      name: 'Tela',
      width: 360,
      height: 640,
      background: '#FFFFFF',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const image = current(store).containers.find((i) => i.id === result.value);
    expect(image).toMatchObject({
      file: null,
      background: '#FFFFFF',
      width: 360,
      height: 640,
      name: 'Tela',
    });
    expect(undoDepth(store)).toBe(1);
    store.undo();
    expect(current(store).containers).toEqual(before.containers);
  });

  it('addBackgroundContainer refuses an invalid size or color without touching anything', () => {
    const { store, actions } = ctx;
    const before = current(store);
    expect(
      actions.addBackgroundContainer({
        name: null,
        width: 0,
        height: 640,
        background: '#FFFFFF',
      }).ok,
    ).toBe(false);
    expect(
      actions.addBackgroundContainer({
        name: null,
        width: 100,
        height: 100,
        background: 'branco',
      }).ok,
    ).toBe(false);
    expect(current(store)).toBe(before);
    expect(store.canUndo.value).toBe(false);
  });

  it('setBackgroundContainer changes color and size in one entry; only valid for a container', () => {
    const { store, actions } = ctx;
    const created = actions.addBackgroundContainer({
      name: null,
      width: 360,
      height: 640,
      background: '#FFFFFF',
    });
    if (!created.ok) throw new Error('addBackgroundContainer');
    const id = created.value;
    expect(
      actions.setBackgroundContainer(id, { background: '#000000', width: 400 }).ok,
    ).toBe(true);
    expect(current(store).containers.find((i) => i.id === id)).toMatchObject({
      background: '#000000',
      width: 400,
    });
    expect(undoDepth(store)).toBe(2);
    store.undo();
    expect(current(store).containers.find((i) => i.id === id)).toMatchObject({
      background: '#FFFFFF',
      width: 360,
    });

    const before = current(store);
    const photo = actions.setBackgroundContainer('I1', { background: '#000000' });
    expect(photo).toEqual({ ok: false, error: 'container-has-file' });
    expect(current(store)).toBe(before);
  });
});

describe('addComponent', () => {
  it('creates the marking and the annotation in one undo entry', () => {
    const { store, actions } = setup();
    const result = actions.addComponent({
      containerId: 'I1',
      parentId: null,
      specId: SPEC_ID,
      typeId: 'text',
      center: { x: 500, y: 400 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = current(store);
    const created = marking(p, result.value);
    expect(created.rect.width).toBeGreaterThan(0);
    const annotation = p.annotations.find((a) => a.markingId === result.value);
    expect(annotation?.type).toEqual({ specId: SPEC_ID, typeId: 'text' });
    // The annotation has its own id, different from the marking's.
    expect(annotation?.id).not.toBe(result.value);
    expect(undoDepth(store)).toBe(1);
    store.undo();
    expect(current(store).markings.some((m) => m.id === result.value)).toBe(false);
    expect(current(store).annotations.some((a) => a.markingId === result.value)).toBe(
      false,
    );
  });

  it('inside a container, the new one enters as a child', () => {
    const initial = add(componentProject(), 'C', 'row', box(100, 100, 300, 100));
    const { store, actions } = setup(initial);
    const result = actions.addComponent({
      containerId: 'I1',
      parentId: 'C',
      specId: SPEC_ID,
      typeId: 'text',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(marking(current(store), result.value).parentId).toBe('C');
  });

  it('refuses a type without a component or a nonexistent image, without changing anything', () => {
    const { store, actions } = setup();
    const before = current(store);
    expect(
      actions.addComponent({
        containerId: 'I1',
        parentId: null,
        specId: SPEC_ID,
        typeId: 'plain',
      }),
    ).toEqual({ ok: false, error: 'unknown-type' });
    expect(
      actions.addComponent({
        containerId: 'nada',
        parentId: null,
        specId: SPEC_ID,
        typeId: 'text',
      }).ok,
    ).toBe(false);
    expect(current(store)).toBe(before);
    expect(store.canUndo.value).toBe(false);
  });

  it('without a catalog (default) nothing is created', () => {
    const store = createProjectStore();
    const actions = createProjectActions(store);
    store.load(componentProject());
    expect(
      actions.addComponent({
        containerId: 'I1',
        parentId: null,
        specId: SPEC_ID,
        typeId: 'text',
      }).ok,
    ).toBe(false);
  });
});

describe('addComponent: Material 3 top-app-bar (TB1, decision 1 of #1335)', () => {
  const m3setup = () => {
    let n = 0;
    let p = applySpecialization(emptyProject(), m3Spec, {
      newId: () => `TB${++n}`,
      packageSpecName: 'material3-compose.spec.json',
    });
    p = addContainer(p, { id: 'I1', file: null, width: 360, height: 800 } as never);
    const store = createProjectStore({ now: () => '2026-10-01T00:00:00.000Z' });
    let ids = 0;
    const actions = createProjectActions(store, {
      newId: () => `N${++ids}`,
      components: () => m3Catalog,
      measure: () => approximateMeasurer,
    });
    store.load(p);
    return { store, actions };
  };

  it('the Palette creates the top-app-bar with 64 and the Row at Y 100 stays outside, its sibling', () => {
    const { store, actions } = m3setup();
    const bar = actions.addComponent({
      containerId: 'I1',
      parentId: null,
      specId: m3Spec.id,
      typeId: 'top-app-bar',
      center: { x: 180, y: 400 },
    });
    expect(bar.ok).toBe(true);
    if (!bar.ok) return;
    // The bar is born at the place the Palette asks for (center 180, 400): the height is what matters here.
    expect(marking(current(store), bar.value).rect.height).toBe(64);
    store.load(
      setMarkingRect(current(store), bar.value, { x: 0, y: 0, width: 360, height: 64 }),
    );
    const row = actions.addComponent({
      containerId: 'I1',
      parentId: null,
      specId: m3Spec.id,
      typeId: 'row',
      center: { x: 180, y: 400 },
    });
    expect(row.ok).toBe(true);
    if (!row.ok) return;
    // As in R9.4: the Palette creates and the Y is typed in the Details (here 100, below the 64 of the bar).
    const made = marking(current(store), row.value).rect;
    store.load(setMarkingRect(current(store), row.value, { ...made, y: 100 }));
    const p = current(store);
    expect(marking(p, row.value).rect.y).toBe(100);
    expect(marking(p, row.value).parentId).toBeNull();
    expect(marking(p, bar.value).parentId).toBeNull();
  });
});

describe('components on the canvas and between spaces (ME1)', () => {
  it('addComponent with a null containerId creates the instance on the canvas, centered on `center`', () => {
    const { store, actions } = setup();
    const result = actions.addComponent({
      containerId: null,
      parentId: null,
      specId: SPEC_ID,
      typeId: 'text',
      center: { x: -2000, y: -1500 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const created = marking(current(store), result.value);
    expect(created).toMatchObject({ containerId: null, parentId: null, floating: false });
    // In canvas units, no limit, and centered on the requested point.
    expect(created.rect.x + created.rect.width / 2).toBeCloseTo(-2000, -1);
    expect(created.rect.y + created.rect.height / 2).toBeCloseTo(-1500, -1);
    const annotation = current(store).annotations.find(
      (a) => a.markingId === result.value,
    );
    expect(annotation?.type).toEqual({ specId: SPEC_ID, typeId: 'text' });
    expect(undoDepth(store)).toBe(1);
  });

  it('the instance on the canvas becomes floating through an action, in one entry', () => {
    const { store, actions } = setup();
    const result = actions.addComponent({
      containerId: null,
      parentId: null,
      specId: SPEC_ID,
      typeId: 'text',
      center: { x: -2000, y: -1500 },
    });
    if (!result.ok) throw new Error('addComponent');
    expect(actions.setMarkingFloating(result.value, true).ok).toBe(true);
    expect(marking(current(store), result.value).floating).toBe(true);
    expect(undoDepth(store)).toBe(2);
    store.undo();
    expect(marking(current(store), result.value).floating).toBe(false);
  });

  /** I1 reduced to a quarter: a 100×40 pixel text measures 25×10 on the canvas (the minimum is 60×24). */
  function smallImage() {
    let p = setContainerPlacement(componentProject(), 'I1', { x: 0, y: 0, scale: 0.25 });
    p = add(p, 'T', 'text', box(100, 100, 100, 40));
    return setup(p);
  }

  it('moving the component to the canvas respects its minimum size in the rect conversion', () => {
    const { store, actions } = smallImage();
    // 2000 pixels of I1 = 500 canvas units: it leaves the image (0..250).
    expect(actions.moveMarking('T', 2000, 0).ok).toBe(true);
    expect(marking(current(store), 'T')).toMatchObject({
      containerId: null,
      rect: { x: 525, y: 25, width: 60, height: 24 },
    });
  });

  it('the move gesture too: the final one settles with the component minimum', () => {
    const { store, actions } = smallImage();
    expect(actions.beginGesture().ok).toBe(true);
    actions.previewMarkingMove('T', 2000, 0);
    // In the preview the rect is still the one of I1 (not settled): 100×40 pixels.
    expect(marking(current(store), 'T').rect).toMatchObject({ width: 100, height: 40 });
    expect(actions.finishMarkingMove('T', 2000, 0).ok).toBe(true);
    actions.commitGesture();
    expect(marking(current(store), 'T')).toMatchObject({
      containerId: null,
      rect: { x: 525, y: 25, width: 60, height: 24 },
    });
    expect(undoDepth(store)).toBe(1);
  });
});

describe('reorderMarking', () => {
  function threeSiblings() {
    let p = componentProject();
    ['A', 'B', 'C'].forEach((id, i) => {
      p = createMarking(p, { id, containerId: 'I1', rect: box(i * 100, 0, 50, 50) });
    });
    return setup(p);
  }
  const order = (store: ProjectStore) => current(store).markings.map((m) => m.id);

  it('moves among the siblings in one entry and undoes', () => {
    const { store, actions } = threeSiblings();
    expect(actions.reorderMarking('A', 2).ok).toBe(true);
    expect(order(store)).toEqual(['B', 'C', 'A']);
    expect(undoDepth(store)).toBe(1);
    store.undo();
    expect(order(store)).toEqual(['A', 'B', 'C']);
  });

  it('same position does not create an entry; out-of-range index refuses', () => {
    const { store, actions } = threeSiblings();
    expect(actions.reorderMarking('B', 1).ok).toBe(true);
    expect(store.canUndo.value).toBe(false);
    expect(actions.reorderMarking('B', 3)).toEqual({ ok: false, error: 'invalid-index' });
    expect(order(store)).toEqual(['A', 'B', 'C']);
  });

  it('the geometry lock does not prevent reordering', () => {
    const { store, actions } = threeSiblings();
    actions.setMarkingLocked('A', true);
    expect(actions.reorderMarking('A', 2).ok).toBe(true);
    expect(order(store)).toEqual(['B', 'C', 'A']);
  });
});

describe('arrange', () => {
  function rowWithKids() {
    let p = add(componentProject(), 'C', 'row', box(100, 100, 300, 100));
    p = add(p, 'T1', 'text', box(250, 150, 100, 40), 'C');
    p = add(p, 'T2', 'text', box(120, 110, 100, 40), 'C');
    return setup(p);
  }

  it('arranges the children in one undo entry and returns the warnings', () => {
    const { store, actions } = rowWithKids();
    const before = current(store);
    const result = actions.arrange('C');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.isArray(result.value)).toBe(true);
    expect(current(store)).not.toBe(before);
    expect(marking(current(store), 'T1').rect).not.toEqual(marking(before, 'T1').rect);
    expect(undoDepth(store)).toBe(1);
    store.undo();
    expect(current(store).markings).toEqual(before.markings);
  });

  it('already arranged: does not create a new entry', () => {
    const { store, actions } = rowWithKids();
    actions.arrange('C');
    const arranged = current(store);
    expect(actions.arrange('C').ok).toBe(true);
    expect(current(store)).toBe(arranged);
    // Just one entry: the one of the first arrange.
    expect(store.undo()).toBe(true);
    expect(store.canUndo.value).toBe(false);
  });

  it('refuses what is not a container with children, and the locked geometry', () => {
    const { store, actions } = rowWithKids();
    const before = current(store);
    // A component without a slot nor adjustable axis: `not-fittable`; a marking without a component: `not-arrangeable`.
    expect(actions.arrange('T1')).toEqual({ ok: false, error: 'not-fittable' });
    actions.setMarkingLocked('T1', true);
    const locked = current(store);
    expect(actions.arrange('C')).toEqual({ ok: false, error: 'locked' });
    expect(current(store)).toBe(locked);
    expect(before).not.toBe(locked);
  });
});

describe('arrange on a marking without a slot: fit to the content (MC3)', () => {
  const fcat = fitCatalog();
  function fitSetup(typeId = 'fit-button', label = LONG_LABEL) {
    let p = addComponentMarking(
      fitProject(),
      fcat,
      {
        markingId: 'B',
        annotationId: 'A_B',
        containerId: 'I1',
        parentId: null,
        specId: FIT_SPEC_ID,
        typeId,
        rect: box(100, 100, 120, 40),
      },
      approximateMeasurer,
    );
    p = setFieldValue(p, 'A_B', 'label', label);
    p = createMarking(p, { id: 'P', containerId: 'I1', rect: box(400, 400, 50, 50) });
    const store = createProjectStore({ now: () => '2026-10-01T00:00:00.000Z' });
    let n = 0;
    const actions = createProjectActions(store, {
      newId: () => `N${++n}`,
      components: () => fcat,
      measure: () => approximateMeasurer,
    });
    store.load(p);
    return { store, actions };
  }

  it('Arrange adjusts the height to the label in one undo entry, without warnings', () => {
    const { store, actions } = fitSetup();
    const before = current(store);
    expect(actions.arrange('B')).toEqual({ ok: true, value: [] });
    const rect = marking(current(store), 'B').rect;
    expect(rect).toMatchObject({ x: 100, y: 100, width: 120 });
    expect(rect.height).toBeGreaterThan(40);
    expect(undoDepth(store)).toBe(1);
    store.undo();
    expect(current(store).markings).toEqual(before.markings);
  });

  it('already adjusted: no new entry', () => {
    const { store, actions } = fitSetup();
    actions.arrange('B');
    const fitted = current(store);
    expect(actions.arrange('B').ok).toBe(true);
    expect(current(store)).toBe(fitted);
    expect(undoDepth(store)).toBe(1);
  });

  it('locked geometry and component without an adjustable axis refuse; marking without a component is not-arrangeable', () => {
    const { store, actions } = fitSetup();
    expect(actions.arrange('P')).toEqual({ ok: false, error: 'not-arrangeable' });
    actions.setMarkingLocked('B', true);
    const locked = current(store);
    expect(actions.arrange('B')).toEqual({ ok: false, error: 'locked' });
    expect(current(store)).toBe(locked);
    const plain = fitSetup('fit-plain');
    expect(plain.actions.arrange('B')).toEqual({ ok: false, error: 'not-fittable' });
  });
});

describe('minimum size of the component', () => {
  // `text` has minSize 60 x 24.
  function withText() {
    return setup(add(componentProject(), 'T', 'text', box(100, 100, 100, 40)));
  }

  it('setMarkingRect and adjustMarkingRect respect the minimum', () => {
    const { store, actions } = withText();
    expect(actions.setMarkingRect('T', box(100, 100, 50, 40))).toEqual({
      ok: false,
      error: 'rect-too-small',
    });
    expect(actions.setMarkingRect('T', box(100, 100, 61, 24)).ok).toBe(true);
    expect(marking(current(store), 'T').rect).toEqual(box(100, 100, 61, 24));
    const depth = undoDepth(store);
    actions.adjustMarkingRect('T', 'width', 10);
    // The fine adjustment is limited by the rules: never below the minimum.
    expect(marking(current(store), 'T').rect.width).toBeGreaterThanOrEqual(60);
    expect(undoDepth(store)).toBeGreaterThanOrEqual(depth);
  });

  it('a plain marking has no minimum', () => {
    const { store, actions } = setup(
      createMarking(componentProject(), {
        id: 'P',
        containerId: 'I1',
        rect: box(0, 0, 50, 50),
      }),
    );
    expect(actions.setMarkingRect('P', box(0, 0, 10, 10)).ok).toBe(true);
    expect(marking(current(store), 'P').rect).toEqual(box(0, 0, 10, 10));
  });

  it('the gesture preview clamps to the minimum, keeping the edge opposite to the handle', () => {
    const { store, actions } = withText();
    expect(actions.beginGesture().ok).toBe(true);
    // Right handle: the left side stays.
    expect(actions.previewMarkingRect('T', box(100, 100, 20, 40)).ok).toBe(true);
    expect(marking(current(store), 'T').rect).toEqual(box(100, 100, 60, 40));
    // Left handle: the right side (x + width = 200) stays.
    expect(actions.previewMarkingRect('T', box(180, 100, 20, 40)).ok).toBe(true);
    expect(marking(current(store), 'T').rect).toEqual(box(140, 100, 60, 40));
    // Bottom and top handle.
    expect(actions.previewMarkingRect('T', box(100, 100, 100, 5)).ok).toBe(true);
    expect(marking(current(store), 'T').rect).toEqual(box(100, 100, 100, 24));
    expect(actions.previewMarkingRect('T', box(100, 135, 100, 5)).ok).toBe(true);
    expect(marking(current(store), 'T').rect).toEqual(box(100, 116, 100, 24));
    actions.commitGesture();
    expect(undoDepth(store)).toBe(1);
  });
});

describe('clampToMinSize', () => {
  const base = box(100, 100, 100, 40);
  const min = { width: 60, height: 24 };

  it('what already fits does not change', () => {
    expect(clampToMinSize(box(90, 100, 120, 40), base, min)).toEqual(
      box(90, 100, 120, 40),
    );
  });

  it('an axis the gesture did not touch stays, even below the minimum', () => {
    const tiny = box(100, 100, 50, 10);
    expect(clampToMinSize(tiny, tiny, min)).toEqual(tiny);
  });

  it('sem borda conhecida, ancora em x e y', () => {
    expect(clampToMinSize(box(120, 110, 10, 10), base, min)).toEqual(
      box(120, 110, 60, 24),
    );
  });
});
