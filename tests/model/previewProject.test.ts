import { describe, expect, it } from 'vitest';
import { refPreviewProject } from '../../src/model';
import { arrowProject, withArrow } from './arrowFixtures';

// refPreviewProject (stage #883, PG3, decision 13): the project reduced to the root group of one item,
// for the read-only preview of a reference to another page. Roots of `arrowProject`: G (holds the
// containers A, B and C with their markings and the arrow r1), D, E, H (canvas marking) and N
// (floating marking).

const ids = (list: readonly { readonly id: string }[]) => list.map((x) => x.id).sort();
const GROUP_G = {
  containers: ['A', 'B', 'C'],
  markings: ['G', 'G2', 'a1', 'a2', 'a3', 'b1', 'b2', 'c1'],
};

describe('refPreviewProject', () => {
  it('a container: keeps its root group, its markings and the arrows inside', () => {
    const p = refPreviewProject(arrowProject(), 'A');
    expect(p).not.toBeNull();
    expect(ids(p!.containers)).toEqual(GROUP_G.containers);
    expect(ids(p!.markings)).toEqual(GROUP_G.markings);
    expect(ids(p!.arrows)).toEqual(['r1']);
  });

  it('a container marking: the same group, dropping the other roots', () => {
    const source = arrowProject();
    const p = refPreviewProject(source, 'b2')!;
    expect(ids(p.containers)).toEqual(GROUP_G.containers);
    expect(ids(p.markings)).toEqual(GROUP_G.markings);
    expect(p.markings.some((m) => m.id === 'H' || m.id === 'N')).toBe(false);
    expect(p.containers.some((c) => c.id === 'D' || c.id === 'E')).toBe(false);
  });

  it('a canvas marking with children: itself and what it contains', () => {
    const p = refPreviewProject(arrowProject(), 'G2')!;
    expect(ids(p.markings)).toEqual(GROUP_G.markings);
  });

  it('a floating marking: only itself', () => {
    const p = refPreviewProject(arrowProject(), 'N')!;
    expect(ids(p.markings)).toEqual(['N']);
    expect(p.containers).toEqual([]);
    expect(p.arrows).toEqual([]);
  });

  it('an arrow resolves to the root group of its ends', () => {
    const p = refPreviewProject(arrowProject(), 'r1')!;
    expect(ids(p.containers)).toEqual(GROUP_G.containers);
    expect(ids(p.arrows)).toEqual(['r1']);
  });

  it('drops the arrows with an end outside the group, keeps everything else of the project', () => {
    const source = withArrow(arrowProject(), 'r2', 'c1', 'H');
    const p = refPreviewProject(source, 'a1')!;
    expect(ids(p.arrows)).toEqual(['r1']);
    expect(p.layers).toBe(source.layers);
    expect(p.annotations).toBe(source.annotations);
    expect(p.pages).toBe(source.pages);
  });

  it('an unknown id gives null', () => {
    expect(refPreviewProject(arrowProject(), 'nope')).toBeNull();
  });
});
