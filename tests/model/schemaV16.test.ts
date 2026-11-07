// Schema v16 (perspectivas): `project.id`, `perspectives` e `arrivals`. Migração v15 → v16 cria o
// id e as listas vazias; as invariantes novas têm o código certo e reparo mecânico.
import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  migrateFrom15To16,
  migrations,
  repairProject,
  serialize,
  validateProject,
  type InvariantCode,
  type Marking,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function load(text: string) {
  const result = deserialize(text, migrations);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result;
}

/** O projeto como um mapping.json v15: sem `project.id`, `perspectives` nem `arrivals`. */
const v15Raw = (): Raw => {
  const raw = JSON.parse(serialize(sampleProject())) as Raw;
  raw.schemaVersion = 15;
  delete raw.project.id;
  delete raw.perspectives;
  delete raw.arrivals;
  return raw;
};

const canvasMarking = (id: string, extra: Partial<Marking> = {}): Marking => ({
  id,
  containerId: null,
  parentId: null,
  name: null,
  rect: { x: 300, y: 300, width: 100, height: 100 },
  needsReview: false,
  locked: false,
  floating: false,
  source: null,
  ...extra,
});

/** O sampleProject com raízes dos três tipos e duas perspectivas válidas. */
function withPerspectives(): Project {
  const p = sampleProject();
  return {
    ...p,
    markings: [
      ...p.markings,
      canvasMarking('MC'),
      canvasMarking('MF', { floating: true }),
    ],
    perspectives: [
      {
        id: 'P1',
        name: 'Analytics',
        hiddenLayers: ['L2'],
        items: [
          { root: 'I1', x: 0, y: 0 },
          { root: 'MC', x: 100.5, y: -40 },
        ],
      },
      {
        id: 'P2',
        name: 'Outra',
        hiddenLayers: [],
        items: [
          { root: 'I2', x: 5, y: 5 },
          { root: 'MF', x: 1, y: 1 },
        ],
      },
    ],
    arrivals: [{ root: 'MC', from: 'P1', fromName: 'Analytics' }],
  };
}

