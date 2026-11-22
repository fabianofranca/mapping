import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  createArrow,
  getBacklinks,
  projectIndex,
  projectIssues,
  typeKey,
  type Project,
} from '../../src/model';
import { withArrow } from './arrowFixtures';
import { mk, multiProjectAnnotated, rect } from './multiSelectionFixtures';
import { cadastroProject } from './specFixtures';

describe('projectIndex', () => {
  const p = cadastroProject();

  it('returns the same index for the same project version', () => {
    expect(projectIndex(p)).toBe(projectIndex(p));
    const next = addAnnotation(p, {
      id: 'new',
      markingId: 'MT',
      layerId: 'LM',
      name: null,
      entries: [],
    });
    expect(projectIndex(next)).not.toBe(projectIndex(p));
    expect(projectIndex(next).annotations.get('new')?.id).toBe('new');
    expect(projectIndex(p).annotations.has('new')).toBe(false);
  });

  it('indexes by id, by marking, by owner and the tuples', () => {
    const index = projectIndex(p);
    expect(index.markings.get('MN')?.name).toBe('Nome');
    expect(index.layers.get('LM')?.name).toBe('Model');
    expect(index.containers.get('I1')?.file).toBe('images/cadastro.png');
    expect(index.entries.get('AU')?.get('EN')?.key).toBe('name');
    expect(index.annotationsByMarking.get('MC')?.map((a) => a.id)).toEqual([
      'AB',
      'AOC',
      'AOH',
    ]);
    expect(index.annotationsByOwner.get('AB')?.map((a) => a.id)).toEqual(['AOC', 'AOH']);
    expect(index.children.get(null)?.map((m) => m.id)).toEqual(['MT', 'MF']);
    expect(index.children.get('MF')?.map((m) => m.id)).toEqual(['MN', 'MI', 'ME', 'MC']);
    expect(index.types.get(typeKey('sdui', 'button'))?.type.name).toBe('Button');
    expect(index.specLayers.get(typeKey('sdui', 'componentes'))?.id).toBe('componentes');
  });

  it('indexes the arrows by id and under the source and target, in array order', () => {
    let q = createArrow(p, { id: 'R1', from: 'MT', to: 'MN' });
    q = createArrow(q, { id: 'R2', from: 'MN', to: 'MT' });
    q = createArrow(q, { id: 'R3', from: 'MN', to: 'MF' });
    const index = projectIndex(q);
    expect(index.arrows.get('R2')?.to).toBe('MT');
    expect(index.arrows.size).toBe(3);
    expect(index.arrowsByMarking.get('MN')?.map((a) => a.id)).toEqual(['R1', 'R2', 'R3']);
    expect(index.arrowsByMarking.get('MT')?.map((a) => a.id)).toEqual(['R1', 'R2']);
    expect(index.arrowsByMarking.get('MF')?.map((a) => a.id)).toEqual(['R3']);
    expect(index.arrowsByMarking.has('MC')).toBe(false);
    // With no arrows, the maps exist and are empty.
    expect(projectIndex(p).arrows.size).toBe(0);
    expect(projectIndex(p).arrowsByMarking.size).toBe(0);
    // An arrow from a marking to itself (invalid project) appears only once.
    const self: Project = { ...q, arrows: [{ ...q.arrows[0]!, to: 'MT' }] };
    expect(projectIndex(self).arrowsByMarking.get('MT')?.length).toBe(1);
  });

  it('with repeated ids, the first one counts (like find)', () => {
    const [first, second] = p.markings;
    if (!first || !second) throw new Error('fixture');
    const dup: Project = { ...p, markings: [first, { ...second, id: first.id }] };
    expect(projectIndex(dup).markings.get(first.id)).toBe(first);
  });

  it('pending items and backlinks are memoized by version', () => {
    expect(projectIssues(p)).toBe(projectIssues(p));
    expect(getBacklinks(p, 'AU').map((b) => b.source.id)).toEqual(['AIN', 'AII']);
    expect(getBacklinks(p, 'AU')).not.toBe(getBacklinks(p, 'AU'));
  });
});

