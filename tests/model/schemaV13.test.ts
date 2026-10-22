import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  discardedOnMigrationTo13,
  migrateFrom12To13,
  migrations,
  serialize,
} from '../../src/model';
import { marking, sampleProject } from './fixtures';

// Schema v13 (etapa Marcações espaciais). ME0: a anotação perde `inherit` ("vale para todos os
// descendentes da marcação"); a migração v12 → v13 apaga o campo e não remove nenhuma anotação.
// ME1: a marcação ganha `floating` e `containerId` nulo (marcação do canvas, `rect` em unidades
// do canvas, `x`/`y` negativos), o container ganha `parentId`; a migração grava `floating:
// false` e `parentId: null` sem assentar, e um v13 gravado antes desses campos abre como está.

function load(text: string) {
  const result = deserialize(text, migrations, new Map());
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result;
}

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** O sampleProject como um mapping.json v12: A1 e A3 herdam, A2 e A4 não; sem os campos da ME1. */
function v12Raw(): Raw {
  const data = JSON.parse(serialize(sampleProject())) as Raw;
  const inherit: Record<string, boolean> = { A1: true, A2: false, A3: true, A4: false };
  data.schemaVersion = 12;
  data.annotations = data.annotations.map((a: Raw) => ({
    ...a,
    inherit: inherit[a.id] ?? false,
  }));
  data.markings = data.markings.map((m: Raw) => {
    const { floating, ...rest } = m;
    void floating;
    return rest;
  });
  data.containers = data.containers.map((c: Raw) => {
    const { parentId, ...rest } = c;
    void parentId;
    return rest;
  });
  return data;
}

/** O sampleProject como um v13 gravado antes dos campos de pertencimento (preview da ME0). */
function v13Me0Raw(): Raw {
  const data = v12Raw();
  data.schemaVersion = 13;
  data.annotations = data.annotations.map((a: Raw) => {
    const { inherit, ...rest } = a;
    void inherit;
    return rest;
  });
  return data;
}

describe('migração v12 → v13 (sem herança)', () => {
  it('o registro tem a migração v12 → v13', () => {
    expect(SCHEMA_VERSION).toBe(13);
    expect(migrations.get(12)).toBe(migrateFrom12To13);
  });

  it('abre o v12, migra, não perde anotação e o objeto lido não tem `inherit`', () => {
    const raw = v12Raw();
    const result = load(JSON.stringify(raw));
    expect(result.migratedFrom).toBe(12);
    expect(result.readOnly).toBe(false);
    expect(result.project.schemaVersion).toBe(13);
    expect(result.project.annotations.map((a) => a.id)).toEqual(
      raw.annotations.map((a: Raw) => a.id),
    );
    for (const a of result.project.annotations) expect(a).not.toHaveProperty('inherit');
    expect(result.project).toEqual(sampleProject());
  });

  it('serialize não grava `inherit` e a releitura é estável', () => {
    const result = load(JSON.stringify(v12Raw()));
    const saved = serialize(result.project);
    const data = JSON.parse(saved) as Raw;
    expect(data.schemaVersion).toBe(13);
    for (const a of data.annotations) expect(a).not.toHaveProperty('inherit');
    expect(saved).not.toContain('"inherit"');
    const again = load(saved);
    expect(again.migratedFrom).toBeNull();
    expect(serialize(again.project)).toBe(saved);
  });

  it('a migração apaga `inherit` e acrescenta `floating` e `parentId`, sem mexer no resto', () => {
    const raw = v12Raw();
    const out = migrateFrom12To13(raw, { specs: new Map() }) as Raw;
    expect(out.annotations).toEqual(
      raw.annotations.map((a: Raw) => {
        const { inherit, ...rest } = a;
        void inherit;
        return rest;
      }),
    );
    expect(out.markings).toEqual(
      raw.markings.map((m: Raw) => ({ ...m, floating: false })),
    );
    expect(out.containers).toEqual(
      raw.containers.map((c: Raw) => ({ ...c, parentId: null })),
    );
    expect(out.layers).toEqual(raw.layers);
  });

  it('a migração preserva o que já existe e ignora item que não é objeto', () => {
    const out = migrateFrom12To13({
      containers: [{ id: 'I1', parentId: 'K' }, 7],
      markings: [{ id: 'M1', floating: true }, null],
      annotations: [],
    });
    expect(out.containers).toEqual([{ id: 'I1', parentId: 'K' }, 7]);
    expect(out.markings).toEqual([{ id: 'M1', floating: true }, null]);
  });

  it('a migração não assenta: o `parentId` das marcações fica como está, o dos containers é nulo', () => {
    // No v12 o pai era um dado escolhido: M3 aponta para M1 mesmo com M2 (menor) a contendo.
    const raw = v12Raw();
    raw.markings = raw.markings.map((m: Raw) =>
      m.id === 'M3' ? { ...m, parentId: 'M1' } : m,
    );
    const result = load(JSON.stringify(raw));
    expect(result.migratedFrom).toBe(12);
    expect(marking(result.project, 'M3').parentId).toBe('M1');
    expect(result.project.markings.every((m) => !m.floating)).toBe(true);
    expect(result.project.containers.every((c) => c.parentId === null)).toBe(true);
  });

  it('o v12 migrado grava `parentId` do container e `floating` da marcação, na ordem fixa', () => {
    const saved = serialize(load(JSON.stringify(v12Raw())).project);
    const data = JSON.parse(saved) as Raw;
    expect(Object.keys(data.containers[0]).slice(4, 8)).toEqual([
      'height',
      'placement',
      'parentId',
      'markingColor',
    ]);
    expect(Object.keys(data.markings[0])).toEqual([
      'id',
      'containerId',
      'parentId',
      'name',
      'rect',
      'needsReview',
      'locked',
      'floating',
      'source',
    ]);
    expect(data.containers.every((c: Raw) => c.parentId === null)).toBe(true);
    expect(data.markings.every((m: Raw) => m.floating === false)).toBe(true);
  });
});

