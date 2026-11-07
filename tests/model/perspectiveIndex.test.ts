import { describe, expect, it } from 'vitest';
import { projectIndex, type Perspective, type Project } from '../../src/model';
import { multiProject } from './multiSelectionFixtures';

// Raízes no índice do projeto (v16, perspectivas). Geometria do `multiProject` (ver
// tests/model/multiSelectionFixtures.ts): pertencimento A › G2 › G, B e C › G; D e E sem pai.
// Raízes: D, E (containers), G, N (flutuante) e H (marcações do canvas).

describe('projectIndex: raízes', () => {
  const p = multiProject();
  const index = projectIndex(p);

  it('roots: containers sem pai e depois as marcações do canvas sem pai, na ordem dos arrays', () => {
    expect(index.roots).toEqual(['D', 'E', 'G', 'N', 'H']);
  });

  it('rootOf: a raiz de cada container e marcação', () => {
    const expected: Record<string, string> = {
      A: 'G',
      B: 'G',
      C: 'G',
      D: 'D',
      E: 'E',
      G: 'G',
      G2: 'G',
      a1: 'G',
      a2: 'G',
      a3: 'G',
      b1: 'G',
      c1: 'G',
      e1: 'E',
      N: 'N',
      H: 'H',
    };
    expect(Object.fromEntries(index.rootOf)).toEqual(expected);
  });

  it('rootMembers: tudo o que tem a raiz, ela inclusive, na ordem dos arrays', () => {
    const group = index.rootMembers.get('G');
    expect(group?.containers.map((c) => c.id)).toEqual(['A', 'B', 'C']);
    expect(group?.markings.map((m) => m.id)).toEqual([
      'G',
      'G2',
      'a1',
      'a2',
      'a3',
      'b1',
      'c1',
    ]);
    const container = index.rootMembers.get('E');
    expect(container?.containers.map((c) => c.id)).toEqual(['E']);
    expect(container?.markings.map((m) => m.id)).toEqual(['e1']);
  });

  it('toda raiz tem grupo, inclusive a sozinha', () => {
    expect(index.rootMembers.get('D')?.containers.map((c) => c.id)).toEqual(['D']);
    expect(index.rootMembers.get('D')?.markings).toEqual([]);
    expect(index.rootMembers.get('N')?.markings.map((m) => m.id)).toEqual(['N']);
    expect([...index.rootMembers.keys()].sort()).toEqual(['D', 'E', 'G', 'H', 'N']);
  });

  it('perspectivesByRoot: as perspectivas que têm cada raiz, na ordem', () => {
    const one: Perspective = {
      id: 'P1',
      name: 'Um',
      hiddenLayers: [],
      items: [
        { root: 'D', x: 0, y: 0 },
        { root: 'H', x: 0, y: 0 },
      ],
    };
    const two: Perspective = { ...one, id: 'P2', name: 'Dois', items: [one.items[0]!] };
    const q: Project = { ...p, perspectives: [one, two] };
    const byRoot = projectIndex(q).perspectivesByRoot;
    expect(byRoot.get('D')?.map((x) => x.id)).toEqual(['P1', 'P2']);
    expect(byRoot.get('H')?.map((x) => x.id)).toEqual(['P1']);
    expect(byRoot.get('E')).toBeUndefined();
  });

  it('ciclo de pais (projeto inválido) não trava: todos ficam com o nó em que fecha', () => {
    const cyclic: Project = {
      ...p,
      markings: p.markings.map((m) =>
        m.id === 'G'
          ? { ...m, parentId: 'H' }
          : m.id === 'H'
            ? { ...m, parentId: 'G' }
            : m,
      ),
    };
    const rootOf = projectIndex(cyclic).rootOf;
    expect(rootOf.get('G')).toBe(rootOf.get('H'));
    expect(rootOf.get('a1')).toBe(rootOf.get('G'));
  });

  it('pai inexistente (projeto inválido): o nó é a própria raiz', () => {
    const broken: Project = {
      ...p,
      markings: p.markings.map((m) => (m.id === 'H' ? { ...m, parentId: 'zzz' } : m)),
    };
    expect(projectIndex(broken).rootOf.get('H')).toBe('H');
  });
});
