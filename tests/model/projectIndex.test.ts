import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
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
    expect(index.images.get('I1')?.file).toBe('images/cadastro.png');
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
