// `docRepos` do projeto (etapa #559, PD2, decisões 13 e 15): gravar e remover o `localPath`.
import { describe, expect, it } from 'vitest';
import { docRepoOf, removeDocRepo, setDocRepo, type ModelError } from '../../src/model';
import { roleProject, withDocRepo } from './roleFixtures';

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as ModelError).code;
  }
  return 'no-error';
}

describe('setDocRepo / removeDocRepo', () => {
  it('grava o localPath de um repositório declarado pela especialização', () => {
    const p = setDocRepo(roleProject(withDocRepo), 'design-docs', {
      localPath: '../docs',
    });
    expect(p.docRepos).toEqual({ 'design-docs': { localPath: '../docs' } });
    expect(docRepoOf(p, 'design-docs')).toEqual({ localPath: '../docs' });
  });

  it('normaliza o caminho (barras e espaços) e o mesmo valor devolve o mesmo projeto', () => {
    const p = setDocRepo(roleProject(withDocRepo), 'design-docs', {
      localPath: ' ..\\docs/ ',
    });
    expect(p.docRepos['design-docs']?.localPath).toBe('../docs');
    expect(setDocRepo(p, 'design-docs', { localPath: '../docs' })).toBe(p);
  });

  it('trocar o caminho substitui a entrada', () => {
    let p = setDocRepo(roleProject(withDocRepo), 'design-docs', { localPath: '../a' });
    p = setDocRepo(p, 'design-docs', { localPath: '../b' });
    expect(p.docRepos).toEqual({ 'design-docs': { localPath: '../b' } });
  });

  it('caminho vazio ou null remove a entrada', () => {
    let p = setDocRepo(roleProject(withDocRepo), 'design-docs', { localPath: '../a' });
    expect(setDocRepo(p, 'design-docs', { localPath: '  ' }).docRepos).toEqual({});
    p = setDocRepo(p, 'design-docs', { localPath: null });
    expect(p.docRepos).toEqual({});
  });

  it('id não declarado por nenhuma especialização falha com unknown-doc-repo', () => {
    expect(
      codeOf(() => setDocRepo(roleProject(), 'design-docs', { localPath: '../a' })),
    ).toBe('unknown-doc-repo');
  });

  it('caminho absoluto falha com invalid-local-path', () => {
    expect(
      codeOf(() =>
        setDocRepo(roleProject(withDocRepo), 'design-docs', { localPath: '/x' }),
      ),
    ).toBe('invalid-local-path');
  });

  it('remove a entrada (e falha com not-found se ela não existe); remover a especialização não a apaga', () => {
    const p = setDocRepo(roleProject(withDocRepo), 'design-docs', { localPath: '../a' });
    expect(removeDocRepo(p, 'design-docs').docRepos).toEqual({});
    expect(codeOf(() => removeDocRepo(roleProject(), 'design-docs'))).toBe('not-found');
    expect(removeDocRepo({ ...p, specializations: [] }, 'design-docs').docRepos).toEqual(
      {},
    );
    expect({ ...p, specializations: [] }.docRepos).toEqual(p.docRepos);
  });
});
