import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  addBackgroundContainer,
  deserialize,
  migrateFrom11To12,
  migrations,
  serialize,
  type Project,
} from '../../src/model';
import { emptyProject, sampleProject } from './fixtures';
import { legacyJson } from './legacyShape';

// Schema v12 (stage Container): the `images` collection became `containers` and the marking points by
// `containerId` (it was `imageId`). The v11 → v12 migration only renames the keys.

function load(text: string) {
  const result = deserialize(text, migrations, new Map());
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result;
}

/** Project with images with a file and a container without a file (background), with a marking in it. */
function mixedProject(): Project {
  return addBackgroundContainer(sampleProject(), {
    id: 'B1',
    name: 'Login',
    width: 390,
    height: 844,
    background: '#112233',
  });
}

/** A v11 mapping.json of the project: `images`, `imageId` and the old version. */
function v11Text(p: Project): string {
  return JSON.stringify({ ...legacyJson(p), schemaVersion: 11 });
}

describe('migration v11 → v12 (containers)', () => {
  it('the registry has the v11 → v12 migration and the chain goes up to the current version', () => {
    expect(SCHEMA_VERSION).toBe(20);
    expect(migrations.get(11)).toBe(migrateFrom11To12);
    expect([...migrations.keys()]).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    ]);
  });

  it('v11 with an image with a file and a container without a file: all the same, only with the new keys', () => {
    const p = mixedProject();
    expect(p.containers.some((c) => c.file === null)).toBe(true);
    expect(p.containers.some((c) => c.file !== null)).toBe(true);
    const text = v11Text(p);
    // The starting point really has the old format.
    const old = JSON.parse(text) as Record<string, unknown>;
    expect(old.images).toBeDefined();
    expect(old.containers).toBeUndefined();

    const result = load(text);
    expect(result.migratedFrom).toBe(11);
    expect(result.readOnly).toBe(false);
    expect(result.project).toEqual(p);

    const saved = JSON.parse(serialize(result.project)) as Record<string, unknown>;
    expect(saved.schemaVersion).toBe(20);
    expect(saved.images).toBeUndefined();
    expect(saved.containers).toEqual(
      (JSON.parse(serialize(p)) as { containers: unknown }).containers,
    );
    const markings = saved.markings as Record<string, unknown>[];
    expect(markings.length).toBe(p.markings.length);
    for (const m of markings) {
      expect(m.imageId).toBeUndefined();
      expect(typeof m.containerId).toBe('string');
    }
    // Nothing disappears: the same counts and the same ids as before.
    expect((old.images as { id: string }[]).map((i) => i.id)).toEqual(
      p.containers.map((c) => c.id),
    );
    expect((old.markings as { imageId: string }[]).map((m) => m.imageId)).toEqual(
      p.markings.map((m) => m.containerId),
    );
  });

  it('the function only renames the keys and does not touch the values', () => {
    expect(
      migrateFrom11To12({
        a: 1,
        images: [{ id: 'I1', file: null }, 'text'],
        markings: [{ id: 'M1', imageId: 'I1', x: 1 }, 7],
      }),
    ).toEqual({
      a: 1,
      containers: [{ id: 'I1', file: null }, 'text'],
      markings: [{ id: 'M1', containerId: 'I1', x: 1 }, 7],
    });
  });

  it('a new key that is already present is preserved (the old one is discarded)', () => {
    expect(
      migrateFrom11To12({
        images: [{ id: 'old' }],
        containers: [{ id: 'new' }],
        markings: [{ id: 'M1', imageId: 'old', containerId: 'new' }],
      }),
    ).toEqual({
      containers: [{ id: 'new' }],
      markings: [{ id: 'M1', containerId: 'new' }],
    });
  });

  it('a file without the old keys passes unchanged', () => {
    const data = { schemaVersion: 11, containers: [], markings: [] };
    expect(migrateFrom11To12(data)).toEqual(data);
  });

  it('writes v12 and re-reading is stable (round-trip)', () => {
    const first = load(v11Text(mixedProject()));
    const saved = serialize(first.project);
    const again = load(saved);
    expect(again.migratedFrom).toBeNull();
    expect(again.project).toEqual(first.project);
    expect(serialize(again.project)).toBe(saved);
  });

  it('the v1 → v12 chain (a real v1) reaches today\'s project', () => {
    const v1 = readFileSync(
      new URL('../fixtures/mapping-v1.json', import.meta.url),
      'utf8',
    );
    const original = JSON.parse(v1) as {
      images: { id: string }[];
      markings: { imageId: string }[];
    };
    const result = load(v1);
    expect(result.migratedFrom).toBe(1);
    expect(result.project.schemaVersion).toBe(20);
    expect(result.project.containers.map((c) => c.id)).toEqual(
      original.images.map((i) => i.id),
    );
    expect(result.project.markings.map((m) => m.containerId)).toEqual(
      original.markings.map((m) => m.imageId),
    );
    const saved = JSON.parse(serialize(result.project)) as Record<string, unknown>;
    expect(saved.images).toBeUndefined();
    expect(saved.schemaVersion).toBe(20);
  });
});

describe('schema v12', () => {
  it('the new project writes the current version with containers', () => {
    expect(emptyProject().schemaVersion).toBe(20);
    expect(JSON.parse(serialize(emptyProject()))).toMatchObject({
      schemaVersion: 20,
      containers: [],
    });
  });

  it('fixed key order: containers in place of images, containerId right after the id', () => {
    const data = JSON.parse(serialize(sampleProject())) as {
      containers: unknown[];
      markings: Record<string, unknown>[];
    };
    expect(Object.keys(data)).toEqual([
      'schemaVersion',
      'revision',
      'app',
      'coordinateSystem',
      'project',
      'specializations',
      'platformRepos',
      'docRepos',
      'layers',
      'containers',
      'markings',
      'arrows',
      'perspectives',
      'arrivals',
      'annotations',
    ]);
    expect(Object.keys(data.markings[0] ?? {}).slice(0, 3)).toEqual([
      'id',
      'containerId',
      'parentId',
    ]);
  });

  it('a v12 project is read unchanged and without migration', () => {
    const p = mixedProject();
    const text = serialize(p);
    const result = load(text);
    expect(result.migratedFrom).toBeNull();
    expect(result.readOnly).toBe(false);
    expect(result.project).toEqual(p);
    expect(serialize(result.project)).toBe(text);
  });

  it('a file with the old keys at version 12 is refused by the schema', () => {
    const data = legacyJson(mixedProject());
    const result = deserialize(
      JSON.stringify({ ...data, schemaVersion: 12 }),
      migrations,
      new Map(),
    );
    expect(result.ok).toBe(false);
  });
});
