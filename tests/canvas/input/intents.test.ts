import { describe, expect, it } from 'vitest';
import {
  cursorFor,
  dragModeOf,
  hitChain,
  intentAt,
  isRepeatTap,
  tapSelection,
  type IntentContext,
} from '../../../src/canvas/input/intents';
import {
  createMarking,
  setArrowRoute,
  setArrowStyle,
  setImageLocked,
  setMarkingFloating,
  setMarkingLocked,
  type Project,
  type Rect,
} from '../../../src/model';
import type { SelectionItem } from '../../../src/store/ui';
import { visibleArrowShapes } from '../../../src/canvas/arrowGeometry';
import { arrowProject, withArrow } from '../../model/arrowFixtures';
import { canvasProject } from '../harness';

const project = canvasProject();

/**
 * `canvasProject` with a canvas marking C1 (-100, -100, 1800×1000) around I1
 * (0..1000 × 0..800) and I2 (1100..1600 × 0..500), a canvas marking C2 outside them
 * (2000..2200 × 100..300) and a floating N1 over M1 (400..600 × 400..500).
 */
function spatialProject(): Project {
  let p = createMarking(project, {
    id: 'C1',
    containerId: null,
    rect: { x: -100, y: -100, width: 1800, height: 1000 },
    name: 'Group',
  });
  p = createMarking(p, {
    id: 'C2',
    containerId: null,
    rect: { x: 2000, y: 100, width: 200, height: 200 },
  });
  return createMarking(p, {
    id: 'N1',
    containerId: null,
    rect: { x: 400, y: 400, width: 200, height: 100 },
    floating: true,
  });
}
const ctx = (overrides: Partial<IntentContext> = {}): IntentContext => ({
  project,
  readOnly: false,
  mode: 'navigate',
  selection: null,
  // Without an explicit `items`, the selection is just the primary (the one-item case).
  items: overrides.selection ? [overrides.selection] : [],
  zoom: 1,
  spaceDown: false,
  ...overrides,
});
const NONE = new Map();

describe('intentAt', () => {
  it('without a selection, dragging pans', () => {
    expect(intentAt(ctx(), { x: 150, y: 150 })).toEqual({ kind: 'pan' });
  });

  it('selected marking: handle resizes, inside moves, outside pans', () => {
    const c = ctx({ selection: { kind: 'marking', id: 'M1' } });
    expect(intentAt(c, { x: 102, y: 98 })).toEqual({
      kind: 'resize-marking',
      markingId: 'M1',
      corner: 'nw',
    });
    expect(intentAt(c, { x: 400, y: 400 })).toEqual({
      kind: 'move-marking',
      markingId: 'M1',
    });
    expect(intentAt(c, { x: 900, y: 700 })).toEqual({ kind: 'pan' });
  });

  it('selected image: 44 screen px handle, independent of the zoom', () => {
    const c = ctx({ selection: { kind: 'image', id: 'I2' }, zoom: 2 });
    // 10 canvas units = 20 screen px from the corner: within the radius of 22.
    expect(intentAt(c, { x: 1610, y: 510 })).toEqual({
      kind: 'resize-image',
      containerId: 'I2',
      corner: 'se',
    });
    expect(intentAt(c, { x: 1300, y: 300 })).toEqual({
      kind: 'move-image',
      containerId: 'I2',
    });
  });

  it('Draw mode: over an image draws attached to it (even on the handles); on empty space, draws on the canvas', () => {
    const c = ctx({ mode: 'draw', selection: { kind: 'marking', id: 'M1' } });
    expect(intentAt(c, { x: 100, y: 100 })).toEqual({ kind: 'draw', containerId: 'I1' });
    expect(intentAt(c, { x: 1050, y: 100 })).toEqual({ kind: 'draw', containerId: null });
  });

  it('Draw mode: pan only with Space (the middle button and the wheel belong to the pointer)', () => {
    const c = ctx({ mode: 'draw', spaceDown: true });
    expect(intentAt(c, { x: 1050, y: 100 })).toEqual({ kind: 'pan' });
    expect(intentAt(c, { x: 100, y: 100 })).toEqual({ kind: 'pan' });
  });

  it('selected canvas marking: handles and move through its space (identity)', () => {
    const p = spatialProject();
    const c = ctx({ project: p, selection: { kind: 'marking', id: 'C2' } });
    expect(intentAt(c, { x: 2002, y: 102 })).toEqual({
      kind: 'resize-marking',
      markingId: 'C2',
      corner: 'nw',
    });
    expect(intentAt(c, { x: 2100, y: 200 })).toEqual({
      kind: 'move-marking',
      markingId: 'C2',
    });
    expect(intentAt(c, { x: 1900, y: 200 })).toEqual({ kind: 'pan' });
  });

  it('selected container marking uses the container space (different scale)', () => {
    // I2 at scale 0.5: M3 (50, 50, 200×200) takes up 1125..1225 × 25..125 on the canvas.
    const scaled = canvasProject();
    const moved = {
      ...scaled,
      containers: scaled.containers.map((i) =>
        i.id === 'I2' ? { ...i, placement: { x: 1100, y: 0, scale: 0.5 } } : i,
      ),
    };
    const c = ctx({ project: moved, selection: { kind: 'marking', id: 'M3' } });
    expect(intentAt(c, { x: 1175, y: 75 })).toEqual({
      kind: 'move-marking',
      markingId: 'M3',
    });
    expect(intentAt(c, { x: 1300, y: 200 })).toEqual({ kind: 'pan' });
  });

  it('Space, read-only or without a project: always pan', () => {
    const selection = { kind: 'marking', id: 'M1' } as const;
    const inside = { x: 400, y: 400 };
    expect(intentAt(ctx({ selection, spaceDown: true }), inside)).toEqual({
      kind: 'pan',
    });
    expect(intentAt(ctx({ selection, readOnly: true }), inside)).toEqual({ kind: 'pan' });
    expect(intentAt(ctx({ project: null }), inside)).toEqual({ kind: 'pan' });
  });
});

