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

// Schema v11 (stage Instantiation code): the platform repository belongs to the specialization
// (`platforms[].repo`) and `platformRepos[x]` keeps only `localPath`. The v10 → v11 migration
// discards the `urlTemplate`; an entry left without `localPath` goes away.

function load(text: string) {
  const result = deserialize(text, migrations, new Map());
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result;
}

/** A v10 mapping.json of the project, with `platformRepos` in the old format. */
function v10Text(p: Project, platformRepos?: Record<string, unknown>): string {
  const data = legacyJson(p);
  if (platformRepos !== undefined) data.platformRepos = platformRepos;
  return JSON.stringify({ ...data, schemaVersion: 10 });
}

const TEMPLATE = 'https://github.com/org/app/blob/main/{path}#L{line}';

describe('migration v10 → v11 (repository in the specialization)', () => {
  it('discards the urlTemplate and keeps the localPath', () => {
    const result = load(
      v10Text(sampleProject(), {
        android: { urlTemplate: TEMPLATE, localPath: '../..' },
      }),
    );
    expect(result.migratedFrom).toBe(10);
    expect(result.readOnly).toBe(false);
    expect(result.project.schemaVersion).toBe(20);
    expect(result.project.platformRepos).toEqual({ android: { localPath: '../..' } });
    expect(result.discardedUrlTemplates).toEqual([
      { platform: 'android', urlTemplate: TEMPLATE },
    ]);
  });

  it('an entry with only localPath stays as is and nothing is discarded', () => {
    const result = load(v10Text(sampleProject(), { ios: { localPath: '.' } }));
    expect(result.project.platformRepos).toEqual({ ios: { localPath: '.' } });
    expect(result.discardedUrlTemplates).toEqual([]);
  });

  it('an entry with only urlTemplate (null or empty localPath) is removed', () => {
    const result = load(
      v10Text(sampleProject(), {
        android: { urlTemplate: TEMPLATE, localPath: null },
        ios: { urlTemplate: TEMPLATE },
        bff: { urlTemplate: null, localPath: '' },
        web: { urlTemplate: null, localPath: null },
        kept: { urlTemplate: TEMPLATE, localPath: '../app' },
      }),
    );
    expect(result.project.platformRepos).toEqual({ kept: { localPath: '../app' } });
    expect(result.discardedUrlTemplates.map((d) => d.platform)).toEqual([
      'android',
      'ios',
      'kept',
    ]);
  });

  it('a v10 project without platformRepos or with {} migrates without changing anything else', () => {
    const p = sampleProject();
    const empty = load(v10Text(p, {}));
    expect(empty.migratedFrom).toBe(10);
    expect(empty.project).toEqual(p);
    expect(empty.discardedUrlTemplates).toEqual([]);

    const data = JSON.parse(v10Text(p)) as Record<string, unknown>;
    delete data.platformRepos;
    // Without `platformRepos` since v7 the v6 → v7 migration did not run; v10 requires it: the schema refuses.
    expect(deserialize(JSON.stringify(data), migrations, new Map()).ok).toBe(false);
    expect(migrateFrom10To11(data)).toBe(data);
  });

  it('writes the current version and re-reading is stable', () => {
    const saved = serialize(
      load(
        v10Text(sampleProject(), { android: { urlTemplate: TEMPLATE, localPath: '..' } }),
      ).project,
    );
    const parsed = JSON.parse(saved) as { schemaVersion: number; platformRepos: unknown };
    expect(parsed.schemaVersion).toBe(20);
    expect(parsed.platformRepos).toEqual({ android: { localPath: '..' } });
    const again = load(saved);
    expect(again.migratedFrom).toBeNull();
    expect(again.discardedUrlTemplates).toEqual([]);
    expect(serialize(again.project)).toBe(saved);
  });

  it('the v1 → v16 chain puts together what the previous steps already did', () => {
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
    expect(result.project.schemaVersion).toBe(20);
    expect(result.project.platformRepos).toEqual({});
    expect(result.discardedUrlTemplates).toEqual([]);
  });

  it('the migration function ignores a platformRepos that is not an object and strange items', () => {
    expect(migrateFrom10To11({ platformRepos: null })).toEqual({ platformRepos: null });
    expect(migrateFrom10To11({ platformRepos: [1] })).toEqual({ platformRepos: [1] });
    expect(
      migrateFrom10To11({
        a: 1,
        platformRepos: {
          x: 'text',
          y: null,
          z: { localPath: 7 },
          w: { localPath: '.' },
        },
      }),
    ).toEqual({ a: 1, platformRepos: { w: { localPath: '.' } } });
  });

  it('discardedOnMigrationTo11 lists only the non-empty urlTemplates, in the object order', () => {
    expect(
      discardedOnMigrationTo11({
        platformRepos: {
          android: { urlTemplate: ` ${TEMPLATE} `, localPath: '..' },
          ios: { urlTemplate: '   ', localPath: '.' },
          bff: { urlTemplate: null },
          web: { urlTemplate: 'https://x/{path}' },
          strange: 'text',
          other: { urlTemplate: 3 },
        },
      }),
    ).toEqual([
      { platform: 'android', urlTemplate: TEMPLATE },
      { platform: 'web', urlTemplate: 'https://x/{path}' },
    ]);
    expect(discardedOnMigrationTo11({})).toEqual([]);
    expect(discardedOnMigrationTo11({ platformRepos: [] })).toEqual([]);
  });

  it('the registry has the v10 → v11 migration', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(11);
    expect(migrations.get(10)).toBe(migrateFrom10To11);
    expect([...migrations.keys()].slice(0, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('schema v11', () => {
  it('the new project writes the current version with an empty platformRepos', () => {
    expect(emptyProject().schemaVersion).toBe(SCHEMA_VERSION);
    expect(JSON.parse(serialize(emptyProject()))).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      platformRepos: {},
    });
  });

  it('a v11 project with localPath is read unchanged', () => {
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

  it('the schema accepts only localPath (text or null) and drops an unknown key', () => {
    expect(platformRepoSchema.safeParse({ localPath: null }).success).toBe(true);
    expect(platformRepoSchema.safeParse({}).success).toBe(false);
    expect(platformRepoSchema.safeParse({ localPath: 3 }).success).toBe(false);
    expect(platformRepoSchema.parse({ localPath: '.', urlTemplate: TEMPLATE })).toEqual({
      localPath: '.',
    });
  });

  it('a hand-written v11 with urlTemplate loses the key on reading', () => {
    const data = JSON.parse(serialize(sampleProject())) as Record<string, unknown>;
    data.platformRepos = { android: { urlTemplate: TEMPLATE, localPath: '..' } };
    const result = load(JSON.stringify(data));
    expect(result.project.platformRepos).toEqual({ android: { localPath: '..' } });
    expect(result.discardedUrlTemplates).toEqual([]);
  });
});
