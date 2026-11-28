// Schema v26 (variants of a screen, stage #2034 VR1): `containers[].variantGroup`, a non-empty string of at
// most 64 characters. Containers with the same value are variants of each other. Absent or `null` reads as
// absent and is not written; the key goes last in the container. A group of one is read and kept (it is not
// an error and gives no variant). The v25 → v26 migration only changes the number.
import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  migrate,
  migrateFrom25To26,
  migrations,
  serialize,
  variantsOf,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';

type Raw = Record<string, unknown>;

const rawOf = (p: Project): Raw => JSON.parse(serialize(p)) as Raw;
const containersOf = (raw: Raw): [Raw, ...Raw[]] => raw.containers as [Raw, ...Raw[]];

function read(raw: Raw) {
  return deserialize(JSON.stringify(raw), migrations);
}

function opened(raw: Raw): Project {
  const result = read(raw);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.project;
}

/** The sample project with `I1` and `I2` in the group `g`. */
function grouped(group = 'g'): Raw {
  const raw = rawOf(sampleProject());
  for (const c of containersOf(raw)) c.variantGroup = group;
  return raw;
}

describe('schema v26', () => {
  it('the version is at least 26 and the registry has the v25 → v26 migration', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(26);
    expect(migrations.get(25)).toBe(migrateFrom25To26);
  });

  it('the migration changes nothing but the number (the registry adds the version)', () => {
    const data = { containers: [{ id: 'a' }], markings: [] };
    expect(migrateFrom25To26(data, { newId: () => 'x' } as never)).toEqual(data);
  });

  it('a v25 file migrates with only the number changed', () => {
    const raw = { ...rawOf(sampleProject()), schemaVersion: 25 };
    expect(migrate(raw, 25)).toEqual({
      ok: true,
      data: { ...raw, schemaVersion: SCHEMA_VERSION },
    });
    const migrated = opened(raw);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.containers.every((c) => c.variantGroup === undefined)).toBe(true);
  });

  it('`variantGroup` round-trips and is written last in the container', () => {
    const raw = grouped();
    const p = opened(raw);
    expect(p.containers.map((c) => c.variantGroup)).toEqual(['g', 'g']);
    const written = containersOf(rawOf(p))[0];
    expect(written.variantGroup).toBe('g');
    const keys = Object.keys(written);
    expect(keys.at(-1)).toBe('variantGroup');
  });

  it('`null` reads as absent and writes no key', () => {
    const raw = rawOf(sampleProject());
    for (const c of containersOf(raw)) c.variantGroup = null;
    const p = opened(raw);
    expect(p.containers.every((c) => c.variantGroup == null)).toBe(true);
    for (const c of containersOf(rawOf(p))) expect('variantGroup' in c).toBe(false);
  });

  it('a project with no group writes no key', () => {
    for (const c of containersOf(rawOf(sampleProject()))) {
      expect('variantGroup' in c).toBe(false);
    }
  });

  it('an empty string is refused', () => {
    expect(read(grouped('')).ok).toBe(false);
  });

  it('a string above 64 characters is refused and 64 is accepted', () => {
    expect(read(grouped('x'.repeat(65))).ok).toBe(false);
    expect(read(grouped('x'.repeat(64))).ok).toBe(true);
  });

  it('a group of one is read, kept and gives no variant', () => {
    const raw = rawOf(sampleProject());
    containersOf(raw)[0].variantGroup = 'alone';
    const p = opened(raw);
    expect(p.containers[0]?.variantGroup).toBe('alone');
    expect(containersOf(rawOf(p))[0].variantGroup).toBe('alone');
    expect(variantsOf(p, 'I1')).toEqual([]);
  });
});
