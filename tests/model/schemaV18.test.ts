// Schema v18 (drawing mode): `drawingMode` on the project and on the container. The v17 → v18 migration only
// changes the version; the missing mode is the first mode of each specialization.
import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  migrateFrom17To18,
  migrations,
  serialize,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';

type Raw = Record<string, unknown>;

const v17Raw = (): Raw => {
  const raw = JSON.parse(
    serialize({ ...sampleProject(), schemaVersion: 18 } as never),
  ) as Raw;
  raw.schemaVersion = 17;
  return raw;
};

function open(raw: Raw): Project {
  const result = deserialize(JSON.stringify(raw), migrations);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.project;
}

describe('schema v18', () => {
  it('the current version is 18 and the registry has the v17 → v18 migration', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(18);
    expect(migrations.get(17)).toBe(migrateFrom17To18);
  });

  it('the v17 → v18 migration does not change the data', () => {
    const data = { project: { id: 'fixed', name: 'X' }, extra: 1 };
    expect(migrateFrom17To18(data)).toEqual(data);
  });

  it('a v17 mapping.json migrates to v18 without changing anything but the version', () => {
    const result = deserialize(JSON.stringify(v17Raw()), migrations);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.migratedFrom).toBe(17);
    expect(result.project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.project.drawingMode).toBeUndefined();
    const saved = JSON.parse(serialize(result.project)) as Raw;
    expect(saved.schemaVersion).toBe(SCHEMA_VERSION);
    expect('drawingMode' in saved).toBe(false);
    expect((saved.containers as Raw[]).every((c) => !('drawingMode' in c))).toBe(true);
  });

  it('a project with drawingMode "dark" and a container with null are valid and round-trip', () => {
    const raw = v17Raw();
    raw.schemaVersion = 18;
    raw.drawingMode = 'dark';
    (raw.containers as Raw[])[0] = { ...(raw.containers as Raw[])[0], drawingMode: null };
    const project = open(raw);
    expect(project.drawingMode).toBe('dark');
    const text = serialize(project);
    const saved = JSON.parse(text) as Raw;
    expect(saved.drawingMode).toBe('dark');
    // `null` is the same as missing: it follows the project, and the file does not store the key.
    expect('drawingMode' in (saved.containers as Raw[])[0]!).toBe(false);
  });

  it('a container with a pinned drawingMode is written', () => {
    const raw = v17Raw();
    raw.schemaVersion = 18;
    (raw.containers as Raw[])[0] = {
      ...(raw.containers as Raw[])[0],
      drawingMode: 'light',
    };
    const saved = JSON.parse(serialize(open(raw))) as Raw;
    expect((saved.containers as Raw[])[0]!.drawingMode).toBe('light');
  });

  it('a drawingMode that is not text fails', () => {
    const raw = v17Raw();
    raw.schemaVersion = 18;
    raw.drawingMode = 3;
    const result = deserialize(JSON.stringify(raw), migrations);
    expect(result.ok).toBe(false);
    const other = v17Raw();
    other.schemaVersion = 18;
    (other.containers as Raw[])[0] = {
      ...(other.containers as Raw[])[0],
      drawingMode: 3,
    };
    expect(deserialize(JSON.stringify(other), migrations).ok).toBe(false);
  });
});
