import { describe, expect, it } from 'vitest';
import { readRevision, serialize } from '../../src/model';
import { emptyProject } from './fixtures';

describe('readRevision', () => {
  it('reads the revision of a v6 mapping.json', () => {
    expect(readRevision(serialize({ ...emptyProject(), revision: 12 }))).toBe(12);
    expect(readRevision(serialize(emptyProject()))).toBe(0);
  });

  it('a file without the field (schema before v6) is worth 0, as in the migration', () => {
    expect(readRevision('{"schemaVersion":5,"project":{}}')).toBe(0);
  });

  it('text that is not a JSON object, or with an invalid revision, returns null', () => {
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