describe('abertura de um v13 (sem migração)', () => {
  it('sem `floating` nem `parentId` de container (v13 da ME0): abre com os padrões, sem migrar', () => {
    const result = load(JSON.stringify(v13Me0Raw()));
    expect(result.migratedFrom).toBeNull();
    expect(result.project).toEqual(sampleProject());
    expect(result.project.markings.every((m) => m.floating === false)).toBe(true);
    expect(result.project.containers.every((c) => c.parentId === null)).toBe(true);
    // A próxima gravação já traz os campos.
    const saved = JSON.parse(serialize(result.project)) as Raw;
    expect(saved.markings.every((m: Raw) => m.floating === false)).toBe(true);
    expect(saved.containers.every((c: Raw) => c.parentId === null)).toBe(true);
  });

  it('com os campos: marcação do canvas com `x` e `y` negativos, flutuante e container com pai', () => {
    const data = JSON.parse(serialize(sampleProject())) as Raw;
    const base = {
      parentId: null,
      needsReview: false,
      locked: false,
      source: null,
    };
    data.markings.push(
      {
        ...base,
        id: 'K',
        containerId: null,
        name: 'Cerca a I1',
        rect: { x: -100, y: -100, width: 1200, height: 1000 },
        floating: false,
      },
      {
        ...base,
        id: 'N',
        containerId: null,
        name: 'Nota',
        rect: { x: -800, y: -600, width: 300, height: 200 },
        floating: true,
      },
    );
    data.containers[0].parentId = 'K';
    const text = JSON.stringify(data);
    const result = load(text);
    expect(result.migratedFrom).toBeNull();
    expect(marking(result.project, 'K')).toMatchObject({
      containerId: null,
      rect: { x: -100, y: -100, width: 1200, height: 1000 },
      floating: false,
    });
    expect(marking(result.project, 'N')).toMatchObject({
      containerId: null,
      parentId: null,
      floating: true,
      rect: { x: -800, y: -600, width: 300, height: 200 },
    });
    expect(result.project.containers.map((c) => c.parentId)).toEqual(['K', null]);
    // Round-trip estável.
    const saved = serialize(result.project);
    expect(serialize(load(saved).project)).toBe(saved);
    expect(JSON.parse(saved).markings.at(-1).floating).toBe(true);
  });

  it('um v13 não assenta na leitura: pai válido que não é o menor abre como está', () => {
    const data = JSON.parse(serialize(sampleProject())) as Raw;
    data.markings = data.markings.map((m: Raw) =>
      m.id === 'M3' ? { ...m, parentId: 'M1' } : m,
    );
    const result = load(JSON.stringify(data));
    expect(marking(result.project, 'M3').parentId).toBe('M1');
  });

  it('marcação de container com `x` negativo deixa de ser erro de schema: é a invariante `rect-out-of-image`, reparável', () => {
    const data = JSON.parse(serialize(sampleProject())) as Raw;
    data.markings = data.markings.map((m: Raw) =>
      m.id === 'M4' ? { ...m, rect: { x: -20, y: 0, width: 100, height: 100 } } : m,
    );
    const result = deserialize(JSON.stringify(data), migrations, new Map());
    expect(result.ok).toBe(false);
    if (result.ok || result.error.code !== 'invariant-violation') {
      throw new Error('esperava invariant-violation');
    }
    expect(result.error.issues.map((i) => i.code)).toEqual(['rect-out-of-image']);
    expect(result.repair?.unrepaired).toEqual([]);
    expect(marking(result.repair!.project, 'M4').rect).toEqual({
      x: 0,
      y: 0,
      width: 80,
      height: 100,
    });
  });

  it('`floating` e `parentId` de container com tipo errado são erro de schema', () => {
    const data = JSON.parse(serialize(sampleProject())) as Raw;
    data.markings[0].floating = 'sim';
    expect(deserialize(JSON.stringify(data), migrations, new Map())).toMatchObject({
      ok: false,
      error: { code: 'invalid-schema' },
    });
    const other = JSON.parse(serialize(sampleProject())) as Raw;
    other.containers[0].parentId = 7;
    expect(deserialize(JSON.stringify(other), migrations, new Map())).toMatchObject({
      ok: false,
      error: { code: 'invalid-schema' },
    });
  });
});

