import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  migrate,
  serialize,
  settleHierarchy,
  type Migration,
} from '../../src/model';
import { emptyProject, sampleProject } from './fixtures';

function ok(text: string, registry?: ReadonlyMap<number, Migration>) {
  const result = deserialize(text, registry);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result;
}

describe('serialization', () => {
  it('a round trip preserves the key order of the nested values', () => {
    const base = sampleProject();
    const [first, ...rest] = base.annotations;
    if (!first) throw new Error('fixture');
    const values = {
      zeta: 1,
      alpha: { z: 'a', b: [{ y: 1, a: 2 }], m: null },
      middle: { k2: true, k1: false },
    };
    const p = {
      ...base,
      annotations: [
        { ...first, type: { specId: 's', typeId: 't' }, values, entries: [] },
        ...rest,
      ],
    };
    const text = serialize(p);
    const again = serialize(ok(text).project);
    expect(again).toBe(text);
    const read = ok(text).project.annotations[0]?.values;
    expect(Object.keys(read ?? {})).toEqual(['zeta', 'alpha', 'middle']);
    expect(Object.keys((read?.alpha ?? {}) as object)).toEqual(['z', 'b', 'm']);
    expect(Object.keys((read?.middle ?? {}) as object)).toEqual(['k2', 'k1']);
  });

  it('the JSON round-trip is identical', () => {
    const text = serialize(sampleProject());
    const loaded = ok(text);
    expect(loaded.readOnly).toBe(false);
    expect(loaded.migratedFrom).toBeNull();
    expect(serialize(loaded.project)).toBe(text);
    expect(loaded.project).toEqual(sampleProject());
  });

  it('uses 2 spaces, a fixed key order and a trailing newline', () => {
    const text = serialize(emptyProject());
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.split('\n')[1]).toBe('  "schemaVersion": 23,');
    expect(Object.keys(JSON.parse(text))).toEqual([
      'schemaVersion',
      'revision',
      'app',
      'coordinateSystem',
      'project',
      'specializations',
      'platformRepos',
      'docRepos',
      'pages',
      'layers',
      'containers',
      'markings',
      'arrows',
      'perspectives',
      'arrivals',
      'annotations',
    ]);
  });

  it('the order of the input keys does not matter', () => {
    const p = sampleProject();
    const shuffled = JSON.stringify({
      annotations: p.annotations,
      markings: p.markings,
      containers: p.containers,
      layers: p.layers,
      pages: p.pages,
      platformRepos: p.platformRepos,
      docRepos: p.docRepos,
      specializations: p.specializations,
      project: p.project,
      coordinateSystem: p.coordinateSystem,
      app: p.app,
      schemaVersion: p.schemaVersion,
      revision: p.revision,
    });
    expect(serialize(ok(shuffled).project)).toBe(serialize(p));
  });

  it('preserves unicode and empty strings', () => {
    const text = serialize(sampleProject());
    // pt-BR kept: unicode (accents) is the object of the test, in the shared sampleProject entries
    expect(text).toContain('"gravidade"');
    expect(text).toContain('"média"');
    expect(ok(text).project.annotations[0]?.entries[1]?.value).toBe('média');
  });

  it('rejects invalid JSON, an invalid schema and violated invariants', () => {
    expect(deserialize('{')).toEqual({ ok: false, error: { code: 'invalid-json' } });
    expect(deserialize('[]')).toMatchObject({
      ok: false,
      error: { code: 'invalid-schema' },
    });

    const data = JSON.parse(serialize(sampleProject()));
    data.layers[0].color = 'red';
    expect(deserialize(JSON.stringify(data))).toMatchObject({
      ok: false,
      error: { code: 'invalid-schema' },
    });

    const overlap = JSON.parse(serialize(sampleProject()));
    overlap.containers[1].placement.x = 10;
    expect(deserialize(JSON.stringify(overlap))).toMatchObject({
      ok: false,
      error: { code: 'invariant-violation', issues: [{ code: 'images-overlap' }] },
    });
  });

  it('missing or invalid version', () => {
    const data = JSON.parse(serialize(emptyProject()));
    delete data.schemaVersion;
    expect(deserialize(JSON.stringify(data))).toMatchObject({
      ok: false,
      error: { code: 'unsupported-version' },
    });
  });

  it('a newer version opens in read-only mode', () => {
    const data = {
      ...JSON.parse(serialize(sampleProject())),
      schemaVersion: 99,
      extra: 1,
    };
    const loaded = ok(JSON.stringify(data));
    expect(loaded.readOnly).toBe(true);
    expect(loaded.project.markings).toHaveLength(4);
  });

  it('an incompatible newer version is rejected', () => {
    const data = { schemaVersion: 99, allDifferent: true };
    expect(deserialize(JSON.stringify(data))).toMatchObject({
      ok: false,
      error: { code: 'unsupported-version', version: 99 },
    });
  });
});

