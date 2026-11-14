// Schema v17 (whole-annotation ref): the v16 → v17 migration only changes the version. A v16 project
// opens, migrates (migratedFrom 16) and writes v17 without changing any data.
import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  migrateFrom16To17,
  migrations,
  serialize,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';

type Raw = Record<string, unknown>;

/** The example project as a v16 mapping.json: only the file version changes. */
const v16Raw = (): Raw => {
  const raw = JSON.parse(serialize(sampleProject())) as Raw;
  raw.schemaVersion = 16;
  return raw;
};

describe('schema v17', () => {
  it('the current version is 17 and the registry has the v16 → v17 migration', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(17);
    expect(migrations.get(16)).toBe(migrateFrom16To17);
  });

  it('the v16 → v17 migration does not change the data', () => {
    const data = { project: { id: 'fixed', name: 'X' }, extra: 1, perspectives: [] };
    expect(migrateFrom16To17(data)).toEqual(data);
  });

  it('a v16 project opens, migrates up to the current version with a backup and does not change data', () => {
    const text = JSON.stringify(v16Raw(), null, 2);
    const result = deserialize(text, migrations);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.migratedFrom).toBe(16);
    expect(result.readOnly).toBe(false);
    const project: Project = result.project;
    expect(project.schemaVersion).toBe(20);
    // Nothing but the version changes: the migrated project writes the same as the original, with the current version.
    const original = sampleProject();
    expect(serialize(project)).toBe(
      serialize({ ...original, schemaVersion: SCHEMA_VERSION }),
    );
    const saved = JSON.parse(serialize(project)) as Raw;
    expect(saved.schemaVersion).toBe(20);
  });
});
