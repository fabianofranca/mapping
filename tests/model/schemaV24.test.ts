// Schema v24 (named values, stage #1900 NV3): the drawing mode is a map axis → entry on the project and on
// the container. The v23 → v24 migration turns a string `s` into `{ "mode": s }`; nothing else changes.
// An empty map is not written; an axis or entry name outside `[a-z0-9][a-z0-9-]*` is refused.
import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  migrateFrom23To24,
  migrations,
  serialize,
  setContainerDrawingMode,
  setProjectDrawingMode,
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

/** A v23 file whose project and first container carry a string mode. */
function v23WithStrings(): Raw {
  const raw = rawOf(sampleProject());
  const [first, ...others] = containersOf(raw);
  return withVersion(
    {
      ...raw,
      drawingMode: 'dark',
      containers: [{ ...first, drawingMode: 'light' }, ...others],
    },
    23,
  );
}

describe('schema v24', () => {
  it('the current version is 24 and the registry has the v23 → v24 migration', () => {
    expect(SCHEMA_VERSION).toBe(24);
    expect(migrations.get(23)).toBe(migrateFrom23To24);
  });

  it('a string becomes { mode: s } on the project and on every container; null and absent stay', () => {
    const migrated = migrateFrom23To24({
      drawingMode: 'dark',
      containers: [
        { id: 'a', drawingMode: 'light' },
        { id: 'b', drawingMode: null },
        { id: 'c' },
      ],
    });
    expect(migrated).toEqual({
      drawingMode: { mode: 'dark' },
      containers: [
        { id: 'a', drawingMode: { mode: 'light' } },
        { id: 'b', drawingMode: null },
        { id: 'c' },
      ],
    });
  });

  it('a v23 mapping.json migrates with the modes as maps and nothing else changed', () => {
    const raw = v23WithStrings();
    const result = open(raw);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.migratedFrom).toBe(23);
    expect(result.project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.project.drawingMode).toEqual({ mode: 'dark' });
    expect(result.project.containers[0]!.drawingMode).toEqual({ mode: 'light' });
    const [first, ...others] = containersOf(raw);
    expect(rawOf(result.project)).toEqual({
      ...raw,
      schemaVersion: SCHEMA_VERSION,
      drawingMode: { mode: 'dark' },
      containers: [{ ...first, drawingMode: { mode: 'light' } }, ...others],
    });
  });

  it('a v23 file without a mode changes only the version', () => {
    const raw = withVersion(rawOf(sampleProject()), 23);
    expect(rawOf(opened(raw))).toEqual({ ...raw, schemaVersion: SCHEMA_VERSION });
  });

  it('a v24 map round-trips in the same key order, after docRepos and before direction', () => {
    const base = sampleProject();
    const id = base.containers[0]!.id;
    const project = setContainerDrawingMode(
      setProjectDrawingMode(base, { theme: 'dark', contrast: 'high' }),
      id,
      { contrast: 'normal' },
    );
    const raw = rawOf(project);
    expect(raw.drawingMode).toEqual({ theme: 'dark', contrast: 'high' });
    expect(Object.keys(raw.drawingMode as Raw)).toEqual(['theme', 'contrast']);
    expect(containersOf(raw)[0]!.drawingMode).toEqual({ contrast: 'normal' });
    expect(rawOf(opened(raw))).toEqual(raw);
  });

  it('an empty map and null are read as absent and write no key', () => {
    const raw = rawOf(sampleProject());
    for (const empty of [{}, null]) {
      const [first, ...others] = containersOf(raw);
      const project = opened({
        ...raw,
        drawingMode: {},
        containers: [{ ...first, drawingMode: empty }, ...others],
      });
      expect(project.drawingMode).toBeUndefined();
      expect(project.containers[0]!.drawingMode ?? null).toBeNull();
      const written = rawOf(project);
      expect('drawingMode' in written).toBe(false);
      expect('drawingMode' in containersOf(written)[0]!).toBe(false);
    }
  });

  it.each([
    ['an axis name with an uppercase letter', { Theme: 'dark' }],
    ['an axis name with a space', { 'my axis': 'dark' }],
    ['an empty axis name', { '': 'dark' }],
    ['an entry name with an uppercase letter', { theme: 'Dark' }],
    ['an empty entry name', { theme: '' }],
    ['an entry that is not text', { theme: 3 }],
    ['a string (v24 stores a map)', 'dark'],
  ])('refuses %s', (_label, mode) => {
    const raw = rawOf(sampleProject());
    expect(open({ ...raw, drawingMode: mode }).ok).toBe(false);
    const [first, ...others] = containersOf(raw);
    expect(
      open({ ...raw, containers: [{ ...first, drawingMode: mode }, ...others] }).ok,
    ).toBe(false);
  });

  it('an earlier app meets a newer version number and opens the file read-only', () => {
    const newer = open(withVersion(rawOf(emptyProject()), SCHEMA_VERSION + 1));
    expect(newer.ok && newer.readOnly).toBe(true);
  });
});