// Decision 6 of #1971: reading settles the project (a hand-edited `parentId` is corrected in
// memory; nothing is written until an edit).
describe('reading settles the project', () => {
  /** The sample project with `M2`'s `parentId` (inside `M1` by geometry) edited to null. */
  function handEdited(mutate?: (json: Record<string, unknown>) => void): string {
    const json = JSON.parse(serialize(sampleProject())) as {
      markings: { id: string; parentId: string | null }[];
    };
    const m2 = json.markings.find((m) => m.id === 'M2');
    if (!m2) throw new Error('fixture');
    m2.parentId = null;
    mutate?.(json as unknown as Record<string, unknown>);
    return JSON.stringify(json);
  }

  it('a hand-edited parentId comes out settled by geometry', () => {
    const read = ok(handEdited()).project;
    expect(read.markings.find((m) => m.id === 'M2')?.parentId).toBe('M1');
    expect(read).toEqual(sampleProject());
  });

  it('an already settled project comes out as the same object (no extra copy)', () => {
    const { project } = ok(serialize(sampleProject()));
    expect(settleHierarchy(project)).toBe(project);
  });

  it('a read-only project (newer schema) is settled too', () => {
    const text = handEdited((json) => {
      json.schemaVersion = SCHEMA_VERSION + 1;
    });
    const result = ok(text);
    expect(result.readOnly).toBe(true);
    expect(result.project.markings.find((m) => m.id === 'M2')?.parentId).toBe('M1');
  });

  it('the repaired project is settled when nothing is left unrepaired', () => {
    const text = handEdited((json) => {
      delete json.pages;
    });
    const result = deserialize(text);
    if (result.ok || result.error.code !== 'invariant-violation') {
      throw new Error('expected an invariant violation');
    }
    expect(result.repair?.unrepaired).toEqual([]);
    expect(result.repair?.project.markings.find((m) => m.id === 'M2')?.parentId).toBe(
      'M1',
    );
  });
});

describe('product name (app)', () => {
  it('grava `app: "mapping"`', () => {
    expect(JSON.parse(serialize(emptyProject())).app).toBe('mapping');
  });

  it('reads the old value `mapeador-imagens` and the next write uses `mapping`', () => {
    const legacy = JSON.stringify({
      ...JSON.parse(serialize(emptyProject())),
      app: 'mapeador-imagens',
    });
    const loaded = ok(legacy);
    expect(loaded.project.app).toBe('mapping');
    expect(JSON.parse(serialize(loaded.project)).app).toBe('mapping');
  });

  it('rejects an unknown `app`', () => {
    const other = JSON.stringify({
      ...JSON.parse(serialize(emptyProject())),
      app: 'other',
    });
    expect(deserialize(other).ok).toBe(false);
  });
});

describe('migrations', () => {
  it('the current registry has no pending migrations', () => {
    expect(SCHEMA_VERSION).toBe(23);
    expect(migrate({ a: 1 }, 23)).toEqual({ ok: true, data: { a: 1 } });
  });

  it('applies the registered migrations in sequence', () => {
    const registry = new Map<number, Migration>([
      [1, (d) => ({ ...d, v2: true })],
      [2, (d) => ({ ...d, v3: d.v2 === true })],
    ]);
    expect(migrate({ schemaVersion: 1 }, 1, registry, 3)).toEqual({
      ok: true,
      data: { schemaVersion: 3, v2: true, v3: true },
    });
    expect(migrate({}, 0, registry, 3)).toEqual({ ok: false, missingFrom: 0 });
  });
});
