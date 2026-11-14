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
import { legacyJson } from './legacyShape';
import { cadastroProject, codeProject, specProject } from './specFixtures';

const strip = (data: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(data).filter(([k]) => k !== key));

/** A v6 mapping.json of the project: without `platformRepos`. */
function v6Text(p: Project): string {
  const data = legacyJson(p);
  return JSON.stringify({ ...strip(data, 'platformRepos'), schemaVersion: 6 });
}

function load(text: string, p: Project) {
  const result = deserialize(text, migrations, specFiles(p));
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result;
}

/** A Screen in the Form (the SDUI v2 type without `code`). */
function withScreen(p: Project): Project {
  const screen: Annotation = {
    id: 'AS',
    markingId: 'MF',
    layerId: 'LS3',
    name: null,
    parentAnnotationId: null,
    parentRole: null,
    type: { specId: 'sdui', typeId: 'screen' },
    values: { nome: 'Cadastro', rota: null },
    entries: [],
  };
  return { ...p, annotations: [...p.annotations, screen] };
}

describe('migration v6 → v7 (code references)', () => {
  it('gets platformRepos: {} and the rest stays the same', () => {
    const result = load(v6Text(sampleProject()), sampleProject());
    expect(result.migratedFrom).toBe(6);
    expect(result.readOnly).toBe(false);
    expect(result.project.schemaVersion).toBe(20);
    expect(result.project.platformRepos).toEqual({});
    expect(result.project).toEqual(sampleProject());
  });

  it('project with specializations (SDUI v2 and Data model v1) and lock', () => {
    let p = withScreen(cadastroProject());
    p = setMarkingLocked(p, 'MF', true);
    p = setImageLocked(p, 'I1', true);
    expect(validateProject(p)).toEqual([]);
    const result = load(v6Text(p), p);
    expect(result.migratedFrom).toBe(6);
    expect(result.specWarnings).toEqual([]);
    expect(result.project).toEqual({ ...p, platformRepos: {} });
    // Nothing else changes in the data.
    const screen = result.project.annotations.find((a) => a.id === 'AS');
    expect(screen?.values).toEqual({ nome: 'Cadastro', rota: null });
    expect(getAnnotationIssues(result.project, 'AS')).toEqual([]);
    expect(result.project.markings.find((m) => m.id === 'MF')?.locked).toBe(true);
    expect(result.project.containers[0]?.locked).toBe(true);
  });

  it('the migrated v6 saves as a stable v16 (round-trip)', () => {
    const p = cadastroProject();
    const first = load(v6Text(p), p);
    const saved = serialize(first.project);
    expect(JSON.parse(saved)).toMatchObject({ schemaVersion: 20, platformRepos: {} });
    const again = load(saved, p);
    expect(again.migratedFrom).toBeNull();
    expect(serialize(again.project)).toBe(saved);
  });

  it('is idempotent: preserves an existing platformRepos', () => {
    const repos = {
      android: { urlTemplate: 'https://x/{path}', localPath: '../app' },
    };
    expect(migrateFrom6To7({ platformRepos: repos })).toEqual({ platformRepos: repos });
    expect(migrateFrom6To7({})).toEqual({ platformRepos: {} });
    expect(migrateFrom6To7(migrateFrom6To7({ a: 1 }))).toEqual(migrateFrom6To7({ a: 1 }));
    // A v6 that already carried the field (e.g. hand-edited) does not lose the configuration; along the chain
    // up to v11 only the `urlTemplate` goes away (the address became the specialization's).
    const p = specProject();
    const data = JSON.parse(serialize(p)) as Record<string, unknown>;
    const text = JSON.stringify({ ...data, schemaVersion: 6, platformRepos: repos });
    expect(load(text, p).project.platformRepos).toEqual({
      android: { localPath: '../app' },
    });
  });

  it('the registry has the v6 migration', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(7);
    expect(migrations.get(6)).toBe(migrateFrom6To7);
  });
});

describe('schema v7', () => {
  it('serializes platformRepos after specializations, in the stored order', () => {
    const p = codeProject();
    const text = serialize(p);
    const data = JSON.parse(text);
    expect(Object.keys(data).indexOf('platformRepos')).toBe(
      Object.keys(data).indexOf('specializations') + 1,
    );
    // Since v11 the project only stores the local clone; the address belongs to the specialization.
    expect(data.platformRepos).toEqual({ android: { localPath: '../../..' } });
    const loaded = load(text, p);
    expect(loaded.project).toEqual(p);
    expect(serialize(loaded.project)).toBe(text);
  });

  it('refuses missing platformRepos, with an id outside the format or with invalid fields', () => {
    const data = JSON.parse(serialize(sampleProject()));
    const variants: unknown[] = [
      undefined,
      [],
      { Android: { localPath: null } },
      { android: { localPath: 1 } },
      { android: {} },
      { android: null },
    ];
    for (const platformRepos of variants) {
      const text = JSON.stringify({ ...data, platformRepos });
      expect(deserialize(text), JSON.stringify(platformRepos)).toMatchObject({
        ok: false,
        error: { code: 'invalid-schema' },
      });
    }
    // A platform that no specialization declares does not prevent opening.
    const orphan = { web: { localPath: '.' } };
    const loaded = deserialize(JSON.stringify({ ...data, platformRepos: orphan }));
    expect(loaded.ok && loaded.project.platformRepos).toEqual(orphan);
  });

  it('a newer version with platformRepos opens read-only', () => {
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
