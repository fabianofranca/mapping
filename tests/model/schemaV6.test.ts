import { describe, expect, it } from 'vitest';
import { deserialize, migrateFrom5To6, serialize } from '../../src/model';
import { sampleProject } from './fixtures';
import { legacyJson } from './legacyShape';

const strip = (data: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(data).filter(([k]) => k !== key));

/** A v5 mapping.json: without `revision` (nor `platformRepos`, from v7). */
function v5Text(): string {
  const data = legacyJson(sampleProject());
  return JSON.stringify({
    ...strip(strip(data, 'revision'), 'platformRepos'),
    schemaVersion: 5,
  });
}

describe('migration v5 → v6 (revision)', () => {
  it('gets revision: 0 and the rest stays the same', () => {
    const result = deserialize(v5Text());
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.migratedFrom).toBe(5);
    expect(result.readOnly).toBe(false);
    expect(result.project.schemaVersion).toBe(20);
    expect(result.project.revision).toBe(0);
    expect(result.project).toEqual(sampleProject());
  });

  it('the migrated v5 saves as a stable v16 (round-trip)', () => {
    const first = deserialize(v5Text());
    if (!first.ok) throw new Error('failed');
    const saved = serialize(first.project);
    expect(JSON.parse(saved).schemaVersion).toBe(20);
    const again = deserialize(saved);
    if (!again.ok) throw new Error('failed');
    expect(serialize(again.project)).toBe(saved);
  });

  it('preserves an existing revision', () => {
    expect(migrateFrom5To6({ revision: 7 })).toEqual({ revision: 7 });
    expect(migrateFrom5To6({})).toEqual({ revision: 0 });
  });

  it('serializes revision right after schemaVersion and keeps the value in the round-trip', () => {
    const text = serialize({ ...sampleProject(), revision: 12 });
    expect(Object.keys(JSON.parse(text)).slice(0, 2)).toEqual([
      'schemaVersion',
      'revision',
    ]);
    const loaded = deserialize(text);
    if (!loaded.ok) throw new Error('failed');
    expect(loaded.project.revision).toBe(12);
  });

  it('refuses a v6 file without revision or with an invalid revision', () => {
    const data = JSON.parse(serialize(sampleProject()));
    delete data.revision;
    expect(deserialize(JSON.stringify(data)).ok).toBe(false);
    for (const bad of [-1, 1.5, '1']) {
      expect(deserialize(JSON.stringify({ ...data, revision: bad })).ok).toBe(false);
    }
  });
});