describe('tapSelection', () => {
  it('selects the innermost; tapping again goes up to the parent; outside, the image', () => {
    const p = { x: 250, y: 250 };
    const first = tapSelection(project, null, NONE, p, false);
    expect(first).toEqual({ kind: 'marking', id: 'M2' });
    const second = tapSelection(project, first, NONE, p, true);
    expect(second).toEqual({ kind: 'marking', id: 'M1' });
    // After the root, the container; after it, back to the innermost.
    const third = tapSelection(project, second, NONE, p, true);
    expect(third).toEqual({ kind: 'image', id: 'I1' });
    expect(tapSelection(project, third, NONE, p, true)).toEqual({
      kind: 'marking',
      id: 'M2',
    });
    expect(tapSelection(project, second, NONE, { x: 900, y: 700 }, false)).toEqual({
      kind: 'image',
      id: 'I1',
    });
  });

  it('outside the images and without a canvas marking (or without a project), clears the selection', () => {
    const selection = { kind: 'image', id: 'I1' } as const;
    expect(tapSelection(project, selection, NONE, { x: 1050, y: 0 }, false)).toBeNull();
    expect(tapSelection(null, selection, NONE, { x: 250, y: 250 }, false)).toBeNull();
  });
});

describe('container name label', () => {
  const titles: ReadonlyMap<string, Rect> = new Map([
    ['I1', { x: 0, y: -20, width: 100, height: 16 }],
  ]);
  const onTitle = { x: 50, y: -10 };

  it('enters the tap chain; without the labels, the point reaches nothing', () => {
    expect(hitChain(project, NONE, onTitle, undefined, titles)).toEqual([
      { kind: 'image', id: 'I1' },
    ]);
    expect(hitChain(project, NONE, onTitle)).toEqual([]);
    expect(tapSelection(project, null, NONE, onTitle, false, undefined, titles)).toEqual({
      kind: 'image',
      id: 'I1',
    });
  });

  it('includes the canvas markings that contain the container', () => {
    const p = spatialProject();
    const chain = hitChain(p, NONE, onTitle, undefined, titles);
    expect(chain.slice(0, 2)).toEqual([
      { kind: 'image', id: 'I1' },
      { kind: 'marking', id: 'C1' },
    ]);
  });

  it('dragging by the selected container label moves it; locked, locked; not selected, pan', () => {
    const selection = { kind: 'image', id: 'I1' } as const;
    expect(intentAt(ctx({ selection, titles }), onTitle)).toEqual({
      kind: 'move-image',
      containerId: 'I1',
    });
    expect(intentAt(ctx({ selection }), onTitle)).toEqual({ kind: 'pan' });
    expect(intentAt(ctx({ titles }), onTitle)).toEqual({ kind: 'pan' });
    expect(
      intentAt(
        ctx({ project: setImageLocked(project, 'I1', true), selection, titles }),
        onTitle,
      ),
    ).toEqual({ kind: 'locked' });
  });

  it('multiple selection: the label of a selected container counts as inside', () => {
    const items: SelectionItem[] = [
      { kind: 'marking', id: 'C2' },
      { kind: 'image', id: 'I1' },
    ];
    const c = ctx({
      project: spatialProject(),
      items,
      selection: items[1] ?? null,
      titles,
    });
    expect(intentAt(c, onTitle)).toEqual({ kind: 'move-items', items });
    expect(intentAt({ ...c, titles: undefined }, onTitle)).toEqual({ kind: 'pan' });
  });
});

