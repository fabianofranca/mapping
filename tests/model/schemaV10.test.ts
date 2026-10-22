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

// Schema v10 (etapa Biblioteca, B3): a imagem pode não ter arquivo (container: `file`
// nulo, `background` com a cor). A migração v9 → v10 só dá `background: null` às imagens.

function load(text: string) {
  const result = deserialize(text, migrations, new Map());
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result;
}

/** Um mapping.json v9 do projeto: sem `background` nas imagens e com a versão antiga. */
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

/** Troca campos da imagem no JSON gravado (para montar combinações inválidas). */
function withImage(p: Project, id: string, patch: Record<string, unknown>): string {
  const data = JSON.parse(serialize(p)) as { containers: { id: string }[] };
  data.containers = data.containers.map((i) => (i.id === id ? { ...i, ...patch } : i));
  return JSON.stringify(data);
}

describe('migração v9 → v10 (container)', () => {
  it('todas as imagens ganham `background: null`, sem perder mais nada', () => {
    const p = sampleProject();
    const result = load(v9Text(p));
    expect(result.migratedFrom).toBe(9);
    expect(result.readOnly).toBe(false);
    expect(result.project.schemaVersion).toBe(12);
    expect(result.project.containers.every((i) => i.background === null)).toBe(true);
    expect(result.project).toEqual(p);
  });

  it('grava v10 e a releitura é estável', () => {
    const saved = serialize(load(v9Text(sampleProject())).project);
    expect(JSON.parse(saved).schemaVersion).toBe(12);
    const again = load(saved);
    expect(again.migratedFrom).toBeNull();
    expect(serialize(again.project)).toBe(saved);
  });

  it('a função da migração preserva um valor já presente e itens que não são objetos', () => {
    const migrated = migrateFrom9To10({
      images: [{ id: 'I1', background: '#112233' }, { id: 'I2' }, 'texto'],
    });
    expect(migrated.images).toEqual([
      { id: 'I1', background: '#112233' },
      { id: 'I2', background: null },
      'texto',
    ]);
  });

  it('o registro tem a migração v9 → v10', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(10);
    expect([...migrations.keys()].slice(0, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(migrations.get(9)).toBe(migrateFrom9To10);
  });
});

describe('schema v10', () => {
  it('um projeto v10 com container é lido sem mudança', () => {
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

  it('o projeto novo e a imagem com arquivo têm `background: null`', () => {
    expect(emptyProject().schemaVersion).toBe(12);
    expect(sampleProject().containers.every((i) => i.background === null)).toBe(true);
  });

  it('cor, dimensões e `file` malformados são recusados pelo schema', () => {
    const p = backgroundProject();
    const bad = (patch: Record<string, unknown>) =>
      deserialize(withImage(p, 'B1', patch), migrations, new Map()).ok;
    expect(bad({ background: 'branco' })).toBe(false);
    expect(bad({ background: '#FFF' })).toBe(false);
    expect(bad({ width: 0 })).toBe(false);
    expect(bad({ height: 10.5 })).toBe(false);
    // `file` vazio não vale como "sem arquivo": só `null`.
    expect(bad({ file: '' })).toBe(false);
  });

  it('arquivo e cor juntos (ou nenhum dos dois) violam o invariante container-content', () => {
    const p = backgroundProject();
    const issues = (id: string, patch: Record<string, unknown>) => {
      const result = deserialize(withImage(p, id, patch), migrations, new Map());
      if (result.ok || result.error.code !== 'invariant-violation') {
        throw new Error('esperava invariant-violation');
      }
      return result.error.issues.map((i) => `${i.code}:${i.id}`);
    };
    expect(issues('B1', { background: null })).toEqual(['container-content:B1']);
    expect(issues('B1', { file: 'images/x.png' })).toEqual(['container-content:B1']);
    expect(issues('I2', { background: '#000000' })).toEqual(['container-content:I2']);
  });
});
