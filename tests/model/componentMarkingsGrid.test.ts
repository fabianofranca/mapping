// The new child goes into the next free cell of a grid slot (decision 15 of #1078).
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  arrangeMarking,
  setFieldValue,
  setProjectDirection,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import { SPEC_ID, componentProject } from './componentFixtures';
import { gridCatalog } from './gridFixtures';
import { expectValid, marking } from './fixtures';

function add(
  p: Project,
  catalog: ComponentCatalog,
  id: string,
  typeId: string,
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
      ...extra,
    },
    approximateMeasurer,
  );
}

const rectOf = (p: Project, id: string): Rect => marking(p, id).rect;
const container = (catalog: ComponentCatalog, rect: Rect) =>
  add(componentProject(), catalog, 'C', 'row', { rect });
const kid = (p: Project, catalog: ComponentCatalog, n: number, rect?: Rect) =>
  add(p, catalog, `T${n}`, 'text', { parentId: 'C', ...(rect ? { rect } : {}) });

describe('componentPlacement in a grid slot', () => {
  it('the first child goes into the first cell and the following ones into the next ones', () => {
    const catalog = gridCatalog('row', { columns: 3 });
    let p = container(catalog, { x: 100, y: 100, width: 340, height: 300 });
    for (const n of [1, 2, 3, 4]) p = kid(p, catalog, n);
    // track (340 - 16) / 3 = 108; step 116; children of 100 × 40.
    expect(rectOf(p, 'T1')).toEqual({ x: 100, y: 100, width: 100, height: 40 });
    expect(rectOf(p, 'T2')).toEqual({ x: 216, y: 100, width: 100, height: 40 });
    expect(rectOf(p, 'T3')).toEqual({ x: 332, y: 100, width: 100, height: 40 });
    expect(rectOf(p, 'T4')).toEqual({ x: 100, y: 140, width: 100, height: 40 });
    expectValid(p);
  });

  it('with the slot padding and lineGap', () => {
    const catalog = gridCatalog('row', { columns: 2, lineGap: 6 });
    let p = container(catalog, { x: 100, y: 100, width: 300, height: 300 });
    p = setFieldValue(p, 'A_C', 'padding', 4);
    for (const n of [1, 2, 3]) p = kid(p, catalog, n);
    // content 292, track (292 - 8) / 2 = 142, step 150.
    expect(rectOf(p, 'T2')).toEqual({ x: 254, y: 104, width: 100, height: 40 });
    expect(rectOf(p, 'T3')).toEqual({ x: 104, y: 150, width: 100, height: 40 });
  });

  it('a free cell in the middle comes before the end', () => {
    const catalog = gridCatalog('row', { columns: 3 });
    let p = container(catalog, { x: 100, y: 100, width: 340, height: 300 });
    p = kid(p, catalog, 1, { x: 100, y: 100, width: 100, height: 40 });
    p = kid(p, catalog, 2, { x: 332, y: 100, width: 100, height: 40 });
    p = kid(p, catalog, 3);
    expect(rectOf(p, 'T3')).toEqual({ x: 216, y: 100, width: 100, height: 40 });
  });

  it('with Arrange already done, the new one goes into the cell after the last one', () => {
    const catalog = gridCatalog('row', { columns: 3, lineGap: 4 });
    let p = container(catalog, { x: 100, y: 100, width: 340, height: 300 });
    for (const n of [1, 2, 3, 4]) p = kid(p, catalog, n);
    p = arrangeMarking(p, catalog, 'C', approximateMeasurer).project;
    p = kid(p, catalog, 5);
    expect(rectOf(p, 'T4')).toEqual({ x: 100, y: 144, width: 100, height: 40 });
    expect(rectOf(p, 'T5')).toEqual({ x: 216, y: 144, width: 100, height: 40 });
  });

  it('all cells taken: the first one after the last row', () => {
    const catalog = gridCatalog('row', { columns: 2 });
    let p = container(catalog, { x: 100, y: 100, width: 300, height: 300 });
    for (const n of [1, 2]) p = kid(p, catalog, n);
    p = kid(p, catalog, 3);
    expect(rectOf(p, 'T3')).toEqual({ x: 100, y: 140, width: 100, height: 40 });
  });

  it('horizontal grid (rows): fills columns, from top to bottom', () => {
    const catalog = gridCatalog('row', { rows: 2 });
    let p = container(catalog, { x: 100, y: 100, width: 300, height: 200 });
    for (const n of [1, 2, 3]) p = kid(p, catalog, n);
    // track (row): (200 - 8) / 2 = 96, step 104; columns of 100.
    expect(rectOf(p, 'T2')).toEqual({ x: 100, y: 204, width: 100, height: 40 });
    expect(rectOf(p, 'T3')).toEqual({ x: 200, y: 100, width: 100, height: 40 });
  });
});

describe('componentPlacement in a grid slot in rtl', () => {
  const catalog = gridCatalog('row', { columns: 3 });
  const ids = ['T1', 'T2', 'T3', 'T4'];
  const fill = (direction: 'ltr' | 'rtl'): Project => {
    let p = setProjectDirection(
      container(catalog, { x: 100, y: 100, width: 340, height: 300 }),
      direction,
    );
    for (const n of [1, 2, 3, 4]) p = kid(p, catalog, n);
    return p;
  };

  it('the first child lands in the rightmost cell, mirrored inside the slot area', () => {
    const p = fill('rtl');
    // ltr tracks at x = 100, 216, 332 (children of 100): mirrored, x' = 440 - x.
    expect(rectOf(p, 'T1')).toEqual({ x: 340, y: 100, width: 100, height: 40 });
    expect(rectOf(p, 'T2')).toEqual({ x: 224, y: 100, width: 100, height: 40 });
    expect(rectOf(p, 'T3')).toEqual({ x: 108, y: 100, width: 100, height: 40 });
    expect(rectOf(p, 'T4')).toEqual({ x: 340, y: 140, width: 100, height: 40 });
    expectValid(p);
  });

  it('the placement agrees with Arrange (arranging moves nobody)', () => {
    const p = fill('rtl');
    const arranged = arrangeMarking(p, catalog, 'C', approximateMeasurer).project;
    for (const id of ids) expect(rectOf(arranged, id)).toEqual(rectOf(p, id));
  });

  it('in ltr nothing changes', () => {
    const p = fill('ltr');
    expect(rectOf(p, 'T1')).toEqual({ x: 100, y: 100, width: 100, height: 40 });
    expect(rectOf(p, 'T3')).toEqual({ x: 332, y: 100, width: 100, height: 40 });
  });
});