describe('tapSelection with canvas markings and floating ones', () => {
  const p = spatialProject();
  const tap = (
    point: { x: number; y: number },
    selection = null as never,
    repeat = false,
  ) => tapSelection(p, selection, NONE, point, repeat);

  it('inside a container: the marking, the ancestors, the container and the canvas markings that contain it', () => {
    const at = { x: 250, y: 250 };
    const chain = [
      { kind: 'marking', id: 'M2' },
      { kind: 'marking', id: 'M1' },
      { kind: 'image', id: 'I1' },
      { kind: 'marking', id: 'C1' },
    ] as const;
    let current = tap(at);
    expect(current).toEqual(chain[0]);
    for (const next of [chain[1], chain[2], chain[3], chain[0]]) {
      current = tapSelection(p, current, NONE, at, true);
      expect(current).toEqual(next);
    }
  });

  it('outside the containers: the canvas marking under the point', () => {
    // Between I1 and I2 (1000..1100), still inside C1.
    expect(tap({ x: 1050, y: 300 })).toEqual({ kind: 'marking', id: 'C1' });
    // Far from C1, the canvas marking C2.
    expect(tap({ x: 2100, y: 200 })).toEqual({ kind: 'marking', id: 'C2' });
    // In truly empty space, nothing.
    expect(tap({ x: 1900, y: 900 })).toBeNull();
  });

  it('the floating one is the first to receive the tap wherever it is; tapping again goes down to what is underneath', () => {
    const at = { x: 450, y: 450 }; // N1 is over M1, inside I1 and C1
    let current = tap(at);
    expect(current).toEqual({ kind: 'marking', id: 'N1' });
    current = tapSelection(p, current, NONE, at, true);
    expect(current).toEqual({ kind: 'marking', id: 'M1' });
    current = tapSelection(p, current, NONE, at, true);
    expect(current).toEqual({ kind: 'image', id: 'I1' });
    current = tapSelection(p, current, NONE, at, true);
    expect(current).toEqual({ kind: 'marking', id: 'C1' });
    current = tapSelection(p, current, NONE, at, true);
    expect(current).toEqual({ kind: 'marking', id: 'N1' });
  });

  it('the floating one outside any container also receives the tap', () => {
    const floating = setMarkingFloating(p, 'C2', true);
    expect(tapSelection(floating, null, NONE, { x: 2100, y: 200 }, false)).toEqual({
      kind: 'marking',
      id: 'C2',
    });
  });

  it('markings hidden by visibility do not receive the tap', () => {
    const hidden = new Map([['N1', 'hidden' as const]]);
    expect(tapSelection(p, null, hidden, { x: 450, y: 450 }, false)).toEqual({
      kind: 'marking',
      id: 'M1',
    });
    const hiddenParent = new Map([['C1', 'hidden' as const]]);
    expect(tapSelection(p, null, hiddenParent, { x: 1050, y: 300 }, false)).toBeNull();
  });

  it('the tap falls on the canvas markings overlapping the container, at the end of the chain', () => {
    // C3 crosses I2 by the right edge (1500..1800): overlapping, without being the container parent.
    const q = createMarking(p, {
      id: 'C3',
      containerId: null,
      rect: { x: 1500, y: 100, width: 300, height: 200 },
    });
    expect(q.containers.find((i) => i.id === 'I2')?.parentId).toBe('C1');
    const at = { x: 1550, y: 150 };
    const first = tapSelection(q, null, NONE, at, false);
    expect(first).toEqual({ kind: 'image', id: 'I2' });
    const chain: string[] = [];
    let current = first;
    for (let i = 0; i < 4; i++) {
      current = tapSelection(q, current, NONE, at, true);
      chain.push(current ? `${current.kind}:${current.id}` : 'nothing');
    }
    expect(chain).toEqual(['marking:C1', 'marking:C3', 'image:I2', 'marking:C1']);
  });
});

describe('isRepeatTap', () => {
  it('near the previous one in screen px (12 px)', () => {
    expect(isRepeatTap(null, { x: 0, y: 0 }, 1)).toBe(false);
    expect(isRepeatTap({ x: 0, y: 0 }, { x: 10, y: 0 }, 1)).toBe(true);
    expect(isRepeatTap({ x: 0, y: 0 }, { x: 10, y: 0 }, 2)).toBe(false);
  });
});

