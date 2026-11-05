// `projectDocRepos` (etapa #559, PD5): os repositórios de documentos das especializações aplicadas.
import { describe, expect, it } from 'vitest';
import { applySpecialization, parseSpec, projectDocRepos } from '../../src/model';
import { emptyProject } from './fixtures';
import { idGen } from './specFixtures';
import { v11Json, type Json } from './specV11Fixtures';
import { docReposProject, roleProject } from './roleFixtures';

function specWith(id: string, docRepos: unknown[] | undefined) {
  const result = parseSpec(
    v11Json((s: Json) => {
      s.id = id;
      if (docRepos) s.docRepos = docRepos;
    }),
  );
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.spec;
}

describe('projectDocRepos', () => {
  it('sem docRepos declarados devolve lista vazia', () => {
    expect(projectDocRepos(roleProject())).toEqual([]);
    expect(projectDocRepos(emptyProject())).toEqual([]);
  });

  it('lista os docRepos na ordem declarada, com a especialização que o declara', () => {
    const repos = projectDocRepos(docReposProject());
    expect(repos.map((r) => r.id)).toEqual(['design-docs', 'wiki']);
    expect(repos[0]).toEqual({
      id: 'design-docs',
      specIds: ['s'],
      repos: [
        {
          specId: 's',
          repo: {
            url: 'https://gitlab.example.com/g/design-docs',
            ref: 'main',
          },
        },
      ],
    });
  });

  it('o mesmo id em especializações diferentes é uma entrada só, na ordem de aplicação', () => {
    const newId = idGen('SL');
    let p = emptyProject();
    p = applySpecialization(
      p,
      specWith('a', [
        { id: 'docs', url: 'https://example.com/a' },
        { id: 'only-a', url: 'https://example.com/only-a' },
      ]),
      { newId },
    );
    p = applySpecialization(p, specWith('b', undefined), { newId });
    p = applySpecialization(
      p,
      specWith('c', [
        { id: 'new-c', url: 'https://example.com/new-c' },
        { id: 'docs', url: 'https://example.com/c', ref: 'v2' },
      ]),
      { newId },
    );
    const repos = projectDocRepos(p);
    expect(repos.map((r) => r.id)).toEqual(['docs', 'only-a', 'new-c']);
    expect(repos[0]?.specIds).toEqual(['a', 'c']);
    expect(repos[0]?.repos.map((r) => [r.specId, r.repo.url])).toEqual([
      ['a', 'https://example.com/a'],
      ['c', 'https://example.com/c'],
    ]);
  });

  it('é memoizada por projeto', () => {
    const p = docReposProject();
    expect(projectDocRepos(p)).toBe(projectDocRepos(p));
  });
});
