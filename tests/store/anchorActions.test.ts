// Anchor in the app (R4, decisions 12 and 13): the `setMarkingAnchor` and `snapToAnchor` actions, the Arrange
// that also snaps and the anchored `addComponent`. Each one is an undo entry.
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  createMarking,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import { createProjectStore, type ProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { FIT_SPEC_ID, LONG_LABEL, fitCatalog, fitProject } from '../model/fitFixtures';
import { marking } from '../model/fixtures';
import { TIP_SPEC_ID, tipCatalog, tipProject } from '../model/tooltipFixtures';

const tipComponents = tipCatalog();
const fitComponents = fitCatalog();

const BUTTON: Rect = { x: 400, y: 300, width: 80, height: 32 };
const TOOLTIP: Rect = { x: 100, y: 100, width: 100, height: 48 };

function addTip(
  p: Project,
  id: string,
  typeId: string,
  rect: Rect,
  extra: Partial<NewComponentArgs> = {},
): Project {
  return addComponentMarking(
    p,
    tipComponents,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'I1',
      parentId: null,
      specId: TIP_SPEC_ID,
      typeId,
      rect,
      ...extra,
    },
    approximateMeasurer,
  );
}

/** I1 with the button B and the tooltip T far from it, no anchor yet. */
function tipScene(): Project {
  // pt-BR kept: shared fixture data (tooltipFixtures typeId) asserted by tests/model
  return addTip(addTip(tipProject(), 'B', 'botao', BUTTON), 'T', 'tooltip', TOOLTIP);
}

function setup(initial: Project, catalog = tipComponents) {
  const store = createProjectStore({ now: () => '2026-11-13T00:00:00.000Z' });
  let n = 0;
  const actions = createProjectActions(store, {
    newId: () => `N${++n}`,
    components: () => catalog,
    measure: () => approximateMeasurer,
  });
  store.load(initial);
  return { store, actions };
}

const current = (store: ProjectStore): Project => store.project.value as Project;

/** How many undo entries exist (undoes everything and redoes). */
function undoDepth(store: ProjectStore): number {
  let depth = 0;
  while (store.undo()) depth++;
  for (let i = 0; i < depth; i++) store.redo();
  return depth;
}

// The tooltip has `anchor` top/center with `offset.main` 4 at the root: above the button (400,300, 80×32),
// 100×48 sits at x = 400 + (80 − 100) / 2 = 390 and y = 300 − 48 − 4 = 248.
const SNAPPED = { x: 390, y: 248 };

describe('setMarkingAnchor', () => {
  it('records the anchor in an undo entry, without moving the marking', () => {
    const { store, actions } = setup(tipScene());
    expect(actions.setMarkingAnchor('T', { to: 'B', side: 'bottom' }).ok).toBe(true);
    expect(marking(current(store), 'T').anchor).toEqual({ to: 'B', side: 'bottom' });
    expect(marking(current(store), 'T').rect).toEqual(TOOLTIP);
    expect(undoDepth(store)).toBe(1);
    store.undo();
    expect(marking(current(store), 'T').anchor ?? null).toBeNull();
  });

  it('`null` removes the anchor; the same anchor does not create an entry', () => {
    const { store, actions } = setup(tipScene());
    actions.setMarkingAnchor('T', { to: 'B' });
    const anchored = current(store);
    expect(actions.setMarkingAnchor('T', { to: 'B' }).ok).toBe(true);
    expect(current(store)).toBe(anchored);
    expect(actions.setMarkingAnchor('T', null).ok).toBe(true);
    expect(marking(current(store), 'T').anchor).toBeNull();
    expect(undoDepth(store)).toBe(2);
  });

  it('refuses the marking itself, the cycle and another space with the invariant code', () => {
    const { store, actions } = setup(
      createMarking(tipScene(), {
        id: 'C',
        containerId: null,
        rect: { x: -3000, y: -3000, width: 100, height: 48 },
      }),
    );
    expect(actions.setMarkingAnchor('T', { to: 'T' })).toEqual({
      ok: false,
      error: 'anchor-self',
    });
    expect(actions.setMarkingAnchor('T', { to: 'C' })).toEqual({
      ok: false,
      error: 'anchor-other-space',
    });
    expect(actions.setMarkingAnchor('T', { to: 'missing' })).toEqual({
      ok: false,
      error: 'anchor-missing',
    });
    actions.setMarkingAnchor('T', { to: 'B' });
    expect(actions.setMarkingAnchor('B', { to: 'T' })).toEqual({
      ok: false,
      error: 'anchor-cycle',
    });
    expect(undoDepth(store)).toBe(1);
  });

  it('the geometry lock does not prevent anchoring (it is not geometry)', () => {
    const { store, actions } = setup(tipScene());
    actions.setMarkingLocked('T', true);
    expect(actions.setMarkingAnchor('T', { to: 'B' }).ok).toBe(true);
    expect(marking(current(store), 'T').anchor).toEqual({ to: 'B' });
  });
});