describe('dragModeOf and cursorFor', () => {
  it('classify the intent', () => {
    expect(dragModeOf({ kind: 'pan' })).toBe('pan');
    expect(dragModeOf({ kind: 'draw', containerId: 'I1' })).toBe('draw');
    expect(dragModeOf({ kind: 'draw', containerId: null })).toBe('draw');
    expect(dragModeOf({ kind: 'move-image', containerId: 'I1' })).toBe('move');
    expect(dragModeOf({ kind: 'resize-marking', markingId: 'M1', corner: 'ne' })).toBe(
      'resize',
    );
    expect(cursorFor({ kind: 'pan' })).toBe('');
    expect(cursorFor({ kind: 'move-marking', markingId: 'M1' })).toBe('move');
    expect(cursorFor({ kind: 'resize-image', containerId: 'I1', corner: 'se' })).toBe(
      'nwse-resize',
    );
    expect(cursorFor({ kind: 'resize-image', containerId: 'I1', corner: 'ne' })).toBe(
      'nesw-resize',
    );
    expect(cursorFor({ kind: 'draw', containerId: 'I1' })).toBe('crosshair');
    expect(cursorFor({ kind: 'draw', containerId: null })).toBe('crosshair');
  });
});

describe('lock (stage 2.5)', () => {
  const lockedMarking = (id: string) => setMarkingLocked(project, id, true);
  const select = (id: string) => ({ kind: 'marking', id }) as const;

  it('selected and locked marking: no handles, and dragging inside it is "locked"', () => {
    const c = ctx({ project: lockedMarking('M1'), selection: select('M1') });
    // The corner where the handle would be is also just "locked".
    expect(intentAt(c, { x: 102, y: 102 })).toEqual({ kind: 'locked' });
    expect(intentAt(c, { x: 400, y: 400 })).toEqual({ kind: 'locked' });
    expect(intentAt(c, { x: 900, y: 700 })).toEqual({ kind: 'pan' });
  });

  it('descendant of a locked parent also has no handles', () => {
    const c = ctx({ project: lockedMarking('M1'), selection: select('M2') });
    expect(intentAt(c, { x: 202, y: 202 })).toEqual({ kind: 'locked' });
  });

  it('parent with a locked descendant: resizes and moves normally', () => {
    const c = ctx({ project: lockedMarking('M2'), selection: select('M1') });
    expect(intentAt(c, { x: 102, y: 98 })).toMatchObject({ kind: 'resize-marking' });
    expect(intentAt(c, { x: 500, y: 450 })).toEqual({
      kind: 'move-marking',
      markingId: 'M1',
    });
  });

  it('selected and locked image: no handles and no move', () => {
    const c = ctx({
      project: setImageLocked(project, 'I2', true),
      selection: { kind: 'image', id: 'I2' },
    });
    expect(intentAt(c, { x: 1600, y: 500 })).toEqual({ kind: 'locked' });
    expect(intentAt(c, { x: 1300, y: 300 })).toEqual({ kind: 'locked' });
    expect(intentAt(c, { x: 1050, y: 300 })).toEqual({ kind: 'pan' });
  });

  it('Draw mode is not affected by the lock', () => {
    const c = ctx({
      project: lockedMarking('M1'),
      mode: 'draw',
      selection: select('M1'),
    });
    expect(intentAt(c, { x: 400, y: 400 })).toEqual({ kind: 'draw', containerId: 'I1' });
  });

  it('container inside a locked canvas marking: no handles and no move (inherited lock)', () => {
    const locked = setMarkingLocked(spatialProject(), 'C1', true);
    const c = ctx({ project: locked, selection: { kind: 'image', id: 'I2' } });
    expect(intentAt(c, { x: 1600, y: 500 })).toEqual({ kind: 'locked' });
    expect(intentAt(c, { x: 1300, y: 300 })).toEqual({ kind: 'locked' });
    expect(intentAt(c, { x: 1050, y: 300 })).toEqual({ kind: 'pan' });
    // A container outside the locked marking stays free.
    const free = ctx({
      project: setMarkingLocked(spatialProject(), 'C2', true),
      selection: { kind: 'image', id: 'I2' },
    });
    expect(intentAt(free, { x: 1300, y: 300 })).toEqual({
      kind: 'move-image',
      containerId: 'I2',
    });
  });

  it('locked canvas marking: no handles; the floating ones and whoever is not a descendant stay free', () => {
    const locked = setMarkingLocked(spatialProject(), 'C2', true);
    const c = ctx({ project: locked, selection: { kind: 'marking', id: 'C2' } });
    expect(intentAt(c, { x: 2002, y: 102 })).toEqual({ kind: 'locked' });
    const other = ctx({ project: locked, selection: { kind: 'marking', id: 'N1' } });
    expect(intentAt(other, { x: 500, y: 450 })).toEqual({
      kind: 'move-marking',
      markingId: 'N1',
    });
  });

  it('"not allowed" cursor and dragging would try to move', () => {
    expect(cursorFor({ kind: 'locked' })).toBe('not-allowed');
    expect(dragModeOf({ kind: 'locked' })).toBe('move');
  });

  it('tapping still selects the locked item', () => {
    const p = lockedMarking('M2');
    expect(tapSelection(p, null, NONE, { x: 250, y: 250 }, false)).toEqual({
      kind: 'marking',
      id: 'M2',
    });
  });
});

