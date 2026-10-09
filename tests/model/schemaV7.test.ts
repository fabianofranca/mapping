import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  getAnnotationIssues,
  migrateFrom6To7,
  migrations,
  serialize,
  setImageLocked,
  setMarkingLocked,
  specFiles,
  validateProject,
  type Annotation,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { cadastroProject, codeProject, specProject } from './specFixtures';

const strip = (data: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(data).filter(([k]) => k !== key));

/** Um mapping.json v6 do projeto: sem `platformRepos`. */
function v6Text(p: Project): string {
  const data = JSON.parse(serialize(p)) as Record<string, unknown>;
  return JSON.stringify({ ...strip(data, 'platformRepos'), schemaVersion: 6 });
}

function load(text: string, p: Project) {
  const result = deserialize(text, migrations, specFiles(p));
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result;
}

/** Como a fase 3b.1 deixava um Screen novo: `implementacao: null`. */
function withScreenFrom3b1(p: Project): Project {
  const screen: Annotation = {
    id: 'AS',
    markingId: 'MF',
    layerId: 'LS3',
    name: null,
    inherit: false,
    parentAnnotationId: null,
    type: { specId: 'sdui', typeId: 'screen' },
    values: { nome: 'Cadastro', rota: null, implementacao: null },
    entries: [],
  };
  return { ...p, annotations: [...p.annotations, screen] };
}

describe('migração v6 → v7 (referências de código)', () => {
  it('ganha platformRepos: {} e o resto fica igual', () => {
    const result = load(v6Text(sampleProject()), sampleProject());
    expect(result.migratedFrom).toBe(6);
    expect(result.readOnly).toBe(false);
    expect(result.project.schemaVersion).toBe(8);
    expect(result.project.platformRepos).toEqual({});
    expect(result.project).toEqual(sampleProject());
  });

  it('projeto com especializações (SDUI v2 e Modelo de dados v1), trava e codeRef da 3b.1', () => {
    let p = withScreenFrom3b1(cadastroProject());
    p = setMarkingLocked(p, 'MF', true);
    p = setImageLocked(p, 'I1', true);
    expect(validateProject(p)).toEqual([]);
    const result = load(v6Text(p), p);
    expect(result.migratedFrom).toBe(6);
    expect(result.specWarnings).toEqual([]);
    expect(result.project).toEqual({ ...p, platformRepos: {} });
    // Nada mais muda nos dados: o `null` do codeRef continua `null`, sem pendência.
    const screen = result.project.annotations.find((a) => a.id === 'AS');
    expect(screen?.values?.implementacao).toBeNull();
    expect(getAnnotationIssues(result.project, 'AS')).toEqual([]);
    expect(result.project.markings.find((m) => m.id === 'MF')?.locked).toBe(true);
    expect(result.project.images[0]?.locked).toBe(true);
  });

  it('o v6 migrado salva como v8 estável (round-trip)', () => {
    const p = cadastroProject();
    const first = load(v6Text(p), p);
    const saved = serialize(first.project);
    expect(JSON.parse(saved)).toMatchObject({ schemaVersion: 8, platformRepos: {} });
    const again = load(saved, p);
    expect(again.migratedFrom).toBeNull();
    expect(serialize(again.project)).toBe(saved);
  });

  it('é idempotente: preserva um platformRepos que já exista', () => {
    const repos = {
      android: { urlTemplate: 'https://x/{path}', localPath: null },
    };
    expect(migrateFrom6To7({ platformRepos: repos })).toEqual({ platformRepos: repos });
    expect(migrateFrom6To7({})).toEqual({ platformRepos: {} });
    expect(migrateFrom6To7(migrateFrom6To7({ a: 1 }))).toEqual(migrateFrom6To7({ a: 1 }));
    // Um v6 que já trazia o campo (ex: editado à mão) não perde a configuração.
    const p = specProject();
    const data = JSON.parse(serialize(p)) as Record<string, unknown>;
    const text = JSON.stringify({ ...data, schemaVersion: 6, platformRepos: repos });
    expect(load(text, p).project.platformRepos).toEqual(repos);
  });

  it('o registro tem a migração da v6', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(7);
    expect(migrations.get(6)).toBe(migrateFrom6To7);
  });
});

describe('schema v7', () => {
  it('serializa platformRepos depois de specializations, na ordem gravada', () => {
    const p = codeProject();
    const text = serialize(p);
    const data = JSON.parse(text);
    expect(Object.keys(data).indexOf('platformRepos')).toBe(
      Object.keys(data).indexOf('specializations') + 1,
    );
    expect(data.platformRepos).toEqual({
      android: {
        urlTemplate: 'https://github.com/org/app-android/blob/main/{path}#L{line}',
        localPath: '../../..',
      },
    });
    const screen = data.annotations.find((a: { id: string }) => a.id === 'AS');
    expect(screen.values.implementacao.map((e: object) => Object.keys(e))).toEqual([
      ['_id', 'platform', 'path', 'symbol', 'line'],
      ['_id', 'platform', 'path', 'symbol', 'line'],
      ['_id', 'platform', 'path', 'symbol', 'line'],
    ]);
    const loaded = load(text, p);
    expect(loaded.project).toEqual(p);
    expect(serialize(loaded.project)).toBe(text);
  });

  it('recusa platformRepos ausente, com id fora do formato ou com campos inválidos', () => {
    const data = JSON.parse(serialize(sampleProject()));
    const variants: unknown[] = [
      undefined,
      [],
      { Android: { urlTemplate: null, localPath: null } },
      { android: { urlTemplate: 1, localPath: null } },
      { android: { urlTemplate: null } },
      { android: null },
    ];
    for (const platformRepos of variants) {
      const text = JSON.stringify({ ...data, platformRepos });
      expect(deserialize(text), JSON.stringify(platformRepos)).toMatchObject({
        ok: false,
        error: { code: 'invalid-schema' },
      });
    }
    // Plataforma que nenhuma especialização declara não impede a abertura.
    const orphan = { web: { urlTemplate: '', localPath: null } };
    const loaded = deserialize(JSON.stringify({ ...data, platformRepos: orphan }));
    expect(loaded.ok && loaded.project.platformRepos).toEqual(orphan);
  });

  it('_id repetido numa lista de codeRef impede a abertura (como nas linhas de tabela)', () => {
    const p = codeProject();
    const data = JSON.parse(serialize(p));
    const screen = data.annotations.find((a: { id: string }) => a.id === 'AS');
    screen.values.implementacao[1]._id = 'C1';
    const result = deserialize(JSON.stringify(data), migrations, specFiles(p));
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'invariant-violation', issues: [{ code: 'duplicate-row-id' }] },
    });
  });

  it('versão mais nova com platformRepos abre somente leitura', () => {
    const p = codeProject();
    const text = JSON.stringify({
      ...JSON.parse(serialize(p)),
      schemaVersion: SCHEMA_VERSION + 1,
    });
    const loaded = load(text, p);
    expect(loaded.readOnly).toBe(true);
    expect(loaded.project.platformRepos).toEqual(p.platformRepos);
  });
});
