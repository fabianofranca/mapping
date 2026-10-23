import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  discardedOnMigrationTo11,
  migrateFrom10To11,
  migrations,
  platformRepoSchema,
  serialize,
  type Project,
} from '../../src/model';
import { emptyProject, sampleProject } from './fixtures';
import { legacyJson } from './legacyShape';

// Schema v11 (etapa Código de instanciação): o repositório da plataforma é da especialização
// (`platforms[].repo`) e `platformRepos[x]` fica só com `localPath`. A migração v10 → v11
// descarta o `urlTemplate`; a entrada que fica sem `localPath` sai.

function load(text: string) {
  const result = deserialize(text, migrations, new Map());
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result;
}

/** Um mapping.json v10 do projeto, com `platformRepos` no formato antigo. */
function v10Text(p: Project, platformRepos?: Record<string, unknown>): string {
  const data = legacyJson(p);
  if (platformRepos !== undefined) data.platformRepos = platformRepos;
  return JSON.stringify({ ...data, schemaVersion: 10 });
}

const TEMPLATE = 'https://github.com/org/app/blob/main/{path}#L{line}';

describe('migração v10 → v11 (repositório na especialização)', () => {
  it('descarta o urlTemplate e mantém o localPath', () => {
    const result = load(
      v10Text(sampleProject(), {
        android: { urlTemplate: TEMPLATE, localPath: '../..' },
      }),
    );
    expect(result.migratedFrom).toBe(10);
    expect(result.readOnly).toBe(false);
    expect(result.project.schemaVersion).toBe(13);
    expect(result.project.platformRepos).toEqual({ android: { localPath: '../..' } });
    expect(result.discardedUrlTemplates).toEqual([
      { platform: 'android', urlTemplate: TEMPLATE },
    ]);
  });

  it('entrada só com localPath fica como está e não há nada descartado', () => {
    const result = load(v10Text(sampleProject(), { ios: { localPath: '.' } }));
    expect(result.project.platformRepos).toEqual({ ios: { localPath: '.' } });
    expect(result.discardedUrlTemplates).toEqual([]);
  });

  it('entrada só com urlTemplate (localPath nulo ou vazio) é removida', () => {
    const result = load(
      v10Text(sampleProject(), {
        android: { urlTemplate: TEMPLATE, localPath: null },
        ios: { urlTemplate: TEMPLATE },
        bff: { urlTemplate: null, localPath: '' },
        web: { urlTemplate: null, localPath: null },
        mantida: { urlTemplate: TEMPLATE, localPath: '../app' },
      }),
    );
    expect(result.project.platformRepos).toEqual({ mantida: { localPath: '../app' } });
    expect(result.discardedUrlTemplates.map((d) => d.platform)).toEqual([
      'android',
      'ios',
      'mantida',
    ]);
  });

  it('projeto v10 sem platformRepos ou com {} migra sem mudar mais nada', () => {
    const p = sampleProject();
    const empty = load(v10Text(p, {}));
    expect(empty.migratedFrom).toBe(10);
    expect(empty.project).toEqual(p);
    expect(empty.discardedUrlTemplates).toEqual([]);

    const data = JSON.parse(v10Text(p)) as Record<string, unknown>;
    delete data.platformRepos;
    // Sem `platformRepos` desde a v7 a migração v6 → v7 não rodou; a v10 o exige: o schema recusa.
    expect(deserialize(JSON.stringify(data), migrations, new Map()).ok).toBe(false);
    expect(migrateFrom10To11(data)).toBe(data);
  });

  it('grava a versão atual e a releitura é estável', () => {
    const saved = serialize(
      load(
        v10Text(sampleProject(), { android: { urlTemplate: TEMPLATE, localPath: '..' } }),
      ).project,
    );
    const parsed = JSON.parse(saved) as { schemaVersion: number; platformRepos: unknown };
    expect(parsed.schemaVersion).toBe(13);
    expect(parsed.platformRepos).toEqual({ android: { localPath: '..' } });
    const again = load(saved);
    expect(again.migratedFrom).toBeNull();
    expect(again.discardedUrlTemplates).toEqual([]);
    expect(serialize(again.project)).toBe(saved);
  });

  it('a cadeia v1 → v13 junta o que os passos anteriores já faziam', () => {
    const p = emptyProject();
    const v1 = JSON.stringify({
      schemaVersion: 1,
      app: 'mapeador-imagens',
      coordinateSystem: p.coordinateSystem,
      project: p.project,
      layers: [],
      images: [],
      markings: [],
      annotations: [],
    });
    const result = load(v1);
    expect(result.migratedFrom).toBe(1);
    expect(result.project.schemaVersion).toBe(13);
    expect(result.project.platformRepos).toEqual({});
    expect(result.discardedUrlTemplates).toEqual([]);
  });

  it('a função da migração ignora platformRepos que não é objeto e itens estranhos', () => {
    expect(migrateFrom10To11({ platformRepos: null })).toEqual({ platformRepos: null });
    expect(migrateFrom10To11({ platformRepos: [1] })).toEqual({ platformRepos: [1] });
    expect(
      migrateFrom10To11({
        a: 1,
        platformRepos: {
          x: 'texto',
          y: null,
          z: { localPath: 7 },
          w: { localPath: '.' },
        },
      }),
    ).toEqual({ a: 1, platformRepos: { w: { localPath: '.' } } });
  });

  it('discardedOnMigrationTo11 lista só os urlTemplate não vazios, na ordem do objeto', () => {
    expect(
      discardedOnMigrationTo11({
        platformRepos: {
          android: { urlTemplate: ` ${TEMPLATE} `, localPath: '..' },
          ios: { urlTemplate: '   ', localPath: '.' },
          bff: { urlTemplate: null },
          web: { urlTemplate: 'https://x/{path}' },
          estranho: 'texto',
          outro: { urlTemplate: 3 },
        },
      }),
    ).toEqual([
      { platform: 'android', urlTemplate: TEMPLATE },
      { platform: 'web', urlTemplate: 'https://x/{path}' },
    ]);
    expect(discardedOnMigrationTo11({})).toEqual([]);
    expect(discardedOnMigrationTo11({ platformRepos: [] })).toEqual([]);
  });

  it('o registro tem a migração v10 → v11', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(11);
    expect(migrations.get(10)).toBe(migrateFrom10To11);
    expect([...migrations.keys()].slice(0, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('schema v11', () => {
  it('o projeto novo grava a versão atual com platformRepos vazio', () => {
    expect(emptyProject().schemaVersion).toBe(SCHEMA_VERSION);
    expect(JSON.parse(serialize(emptyProject()))).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      platformRepos: {},
    });
  });

  it('um projeto v11 com localPath é lido sem mudança', () => {
    const p: Project = {
      ...sampleProject(),
      platformRepos: { android: { localPath: '../..' } },
    };
    const text = serialize(p);
    const result = load(text);
    expect(result.migratedFrom).toBeNull();
    expect(result.project).toEqual(p);
    expect(serialize(result.project)).toBe(text);
  });

  it('o schema aceita só localPath (texto ou null) e descarta chave desconhecida', () => {
    expect(platformRepoSchema.safeParse({ localPath: null }).success).toBe(true);
    expect(platformRepoSchema.safeParse({}).success).toBe(false);
    expect(platformRepoSchema.safeParse({ localPath: 3 }).success).toBe(false);
    expect(platformRepoSchema.parse({ localPath: '.', urlTemplate: TEMPLATE })).toEqual({
      localPath: '.',
    });
  });

  it('um v11 gravado à mão com urlTemplate perde a chave na leitura', () => {
    const data = JSON.parse(serialize(sampleProject())) as Record<string, unknown>;
    data.platformRepos = { android: { urlTemplate: TEMPLATE, localPath: '..' } };
    const result = load(JSON.stringify(data));
    expect(result.project.platformRepos).toEqual({ android: { localPath: '..' } });
    expect(result.discardedUrlTemplates).toEqual([]);
  });
});
