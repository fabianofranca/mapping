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
  suggestDensity,
  validateProject,
  type Project,
  type Spec,
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

// Sugestão de densidade (D2, decisão 6): a largura do container ÷ a do tamanho pronto é 1,5, 2, 3
// ou 4 (tolerância de 2 px); a altura só desempata; só sugere, nunca aplica.
const specOf = (
  id: string,
  containers: readonly { id: string; name: string; width: number; height: number }[],
): { id: string; spec: Spec } => ({
  id,
  spec: {
    format: 'mapping-spec',
    formatVersion: 6,
    id,
    name: id,
    version: 1,
    containers: [...containers],
    layers: [],
  },
});
const PHONE = { id: 'phone', name: 'Celular', width: 360, height: 800 };
const PHONE_LARGE = {
  id: 'phone-large',
  name: 'Celular grande',
  width: 412,
  height: 915,
};
const material = specOf('m3', [PHONE, PHONE_LARGE]);

describe('suggestDensity', () => {
  it('1080 com o tamanho pronto 360 dá 3 e devolve o tamanho pronto (nome e medidas)', () => {
    const found = suggestDensity({ width: 1080, height: 2400 }, [material]);
    expect(found).toMatchObject({
      density: 3,
      specId: 'm3',
      preset: { id: 'phone', name: 'Celular', width: 360, height: 800 },
    });
  });

  it('1082 (tolerância de 2 px no arredondamento) também dá 3; 1083 já não', () => {
    expect(suggestDensity({ width: 1082, height: 2400 }, [material])?.density).toBe(3);
    expect(suggestDensity({ width: 1078, height: 2400 }, [material])?.density).toBe(3);
    expect(suggestDensity({ width: 1083, height: 2400 }, [material])).toBeNull();
  });

  it('720 com 360 e 412 dá 2 pelo 360; 540 dá 1,5 e 1440 dá 4', () => {
    expect(suggestDensity({ width: 720, height: 1600 }, [material])).toMatchObject({
      density: 2,
      preset: { id: 'phone' },
    });
    expect(suggestDensity({ width: 540, height: 1200 }, [material])?.density).toBe(1.5);
    expect(suggestDensity({ width: 1440, height: 3200 }, [material])?.density).toBe(4);
  });

  it('1000 sem múltiplo dá nada; a mesma largura do tamanho pronto (1x) também', () => {
    expect(suggestDensity({ width: 1000, height: 2000 }, [material])).toBeNull();
    expect(suggestDensity({ width: 360, height: 800 }, [material])).toBeNull();
  });

  it('sem especialização com containers (ou sem cópia legível) dá nada', () => {
    expect(suggestDensity({ width: 1080, height: 2400 }, [])).toBeNull();
    expect(
      suggestDensity({ width: 1080, height: 2400 }, [{ id: 'a', spec: null }]),
    ).toBeNull();
    expect(
      suggestDensity({ width: 1080, height: 2400 }, [specOf('vazia', [])]),
    ).toBeNull();
  });

  it('a altura desempata entre tamanhos prontos da mesma largura; depois, a ordem', () => {
    const a = specOf('a', [
      { id: 'curto', name: 'Curto', width: 360, height: 640 },
      { id: 'longo', name: 'Longo', width: 360, height: 800 },
    ]);
    // 2400 ÷ 3 = 800: o "Longo" tem a altura mais próxima, mesmo vindo depois.
    expect(suggestDensity({ width: 1080, height: 2400 }, [a])?.preset.id).toBe('longo');
    // Altura igual para os dois: o primeiro na ordem das especializações aplicadas.
    const b = specOf('b', [{ id: 'outro', name: 'Outro', width: 360, height: 800 }]);
    expect(suggestDensity({ width: 1080, height: 2400 }, [b, material])?.specId).toBe(
      'b',
    );
  });

  it('a captura costuma recortar barras: a altura não impede a sugestão', () => {
    expect(suggestDensity({ width: 1080, height: 2100 }, [material])?.density).toBe(3);
  });
});
