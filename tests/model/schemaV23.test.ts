// Schema v23 (container classes, stage #1901 CX2): `containers[].classes`, a map set id → class id
// of the chosen sets. The v22 → v23 migration only changes the version; the new version exists so
// that an earlier app opens a file with a choice read-only instead of discarding it when writing.
import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  migrateFrom22To23,
  migrations,
  serialize,
  setContainerClass,
  type Project,
} from '../../src/model';
import { emptyProject, sampleProject } from './fixtures';

type Raw = Record<string, unknown>;

const rawOf = (p: Project): Raw => JSON.parse(serialize(p)) as Raw;
const withVersion = (raw: Raw, schemaVersion: number): Raw => ({ ...raw, schemaVersion });
const containersOf = (raw: Raw): Raw[] => raw.containers as Raw[];

function open(raw: Raw) {
  return deserialize(JSON.stringify(raw), migrations);
}

function opened(raw: Raw): Project {
  const result = open(raw);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.project;
}

describe('schema v23', () => {
  it('the current version is 23 and the registry has the v22 → v23 migration', () => {
    expect(SCHEMA_VERSION).toBe(23);
    expect(migrations.get(22)).toBe(migrateFrom22To23);
  });

  it('the v22 → v23 migration does not change the data', () => {
    const data = { project: { id: 'fixed', name: 'X' }, extra: 1 };
    expect(migrateFrom22To23(data)).toEqual(data);
  });

  it('a v22 mapping.json migrates to v23 changing only the version', () => {
    const raw = withVersion(rawOf(sampleProject()), 22);
    const result = open(raw);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.migratedFrom).toBe(22);
    expect(result.project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.project.containers.every((c) => c.classes === undefined)).toBe(true);
    expect(rawOf(result.project)).toEqual({ ...raw, schemaVersion: SCHEMA_VERSION });
  });

  it('a file with classes reads and writes them back, after the density', () => {
    const base = sampleProject();
    const id = base.containers[0]!.id;
    const withClasses = setContainerClass(
      setContainerClass(base, id, 'platform', 'android'),
      id,
      'form',
      'phone',
    );
    const raw = rawOf(withClasses);
    expect(containersOf(raw)[0]!.classes).toEqual({ platform: 'android', form: 'phone' });
    const keys = Object.keys(containersOf(raw)[0]!);
    expect(keys.indexOf('classes')).toBeGreaterThan(keys.indexOf('background'));
    const back = opened(raw);
    expect(back.containers[0]!.classes).toEqual({ platform: 'android', form: 'phone' });
    expect(rawOf(back)).toEqual(raw);
  });

  it('an empty map and null are read as absent and write no key', () => {
    const raw = rawOf(sampleProject());
    for (const empty of [{}, null]) {
      const [first, ...others] = containersOf(raw);
      const project = opened({
        ...raw,
        containers: [{ ...first, classes: empty }, ...others],
      });
      expect(project.containers[0]!.classes ?? null).toBeNull();
      expect('classes' in containersOf(rawOf(project))[0]!).toBe(false);
    }
  });

  it.each([
    ['a set name with an uppercase letter', { Platform: 'android' }],
    ['a set name with a space', { 'my set': 'android' }],
    ['an empty set name', { '': 'android' }],
    ['a class name with an uppercase letter', { platform: 'Android' }],
    ['an empty class name', { platform: '' }],
    ['a class that is not text', { platform: 3 }],
  ])('refuses %s', (_label, classes) => {
    const raw = rawOf(sampleProject());
    const [first, ...others] = containersOf(raw);
    const edited = { ...raw, containers: [{ ...first, classes }, ...others] };
    expect(open(edited).ok).toBe(false);
  });

  it('an earlier app meets a newer version number and opens the file read-only', () => {
    const newer = open(withVersion(rawOf(emptyProject()), SCHEMA_VERSION + 1));
    expect(newer.ok && newer.readOnly).toBe(true);
  });

  it('an empty project round-trips at v23', () => {
    expect(open(rawOf(emptyProject())).ok).toBe(true);
  });
});
