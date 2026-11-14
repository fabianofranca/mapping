// Without an anchor in the project, creating markings does not build the index (O(n)) of each version: the
// settle only looks at the index when there is an anchor relation (R3 performance regression).
import { describe, expect, it, vi } from 'vitest';

const built = vi.hoisted(() => ({ count: 0 }));

vi.mock('../../src/model/projectIndex', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/model/projectIndex')>();
  const seen = new WeakSet<object>();
  return {
    ...original,
    projectIndex: (p: object) => {
      if (!seen.has(p)) {
        seen.add(p);
        built.count++;
      }
      return (original.projectIndex as (q: object) => unknown)(p);
    },
  };
});

import {
  addContainer,
  createMarking,
  moveMarking,
  setMarkingAnchor,
} from '../../src/model';
import { emptyProject } from './fixtures';

function withContainer() {
  return addContainer(emptyProject(), {
    id: 'I1',
    file: 'a.png',
    width: 2000,
    height: 2000,
  });
}

describe('settling without anchors does not build the index on every operation', () => {
  it('50 creations in a project without anchors build few indexes', () => {
    let p = withContainer();
    built.count = 0;
    for (let i = 0; i < 50; i++) {
      p = createMarking(p, {
        id: `M${i}`,
        containerId: 'I1',
        rect: { x: (i % 10) * 60, y: Math.floor(i / 10) * 60, width: 50, height: 50 },
      });
    }
    // The cost must not grow with the number of operations (without the fast path it was one index per creation).
    expect(built.count).toBeLessThan(10);
  });

  it('with an anchor in the project, the index is consulted again', () => {
    let p = withContainer();
    for (const [id, x] of [
      ['A', 0],
      ['B', 200],
    ] as const) {
      p = createMarking(p, {
        id,
        containerId: 'I1',
        rect: { x, y: 0, width: 50, height: 50 },
      });
    }
    p = setMarkingAnchor(p, 'B', { to: 'A', side: 'end', align: 'start' });
    built.count = 0;
    p = moveMarking(p, 'A', 5, 5);
    expect(built.count).toBeGreaterThan(0);
    expect(p.markings.find((m) => m.id === 'B')?.anchor?.to).toBe('A');
  });
});