describe('schema v16', () => {
  it('a versão atual é 16 e o registro tem a migração v15 → v16', () => {
    expect(SCHEMA_VERSION).toBe(16);
    expect(migrations.get(15)).toBe(migrateFrom15To16);
  });

  it('a migração cria o id do projeto e as listas vazias', () => {
    const out = migrateFrom15To16({ project: { name: 'X' }, extra: 1 });
    expect((out.project as Raw).id).toMatch(UUID);
    expect((out.project as Raw).name).toBe('X');
    expect(out.perspectives).toEqual([]);
    expect(out.arrivals).toEqual([]);
    expect(out.extra).toBe(1);
  });

  it('a migração preserva valores já presentes', () => {
    const present = {
      project: { id: 'fixo', name: 'X' },
      perspectives: [{ id: 'P1' }],
      arrivals: [{ root: 'M1' }],
    };
    expect(migrateFrom15To16(present)).toEqual(present);
  });

  it('o v15 abre, migra (migratedFrom 15) e grava v16 sem perder nada', () => {
    const result = load(JSON.stringify(v15Raw(), null, 2));
    expect(result.migratedFrom).toBe(15);
    expect(result.readOnly).toBe(false);
    expect(result.project.schemaVersion).toBe(16);
    expect(result.project.project.id).toMatch(UUID);
    expect(result.project.perspectives).toEqual([]);
    expect(result.project.arrivals).toEqual([]);
    const original = sampleProject();
    const sameId = {
      ...result.project,
      project: { ...result.project.project, id: original.project.id },
    };
    expect(serialize(sameId)).toBe(serialize(original));
    const saved = JSON.parse(serialize(result.project)) as Raw;
    expect(saved.schemaVersion).toBe(16);
    expect(saved.project.id).toBe(result.project.project.id);
    expect(saved.perspectives).toEqual([]);
    expect(saved.arrivals).toEqual([]);
    // Estável: o id criado na migração é gravado e relido igual.
    expect(serialize(load(serialize(result.project)).project)).toBe(
      serialize(result.project),
    );
  });

  it('um v16 com perspectivas e chegadas faz round-trip exato, na ordem das chaves', () => {
    const p = withPerspectives();
    expect(validateProject(p)).toEqual([]);
    const text = serialize(p);
    const loaded = load(text);
    expect(loaded.migratedFrom).toBeNull();
    expect(loaded.project.perspectives).toEqual(p.perspectives);
    expect(loaded.project.arrivals).toEqual(p.arrivals);
    expect(serialize(loaded.project)).toBe(text);
    const raw = JSON.parse(text) as Raw;
    expect(Object.keys(raw.project)).toEqual(['id', 'name', 'createdAt', 'updatedAt']);
    const keys = Object.keys(raw);
    expect(keys.slice(keys.indexOf('arrows'), keys.indexOf('arrows') + 4)).toEqual([
      'arrows',
      'perspectives',
      'arrivals',
      'annotations',
    ]);
    expect(Object.keys(raw.perspectives[0])).toEqual([
      'id',
      'name',
      'hiddenLayers',
      'items',
    ]);
    expect(Object.keys(raw.perspectives[0].items[0])).toEqual(['root', 'x', 'y']);
    expect(Object.keys(raw.arrivals[0])).toEqual(['root', 'from', 'fromName']);
  });

  it('um v16 sem perspectives nem arrivals abre com listas vazias', () => {
    const raw = JSON.parse(serialize(sampleProject())) as Raw;
    delete raw.perspectives;
    delete raw.arrivals;
    const loaded = load(JSON.stringify(raw));
    expect(loaded.project.perspectives).toEqual([]);
    expect(loaded.project.arrivals).toEqual([]);
  });

  it('project.id vazio ou ausente no v16 é recusado', () => {
    const raw = JSON.parse(serialize(sampleProject())) as Raw;
    raw.project.id = '';
    expect(deserialize(JSON.stringify(raw), migrations).ok).toBe(false);
    delete raw.project.id;
    expect(deserialize(JSON.stringify(raw), migrations).ok).toBe(false);
  });

  it('x e y precisam ser números finitos', () => {
    const raw = JSON.parse(serialize(withPerspectives())) as Raw;
    raw.perspectives[0].items[0].x = 'a';
    expect(deserialize(JSON.stringify(raw), migrations).ok).toBe(false);
  });

  it('o v17 abre só para leitura ("versão mais nova")', () => {
    const p = withPerspectives();
    const newer = JSON.stringify({ ...JSON.parse(serialize(p)), schemaVersion: 17 });
    const loaded = load(newer);
    expect(loaded.readOnly).toBe(true);
    expect(loaded.project.perspectives).toHaveLength(2);
  });
});

interface InvalidCase {
  readonly code: InvariantCode;
  readonly entity: 'perspective' | 'arrival';
  readonly build: (p: Project) => Project;
}

const withFirstPerspective =
  (update: (p: Project['perspectives'][number]) => Project['perspectives'][number]) =>
  (p: Project): Project => ({
    ...p,
    perspectives: p.perspectives.map((x, i) => (i === 0 ? update(x) : x)),
  });

