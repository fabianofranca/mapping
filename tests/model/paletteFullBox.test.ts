import { describe, expect, it } from 'vitest';
import { addComponentMarking, approximateMeasurer, type Rect } from '../../src/model';
import { SPEC_ID, componentProject, testCatalog } from './componentFixtures';
import { expectValid, marking } from './fixtures';

// Finding 3.1 (stage #1533, block 3, R12.12a): dropping a Button from the Palette into a Box with no free space
// nested it in the previous Button (its parentId) and over the 1st Button.

const catalog = testCatalog();
const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

describe('Palette dropped into a Box with a full slot (3.1, slot path)', () => {
  function fullBox() {
    let p = addComponentMarking(
      componentProject(),
      catalog,
      {
        markingId: 'BOX',
        annotationId: 'A_BOX',
        containerId: 'I1',
        parentId: null,
        specId: SPEC_ID,
        typeId: 'box',
        rect: rect(100, 100, 100, 80),
      },
      approximateMeasurer,
    );
    p = dropIn(p, 'T1');
    p = dropIn(p, 'T2');
    return p;
  }
  function dropIn(p: ReturnType<typeof componentProject>, id: string) {
    return addComponentMarking(
      p,
      catalog,
      {
        markingId: id,
        annotationId: `A_${id}`,
        containerId: 'I1',
        parentId: 'BOX',
        specId: SPEC_ID,
        typeId: 'text',
      },
      approximateMeasurer,
    );
  }

  it('the third one with the slot full becomes a child of the Box, without coinciding with the first', () => {
    const p = dropIn(fullBox(), 'T3');
    expect(marking(p, 'T3').parentId).toBe('BOX');
    expect(marking(p, 'T3').rect).not.toEqual(marking(p, 'T1').rect);
    expectValid(p);
  });

  it('dropping again does not nest one more level', () => {
    const p = dropIn(dropIn(fullBox(), 'T3'), 'T4');
    for (const id of ['T1', 'T2', 'T3', 'T4'])
      expect(marking(p, id).parentId).toBe('BOX');
  });
});
