import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  discardedOnMigrationTo13,
  migrateFrom12To13,
  migrations,
  serialize,
} from '../../src/model';
import { sampleProject } from './fixtures';

// Schema v13 (etapa Marcações espaciais, ME0): a anotação perde `inherit` ("vale para todos os
// descendentes da marcação"). A migração v12 → v13 apaga o campo e não remove nenhuma anotação.

function load(text: string) {
  const result = deserialize(text, migrations, new Map());
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result;
}

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** O sampleProject como um mapping.json v12: A1 e A3 herdam, A2 e A4 não. */
function v12Raw(): Raw {
  const data = JSON.parse(serialize(sampleProject())) as Raw;
  const inherit: Record<string, boolean> = { A1: true, A2: false, A3: true, A4: false };
  data.schemaVersion = 12;
  data.annotations = data.annotations.map((a: Raw) => ({
    ...a,
    inherit: inherit[a.id] ?? false,
  }));
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

  it('a migração sozinha só apaga o campo, sem mexer no resto', () => {
    const raw = v12Raw();
    const out = migrateFrom12To13(raw, { specs: new Map() }) as Raw;
    expect(out.annotations).toEqual(
      raw.annotations.map((a: Raw) => {
        const { inherit, ...rest } = a;
        void inherit;
        return rest;
      }),
    );
    expect(out.markings).toEqual(raw.markings);
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
