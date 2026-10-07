import { describe, expect, it } from 'vitest';
import { readRevision, serialize } from '../../src/model';
import { emptyProject } from './fixtures';

describe('readRevision', () => {
  it('lê o revision de um mapping.json v6', () => {
    expect(readRevision(serialize({ ...emptyProject(), revision: 12 }))).toBe(12);
    expect(readRevision(serialize(emptyProject()))).toBe(0);
  });

  it('arquivo sem o campo (schema anterior ao v6) vale 0, como na migração', () => {
    expect(readRevision('{"schemaVersion":5,"project":{}}')).toBe(0);
  });

  it('texto que não é um objeto JSON, ou com revisão inválida, devolve null', () => {
    expect(readRevision('')).toBeNull();
    expect(readRevision('{ "schemaVersion": 6, ')).toBeNull();
    expect(readRevision('[]')).toBeNull();
    expect(readRevision('42')).toBeNull();
    expect(readRevision('null')).toBeNull();
    expect(readRevision('{"revision":-1}')).toBeNull();
    expect(readRevision('{"revision":1.5}')).toBeNull();
    expect(readRevision('{"revision":"3"}')).toBeNull();
  });
});
