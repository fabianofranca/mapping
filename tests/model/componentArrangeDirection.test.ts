import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  arrangeMarking,
  componentPlacement,
  createDrawingCache,
  setContainerDirection,
  setProjectDirection,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import { SPEC_ID, componentProject, testCatalog } from './componentFixtures';
import { marking } from './fixtures';

// Direction (schema v20): the effective one of the marking's space reaches Arrange and the drawing. In `rtl`
// the row runs from right to left (R1 mirrors in the engine; here the project chooses).

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

/** Row of 300×100 at (100,100) with two out-of-order children of 100×40. */
function row(): Project {
  let p = add(componentProject(), 'C', 'row', box(100, 100, 300, 100));
  p = add(p, 'T1', 'text', box(150, 150, 100, 40), 'C');
  p = add(p, 'T2', 'text', box(300, 120, 100, 40), 'C');
  return p;
}

const arrange = (p: Project) => arrangeMarking(p, catalog, 'C', approximateMeasurer);
const rectOf = (p: Project, id: string): Rect => marking(p, id).rect;

describe('Arrange with the effective direction', () => {
  it('ltr (default): the first child at the start on the left', () => {
    const { project } = arrange(row());
    expect(rectOf(project, 'T1')).toEqual(box(100, 100, 100, 40));
    expect(rectOf(project, 'T2')).toEqual(box(208, 100, 100, 40));
  });

  it('rtl in the project: the row runs from right to left', () => {
    const { project } = arrange(setProjectDirection(row(), 'rtl'));
    expect(rectOf(project, 'T1')).toEqual(box(300, 100, 100, 40));
    expect(rectOf(project, 'T2')).toEqual(box(192, 100, 100, 40));
  });

  it('rtl pinned on the container applies even with the project in ltr', () => {
    const { project } = arrange(setContainerDirection(row(), 'I1', 'rtl'));
    expect(rectOf(project, 'T1')).toEqual(box(300, 100, 100, 40));
  });

  it('a container that pins ltr in an rtl project arranges in ltr', () => {
    const p = setContainerDirection(setProjectDirection(row(), 'rtl'), 'I1', 'ltr');
    expect(rectOf(arrange(p).project, 'T1')).toEqual(box(100, 100, 100, 40));
  });

  it('the spot of a new child follows the direction: after the last one, to its left', () => {
    const arranged = (dir: 'ltr' | 'rtl') =>
      arrange(setProjectDirection(row(), dir)).project;
    const place = (p: Project): Rect =>
      componentPlacement(
        p,
        catalog,
        {
          containerId: 'I1',
          parentId: 'C',
          specId: SPEC_ID,
          typeId: 'text',
          size: { width: 40, height: 24 },
        },
        approximateMeasurer,
      );
    expect(place(arranged('ltr')).x).toBeGreaterThan(rectOf(arranged('ltr'), 'T2').x);
    expect(place(arranged('rtl')).x).toBeLessThan(rectOf(arranged('rtl'), 'T2').x);
  });
});

describe('drawing with the effective direction', () => {
  it('the rtl drawing mirrors the row relative to ltr', () => {
    // `wide`: two boxes in a row, which the engine mirrors in rtl.
    const p = add(componentProject(), 'C', 'wide', box(100, 100, 300, 100));
    const ltr = createDrawingCache()(p, catalog, approximateMeasurer, 0).get('C');
    const rtl = createDrawingCache()(
      setProjectDirection(p, 'rtl'),
      catalog,
      approximateMeasurer,
      0,
    ).get('C');
    const xs = (d: typeof ltr) => d?.root.children?.map((n) => n.transform[4]);
    expect(xs(ltr)).toHaveLength(2);
    // Boxes of 80 in a row of 300: [0, 80] in ltr and, mirrored, [220, 140] in rtl.
    expect(xs(ltr)).toEqual([0, 80]);
    expect(xs(rtl)).toEqual([220, 140]);
  });
});
