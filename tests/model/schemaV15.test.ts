// Schema v15 (link between annotations of the same layer): the change is a rule only (formatVersion 13
// of the specialization); the data do not change. The v14 → v15 migration only swaps the version.
import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  migrateFrom14To15,
  migrations,
  serialize,
  specFiles,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { add, sameLayerProject } from './sameLayerFixtures';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function load(text: string, specs = new Map<string, string>()) {
  const result = deserialize(text, migrations, specs);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result;
}

/** The project as a v14 mapping.json: the same shape, with the previous version. */
const v14Text = (): string => {
  const raw = JSON.parse(serialize(sampleProject())) as Raw;
  raw.schemaVersion = 14;
  return JSON.stringify(raw, null, 2);
};

describe('schema v15', () => {
  it('the registry has the v14 → v15 migration', () => {
    expect(migrations.get(14)).toBe(migrateFrom14To15);
  });

  it('the migration does not change the data', () => {
    const data = { annotations: [{ id: 'X' }], docRepos: {}, extra: 1 };
    expect(migrateFrom14To15(data)).toEqual(data);
  });

  it('the v14 opens, migrates (migratedFrom 14) and writes v15 without changing data', () => {
    const result = load(v14Text());
    expect(result.migratedFrom).toBe(14);
    expect(result.readOnly).toBe(false);
    expect(result.project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(serialize(result.project)).toBe(serialize(sampleProject()));
    const saved = JSON.parse(serialize(result.project)) as Raw;
    expect(saved.schemaVersion).toBe(SCHEMA_VERSION);
    expect(serialize(load(serialize(result.project)).project)).toBe(
      serialize(result.project),
    );
  });

  it('the current one opens without migrating; the v21 opens read-only ("newer version")', () => {
    const p = add(add(sameLayerProject(), 'R1', 'request'), 'N1', 'navigate', 'R1');
    const text = serialize(p);
    expect(load(text, specFiles(p)).migratedFrom).toBeNull();
    const newer = JSON.stringify({ ...JSON.parse(text), schemaVersion: 21 });
    const loaded = load(newer, specFiles(p));
    expect(loaded.readOnly).toBe(true);
    expect(loaded.project.annotations.map((a) => a.id)).toEqual(['R1', 'N1']);
  });
});
