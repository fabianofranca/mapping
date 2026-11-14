import { describe, expect, it } from 'vitest';
import {
  adjustMarkingRect,
  createMarking,
  reorderMarking,
  setMarkingLocked,
  setMarkingRect,
  siblingPosition,
  type Project,
} from '../../src/model';
import { expectValid, sampleProject } from './fixtures';

/** I1 with the siblings S1..S4 at the image level, after the M1 Door (M2 and M3 are its children). */
function withSiblings(): Project {
  let p = sampleProject();
  for (const [id, x] of [
    ['S1', 0],
    ['S2', 100],
    ['S3', 200],
    ['S4', 300],
  ] as const) {
    p = createMarking(p, {
      id,
      containerId: 'I1',
      rect: { x, y: 0, width: 50, height: 50 },
    });
  }
  return p;
}

const order = (p: Project, ids: string[]) =>
  p.markings.map((m) => m.id).filter((id) => ids.includes(id));

describe('siblingPosition', () => {
  it('position among the siblings of the same image and the same parent', () => {
    const p = withSiblings();
    // Image level I1: M1, S1..S4 (M2 and M3 are children).
    expect(siblingPosition(p, 'M1')).toEqual({ index: 0, count: 5 });
    expect(siblingPosition(p, 'S3')).toEqual({ index: 3, count: 5 });
    // Another image has its own siblings.
    expect(siblingPosition(p, 'M4')).toEqual({ index: 0, count: 1 });
    // Child of M1.
    expect(siblingPosition(p, 'M2')).toEqual({ index: 0, count: 1 });
  });

  it('a missing marking fails with not-found', () => {
    expect(() => siblingPosition(withSiblings(), 'X')).toThrow('not-found');
  });
});

describe('reorderMarking', () => {
  it('moves up and down among the siblings, keeping the relative order of the others', () => {
    const p = withSiblings();
    const up = reorderMarking(p, 'S1', 4);
    expect(order(up, ['M1', 'S1', 'S2', 'S3', 'S4'])).toEqual([
      'M1',
      'S2',
      'S3',
      'S4',
      'S1',
    ]);
    expect(siblingPosition(up, 'S1')).toEqual({ index: 4, count: 5 });
    const down = reorderMarking(p, 'S4', 0);
    expect(order(down, ['M1', 'S1', 'S2', 'S3', 'S4'])).toEqual([
      'S4',
      'M1',
      'S1',
      'S2',
      'S3',
    ]);
    const middle = reorderMarking(p, 'S1', 2);
    expect(order(middle, ['M1', 'S1', 'S2', 'S3', 'S4'])).toEqual([
      'M1',
      'S2',
      'S1',
      'S3',
      'S4',
    ]);
    expectValid(middle);
  });

  it('the markings that are not siblings stay where they were in the array', () => {
    const p = withSiblings();
    const next = reorderMarking(p, 'S1', 4);
    for (const id of ['M2', 'M3', 'M4']) {
      expect(next.markings.findIndex((m) => m.id === id)).toBe(
        p.markings.findIndex((m) => m.id === id),
      );
    }
    expect(next.markings).toHaveLength(p.markings.length);
  });

  it('only reorders among siblings: children of different parents do not mix', () => {
    let p = withSiblings();
    p = createMarking(p, {
      id: 'C1',
      containerId: 'I1',
      rect: { x: 1010, y: 1010, width: 30, height: 30 },
    });
    // Does C1 fit in M1 › M2? (1200..) no; it fits in M1 but outside M2: parent = M1.
    expect(siblingPosition(p, 'C1')).toEqual({ index: 1, count: 2 });
    const next = reorderMarking(p, 'C1', 0);
    expect(order(next, ['M2', 'C1'])).toEqual(['C1', 'M2']);
  });

  it('the same position returns the same project', () => {
    const p = withSiblings();
    expect(reorderMarking(p, 'S2', 2)).toBe(p);
  });

  it('an index outside [0, count - 1] fails with invalid-index', () => {
    const p = withSiblings();
    expect(() => reorderMarking(p, 'S1', 5)).toThrow('invalid-index');
    expect(() => reorderMarking(p, 'S1', -1)).toThrow('invalid-index');
    expect(() => reorderMarking(p, 'S1', 1.5)).toThrow('invalid-index');
  });

  it('the lock does not prevent reordering', () => {
    let p = withSiblings();
    p = setMarkingLocked(p, 'S1', true);
    expect(order(reorderMarking(p, 'S1', 4), ['S1', 'S4'])).toEqual(['S4', 'S1']);
  });
});