// Multiple selection (Spatial markings stage, ME2): the handles stay only on the primary and
// dragging inside any selected item moves the whole selection.
describe('intentAt: multiple selection', () => {
  const p = spatialProject();
  const mk = (id: string): SelectionItem => ({ kind: 'marking', id });
  const im = (id: string): SelectionItem => ({ kind: 'image', id });
  /** The primary is the last of the items, as in `selectedItems`. */
  const multi = (
    items: readonly SelectionItem[],
    overrides: Partial<IntentContext> = {},
  ) => ctx({ project: p, items, selection: items.at(-1) ?? null, ...overrides });

  it('inside any selected item (container or marking) starts the joint drag', () => {
    const items = [im('I2'), mk('C2'), mk('M2')];
    const c = multi(items);
    const expected = { kind: 'move-items', items };
    expect(intentAt(c, { x: 1300, y: 300 })).toEqual(expected); // inside I2
    expect(intentAt(c, { x: 2100, y: 200 })).toEqual(expected); // inside C2
    expect(intentAt(c, { x: 250, y: 250 })).toEqual(expected); // inside M2 (the primary)
  });

  it('outside all selected items, pan', () => {
    const c = multi([im('I2'), mk('M2')]);
    expect(intentAt(c, { x: 900, y: 700 })).toEqual({ kind: 'pan' }); // I1, not selected
    expect(intentAt(c, { x: 1050, y: 300 })).toEqual({ kind: 'pan' }); // between the screens
  });

  it('the handles belong only to the primary: the ones of the other items move the selection', () => {
    const c = multi([im('I2'), mk('M2')]);
    // SE corner of M2 (the primary): resizes M2.
    expect(intentAt(c, { x: 300, y: 300 })).toEqual({
      kind: 'resize-marking',
      markingId: 'M2',
      corner: 'se',
    });
    // SE corner of I2 (secondary): it is just "inside a selected item".
    expect(intentAt(c, { x: 1598, y: 498 })).toMatchObject({ kind: 'move-items' });
  });

  it('the primary can be a container: its handles resize', () => {
    const c = multi([mk('C2'), im('I2')]);
    expect(intentAt(c, { x: 1600, y: 500 })).toEqual({
      kind: 'resize-image',
      containerId: 'I2',
      corner: 'se',
    });
    expect(intentAt(c, { x: 2002, y: 102 })).toMatchObject({ kind: 'move-items' });
  });

  it('some locked item blocks the whole drag ("not allowed" cursor)', () => {
    const locked = setImageLocked(p, 'I2', true);
    const c = multi([im('I2'), mk('C2')], { project: locked });
    expect(intentAt(c, { x: 1300, y: 300 })).toEqual({ kind: 'locked' }); // over the locked one
    expect(intentAt(c, { x: 2100, y: 200 })).toEqual({ kind: 'locked' }); // over the free one
    expect(intentAt(c, { x: 900, y: 700 })).toEqual({ kind: 'pan' }); // outside all
  });

  it('the locked primary has no handles, but the joint drag stays blocked', () => {
    const locked = setMarkingLocked(p, 'C2', true);
    const c = multi([im('I2'), mk('C2')], { project: locked });
    expect(intentAt(c, { x: 2002, y: 102 })).toEqual({ kind: 'locked' });
  });

  it('a marking hidden by the display mode does not count as "inside", but moves with the selection', () => {
    const items = [mk('M2'), im('I2')];
    const visibility = new Map([['M2', 'hidden' as const]]);
    const c = multi(items, { visibility });
    expect(intentAt(c, { x: 250, y: 250 })).toEqual({ kind: 'pan' });
    expect(intentAt(c, { x: 1300, y: 300 })).toEqual({ kind: 'move-items', items });
  });

  it('only one item (or none): nothing changes, the primary applies', () => {
    const one = multi([mk('M1')]);
    expect(intentAt(one, { x: 400, y: 400 })).toEqual({
      kind: 'move-marking',
      markingId: 'M1',
    });
    expect(intentAt(multi([]), { x: 400, y: 400 })).toEqual({ kind: 'pan' });
  });

  it('Draw mode, Space and read-only ignore the multiple selection', () => {
    const items = [im('I2'), mk('M2')];
    expect(intentAt(multi(items, { mode: 'draw' }), { x: 1300, y: 300 })).toEqual({
      kind: 'draw',
      containerId: 'I2',
    });
    expect(intentAt(multi(items, { spaceDown: true }), { x: 1300, y: 300 })).toEqual({
      kind: 'pan',
    });
    expect(intentAt(multi(items, { readOnly: true }), { x: 1300, y: 300 })).toEqual({
      kind: 'pan',
    });
  });

  it('the joint drag is a "move": move cursor and gesture classification', () => {
    const intent = { kind: 'move-items', items: [im('I1'), mk('M1')] } as const;
    expect(cursorFor(intent)).toBe('move');
    expect(dragModeOf(intent)).toBe('move');
  });
});

