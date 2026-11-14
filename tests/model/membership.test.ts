import { describe, expect, it } from 'vitest';
import { membershipChanges, type Project } from '../../src/model';

// Who changed parent or space between two projects (the `membership` of the MCP batch): compares
// `parentId` and `containerId` by id, never the array order.

const marking = (id: string, parentId: string | null, containerId: string | null) => ({
  id,
  parentId,
  containerId,
  name: id,
  rect: { x: 0, y: 0, width: 10, height: 10 },
  needsReview: false,
  locked: false,
  floating: false,
  source: null,
});
const container = (id: string, parentId: string | null) => ({
  id,
  parentId,
  name: id,
  file: null,
  width: 10,
  height: 10,
  placement: { x: 0, y: 0, scale: 1 },
  markingColor: null,
  locked: false,
  source: null,
  background: '#FFFFFF',
});
const project = (
  markings: ReturnType<typeof marking>[],
  containers: ReturnType<typeof container>[] = [],
) => ({ markings, containers }) as unknown as Project;

describe('membershipChanges', () => {
  it('without a parent or space change, returns empty (the array order does not count)', () => {
    const a = project([marking('a', null, 'c'), marking('b', 'a', 'c')]);
    const b = project([marking('b', 'a', 'c'), marking('a', null, 'c')]);
    expect(membershipChanges(a, b)).toEqual([]);
  });

  it('marking that loses its parent', () => {
    const before = project([marking('t', null, 'c'), marking('b', 't', 'c')]);
    const after = project([marking('t', null, 'c'), marking('b', null, 'c')]);
    expect(membershipChanges(before, after)).toEqual([
      {
        kind: 'marking',
        id: 'b',
        from: { parentId: 't', containerId: 'c' },
        to: { parentId: null, containerId: 'c' },
      },
    ]);
  });

  it('marking that changes space (container to the canvas)', () => {
    const before = project([marking('a', null, 'c')]);
    const after = project([marking('a', null, null)]);
    expect(membershipChanges(before, after)).toEqual([
      {
        kind: 'marking',
        id: 'a',
        from: { parentId: null, containerId: 'c' },
        to: { parentId: null, containerId: null },
      },
    ]);
  });

  it('container that gets a canvas marking as its parent', () => {
    const before = project([marking('w', null, null)], [container('c', null)]);
    const after = project([marking('w', null, null)], [container('c', 'w')]);
    expect(membershipChanges(before, after)).toEqual([
      { kind: 'container', id: 'c', from: { parentId: null }, to: { parentId: 'w' } },
    ]);
  });

  it('only the items that already existed enter: the created one and the deleted one are left out', () => {
    const before = project([marking('a', null, 'c'), marking('gone', null, 'c')]);
    const after = project([marking('a', 'n', 'c'), marking('n', null, 'c')]);
    const changes = membershipChanges(before, after);
    expect(changes.map((c) => c.id)).toEqual(['a']);
    expect(changes[0]!.to.parentId).toBe('n');
  });
});