describe('minimum size (minSize)', () => {
  const minSize = { width: 60, height: 40 };

  it('createMarking refuses a rectangle smaller than the minimum', () => {
    const p = sampleProject();
    const args = {
      id: 'N1',
      containerId: 'I2',
      rect: { x: 200, y: 200, width: 59, height: 60 },
    };
    expect(() => createMarking(p, args, { minSize })).toThrow('rect-too-small');
    expect(() =>
      createMarking(
        p,
        { ...args, rect: { ...args.rect, width: 60, height: 39 } },
        { minSize },
      ),
    ).toThrow('rect-too-small');
    expect(
      createMarking(
        p,
        { ...args, rect: { ...args.rect, width: 60, height: 40 } },
        { minSize },
      ).markings,
    ).toHaveLength(p.markings.length + 1);
  });

  it('without the option nothing changes', () => {
    const p = sampleProject();
    const next = createMarking(p, {
      id: 'N1',
      containerId: 'I2',
      rect: { x: 200, y: 200, width: 10, height: 10 },
    });
    expect(next.markings.at(-1)?.rect.width).toBe(10);
  });

  it('setMarkingRect refuses below the minimum and accepts the minimum', () => {
    const p = sampleProject();
    const rect = { x: 0, y: 0, width: 59, height: 100 };
    expect(() => setMarkingRect(p, 'M4', rect, { minSize })).toThrow('rect-too-small');
    const ok = setMarkingRect(p, 'M4', { ...rect, width: 60 }, { minSize });
    expect(ok.markings.find((m) => m.id === 'M4')?.rect.width).toBe(60);
  });

  it('setMarkingRect without the option follows the usual rules', () => {
    const p = sampleProject();
    expect(() =>
      setMarkingRect(p, 'M4', { x: 0, y: 0, width: 8, height: 8 }),
    ).not.toThrow();
    expect(() => setMarkingRect(p, 'M4', { x: 0, y: 0, width: 7, height: 8 })).toThrow(
      'rect-too-small',
    );
  });

  it('the current rectangle is still not a change, even below the minimum', () => {
    const p = sampleProject();
    const rect = { ...p.markings.find((m) => m.id === 'M4')!.rect };
    expect(setMarkingRect(p, 'M4', rect, { minSize: { width: 500, height: 500 } })).toBe(
      p,
    );
  });

  it('adjustMarkingRect bounds width and height from below at the minimum', () => {
    const p = sampleProject();
    const wide = adjustMarkingRect(p, 'M4', 'width', 20, { minSize });
    expect(wide.markings.find((m) => m.id === 'M4')?.rect.width).toBe(60);
    const tall = adjustMarkingRect(p, 'M4', 'height', 20, { minSize });
    expect(tall.markings.find((m) => m.id === 'M4')?.rect.height).toBe(40);
    // Without the option, the minimum is the markings'.
    const plain = adjustMarkingRect(p, 'M4', 'width', 20);
    expect(plain.markings.find((m) => m.id === 'M4')?.rect.width).toBe(20);
  });

  it('adjustMarkingRect: if the minimum does not fit in the parent, it refuses', () => {
    const p = sampleProject();
    expect(() =>
      adjustMarkingRect(p, 'M3', 'width', 20, { minSize: { width: 5000, height: 10 } }),
    ).toThrow();
  });
});
