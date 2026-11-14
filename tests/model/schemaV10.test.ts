import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  addBackgroundContainer,
  deserialize,
  migrateFrom9To10,
  migrations,
  serialize,
  validateProject,
  type Project,
} from '../../src/model';
import { emptyProject, sampleProject } from './fixtures';
import { legacyJson } from './legacyShape';

// Schema v10 (stage Library, B3): the image may have no file (container: null
// `file`, `background` with the color). The v9 → v10 migration only gives `background: null` to the images.

function load(text: string) {
  const result = deserialize(text, migrations, new Map());
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result;
}

/** A v9 mapping.json of the project: without `background` on the images and with the old version. */
function v9Text(p: Project): string {
  const data = legacyJson(p) as { images: Record<string, unknown>[] };
  for (const image of data.images) delete image.background;
  return JSON.stringify({ ...data, schemaVersion: 9 });
}

function backgroundProject(): Project {
  return addBackgroundContainer(sampleProject(), {
    id: 'B1',
    name: 'Login',
    width: 390,
    height: 844,
    background: '#ffffff',
  });
}

/** Swaps image fields in the stored JSON (to build invalid combinations). */
function withImage(p: Project, id: string, patch: Record<string, unknown>): string {
  const data = JSON.parse(serialize(p)) as { containers: { id: string }[] };
  data.containers = data.containers.map((i) => (i.id === id ? { ...i, ...patch } : i));
  return JSON.stringify(data);
}

describe('migration v9 → v10 (container)', () => {
  it('all images get `background: null`, without losing anything else', () => {
    const p = sampleProject();
    const result = load(v9Text(p));
    expect(result.migratedFrom).toBe(9);
    expect(result.readOnly).toBe(false);
    expect(result.project.schemaVersion).toBe(20);
    expect(result.project.containers.every((i) => i.background === null)).toBe(true);
    expect(result.project).toEqual(p);
  });

  it('writes v10 and re-reading is stable', () => {
    const saved = serialize(load(v9Text(sampleProject())).project);
    expect(JSON.parse(saved).schemaVersion).toBe(20);
    const again = load(saved);
    expect(again.migratedFrom).toBeNull();
    expect(serialize(again.project)).toBe(saved);
  });

  it('the migration function preserves an existing value and items that are not objects', () => {
    const migrated = migrateFrom9To10({
      images: [{ id: 'I1', background: '#112233' }, { id: 'I2' }, 'text'],
    });
    expect(migrated.images).toEqual([
      { id: 'I1', background: '#112233' },
      { id: 'I2', background: null },
      'text',
    ]);
  });

  it('the registry has the v9 → v10 migration', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(10);
    expect([...migrations.keys()].slice(0, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(migrations.get(9)).toBe(migrateFrom9To10);
  });
});

describe('schema v10', () => {
  it('a v10 project with a container is read unchanged', () => {
    const p = backgroundProject();
    const text = serialize(p);
    const result = load(text);
    expect(result.migratedFrom).toBeNull();
    expect(result.project).toEqual(p);
    expect(serialize(result.project)).toBe(text);
    const bgContainer = result.project.containers.find((i) => i.id === 'B1');
    expect(bgContainer).toMatchObject({
      file: null,
      background: '#FFFFFF',
      width: 390,
      height: 844,
    });
    expect(validateProject(result.project)).toEqual([]);
  });

  it('the new project and the image with a file have `background: null`', () => {
    expect(emptyProject().schemaVersion).toBe(20);
    expect(sampleProject().containers.every((i) => i.background === null)).toBe(true);
  });

  it('malformed color, dimensions and `file` are refused by the schema', () => {
    const p = backgroundProject();
    const bad = (patch: Record<string, unknown>) =>
      deserialize(withImage(p, 'B1', patch), migrations, new Map()).ok;
    expect(bad({ background: 'white' })).toBe(false);
    expect(bad({ background: '#FFF' })).toBe(false);
    expect(bad({ width: 0 })).toBe(false);
    expect(bad({ height: 10.5 })).toBe(false);
    // An empty `file` does not count as "no file": only `null`.
    expect(bad({ file: '' })).toBe(false);
  });

  it('file and color together (or neither) violate the container-content invariant', () => {
    const p = backgroundProject();
    const issues = (id: string, patch: Record<string, unknown>) => {
      const result = deserialize(withImage(p, id, patch), migrations, new Map());
      if (result.ok || result.error.code !== 'invariant-violation') {
        throw new Error('expected invariant-violation');
      }
      return result.error.issues.map((i) => `${i.code}:${i.id}`);
    };
    expect(issues('B1', { background: null })).toEqual(['container-content:B1']);
    expect(issues('B1', { file: 'images/x.png' })).toEqual(['container-content:B1']);
    expect(issues('I2', { background: '#000000' })).toEqual(['container-content:I2']);
  });
});
