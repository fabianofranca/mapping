import { describe, expect, it } from 'vitest';
import {
  ModelError,
  SCHEMA_VERSION,
  deserialize,
  findBySource,
  migrateFrom7To8,
  migrations,
  serialize,
  setImageLocked,
  setImageSource,
  setMarkingLocked,
  setMarkingSource,
  specFiles,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { legacyJson } from './legacyShape';
import { codeProject } from './specFixtures';

const strip = (item: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(item).filter(([k]) => k !== key));

/** A v7 mapping.json of the project: without `source` on images and markings. */
function v7Text(p: Project): string {
  const data = legacyJson(p);
  return JSON.stringify({
    ...data,
    schemaVersion: 7,
    images: (data.images as Record<string, unknown>[]).map((i) => strip(i, 'source')),
    markings: (data.markings as Record<string, unknown>[]).map((m) => strip(m, 'source')),
  });
}

function load(text: string, p: Project = sampleProject()) {
  const result = deserialize(text, migrations, specFiles(p));
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result;
}

const FIGMA = {
  system: 'figma',
  id: '12:34',
  url: 'https://figma.com/file/x?node-id=12-34',
};

describe('migration v7 → v8 (external source)', () => {
  it('images and markings get source: null and the rest stays the same', () => {
    const result = load(v7Text(sampleProject()));
    expect(result.migratedFrom).toBe(7);
    expect(result.readOnly).toBe(false);
    expect(result.project.schemaVersion).toBe(20);
    expect(result.project.containers.every((i) => i.source === null)).toBe(true);
    expect(result.project.markings.every((m) => m.source === null)).toBe(true);
    expect(result.project).toEqual(sampleProject());
  });

  it('a project with specializations and repositories migrates without losing anything', () => {
    const p = codeProject();
    expect(load(v7Text(p), p).project).toEqual(p);
  });

  it('the migrated v7 saves as a stable v16 (round-trip)', () => {
    const saved = serialize(load(v7Text(sampleProject())).project);
    expect(JSON.parse(saved).schemaVersion).toBe(20);
    const again = load(saved);
    expect(again.migratedFrom).toBeNull();
    expect(serialize(again.project)).toBe(saved);
  });

  it('preserves an existing source and does not touch items that are not objects', () => {
    const migrated = migrateFrom7To8({
      images: [{ id: 'I1', source: FIGMA }, 7],
      markings: [{ id: 'M1' }],
    });
    expect(migrated.images).toEqual([{ id: 'I1', source: FIGMA }, 7]);
    expect(migrated.markings).toEqual([{ id: 'M1', source: null }]);
  });

  it('the registry has the v7 migration', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(8);
    expect(migrations.get(7)).toBe(migrateFrom7To8);
  });
});

describe('schema v8: source', () => {
  it('serializes source at the end of each image and marking, in the order system, id, url', () => {
    let p = setImageSource(sampleProject(), 'I1', FIGMA);
    p = setMarkingSource(p, 'M1', { system: 'figma', id: '12:35', url: null });
    const text = serialize(p);
    const data = JSON.parse(text);
    // `background` (v10) comes after `source`.
    expect(Object.keys(data.containers[0]).at(-2)).toBe('source');
    expect(Object.keys(data.containers[0].source)).toEqual(['system', 'id', 'url']);
    expect(data.markings[0].source).toEqual({ system: 'figma', id: '12:35', url: null });
    expect(data.markings[1].source).toBeNull();
    const loaded = load(text);
    expect(loaded.project).toEqual(p);
    expect(serialize(loaded.project)).toBe(text);
  });

  it('refuses a source without system, with an empty id or without the url key', () => {
    const data = JSON.parse(serialize(sampleProject()));
    const variants: unknown[] = [
      undefined,
      { id: 'x', url: null },
      { system: 'figma', id: '', url: null },
      { system: 'figma', id: 'x' },
      'figma:x',
    ];
    for (const source of variants) {
      const copy = structuredClone(data);
      copy.markings[0].source = source;
      expect(deserialize(JSON.stringify(copy)), JSON.stringify(source)).toMatchObject({
        ok: false,
        error: { code: 'invalid-schema' },
      });
    }
  });

  it('setImageSource and setMarkingSource normalize, clear and refuse an incomplete source', () => {
    let p = setMarkingSource(sampleProject(), 'M2', {
      system: ' figma ',
      id: ' 1:2 ',
      url: '  ',
    });
    expect(p.markings.find((m) => m.id === 'M2')?.source).toEqual({
      system: 'figma',
      id: '1:2',
      url: null,
    });
    p = setMarkingSource(p, 'M2', null);
    expect(p.markings.find((m) => m.id === 'M2')?.source).toBeNull();
    expect(() => setImageSource(p, 'I1', { system: '', id: 'x', url: null })).toThrow(
      ModelError,
    );
    expect(() =>
      setMarkingSource(p, 'M2', { system: 'figma', id: ' ', url: null }),
    ).toThrow('invalid-source');
    expect(() => setImageSource(p, 'nothing', FIGMA)).toThrow('not-found');
  });

  it('the lock does not prevent setting the source (it is not geometry)', () => {
    let p = setImageLocked(sampleProject(), 'I1', true);
    p = setMarkingLocked(p, 'M1', true);
    p = setImageSource(p, 'I1', FIGMA);
    p = setMarkingSource(p, 'M1', FIGMA);
    expect(p.containers[0]?.source).toEqual(FIGMA);
    expect(p.markings[0]?.locked).toBe(true);
  });
});

describe('findBySource', () => {
  it('finds images and markings by the exact source, images first', () => {
    let p = setImageSource(sampleProject(), 'I2', FIGMA);
    p = setMarkingSource(p, 'M3', FIGMA);
    p = setMarkingSource(p, 'M1', { system: 'figma', id: 'other', url: null });
    const found = findBySource(p, 'figma', '12:34');
    expect(found.map((f) => (f.kind === 'image' ? f.image.id : f.marking.id))).toEqual([
      'I2',
      'M3',
    ]);
    expect(found.map((f) => f.kind)).toEqual(['image', 'marking']);
  });

  it('does not find with another system, another id or without a source', () => {
    const p = setMarkingSource(sampleProject(), 'M1', FIGMA);
    expect(findBySource(p, 'sketch', '12:34')).toEqual([]);
    expect(findBySource(p, 'figma', '12:3')).toEqual([]);
    expect(findBySource(sampleProject(), 'figma', '12:34')).toEqual([]);
  });
});