describe('snapToAnchor (Snap to anchor)', () => {
  it('moves the marking next to the anchor and undo returns it, in a single entry', () => {
    const { store, actions } = setup(tipScene());
    actions.setMarkingAnchor('T', { to: 'B' });
    const result = actions.snapToAnchor('T');
    expect(result).toEqual({ ok: true, value: [] });
    expect(marking(current(store), 'T').rect).toMatchObject({ ...SNAPPED, width: 100 });
    expect(undoDepth(store)).toBe(2);
    store.undo();
    expect(marking(current(store), 'T').rect).toEqual(TOOLTIP);
    expect(marking(current(store), 'T').anchor).toEqual({ to: 'B' });
  });

  it('already snapped: nothing changes and no entry is created', () => {
    const { store, actions } = setup(tipScene());
    actions.setMarkingAnchor('T', { to: 'B' });
    actions.snapToAnchor('T');
    const before = current(store);
    expect(actions.snapToAnchor('T')).toEqual({ ok: true, value: [] });
    expect(current(store)).toBe(before);
    expect(undoDepth(store)).toBe(2);
  });

  it('without an anchor it refuses with not-anchored; locked, with locked', () => {
    const { store, actions } = setup(tipScene());
    expect(actions.snapToAnchor('T')).toEqual({ ok: false, error: 'not-anchored' });
    actions.setMarkingAnchor('T', { to: 'B' });
    actions.setMarkingLocked('T', true);
    expect(actions.snapToAnchor('T')).toEqual({ ok: false, error: 'locked' });
    expect(marking(current(store), 'T').rect).toEqual(TOOLTIP);
  });

  it('going past the container, it clamps inside and returns the warning', () => {
    const { store, actions } = setup(tipScene());
    actions.setMarkingAnchor('T', {
      to: 'B',
      side: 'top',
      offset: { main: 5000, cross: 0 },
    });
    const result = actions.snapToAnchor('T');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(1);
    expect(marking(current(store), 'T').rect.y).toBe(0);
  });
});

