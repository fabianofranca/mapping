import { describe, expect, it } from 'vitest';
import { canFitSelection, selectionCanvasBounds } from '../../src/canvas/selectionBounds';
import type { SelectionItem } from '../../src/store/ui';
import { arrowProject } from '../model/arrowFixtures';

// Unit tests of the box that "Fit selection" frames and of the predicate that says whether there is
// something to frame. Fixture: `arrowProject` (see tests/model/arrowFixtures.ts).

const project = arrowProject();
const marking = (id: string): SelectionItem => ({ kind: 'marking', id });
const gone: SelectionItem = { kind: 'marking', id: 'does-not-exist' };

describe('canFitSelection', () => {
  it('is false without a project or without items', () => {
    expect(canFitSelection(null, [marking('a1')])).toBe(false);
    expect(canFitSelection(project, [])).toBe(false);
  });

  it('is false when every item no longer exists', () => {
    expect(canFitSelection(project, [gone])).toBe(false);
    expect(canFitSelection(project, [gone, { kind: 'image', id: 'nope' }])).toBe(false);
  });

  it('is true with one existing item among missing ones', () => {
    expect(canFitSelection(project, [gone, marking('a1')])).toBe(true);
  });

  it('is true for a marking, an arrow, a container and a floating marking', () => {
    expect(canFitSelection(project, [marking('a1')])).toBe(true);
    expect(canFitSelection(project, [{ kind: 'arrow', id: 'r1' }])).toBe(true);
    expect(canFitSelection(project, [{ kind: 'image', id: 'A' }])).toBe(true);
    expect(canFitSelection(project, [marking('N')])).toBe(true);
  });
});

describe('selectionCanvasBounds', () => {
  it('is null without a project or without an existing item', () => {
    expect(selectionCanvasBounds(null, [marking('a1')])).toBeNull();
    expect(selectionCanvasBounds(project, [gone])).toBeNull();
  });

  it('is the union of the boxes, ignoring missing items', () => {
    // a1 is (100,100,300,300) and a3 is (600,600,200,200) on the canvas.
    expect(selectionCanvasBounds(project, [marking('a1'), gone, marking('a3')])).toEqual({
      x: 100,
      y: 100,
      width: 700,
      height: 700,
    });
  });
});
