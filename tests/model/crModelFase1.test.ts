import { describe, expect, it } from 'vitest';
import {
  ModelError,
  addContainer,
  canReplaceImage,
  createArrow,
  createMarking,
  itemClipboardData,
  itemsDeletionImpact,
  replaceContainer,
  setMarkingLocked,
  setMarkingSpace,
  wrapItems,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { multiProject } from './multiSelectionFixtures';

function codeOf(op: () => unknown): string | null {
  try {
    op();
    return null;
  } catch (e) {
    if (e instanceof ModelError) return e.code;
    throw e;
  }
}

const extra = { project: 'mapping', ref: 'mapping://mapping/m/x' };

describe('model CR, phase 1', () => {
  it('(5) itemClipboardData with an arrow id returns the arrow data', () => {
    const p = createArrow(sampleProject(), { id: 'R1', from: 'M1', to: 'M4' });
    const data = itemClipboardData(p, 'm', 'R1', extra);
    expect(data.item.id).toBe('R1');
    expect(data.markings).toEqual([]);
  });

  it('(28) replacing the image from under a locked marking is refused', () => {
    const base = multiProject();
    const withFile = {
      ...base,
      containers: base.containers.map((c) =>
        c.id === 'B' ? { ...c, file: 'images/b0.png', background: null } : c,
      ),
    };
    const p = setMarkingLocked(withFile, 'G', true);
    const bigger = { file: 'images/b.png', width: 1000, height: 1000 };
    // B's scale changes (same displayed width): the `placement` the replacement writes.
    const moved = { ...bigger, placement: { x: 2000, y: 0, scale: 1 } };
    expect(canReplaceImage(p, 'B', moved)).toBe(false);
    expect(codeOf(() => replaceContainer(p, 'B', bigger))).toBe('locked');
  });

  it('(31) setMarkingSpace with the same container and rect returns the project untouched', () => {
    const base = sampleProject();
    const m = base.markings.find((x) => x.id === 'M1');
    if (!m) throw new Error('M1');
    const p = setMarkingLocked(base, 'M1', true);
    expect(setMarkingSpace(p, 'M1', 'I1', { ...m.rect })).toBe(p);
  });

  it('(32) an id used by a container refuses marking, arrow and wrap; and the reverse', () => {
    const p = sampleProject();
    const r = { x: 10, y: 10, width: 50, height: 50 };
    expect(codeOf(() => createMarking(p, { id: 'I1', containerId: 'I1', rect: r }))).toBe(
      'duplicate-id',
    );
    expect(codeOf(() => createArrow(p, { id: 'I2', from: 'M1', to: 'M4' }))).toBe(
      'duplicate-id',
    );
    expect(
      codeOf(() => wrapItems(p, { id: 'I1', items: [{ kind: 'marking', id: 'M1' }] })),
    ).toBe('duplicate-id');
    expect(
      codeOf(() =>
        addContainer(p, { id: 'M1', file: 'images/x.png', width: 10, height: 10 }),
      ),
    ).toBe('duplicate-id');
  });

  it('(33) the selected locked marking that leaves with its parent counts in lockedMarkings', () => {
    const p: Project = setMarkingLocked(multiProject(), 'a2', true);
    const impact = itemsDeletionImpact(p, [
      { kind: 'marking', id: 'a1' },
      { kind: 'marking', id: 'a2' },
    ]);
    expect(impact.lockedMarkings).toBe(1);
  });

  it('(33) the selected locked marking that leaves with its container counts in lockedMarkings', () => {
    const p: Project = setMarkingLocked(multiProject(), 'a3', true);
    const impact = itemsDeletionImpact(p, [
      { kind: 'image', id: 'A' },
      { kind: 'marking', id: 'a3' },
    ]);
    expect(impact.lockedMarkings).toBe(1);
  });

  it('(34) commonParent ignores floating ones: the common parent of the others stays the parent', () => {
    // P1 and P2 have the same area, different rectangles, and both contain c1 and c2; c1 and c2 are
    // children of P1. With the floating N in the selection, the common parent must not be lost (the
    // tie-break would fall on P2, the one that comes later in the array).
    let p = sampleProject();
    const add = (id: string, x: number, y: number, size: number) => {
      p = createMarking(p, {
        id,
        containerId: 'I1',
        rect: { x, y, width: size, height: size },
      });
    };
    add('P1', 2200, 200, 400);
    add('P2', 2250, 250, 400);
    add('c1', 2250, 250, 50);
    add('c2', 2400, 400, 50);
    p = createMarking(p, {
      id: 'N',
      containerId: null,
      floating: true,
      rect: { x: 100, y: 5000, width: 200, height: 100 },
    });
    p = {
      ...p,
      markings: p.markings.map((m) =>
        m.id === 'c1' || m.id === 'c2' ? { ...m, parentId: 'P1' } : m,
      ),
    };
    const q = wrapItems(p, {
      id: 'W',
      items: [
        { kind: 'marking', id: 'c1' },
        { kind: 'marking', id: 'c2' },
        { kind: 'marking', id: 'N' },
      ],
    });
    expect(q.markings.find((m) => m.id === 'W')?.parentId).toBe('P1');
  });
});
