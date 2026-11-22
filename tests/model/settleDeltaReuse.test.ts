import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settleFrom, settleHierarchy, type Marking, type Project } from '../../src/model';
import { emptyProject } from './fixtures';

// Decision 9 of #1971: `settleFrom` hands its first delta to the reconciliation when the settle
// changed neither the markings nor the containers array and the reference is `before`;
// otherwise it computes the second one as before. The result is the same either way.

const calls = vi.hoisted(() => ({ n: 0 }));

vi.mock('../../src/model/settleDelta', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/model/settleDelta')>();
  return {
    ...real,
    settleDelta: (...args: Parameters<typeof real.settleDelta>) => {
      calls.n += 1;
      return real.settleDelta(...args);
    },
  };
});

function mk(id: string, parentId: string | null, x: number, size: number): Marking {
  return {
    id,
    containerId: 'A',
    parentId,
    pageId: null,
    name: null,
    rect: { x, y: x, width: size, height: size },
    needsReview: false,
    locked: false,
    floating: false,
    source: null,
  };
}

function settledBefore(): Project {
  const base = emptyProject();
  return settleHierarchy({
    ...base,
    containers: [
      {
        id: 'A',
        name: null,
        file: null,
        width: 1000,
        height: 1000,
        placement: { x: 0, y: 0, scale: 1 },
        parentId: null,
        pageId: 'PG1',
        markingColor: null,
        locked: false,
        source: null,
        background: '#FFFFFF',
      },
    ],
    markings: [
      mk('outer', null, 10, 300),
      mk('inner', null, 50, 50),
      mk('far', null, 600, 100),
    ],
  });
}

/** `far` moves inside its own space without entering or leaving anything: the settle changes nothing. */
function moved(before: Project): Project {
  return {
    ...before,
    markings: before.markings.map((m) =>
      m.id === 'far' ? { ...m, rect: { ...m.rect, x: 620 } } : m,
    ),
  };
}

beforeEach(() => {
  calls.n = 0;
});

describe('settleFrom: one delta when the settle changed nothing', () => {
  it('computes the delta once and gives the same result as computing it again', () => {
    const before = settledBefore();
    const next = moved(before);
    calls.n = 0;
    const reused = settleFrom(before, next);
    const reusedCalls = calls.n;
    // An equal but distinct `before` as the reference: the second delta is computed again.
    calls.n = 0;
    const again = settleFrom(before, next, { before: { ...before } });
    expect(reusedCalls).toBe(1);
    expect(calls.n).toBe(2);
    expect(again).toEqual(reused);
    expect(reused).toEqual(settleHierarchy(next, { before }));
    expect(reused.markings).toBe(next.markings);
  });

  it('computes the second delta when the settle changed the markings', () => {
    const before = settledBefore();
    // `far` moves into `outer`: the settle gives it a parent, so the arrays are not `next`'s.
    const next: Project = {
      ...before,
      markings: before.markings.map((m) =>
        m.id === 'far' ? { ...m, rect: { x: 100, y: 100, width: 20, height: 20 } } : m,
      ),
    };
    calls.n = 0;
    const result = settleFrom(before, next);
    expect(calls.n).toBe(2);
    expect(result.markings.find((m) => m.id === 'far')?.parentId).toBe('outer');
    expect(result).toEqual(settleHierarchy(next, { before }));
  });
});
