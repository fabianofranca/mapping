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

// Schema v12 (etapa Container): a coleção `images` virou `containers` e a marcação aponta por
// `containerId` (era `imageId`). A migração v11 → v12 só renomeia as chaves.

function load(text: string) {
  const result = deserialize(text, migrations, new Map());
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result;
}

/** Projeto com imagens com arquivo e um container sem arquivo (fundo), com marcação nele. */
function mixedProject(): Project {
  return addBackgroundContainer(sampleProject(), {
    id: 'B1',
    name: 'Login',
    width: 390,
    height: 844,
    background: '#112233',
  });
}

/** Um mapping.json v11 do projeto: `images`, `imageId` e a versão antiga. */
function v11Text(p: Project): string {
  return JSON.stringify({ ...legacyJson(p), schemaVersion: 11 });
}

describe('migração v11 → v12 (containers)', () => {
  it('o registro tem a migração v11 → v12 e a cadeia vai até a versão atual', () => {
    expect(SCHEMA_VERSION).toBe(13);
    expect(migrations.get(11)).toBe(migrateFrom11To12);
    expect([...migrations.keys()]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('v11 com imagem com arquivo e container sem arquivo: tudo igual, só com as chaves novas', () => {
    const p = mixedProject();
    expect(p.containers.some((c) => c.file === null)).toBe(true);
    expect(p.containers.some((c) => c.file !== null)).toBe(true);
    const text = v11Text(p);
    // O ponto de partida tem mesmo o formato antigo.
    const old = JSON.parse(text) as Record<string, unknown>;
    expect(old.images).toBeDefined();
    expect(old.containers).toBeUndefined();

    const result = load(text);
    expect(result.migratedFrom).toBe(11);
    expect(result.readOnly).toBe(false);
    expect(result.project).toEqual(p);

    const saved = JSON.parse(serialize(result.project)) as Record<string, unknown>;
    expect(saved.schemaVersion).toBe(13);
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
    // Nada some: as mesmas contagens e os mesmos ids de antes.
    expect((old.images as { id: string }[]).map((i) => i.id)).toEqual(
      p.containers.map((c) => c.id),
    );
    expect((old.markings as { imageId: string }[]).map((m) => m.imageId)).toEqual(
      p.markings.map((m) => m.containerId),
    );
  });

  it('a função só renomeia as chaves e não mexe nos valores', () => {
    expect(
      migrateFrom11To12({
        a: 1,
        images: [{ id: 'I1', file: null }, 'texto'],
        markings: [{ id: 'M1', imageId: 'I1', x: 1 }, 7],
      }),
    ).toEqual({
      a: 1,
      containers: [{ id: 'I1', file: null }, 'texto'],
      markings: [{ id: 'M1', containerId: 'I1', x: 1 }, 7],
    });
  });

  it('a chave nova já presente é preservada (a antiga é descartada)', () => {
    expect(
      migrateFrom11To12({
        images: [{ id: 'velho' }],
        containers: [{ id: 'novo' }],
        markings: [{ id: 'M1', imageId: 'velho', containerId: 'novo' }],
      }),
    ).toEqual({
      containers: [{ id: 'novo' }],
      markings: [{ id: 'M1', containerId: 'novo' }],
    });
  });

  it('um arquivo sem as chaves antigas passa sem mudança', () => {
    const data = { schemaVersion: 11, containers: [], markings: [] };
    expect(migrateFrom11To12(data)).toEqual(data);
  });

  it('grava v12 e a releitura é estável (round-trip)', () => {
    const first = load(v11Text(mixedProject()));
    const saved = serialize(first.project);
    const again = load(saved);
    expect(again.migratedFrom).toBeNull();
    expect(again.project).toEqual(first.project);
    expect(serialize(again.project)).toBe(saved);
  });

  it('a cadeia v1 → v12 (um v1 real) chega ao projeto de hoje', () => {
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
    expect(result.project.schemaVersion).toBe(13);
    expect(result.project.containers.map((c) => c.id)).toEqual(
      original.images.map((i) => i.id),
    );
    expect(result.project.markings.map((m) => m.containerId)).toEqual(
      original.markings.map((m) => m.imageId),
    );
    const saved = JSON.parse(serialize(result.project)) as Record<string, unknown>;
    expect(saved.images).toBeUndefined();
    expect(saved.schemaVersion).toBe(13);
  });
});

describe('schema v12', () => {
  it('o projeto novo grava a versão atual com containers', () => {
    expect(emptyProject().schemaVersion).toBe(13);
    expect(JSON.parse(serialize(emptyProject()))).toMatchObject({
      schemaVersion: 13,
      containers: [],
    });
  });

  it('ordem fixa de chaves: containers no lugar de images, containerId logo após o id', () => {
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
      'layers',
      'containers',
      'markings',
      'annotations',
    ]);
    expect(Object.keys(data.markings[0] ?? {}).slice(0, 3)).toEqual([
      'id',
      'containerId',
      'parentId',
    ]);
  });

  it('um projeto v12 é lido sem mudança e sem migração', () => {
    const p = mixedProject();
    const text = serialize(p);
    const result = load(text);
    expect(result.migratedFrom).toBeNull();
    expect(result.readOnly).toBe(false);
    expect(result.project).toEqual(p);
    expect(serialize(result.project)).toBe(text);
  });

  it('um arquivo com as chaves antigas na versão 12 é recusado pelo schema', () => {
    const data = legacyJson(mixedProject());
    const result = deserialize(
      JSON.stringify({ ...data, schemaVersion: 12 }),
      migrations,
      new Map(),
    );
    expect(result.ok).toBe(false);
  });
});
