// Densidade do container (schema v19): `containers[].density`, de 0,5 a 8; ausente vale 1.
import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  effectiveDensity,
  migrateFrom18To19,
  migrations,
  serialize,
  setContainerDensity,
  validateProject,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';

type Raw = Record<string, unknown>;

const v18Raw = (): Raw => {
  const raw = JSON.parse(
    serialize({ ...sampleProject(), schemaVersion: 19 } as never),
  ) as Raw;
  raw.schemaVersion = 18;
  return raw;
};

function open(raw: Raw): Project {
  const result = deserialize(JSON.stringify(raw), migrations);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.project;
}

const first = (p: Project) => p.containers[0]!;

describe('schema v19 (densidade)', () => {
  it('a versão atual é 19 e o registro tem a migração v18 → v19', () => {
    expect(SCHEMA_VERSION).toBe(19);
    expect(migrations.get(18)).toBe(migrateFrom18To19);
  });

  it('a migração só sobe o número: um mapping.json v18 abre sem density e regrava sem a chave', () => {
    const data = { project: { id: 'fixo' }, extra: 1 };
    expect(migrateFrom18To19(data)).toEqual(data);
    const result = deserialize(JSON.stringify(v18Raw()), migrations);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.migratedFrom).toBe(18);
    expect(result.project.schemaVersion).toBe(19);
    expect(first(result.project).density).toBeUndefined();
    const saved = JSON.parse(serialize(result.project)) as Raw;
    expect((saved.containers as Raw[]).every((c) => !('density' in c))).toBe(true);
  });

  it('density 3 faz round-trip e fica depois de background; null é o mesmo que ausente', () => {
    const raw = v18Raw();
    raw.schemaVersion = 19;
    const containers = raw.containers as Raw[];
    containers[0] = { ...containers[0], density: 3 };
    const project = open(raw);
    expect(first(project).density).toBe(3);
    const saved = JSON.parse(serialize(project)) as Raw;
    const keys = Object.keys((saved.containers as Raw[])[0]!);
    expect(keys.indexOf('density')).toBeGreaterThan(keys.indexOf('background'));
    expect((saved.containers as Raw[])[0]!.density).toBe(3);

    const withNull = setContainerDensity(project, first(project).id, null);
    const text = JSON.parse(serialize(withNull)) as Raw;
    expect('density' in (text.containers as Raw[])[0]!).toBe(false);
  });

  it('density que não é número falha ao abrir', () => {
    const raw = v18Raw();
    raw.schemaVersion = 19;
    (raw.containers as Raw[])[0] = { ...(raw.containers as Raw[])[0], density: '3' };
    expect(deserialize(JSON.stringify(raw), migrations).ok).toBe(false);
  });
});

describe('effectiveDensity', () => {
  it('ausente vale 1; o canvas (containerId nulo) vale 1; o valor do container vale ele', () => {
    const p = sampleProject();
    const id = first(p).id;
    expect(effectiveDensity(p, id)).toBe(1);
    expect(effectiveDensity(p, null)).toBe(1);
    expect(effectiveDensity(p, 'inexistente')).toBe(1);
    expect(effectiveDensity(setContainerDensity(p, id, 3), id)).toBe(3);
  });
});

describe('setContainerDensity', () => {
  it('aceita de 0,5 a 8 e recusa fora com container-density', () => {
    const p = sampleProject();
    const id = first(p).id;
    for (const ok of [0.5, 1.5, 2, 2.625, 8]) {
      expect(first(setContainerDensity(p, id, ok)).density).toBe(ok);
    }
    for (const bad of [0.49, 8.01, 12, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => setContainerDensity(p, id, bad)).toThrowError(/container-density/);
    }
  });

  it('null volta a 1 (remove a chave) e repetir o mesmo valor devolve o mesmo projeto', () => {
    const p = setContainerDensity(sampleProject(), first(sampleProject()).id, 3);
    const id = first(p).id;
    expect(setContainerDensity(p, id, 3)).toBe(p);
    const back = setContainerDensity(p, id, null);
    expect('density' in first(back)).toBe(false);
    expect(setContainerDensity(back, id, null)).toBe(back);
  });

  it('container inexistente falha com not-found', () => {
    expect(() => setContainerDensity(sampleProject(), 'nao-existe', 2)).toThrowError(
      /not-found/,
    );
  });
});

describe('invariante container-density', () => {
  it('density fora de 0,5 a 8 (ou não finita) é violação; dentro, não', () => {
    const p = sampleProject();
    const bad = (density: number): Project => ({
      ...p,
      containers: p.containers.map((c, i) => (i === 0 ? { ...c, density } : c)),
    });
    expect(validateProject(bad(3)).map((v) => v.code)).not.toContain('container-density');
    for (const v of [0.4, 9, Number.NaN]) {
      expect(validateProject(bad(v)).map((x) => x.code)).toContain('container-density');
    }
  });
});