describe('arrange on a marking with an anchor snaps', () => {
  it('component without a slot nor adjustable axis: Arrange only snaps (before it gave not-fittable)', () => {
    const { store, actions } = setup(tipScene());
    actions.setMarkingAnchor('T', { to: 'B' });
    expect(actions.arrange('T')).toEqual({ ok: true, value: [] });
    expect(marking(current(store), 'T').rect).toMatchObject(SNAPPED);
  });

  it('without an anchor the current rule applies (not-fittable)', () => {
    const { actions } = setup(tipScene());
    expect(actions.arrange('T')).toEqual({ ok: false, error: 'not-fittable' });
  });

  it('what fits to the content adjusts and snaps in the SAME undo entry', () => {
    const target: Rect = { x: 400, y: 300, width: 200, height: 100 };
    let p = createMarking(fitProject(), { id: 'T', containerId: 'I1', rect: target });
    p = addComponentMarking(
      p,
      fitComponents,
      {
        markingId: 'B',
        annotationId: 'A_B',
        containerId: 'I1',
        parentId: null,
        specId: FIT_SPEC_ID,
        typeId: 'fit-button',
        rect: { x: 20, y: 20, width: 120, height: 40 },
        values: { label: LONG_LABEL },
      },
      approximateMeasurer,
    );
    const { store, actions } = setup(p, fitComponents);
    actions.setMarkingAnchor('B', { to: 'T', side: 'top', align: 'center' });
    const depth = undoDepth(store);
    expect(actions.arrange('B').ok).toBe(true);
    const b = marking(current(store), 'B');
    expect(b.rect.height).toBeGreaterThan(40);
    // Snapped above the anchor with the height already adjusted, centered on it.
    expect(b.rect.y).toBe(target.y - b.rect.height);
    expect(b.rect.x).toBe(target.x + (target.width - b.rect.width) / 2);
    expect(undoDepth(store)).toBe(depth + 1);
    store.undo();
    expect(marking(current(store), 'B').rect).toEqual({
      x: 20,
      y: 20,
      width: 120,
      height: 40,
    });
  });
});

describe('dragging the anchor takes the anchored ones along', () => {
  it('in the preview and in the commit, in one undo entry', () => {
    const { store, actions } = setup(tipScene());
    actions.setMarkingAnchor('T', { to: 'B' });
    actions.snapToAnchor('T');
    const depth = undoDepth(store);
    expect(actions.beginGesture().ok).toBe(true);
    actions.previewMarkingMove('B', 30, 20);
    expect(marking(current(store), 'B').rect).toMatchObject({ x: 430, y: 320 });
    expect(marking(current(store), 'T').rect).toMatchObject({
      x: SNAPPED.x + 30,
      y: SNAPPED.y + 20,
    });
    expect(actions.finishMarkingMove('B', 30, 20).ok).toBe(true);
    actions.commitGesture();
    expect(marking(current(store), 'T').rect).toMatchObject({
      x: SNAPPED.x + 30,
      y: SNAPPED.y + 20,
    });
    expect(undoDepth(store)).toBe(depth + 1);
    store.undo();
    expect(marking(current(store), 'T').rect).toMatchObject(SNAPPED);
    expect(marking(current(store), 'B').rect).toEqual(BUTTON);
  });
});

describe('anchored addComponent (Palette)', () => {
  it('with `anchorTo` creates the instance anchored and already snapped, in one entry', () => {
    // pt-BR kept: shared fixture data (tooltipFixtures typeId) asserted by tests/model
    const { store, actions } = setup(addTip(tipProject(), 'B', 'botao', BUTTON));
    const result = actions.addComponent({
      containerId: 'I1',
      parentId: null,
      specId: TIP_SPEC_ID,
      typeId: 'tooltip',
      anchorTo: 'B',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const created = marking(current(store), result.value);
    expect(created.anchor).toMatchObject({ to: 'B' });
    expect(created.rect).toMatchObject({ ...SNAPPED, width: 100, height: 48 });
    expect(undoDepth(store)).toBe(1);
  });

  it('without `anchorTo` the current rule applies: no anchor, centered on the requested point', () => {
    // pt-BR kept: shared fixture data (tooltipFixtures typeId) asserted by tests/model
    const { store, actions } = setup(addTip(tipProject(), 'B', 'botao', BUTTON));
    const result = actions.addComponent({
      containerId: 'I1',
      parentId: null,
      specId: TIP_SPEC_ID,
      typeId: 'tooltip',
      center: { x: 500, y: 500 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const created = marking(current(store), result.value);
    expect(created.anchor ?? null).toBeNull();
    expect(created.rect).toMatchObject({ x: 450, y: 476 });
  });
});
