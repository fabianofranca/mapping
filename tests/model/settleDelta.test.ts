import { describe, expect, it } from 'vitest';
import type { Marking, Project } from '../../src/model';
import { settleDelta } from '../../src/model/settleDelta';
import { sampleProject } from './fixtures';

// The comparison of `before` with `next` in the clipped settle (#882): objects, never values.

const marking = (id: string, containerId: string | null, x = 0): Marking => ({
  id,
  containerId,
  parentId: null,
  name: null,
  rect: { x, y: 0, width: 10, height: 10 },
  needsReview: false,
  locked: false,
  floating: false,
  source: null,
});

// The same containers (same objects) in all the test projects.
const shared = sampleProject();

function projectWith(markings: readonly Marking[]): Project {
  return { ...shared, markings: [...markings] };
}

const base = (): Marking[] =>
  Array.from({ length: 12 }, (_, i) =>
    marking(`m${i}`, i % 2 === 0 ? 'I1' : 'I2', i * 20),
  );

describe('settleDelta', () => {
  it('nothing changed: empty and stable delta', () => {
    const before = projectWith(base());
    expect(settleDelta(before, { ...before })).toEqual({
      changed: [],
      old: [],
      full: new Set(),
      stable: true,
    });
  });

  it('an object swapped at the same position: the index, the old one, and stable', () => {
    const list = base();
    const before = projectWith(list);
    const swapped = {
      ...list[3],
      rect: { x: 5, y: 5, width: 10, height: 10 },
    } as Marking;
    const next = projectWith(list.map((m, i) => (i === 3 ? swapped : m)));
    const delta = settleDelta(before, next);
    expect(delta?.changed).toEqual([3]);
    expect(delta?.old).toEqual([list[3]]);
    expect(delta?.stable).toBe(true);
    expect(delta?.full.size).toBe(0);
  });

  it('new marking at the end: only the new one, stable', () => {
    const list = base();
    const next = projectWith([...list, marking('fresh', 'I1')]);
    const delta = settleDelta(projectWith(list), next);
    expect(delta?.changed).toEqual([12]);
    expect(delta?.old).toEqual([]);
    expect(delta?.stable).toBe(true);
  });

  it('deleted marking: the old one, and the positions stop being valid', () => {
    const list = base();
    const next = projectWith(list.filter((m) => m.id !== 'm5'));
    const delta = settleDelta(projectWith(list), next);
    expect(delta?.changed).toEqual([]);
    expect(delta?.old).toEqual([list[5]]);
    expect(delta?.stable).toBe(false);
  });

  it('a canvas marking that changed puts the canvas among the whole spaces', () => {
    const list = [...base(), marking('c', null)];
    const swapped = { ...marking('c', null), name: 'fresh' };
    const delta = settleDelta(
      projectWith(list),
      projectWith(list.map((m) => (m.id === 'c' ? swapped : m))),
    );
    expect([...(delta?.full ?? [])]).toEqual([null]);
  });

  it('reordered siblings: their space is settled whole', () => {
    const list = base();
    const reordered = [...list];
    [reordered[0], reordered[2]] = [list[2] as Marking, list[0] as Marking];
    const delta = settleDelta(projectWith(list), projectWith(reordered));
    expect(delta?.changed).toEqual([]);
    expect([...(delta?.full ?? [])]).toEqual(['I1']);
    expect(delta?.stable).toBe(false);
  });

  it('swapped container: its space and the canvas', () => {
    const before = projectWith(base());
    const containers = before.containers.map((c, i) =>
      i === 0 ? { ...c, name: 'other' } : c,
    );
    const delta = settleDelta(before, { ...before, containers });
    const first = before.containers[0]?.id as string;
    expect(new Set(delta?.full)).toEqual(new Set([first, null]));
  });

  it('more than half changed: the whole project (null)', () => {
    const list = base();
    const swapped = list.map((m) => ({ ...m, name: 'x' }));
    expect(settleDelta(projectWith(list), projectWith(swapped))).toBeNull();
  });

  it('repeated id in the part that changed: the whole project (null)', () => {
    const list = base();
    const next = projectWith([...list, marking('dup', 'I1'), marking('dup', 'I1')]);
    expect(settleDelta(projectWith(list), next)).toBeNull();
  });
});
