// Schema v27 (stored structure, stage #3087 MS1): `markings[].slot`, the id of the parent's slot. It is
// optional: absent (or `null`) reads as no slot and is not written; the key goes right after `parentId`.
// The v26 → v27 migration only changes the number and settles nothing.
import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  migrate,
  migrateFrom26To27,
  migrations,
  serialize,
  specFiles,
  type Project,
} from '../../src/model';
import { r, raw as rawMarking, structureProject } from '../support/structureFixtures';
import { sampleProject } from './fixtures';

type Raw = Record<string, unknown>;

const rawOf = (p: Project): Raw => JSON.parse(serialize(p)) as Raw;
const markingsOf = (raw: Raw): Raw[] => raw.markings as Raw[];
const second = (raw: Raw): Raw => markingsOf(raw)[1] as Raw;

function read(raw: Raw) {
  return deserialize(JSON.stringify(raw), migrations);
}

function opened(raw: Raw): Project {
  const result = read(raw);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.project;
}

describe('schema v27', () => {
  it('the current version is 27 and the registry has the v26 → v27 migration', () => {
    expect(SCHEMA_VERSION).toBe(27);
    expect(migrations.get(26)).toBe(migrateFrom26To27);
  });

  it('the migration changes nothing but the number', () => {
    const data = { containers: [{ id: 'a' }], markings: [] };
    expect(migrateFrom26To27(data, { newId: () => 'x' } as never)).toEqual(data);
  });

  it('a v26 file migrates with only the number changed and nothing settled', () => {
    const raw = { ...rawOf(sampleProject()), schemaVersion: 26 };
    expect(migrate(raw, 26)).toEqual({ ok: true, data: { ...raw, schemaVersion: 27 } });
    const migrated = opened(raw);
    expect(migrated.schemaVersion).toBe(27);
    expect(migrated.markings.every((m) => m.slot === undefined)).toBe(true);
  });

  it('a marking without `slot` reads with no slot and writes no key', () => {
    const p = opened(rawOf(sampleProject()));
    expect(p.markings.every((m) => m.slot === undefined)).toBe(true);
    for (const m of markingsOf(rawOf(p))) expect('slot' in m).toBe(false);
  });

  it('`slot` round-trips and is written right after `parentId`', () => {
    const stored = structureProject(
      [
        rawMarking('card', r(10, 10, 300, 300)),
        rawMarking('kid', r(20, 20, 50, 50), { parentId: 'card', slot: 'left' }),
      ],
      ['card', 'kid'],
    );
    // The nature comes from the applied specializations, which the storage reads from `specs/`.
    const result = deserialize(
      JSON.stringify(rawOf(stored)),
      migrations,
      specFiles(stored),
    );
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const p = result.project;
    expect(p.markings[1]?.slot).toBe('left');
    const written = second(rawOf(p));
    expect(written.slot).toBe('left');
    const keys = Object.keys(written);
    expect(keys[keys.indexOf('parentId') + 1]).toBe('slot');
  });

  it('`null` reads as absent and writes no key', () => {
    const raw = rawOf(sampleProject());
    for (const m of markingsOf(raw)) m.slot = null;
    const p = opened(raw);
    expect(p.markings.every((m) => m.slot == null)).toBe(true);
    for (const m of markingsOf(rawOf(p))) expect('slot' in m).toBe(false);
  });

  it('an empty string is refused', () => {
    const raw = rawOf(sampleProject());
    (markingsOf(raw)[0] as Raw).slot = '';
    expect(read(raw).ok).toBe(false);
  });
});
