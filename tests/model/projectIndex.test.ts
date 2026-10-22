import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  createArrow,
  getBacklinks,
  getProjectIssues,
  projectIndex,
  projectIssues,
  typeKey,
  type Project,
} from '../../src/model';
import { cadastroProject } from './specFixtures';

describe('projectIndex', () => {
  const p = cadastroProject();

  it('devolve o mesmo índice para a mesma versão do projeto', () => {
    expect(projectIndex(p)).toBe(projectIndex(p));
    const next = addAnnotation(p, {
      id: 'novo',
      markingId: 'MT',
      layerId: 'LM',
      name: null,
      entries: [],
    });
    expect(projectIndex(next)).not.toBe(projectIndex(p));
    expect(projectIndex(next).annotations.get('novo')?.id).toBe('novo');
    expect(projectIndex(p).annotations.has('novo')).toBe(false);
  });

  it('indexa por id, por marcação, por dona e as tuplas', () => {
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

  it('indexa as setas por id e sob a origem e o destino, na ordem do array', () => {
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
    // Sem setas, os mapas existem e estão vazios.
    expect(projectIndex(p).arrows.size).toBe(0);
    expect(projectIndex(p).arrowsByMarking.size).toBe(0);
    // Uma seta de uma marcação a ela mesma (projeto inválido) aparece uma vez só.
    const self: Project = { ...q, arrows: [{ ...q.arrows[0]!, to: 'MT' }] };
    expect(projectIndex(self).arrowsByMarking.get('MT')?.length).toBe(1);
  });

  it('com ids repetidos, vale o primeiro (como find)', () => {
    const [first, second] = p.markings;
    if (!first || !second) throw new Error('fixture');
    const dup: Project = { ...p, markings: [first, { ...second, id: first.id }] };
    expect(projectIndex(dup).markings.get(first.id)).toBe(first);
  });

  it('pendências e backlinks são memoizados por versão', () => {
    expect(projectIssues(p)).toBe(projectIssues(p));
    expect(getProjectIssues(p)).not.toBe(getProjectIssues(p));
    expect(getProjectIssues(p)).toEqual(new Map(projectIssues(p)));
    expect(getBacklinks(p, 'AU').map((b) => b.source.id)).toEqual(['AIN', 'AII']);
    expect(getBacklinks(p, 'AU')).not.toBe(getBacklinks(p, 'AU'));
  });
});