describe('projectIndex: roots by position', () => {
  /** `multiProjectAnnotated` plus arrow `r1` (annotated), one more annotation on a canvas marking and one with a missing target. */
  function mixed(): Project {
    let p = withArrow(multiProjectAnnotated(), 'r1', 'a1', 'a3');
    p = addAnnotation(p, { id: 'ra1', markingId: 'r1', layerId: 'L1' });
    p = addAnnotation(p, { id: 'n5', markingId: 'H', layerId: 'L1' });
    // An annotation whose target does not exist (invalid project).
    return {
      ...p,
      annotations: [
        ...p.annotations,
        { ...p.annotations[0]!, id: 'lost', markingId: 'nowhere' },
      ],
    };
  }

  it('containerRoots, markingRoots and annotationRoots keep the array length and the order', () => {
    const p = mixed();
    const index = projectIndex(p);
    expect(index.containerRoots).toHaveLength(p.containers.length);
    expect(index.markingRoots).toHaveLength(p.markings.length);
    expect(index.annotationRoots).toHaveLength(p.annotations.length);
  });

  it('containerRoots and markingRoots are the rootOf of the item at the same position', () => {
    const p = mixed();
    const index = projectIndex(p);
    expect(index.containerRoots).toEqual(p.containers.map((c) => index.rootOf.get(c.id)));
    expect(index.markingRoots).toEqual(p.markings.map((m) => index.rootOf.get(m.id)));
    // Not trivially its own id: a container marking and a nested one end in the canvas root that surrounds them.
    const at = (id: string) => p.markings.findIndex((m) => m.id === id);
    expect(index.markingRoots[at('a1')]).toBe('G');
    expect(index.markingRoots[at('G2')]).toBe('G');
    expect(index.markingRoots[at('H')]).toBe('H');
    expect(index.containerRoots[p.containers.findIndex((c) => c.id === 'A')]).toBe('G');
    expect(index.containerRoots[p.containers.findIndex((c) => c.id === 'D')]).toBe('D');
  });

  it('annotationRoots: the root of the target marking; null for an arrow or a missing target', () => {
    const p = mixed();
    const index = projectIndex(p);
    const rootOfAnnotation = (id: string) =>
      index.annotationRoots[p.annotations.findIndex((a) => a.id === id)];
    expect(rootOfAnnotation('n1')).toBe('G');
    expect(rootOfAnnotation('n4')).toBe('G');
    expect(rootOfAnnotation('n5')).toBe('H');
    expect(rootOfAnnotation('ra1')).toBeNull();
    expect(rootOfAnnotation('lost')).toBeNull();
    expect(index.annotationRoots).toEqual(
      p.annotations.map((a) =>
        index.markings.has(a.markingId) ? index.rootOf.get(a.markingId) : null,
      ),
    );
  });

  it('a repeated id takes the root of that id, as rootOf does', () => {
    const base = multiProjectAnnotated();
    const p: Project = {
      ...base,
      markings: [...base.markings, mk('a1', 'B', rect(10, 10, 50, 50))],
    };
    const index = projectIndex(p);
    const root = index.rootOf.get('a1');
    p.markings.forEach((m, i) => {
      if (m.id === 'a1') expect(index.markingRoots[i]).toBe(root);
    });
    p.annotations.forEach((a, i) => {
      if (a.markingId === 'a1') expect(index.annotationRoots[i]).toBe(root);
    });
  });

  it('a cycle (invalid project) gets the same root as rootOf', () => {
    const base = multiProjectAnnotated();
    const p: Project = {
      ...base,
      markings: [
        ...base.markings,
        mk('x1', null, rect(0, 0, 10, 10), { parentId: 'x2' }),
        mk('x2', null, rect(0, 0, 10, 10), { parentId: 'x1' }),
      ],
      annotations: [
        ...base.annotations,
        { ...base.annotations[0]!, id: 'nx', markingId: 'x2' },
      ],
    };
    const index = projectIndex(p);
    expect(index.markingRoots).toEqual(p.markings.map((m) => index.rootOf.get(m.id)));
    const at = (id: string) => p.markings.findIndex((m) => m.id === id);
    expect(index.markingRoots[at('x1')]).toBe(index.markingRoots[at('x2')]);
    expect(index.annotationRoots[p.annotations.findIndex((a) => a.id === 'nx')]).toBe(
      index.rootOf.get('x2'),
    );
  });
});