// Arrows (ME4): the tap picks the stroke (between the floating ones and the rest) and the selected arrow has
// handles; the selected marking has the link handle.
describe('arrows on tap and on handles', () => {
  const base = (): Project => setArrowStyle(arrowProject(), 'r1', 'straight');
  const arrowCtx = (p: Project, overrides: Partial<IntentContext> = {}): IntentContext =>
    ctx({
      project: p,
      arrows: visibleArrowShapes(p, NONE),
      ...overrides,
    });
  // straight r1: from (400,250) to (600,700); the middle (500,475).
  const ON_STROKE = { x: 500, y: 475 };
  const arrowHit = (p: Project) => ({ shapes: visibleArrowShapes(p, NONE), zoom: 1 });

  it('the tap near the stroke selects the arrow, above the container and the markings', () => {
    const p = base();
    expect(hitChain(p, NONE, ON_STROKE)[0]).toEqual({ kind: 'image', id: 'A' });
    expect(hitChain(p, NONE, ON_STROKE, arrowHit(p))[0]).toEqual({
      kind: 'arrow',
      id: 'r1',
    });
    expect(tapSelection(p, null, NONE, ON_STROKE, false, arrowHit(p))).toEqual({
      kind: 'arrow',
      id: 'r1',
    });
    // Far from the stroke (more than 7 screen px), the tap goes to the container.
    expect(tapSelection(p, null, NONE, { x: 520, y: 475 }, false, arrowHit(p))).toEqual({
      kind: 'image',
      id: 'A',
    });
  });

  it('the floating one gets its turn before the arrow; clicking again goes up the chain', () => {
    const p = createMarking(base(), {
      id: 'F1',
      containerId: null,
      rect: { x: 450, y: 425, width: 100, height: 100 },
      floating: true,
    });
    const chain = hitChain(p, NONE, ON_STROKE, arrowHit(p));
    expect(chain.slice(0, 2)).toEqual([
      { kind: 'marking', id: 'F1' },
      { kind: 'arrow', id: 'r1' },
    ]);
    const q = base();
    const first = tapSelection(q, null, NONE, ON_STROKE, false, arrowHit(q));
    expect(tapSelection(q, first, NONE, ON_STROKE, true, arrowHit(q))).not.toEqual(first);
  });

  it('arrow with a hidden end or without `arrows` in the context does not receive the tap', () => {
    const p = base();
    const hidden = new Map([['a3', 'hidden' as const]]);
    expect(
      hitChain(p, hidden, ON_STROKE, {
        shapes: visibleArrowShapes(p, hidden),
        zoom: 1,
      }).some((item) => item.kind === 'arrow'),
    ).toBe(false);
    expect(hitChain(p, NONE, ON_STROKE).some((item) => item.kind === 'arrow')).toBe(
      false,
    );
  });

  it('selected arrow: the ends, the waypoints and the middle of the segment are handles', () => {
    const p = setArrowRoute(base(), 'r1', [{ x: 700, y: 300 }]);
    const context = arrowCtx(p, { selection: { kind: 'arrow', id: 'r1' } });
    expect(intentAt(context, { x: 402, y: 251 })).toMatchObject({
      kind: 'arrow-handle',
      arrowId: 'r1',
      handle: { kind: 'end', end: 'from' },
    });
    expect(intentAt(context, { x: 700, y: 598 })).toMatchObject({
      handle: { kind: 'end', end: 'to' },
    });
    expect(intentAt(context, { x: 701, y: 301 })).toMatchObject({
      handle: { kind: 'point', index: 0 },
    });
    expect(intentAt(context, { x: 550, y: 276 })).toMatchObject({
      handle: { kind: 'mid', index: 0 },
    });
    // Outside the handles, dragging the arrow pans.
    expect(intentAt(context, { x: 560, y: 285 })).toEqual({ kind: 'pan' });
  });

  it('selected elbow arrow: the ends and the middle segment (whole) are handles', () => {
    const p = setArrowStyle(base(), 'r1', 'elbow');
    // r1 as an elbow: (400,250) → (500,250) → (500,700) → (600,700).
    const context = arrowCtx(p, { selection: { kind: 'arrow', id: 'r1' } });
    expect(intentAt(context, { x: 402, y: 251 })).toMatchObject({
      handle: { kind: 'end', end: 'from' },
    });
    expect(intentAt(context, { x: 500, y: 475 })).toEqual({
      kind: 'arrow-handle',
      arrowId: 'r1',
      handle: { kind: 'segment', index: 0, axis: 'x', at: { x: 500, y: 475 } },
    });
    expect(intentAt(context, { x: 497, y: 320 })).toMatchObject({
      handle: { kind: 'segment', index: 0 },
    });
    // The first segment is not a middle segment: dragging there pans.
    expect(intentAt(context, { x: 450, y: 250 })).toEqual({ kind: 'pan' });
    expect(cursorFor(intentAt(context, { x: 500, y: 475 }))).toBe('ew-resize');
  });

  it('locked arrow: dragging the stroke is `locked`, without handles; outside the stroke, pan', () => {
    const p = withArrow(base(), 'r2', 'a3', 'b2', { locked: true });
    const context = arrowCtx(p, { selection: { kind: 'arrow', id: 'r2' } });
    // r2 leaves a3 (800,700) wherever the curve leaves; the anchor is over the stroke.
    expect(intentAt(context, { x: 800, y: 700 })).toEqual({ kind: 'locked' });
    expect(intentAt(context, { x: 0, y: 0 })).toEqual({ kind: 'pan' });
  });

  it('read-only, Draw, space and Clean view (without `arrows`): no handles', () => {
    const p = base();
    const select = { selection: { kind: 'arrow', id: 'r1' } } as const;
    expect(
      intentAt(arrowCtx(p, { ...select, readOnly: true }), { x: 400, y: 250 }),
    ).toEqual({
      kind: 'pan',
    });
    expect(
      intentAt(arrowCtx(p, { ...select, mode: 'draw' }), { x: 400, y: 250 }).kind,
    ).toBe('draw');
    expect(
      intentAt(arrowCtx(p, { ...select, spaceDown: true }), { x: 400, y: 250 }),
    ).toEqual({
      kind: 'pan',
    });
    expect(intentAt(ctx({ project: p, ...select }), { x: 400, y: 250 })).toEqual({
      kind: 'pan',
    });
  });

  it('with several items, the primary arrow handles still apply', () => {
    const p = base();
    const items: SelectionItem[] = [
      { kind: 'marking', id: 'a3' },
      { kind: 'arrow', id: 'r1' },
    ];
    const context = arrowCtx(p, { selection: { kind: 'arrow', id: 'r1' }, items });
    expect(intentAt(context, { x: 402, y: 251 })).toMatchObject({ kind: 'arrow-handle' });
    // Outside the handle, inside a3 (selected): joint drag (the arrow does not move).
    expect(intentAt(context, { x: 700, y: 650 }).kind).toBe('move-items');
  });

  it('selected marking: the link handle creates an arrow, also when locked', () => {
    const p = base();
    // a1 (100,100,300,300): the handle at (414, 250).
    const context = arrowCtx(p, { selection: { kind: 'marking', id: 'a1' } });
    expect(intentAt(context, { x: 414, y: 250 })).toEqual({
      kind: 'arrow-link',
      markingId: 'a1',
    });
    expect(intentAt(context, { x: 416, y: 254 })).toMatchObject({ kind: 'arrow-link' });
    // Inside the marking it is still move.
    expect(intentAt(context, { x: 250, y: 250 }).kind).toBe('move-marking');
    const locked = setMarkingLocked(p, 'a1', true);
    expect(
      intentAt(arrowCtx(locked, { selection: { kind: 'marking', id: 'a1' } }), {
        x: 414,
        y: 250,
      }),
    ).toEqual({ kind: 'arrow-link', markingId: 'a1' });
    // Read-only and Draw: no handle.
    expect(
      intentAt(
        arrowCtx(p, { selection: { kind: 'marking', id: 'a1' }, readOnly: true }),
        {
          x: 414,
          y: 250,
        },
      ),
    ).toEqual({ kind: 'pan' });
    // With several items, there is no link handle.
    const many: SelectionItem[] = [
      { kind: 'marking', id: 'a1' },
      { kind: 'marking', id: 'a3' },
    ];
    expect(
      intentAt(arrowCtx(p, { selection: many[0] as SelectionItem, items: many }), {
        x: 414,
        y: 250,
      }).kind,
    ).not.toBe('arrow-link');
  });

  it('cursor and drag mode of the arrow intents', () => {
    const link = { kind: 'arrow-link', markingId: 'a1' } as const;
    const end = {
      kind: 'arrow-handle',
      arrowId: 'r1',
      handle: { kind: 'end', end: 'to', at: { x: 0, y: 0 } },
    } as const;
    const point = {
      kind: 'arrow-handle',
      arrowId: 'r1',
      handle: { kind: 'point', index: 0, at: { x: 0, y: 0 } },
    } as const;
    expect(cursorFor(link)).toBe('crosshair');
    expect(cursorFor(end)).toBe('crosshair');
    expect(cursorFor(point)).toBe('move');
    expect(cursorFor({ kind: 'locked' })).toBe('not-allowed');
    expect(dragModeOf(link)).toBe('resize');
    expect(dragModeOf(point)).toBe('resize');
  });
});