describe('discardedOnMigrationTo13', () => {
  it('lista só as `inherit: true`, na ordem do array, com o nome da marcação', () => {
    const raw = v12Raw();
    const nameOf = (id: string) =>
      (raw.markings as Raw[]).find((m) => m.id === id)?.name ?? null;
    const a1 = raw.annotations.find((a: Raw) => a.id === 'A1');
    const a3 = raw.annotations.find((a: Raw) => a.id === 'A3');
    expect(discardedOnMigrationTo13(raw)).toEqual([
      { annotationId: 'A1', markingId: a1.markingId, markingName: nameOf(a1.markingId) },
      { annotationId: 'A3', markingId: a3.markingId, markingName: nameOf(a3.markingId) },
    ]);
    expect(discardedOnMigrationTo13(raw).some((d) => d.markingName !== null)).toBe(true);
  });

  it('markingName é null quando a marcação não tem nome ou não existe', () => {
    const raw = {
      markings: [
        { id: 'MA', name: null },
        { id: 'MB', name: '' },
        { id: 'MC', name: 'Porta' },
      ],
      annotations: [
        { id: 'A1', markingId: 'MA', inherit: true },
        { id: 'A2', markingId: 'MB', inherit: true },
        { id: 'A3', markingId: 'MC', inherit: true },
        { id: 'A4', markingId: 'MX', inherit: true },
        { id: 'A5', markingId: 'MC', inherit: false },
        { id: 'A6', markingId: 'MC' },
      ],
    };
    expect(discardedOnMigrationTo13(raw)).toEqual([
      { annotationId: 'A1', markingId: 'MA', markingName: null },
      { annotationId: 'A2', markingId: 'MB', markingName: null },
      { annotationId: 'A3', markingId: 'MC', markingName: 'Porta' },
      { annotationId: 'A4', markingId: 'MX', markingName: null },
    ]);
  });

  it('sem `annotations` válido, devolve lista vazia', () => {
    expect(discardedOnMigrationTo13({})).toEqual([]);
    expect(discardedOnMigrationTo13({ annotations: 'x' })).toEqual([]);
    expect(discardedOnMigrationTo13({ annotations: {} })).toEqual([]);
  });

  it('deserialize devolve o mesmo em `discardedInherit`; vazio para um v13', () => {
    const raw = v12Raw();
    const result = load(JSON.stringify(raw));
    expect(result.discardedInherit).toEqual(discardedOnMigrationTo13(raw));
    expect(result.discardedInherit.map((d) => d.annotationId)).toEqual(['A1', 'A3']);
    expect(load(serialize(sampleProject())).discardedInherit).toEqual([]);
  });
});

describe('v13 cru com `inherit` extra', () => {
  it('é lido sem falhar, ignora a chave e não regrava', () => {
    const data = JSON.parse(serialize(sampleProject())) as Raw;
    data.annotations = data.annotations.map((a: Raw) => ({ ...a, inherit: true }));
    const result = load(JSON.stringify(data));
    expect(result.migratedFrom).toBeNull();
    expect(result.discardedInherit).toEqual([]);
    for (const a of result.project.annotations) expect(a).not.toHaveProperty('inherit');
    expect(serialize(result.project)).not.toContain('"inherit"');
  });
});
