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
import { codeProject } from './specFixtures';

const strip = (item: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(item).filter(([k]) => k !== key));

/** Um mapping.json v7 do projeto: sem `source` nas imagens e marcações. */
function v7Text(p: Project): string {
  const data = JSON.parse(serialize(p)) as Record<string, unknown>;
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

describe('migração v7 → v8 (origem externa)', () => {
  it('imagens e marcações ganham source: null e o resto fica igual', () => {
    const result = load(v7Text(sampleProject()));
    expect(result.migratedFrom).toBe(7);
    expect(result.readOnly).toBe(false);
    expect(result.project.schemaVersion).toBe(8);
    expect(result.project.images.every((i) => i.source === null)).toBe(true);
    expect(result.project.markings.every((m) => m.source === null)).toBe(true);
    expect(result.project).toEqual(sampleProject());
  });

  it('projeto com especializações, codeRef e repositórios migra sem perder nada', () => {
    const p = codeProject();
    expect(load(v7Text(p), p).project).toEqual(p);
  });

  it('o v7 migrado salva como v8 estável (round-trip)', () => {
    const saved = serialize(load(v7Text(sampleProject())).project);
    expect(JSON.parse(saved).schemaVersion).toBe(8);
    const again = load(saved);
    expect(again.migratedFrom).toBeNull();
    expect(serialize(again.project)).toBe(saved);
  });

  it('preserva um source que já exista e não toca em itens que não são objetos', () => {
    const migrated = migrateFrom7To8({
      images: [{ id: 'I1', source: FIGMA }, 7],
      markings: [{ id: 'M1' }],
    });
    expect(migrated.images).toEqual([{ id: 'I1', source: FIGMA }, 7]);
    expect(migrated.markings).toEqual([{ id: 'M1', source: null }]);
  });

  it('o registro tem as migrações de cada versão até a v8', () => {
    expect(SCHEMA_VERSION).toBe(8);
    expect([...migrations.keys()]).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('schema v8: source', () => {
  it('serializa source no fim de cada imagem e marcação, na ordem system, id, url', () => {
    let p = setImageSource(sampleProject(), 'I1', FIGMA);
    p = setMarkingSource(p, 'M1', { system: 'figma', id: '12:35', url: null });
    const text = serialize(p);
    const data = JSON.parse(text);
    expect(Object.keys(data.images[0]).at(-1)).toBe('source');
    expect(Object.keys(data.images[0].source)).toEqual(['system', 'id', 'url']);
    expect(data.markings[0].source).toEqual({ system: 'figma', id: '12:35', url: null });
    expect(data.markings[1].source).toBeNull();
    const loaded = load(text);
    expect(loaded.project).toEqual(p);
    expect(serialize(loaded.project)).toBe(text);
  });

  it('recusa source sem system, com id vazio ou sem a chave url', () => {
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

  it('setImageSource e setMarkingSource normalizam, limpam e recusam origem incompleta', () => {
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
    expect(() => setImageSource(p, 'nada', FIGMA)).toThrow('not-found');
  });

  it('a trava não impede definir a origem (não é geometria)', () => {
    let p = setImageLocked(sampleProject(), 'I1', true);
    p = setMarkingLocked(p, 'M1', true);
    p = setImageSource(p, 'I1', FIGMA);
    p = setMarkingSource(p, 'M1', FIGMA);
    expect(p.images[0]?.source).toEqual(FIGMA);
    expect(p.markings[0]?.locked).toBe(true);
  });
});

describe('findBySource', () => {
  it('acha imagens e marcações pela origem exata, imagens primeiro', () => {
    let p = setImageSource(sampleProject(), 'I2', FIGMA);
    p = setMarkingSource(p, 'M3', FIGMA);
    p = setMarkingSource(p, 'M1', { system: 'figma', id: 'outro', url: null });
    const found = findBySource(p, 'figma', '12:34');
    expect(found.map((f) => (f.kind === 'image' ? f.image.id : f.marking.id))).toEqual([
      'I2',
      'M3',
    ]);
    expect(found.map((f) => f.kind)).toEqual(['image', 'marking']);
  });

  it('não acha com outro sistema, outro id ou sem origem', () => {
    const p = setMarkingSource(sampleProject(), 'M1', FIGMA);
    expect(findBySource(p, 'sketch', '12:34')).toEqual([]);
    expect(findBySource(p, 'figma', '12:3')).toEqual([]);
    expect(findBySource(sampleProject(), 'figma', '12:34')).toEqual([]);
  });
});
