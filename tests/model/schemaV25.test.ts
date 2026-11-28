// Schema v25 (decorative marking, stage #2826 DM1): `markings[].decorative`, a boolean. Absent reads as
// `false`; the writer writes it only when `true`, right after `floating`. The v24 → v25 migration only
// changes the number and settles nothing.
import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  migrate,
  migrateFrom24To25,
  migrations,
  serialize,
  type Project,
} from '../../src/model';
import { createMarking } from '../../src/model';
import { sampleProject } from './fixtures';

type Raw = Record<string, unknown>;

const rawOf = (p: Project): Raw => JSON.parse(serialize(p)) as Raw;
const markingsOf = (raw: Raw): Raw[] => raw.markings as Raw[];

function opened(raw: Raw): Project {
  const result = deserialize(JSON.stringify(raw), migrations);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.project;
}

function withDecorative(): Project {
  const p = sampleProject();
  return createMarking(p, {
    id: 'D1',
    containerId: 'I2',
    rect: { x: 200, y: 200, width: 300, height: 300 },
    decorative: true,
  });
}

describe('schema v25', () => {
  it('the registry has the v24 → v25 migration', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(25);
    expect(migrations.get(24)).toBe(migrateFrom24To25);
  });

  it('the migration changes nothing but the number (the registry adds the version)', () => {
    const data = { markings: [{ id: 'a' }], containers: [] };
    expect(migrateFrom24To25(data, { newId: () => 'x' } as never)).toEqual(data);
  });

  it('a marking without `decorative` reads as false', () => {
    const raw = rawOf(sampleProject());
    for (const m of markingsOf(raw)) delete m.decorative;
    const p = opened(raw);
    expect(p.markings.every((m) => m.decorative === false)).toBe(true);
  });

  it('`decorative: true` round-trips and is written right after `floating`', () => {
    const raw = rawOf(withDecorative());
    const d = markingsOf(raw).find((m) => m.id === 'D1') as Raw;
    expect(d.decorative).toBe(true);
    const keys = Object.keys(d);
    expect(keys.indexOf('decorative')).toBe(keys.indexOf('floating') + 1);
    expect(opened(raw).markings.find((m) => m.id === 'D1')?.decorative).toBe(true);
  });

  it('`false` is not written', () => {
    for (const m of markingsOf(rawOf(sampleProject()))) {
      expect('decorative' in m).toBe(false);
    }
  });

  it('a v24 file migrates with only the number changed and nothing settled', () => {
    const raw = { ...rawOf(sampleProject()), schemaVersion: 24 };
    // A stale parent that a settle would fix: the migration leaves the data untouched.
    const stale = markingsOf(raw).map((m) => ({ ...m, parentId: null }));
    const data = { ...raw, markings: stale };
    expect(migrate(data, 24, migrations, 25)).toEqual({
      ok: true,
      data: { ...data, schemaVersion: 25 },
    });
    const migrated = opened(raw);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.markings.every((m) => m.decorative === false)).toBe(true);
  });
});
