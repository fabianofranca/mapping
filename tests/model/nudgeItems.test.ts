import { describe, expect, it } from 'vitest';
import {
  ModelError,
  nudgeItems,
  setImageLocked,
  setMarkingLocked,
  type ItemRef,
} from '../../src/model';
import { image, marking } from './fixtures';
import { multiProject } from './multiSelectionFixtures';

const img = (id: string): ItemRef => ({ kind: 'image', id });
const mark = (id: string): ItemRef => ({ kind: 'marking', id });

function codeOf(op: () => unknown): string | null {
  try {
    op();
    return null;
  } catch (e) {
    if (e instanceof ModelError) return e.code;
    throw e;
  }
}

describe("nudgeItems: the step in each item's own space", () => {
  it('a container marking in a scale-3 container moves exactly 1 image px', () => {
    const base = multiProject();
    const p = {
      ...base,
      containers: base.containers.map((c) =>
        c.id === 'B' ? { ...c, placement: { ...c.placement, scale: 3 } } : c,
      ),
    };
    const q = nudgeItems(p, [mark('b1')], 1, 0);
    expect(marking(q, 'b1').rect.x).toBe(marking(p, 'b1').rect.x + 1);
    expect(marking(q, 'b1').rect.y).toBe(marking(p, 'b1').rect.y);
  });

  it('a canvas marking and a container move 1 canvas unit; mixed, each in its own', () => {
    const p = multiProject();
    const q = nudgeItems(p, [mark('H'), mark('N'), img('D'), mark('b1')], 0, 1);
    expect(marking(q, 'H').rect.y).toBe(marking(p, 'H').rect.y + 1);
    expect(marking(q, 'N').rect.y).toBe(marking(p, 'N').rect.y + 1);
    expect(image(q, 'D').placement.y).toBe(image(p, 'D').placement.y + 1);
    // B has scale 2: b1 moves 1 image px (2 canvas units).
    expect(marking(q, 'b1').rect.y).toBe(marking(p, 'b1').rect.y + 1);
  });

  it('a container takes its markings; a container marking takes its descendants', () => {
    const p = multiProject();
    const withContainer = nudgeItems(p, [img('A')], 5, 0);
    expect(image(withContainer, 'A').placement.x).toBe(5);
    expect(marking(withContainer, 'a1').rect).toEqual(marking(p, 'a1').rect);
    const withMarking = nudgeItems(p, [mark('a1')], 3, 0);
    expect(marking(withMarking, 'a1').rect.x).toBe(103);
    expect(marking(withMarking, 'a2').rect.x).toBe(153);
  });

  it('an arrow does not move and nothing to move returns the same project', () => {
    const p = multiProject();
    expect(nudgeItems(p, [{ kind: 'arrow', id: 'x' }], 1, 0)).toBe(p);
    expect(nudgeItems(p, [], 1, 0)).toBe(p);
    expect(nudgeItems(p, [mark('H')], 0, 0)).toBe(p);
  });

  it('all or nothing: locked, leaving the container and overlap fail', () => {
    const p = multiProject();
    expect(
      codeOf(() =>
        nudgeItems(setMarkingLocked(p, 'H', true), [mark('H'), mark('N')], 1, 0),
      ),
    ).toBe('locked');
    expect(codeOf(() => nudgeItems(setImageLocked(p, 'D', true), [img('D')], 1, 0))).toBe(
      'locked',
    );
    // c1 is flush with the bottom-right corner of C.
    expect(codeOf(() => nudgeItems(p, [mark('N'), mark('c1')], 1, 0))).toBe(
      'rect-out-of-image',
    );
    // C (4000..5000) is 2000 from D (7000): touching is allowed, overlapping is not.
    const near = {
      ...p,
      containers: p.containers.map((c) =>
        c.id === 'D' ? { ...c, placement: { ...c.placement, x: 5000 } } : c,
      ),
    };
    expect(codeOf(() => nudgeItems(near, [img('C')], 1, 0))).toBe('image-overlap');
  });

  it('a non-integer step is invalid', () => {
    expect(codeOf(() => nudgeItems(multiProject(), [mark('H')], 0.5, 0))).toBe(
      'invalid-placement',
    );
  });

  it('settle: false does not settle; settle: true settles the containment', () => {
    const p = multiProject();
    // A (0..1000) was in G2 (-50..1050); a step of 60 takes it out of G2 (it stays in G).
    expect(image(p, 'A').parentId).toBe('G2');
    const preview = nudgeItems(p, [img('A')], 60, 0, { settle: false });
    expect(image(preview, 'A').parentId).toBe('G2');
    const settled = nudgeItems(p, [img('A')], 60, 0, { settle: true });
    expect(image(settled, 'A').parentId).toBe('G');
  });
});
