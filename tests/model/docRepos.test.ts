// The project's `docRepos` (stage #559, PD2, decisions 13 and 15): writing and removing the `localPath`.
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
  it('writes the localPath of a repository declared by the specialization', () => {
    const p = setDocRepo(roleProject(withDocRepo), 'design-docs', {
      localPath: '../docs',
    });
    expect(p.docRepos).toEqual({ 'design-docs': { localPath: '../docs' } });
    expect(docRepoOf(p, 'design-docs')).toEqual({ localPath: '../docs' });
  });

  it('normalizes the path (slashes and spaces) and the same value returns the same project', () => {
    const p = setDocRepo(roleProject(withDocRepo), 'design-docs', {
      localPath: ' ..\\docs/ ',
    });
    expect(p.docRepos['design-docs']?.localPath).toBe('../docs');
    expect(setDocRepo(p, 'design-docs', { localPath: '../docs' })).toBe(p);
  });

  it('changing the path replaces the entry', () => {
    let p = setDocRepo(roleProject(withDocRepo), 'design-docs', { localPath: '../a' });
    p = setDocRepo(p, 'design-docs', { localPath: '../b' });
    expect(p.docRepos).toEqual({ 'design-docs': { localPath: '../b' } });
  });

  it('an empty path or null removes the entry', () => {
    let p = setDocRepo(roleProject(withDocRepo), 'design-docs', { localPath: '../a' });
    expect(setDocRepo(p, 'design-docs', { localPath: '  ' }).docRepos).toEqual({});
    p = setDocRepo(p, 'design-docs', { localPath: null });
    expect(p.docRepos).toEqual({});
  });

  it('an id not declared by any specialization fails with unknown-doc-repo', () => {
    expect(
      codeOf(() => setDocRepo(roleProject(), 'design-docs', { localPath: '../a' })),
    ).toBe('unknown-doc-repo');
  });

  it('an absolute path fails with invalid-local-path', () => {
    expect(
      codeOf(() =>
        setDocRepo(roleProject(withDocRepo), 'design-docs', { localPath: '/x' }),
      ),
    ).toBe('invalid-local-path');
  });

  it('removes the entry (and fails with not-found if it does not exist); removing the specialization does not delete it', () => {
    const p = setDocRepo(roleProject(withDocRepo), 'design-docs', { localPath: '../a' });
    expect(removeDocRepo(p, 'design-docs').docRepos).toEqual({});
    expect(codeOf(() => removeDocRepo(roleProject(), 'design-docs'))).toBe('not-found');
    expect(removeDocRepo({ ...p, specializations: [] }, 'design-docs').docRepos).toEqual(
      {},
    );
    expect({ ...p, specializations: [] }.docRepos).toEqual(p.docRepos);
  });
});