// Rectangle selection (SM2): with Shift (`rectSelect`) the drag that would pan or draw becomes
// the rectangle; over the selected item and the handles it stays as it was.
describe('intentAt: rectangle selection (rectSelect)', () => {
  const RECT = { kind: 'select-rect' } as const;
  const rc = (overrides: Partial<IntentContext> = {}) =>
    ctx({ rectSelect: true, ...overrides });

  it('Navigate: the background and the unselected item become a rectangle', () => {
    expect(intentAt(rc(), { x: 150, y: 150 })).toEqual(RECT);
    expect(intentAt(rc(), { x: 5000, y: 5000 })).toEqual(RECT);
    const c = rc({ selection: { kind: 'marking', id: 'M1' } });
    expect(intentAt(c, { x: 1300, y: 300 })).toEqual(RECT); // inside I2, not selected
    expect(intentAt(c, { x: 900, y: 700 })).toEqual(RECT); // outside the selected one
  });

  it('without Shift (rectSelect off) nothing changes', () => {
    expect(intentAt(ctx(), { x: 150, y: 150 })).toEqual({ kind: 'pan' });
    expect(intentAt(ctx({ rectSelect: false }), { x: 150, y: 150 })).toEqual({
      kind: 'pan',
    });
  });

  it('over the selected item or its handle it stays move and resize', () => {
    const c = rc({ selection: { kind: 'marking', id: 'M1' } });
    expect(intentAt(c, { x: 400, y: 400 })).toEqual({
      kind: 'move-marking',
      markingId: 'M1',
    });
    expect(intentAt(c, { x: 102, y: 98 })).toMatchObject({ kind: 'resize-marking' });
    const image = rc({ selection: { kind: 'image', id: 'I2' } });
    expect(intentAt(image, { x: 1300, y: 300 })).toMatchObject({ kind: 'move-image' });
    const items: SelectionItem[] = [
      { kind: 'image', id: 'I2' },
      { kind: 'marking', id: 'M2' },
    ];
    const multi = rc({ items, selection: items[1] ?? null });
    expect(intentAt(multi, { x: 1300, y: 300 })).toEqual({ kind: 'move-items', items });
  });

  it('selected locked item stays not-allowed', () => {
    const locked = setImageLocked(project, 'I2', true);
    const c = rc({ project: locked, selection: { kind: 'image', id: 'I2' } });
    expect(intentAt(c, { x: 1300, y: 300 })).toEqual({ kind: 'locked' });
  });

  it('arrow handles stay (arrow-handle and arrow-link)', () => {
    const p = setArrowStyle(arrowProject(), 'r1', 'straight');
    const arrows = visibleArrowShapes(p, NONE);
    const onArrow = rc({
      project: p,
      arrows,
      selection: { kind: 'arrow', id: 'r1' },
    });
    expect(intentAt(onArrow, { x: 402, y: 251 })).toMatchObject({ kind: 'arrow-handle' });
    const onMarking = rc({
      project: p,
      arrows,
      selection: { kind: 'marking', id: 'a1' },
    });
    expect(intentAt(onMarking, { x: 414, y: 250 })).toMatchObject({ kind: 'arrow-link' });
  });

  it('Draw: any point becomes a rectangle, not a marking', () => {
    expect(intentAt(rc({ mode: 'draw' }), { x: 150, y: 150 })).toEqual(RECT);
    expect(intentAt(rc({ mode: 'draw' }), { x: 5000, y: 5000 })).toEqual(RECT);
    expect(intentAt(ctx({ mode: 'draw' }), { x: 150, y: 150 }).kind).toBe('draw');
  });

  it('Space pans and so does no project', () => {
    expect(intentAt(rc({ spaceDown: true }), { x: 150, y: 150 })).toEqual({
      kind: 'pan',
    });
    expect(intentAt(rc({ project: null }), { x: 150, y: 150 })).toEqual({ kind: 'pan' });
  });

  it('read-only: the rectangle applies (the selection does not change the project)', () => {
    expect(intentAt(rc({ readOnly: true }), { x: 150, y: 150 })).toEqual(RECT);
    expect(intentAt(rc({ readOnly: true, mode: 'draw' }), { x: 150, y: 150 })).toEqual(
      RECT,
    );
    expect(intentAt(ctx({ readOnly: true }), { x: 150, y: 150 })).toEqual({
      kind: 'pan',
    });
  });

  it('cursor crosshair and the drag mode is "select"', () => {
    expect(cursorFor(RECT)).toBe('crosshair');
    expect(dragModeOf(RECT)).toBe('select');
  });
});
