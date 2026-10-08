import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  migrate,
  serialize,
  type Migration,
} from '../../src/model';
import { emptyProject, sampleProject } from './fixtures';

function ok(text: string, registry?: ReadonlyMap<number, Migration>) {
  const result = deserialize(text, registry);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result;
}

describe('serialização', () => {
  it('round-trip do JSON é idêntico', () => {
    const text = serialize(sampleProject());
    const loaded = ok(text);
    expect(loaded.readOnly).toBe(false);
    expect(loaded.migratedFrom).toBeNull();
    expect(serialize(loaded.project)).toBe(text);
    expect(loaded.project).toEqual(sampleProject());
  });

  it('usa 2 espaços, ordem fixa de chaves e quebra de linha final', () => {
    const text = serialize(emptyProject());
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.split('\n')[1]).toBe('  "schemaVersion": 7,');
    expect(Object.keys(JSON.parse(text))).toEqual([
      'schemaVersion',
      'revision',
      'app',
      'coordinateSystem',
      'project',
      'specializations',
      'platformRepos',
      'layers',
      'images',
      'markings',
      'annotations',
    ]);
  });

  it('a ordem das chaves de entrada não importa', () => {
    const p = sampleProject();
    const shuffled = JSON.stringify({
      annotations: p.annotations,
      markings: p.markings,
      images: p.images,
      layers: p.layers,
      platformRepos: p.platformRepos,
      specializations: p.specializations,
      project: p.project,
      coordinateSystem: p.coordinateSystem,
      app: p.app,
      schemaVersion: p.schemaVersion,
      revision: p.revision,
    });
    expect(serialize(ok(shuffled).project)).toBe(serialize(p));
  });

  it('preserva unicode e strings vazias', () => {
    const text = serialize(sampleProject());
    expect(text).toContain('"gravidade"');
    expect(text).toContain('"média"');
    expect(ok(text).project.annotations[0]?.entries[1]?.value).toBe('média');
  });

  it('rejeita JSON inválido, schema inválido e invariantes violados', () => {
    expect(deserialize('{')).toEqual({ ok: false, error: { code: 'invalid-json' } });
    expect(deserialize('[]')).toMatchObject({
      ok: false,
      error: { code: 'invalid-schema' },
    });

    const data = JSON.parse(serialize(sampleProject()));
    data.layers[0].color = 'vermelho';
    expect(deserialize(JSON.stringify(data))).toMatchObject({
      ok: false,
      error: { code: 'invalid-schema' },
    });

    const overlap = JSON.parse(serialize(sampleProject()));
    overlap.images[1].placement.x = 10;
    expect(deserialize(JSON.stringify(overlap))).toMatchObject({
      ok: false,
      error: { code: 'invariant-violation', issues: [{ code: 'images-overlap' }] },
    });
  });

  it('versão ausente ou inválida', () => {
    const data = JSON.parse(serialize(emptyProject()));
    delete data.schemaVersion;
    expect(deserialize(JSON.stringify(data))).toMatchObject({
      ok: false,
      error: { code: 'unsupported-version' },
    });
  });

  it('versão mais nova abre em modo somente leitura', () => {
    const data = {
      ...JSON.parse(serialize(sampleProject())),
      schemaVersion: 99,
      extra: 1,
    };
    const loaded = ok(JSON.stringify(data));
    expect(loaded.readOnly).toBe(true);
    expect(loaded.project.markings).toHaveLength(4);
  });

  it('versão mais nova incompatível é rejeitada', () => {
    const data = { schemaVersion: 99, tudoDiferente: true };
    expect(deserialize(JSON.stringify(data))).toMatchObject({
      ok: false,
      error: { code: 'unsupported-version', version: 99 },
    });
  });
});

describe('nome do produto (app)', () => {
  it('grava `app: "mapping"`', () => {
    expect(JSON.parse(serialize(emptyProject())).app).toBe('mapping');
  });

  it('lê o valor antigo `mapeador-imagens` e a próxima gravação usa `mapping`', () => {
    const legacy = JSON.stringify({
      ...JSON.parse(serialize(emptyProject())),
      app: 'mapeador-imagens',
    });
    const loaded = ok(legacy);
    expect(loaded.project.app).toBe('mapping');
    expect(JSON.parse(serialize(loaded.project)).app).toBe('mapping');
  });

  it('rejeita um `app` desconhecido', () => {
    const other = JSON.stringify({
      ...JSON.parse(serialize(emptyProject())),
      app: 'outro',
    });
    expect(deserialize(other).ok).toBe(false);
  });
});

describe('migrações', () => {
  it('registro atual não tem migrações pendentes', () => {
    expect(SCHEMA_VERSION).toBe(7);
    expect(migrate({ a: 1 }, 7)).toEqual({ ok: true, data: { a: 1 } });
  });

  it('aplica as migrações registradas em sequência', () => {
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