const CASES: readonly (readonly [string, InvalidCase])[] = (
  [
    [
      'perspective-root-missing',
      'perspective',
      withFirstPerspective((x) => ({
        ...x,
        items: [...x.items, { root: 'X9', x: 0, y: 0 }],
      })),
    ],
    [
      'perspective-root-not-root',
      'perspective',
      // M1 é marcação de container; MN não existe como raiz de nada.
      withFirstPerspective((x) => ({
        ...x,
        items: [...x.items, { root: 'M1', x: 0, y: 0 }],
      })),
    ],
    [
      'perspective-root-duplicate',
      'perspective',
      withFirstPerspective((x) => ({
        ...x,
        items: [...x.items, { root: 'I1', x: 9, y: 9 }],
      })),
    ],
    [
      'perspective-layer-missing',
      'perspective',
      withFirstPerspective((x) => ({ ...x, hiddenLayers: [...x.hiddenLayers, 'L9'] })),
    ],
    [
      'perspective-duplicate-name',
      'perspective',
      (p: Project) => ({
        ...p,
        perspectives: p.perspectives.map((x, i) =>
          i === 1 ? { ...x, name: ' analytics ' } : x,
        ),
      }),
    ],
    [
      'duplicate-id',
      'perspective',
      (p: Project) => ({
        ...p,
        perspectives: p.perspectives.map((x, i) => (i === 1 ? { ...x, id: 'P1' } : x)),
      }),
    ],
    [
      'arrival-root-missing',
      'arrival',
      (p: Project) => ({
        ...p,
        arrivals: [...p.arrivals, { root: 'X9', from: 'P1', fromName: 'Analytics' }],
      }),
    ],
    [
      'arrival-root-not-root',
      'arrival',
      (p: Project) => ({
        ...p,
        arrivals: [...p.arrivals, { root: 'M1', from: 'P1', fromName: 'Analytics' }],
      }),
    ],
    [
      'arrival-duplicate',
      'arrival',
      (p: Project) => ({
        ...p,
        arrivals: [...p.arrivals, { root: 'MC', from: 'P2', fromName: 'Outra' }],
      }),
    ],
  ] as const
).map(([code, entity, build]) => [code, { code, entity, build }] as const);

describe('invariantes das perspectivas', () => {
  it.each(CASES)('%s: recusa com o código certo e o reparo resolve', (_, c) => {
    const broken = c.build(withPerspectives());
    const issues = validateProject(broken);
    expect(issues.map((i) => i.code)).toContain(c.code);
    expect(issues.find((i) => i.code === c.code)?.entity).toBe(c.entity);

    const result = deserialize(serialize(broken), migrations);
    if (result.ok) throw new Error('deveria ser recusado');
    expect(result.error.code).toBe('invariant-violation');
    const repair = result.repair;
    if (!repair) throw new Error('sem reparo');
    expect(repair.unrepaired).toEqual([]);
    expect(repair.repaired.length).toBeGreaterThan(0);
    expect(validateProject(repair.project)).toEqual([]);
    expect(deserialize(serialize(repair.project), migrations).ok).toBe(true);
  });

  it('o reparo tira só o que está errado e mantém o resto', () => {
    const base = withPerspectives();
    const broken: Project = {
      ...base,
      perspectives: base.perspectives.map((x, i) =>
        i === 0
          ? {
              ...x,
              hiddenLayers: ['L2', 'L9'],
              items: [...x.items, { root: 'X9', x: 0, y: 0 }, { root: 'I1', x: 9, y: 9 }],
            }
          : x,
      ),
    };
    const result = repairProject(broken, validateProject(broken));
    expect(result.unrepaired).toEqual([]);
    expect(result.project.perspectives).toEqual(base.perspectives);
  });

  it('nome repetido ganha um número; o primeiro fica', () => {
    const base = withPerspectives();
    const broken: Project = {
      ...base,
      perspectives: base.perspectives.map((x, i) =>
        i === 1 ? { ...x, name: 'analytics' } : x,
      ),
    };
    const result = repairProject(broken, validateProject(broken));
    expect(result.unrepaired).toEqual([]);
    expect(result.project.perspectives.map((x) => x.name)).toEqual([
      'Analytics',
      'analytics (2)',
    ]);
  });

  it('id repetido de perspectiva: a segunda ganha id novo; a chegada segue na primeira', () => {
    const base = withPerspectives();
    const broken: Project = {
      ...base,
      perspectives: base.perspectives.map((x, i) => (i === 1 ? { ...x, id: 'P1' } : x)),
    };
    const result = repairProject(broken, validateProject(broken), () => 'PNEW');
    expect(result.unrepaired).toEqual([]);
    expect(result.project.perspectives.map((x) => x.id)).toEqual(['P1', 'PNEW']);
    expect(result.project.arrivals).toEqual(base.arrivals);
  });
});
