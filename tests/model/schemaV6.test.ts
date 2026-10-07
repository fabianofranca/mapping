import { describe, expect, it } from 'vitest';
import { deserialize, migrateFrom5To6, serialize } from '../../src/model';
import { sampleProject } from './fixtures';

const strip = (data: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(data).filter(([k]) => k !== key));

/** Um mapping.json v5: sem `revision`. */
function v5Text(): string {
  const data = JSON.parse(serialize(sampleProject())) as Record<string, unknown>;
  return JSON.stringify({ ...strip(data, 'revision'), schemaVersion: 5 });
}

describe('migração v5 → v6 (revisão)', () => {
  it('ganha revision: 0 e o resto fica igual', () => {
    const result = deserialize(v5Text());
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.migratedFrom).toBe(5);
    expect(result.readOnly).toBe(false);
    expect(result.project.schemaVersion).toBe(6);
    expect(result.project.revision).toBe(0);
    expect(result.project).toEqual(sampleProject());
  });

  it('o v5 migrado salva como v6 estável (round-trip)', () => {
    const first = deserialize(v5Text());
    if (!first.ok) throw new Error('falhou');
    const saved = serialize(first.project);
    expect(JSON.parse(saved).schemaVersion).toBe(6);
    const again = deserialize(saved);
    if (!again.ok) throw new Error('falhou');
    expect(serialize(again.project)).toBe(saved);
  });

  it('preserva uma revision que já exista', () => {
    expect(migrateFrom5To6({ revision: 7 })).toEqual({ revision: 7 });
    expect(migrateFrom5To6({})).toEqual({ revision: 0 });
  });

  it('serializa revision logo depois de schemaVersion e mantém o valor no round-trip', () => {
    const text = serialize({ ...sampleProject(), revision: 12 });
    expect(Object.keys(JSON.parse(text)).slice(0, 2)).toEqual([
      'schemaVersion',
      'revision',
    ]);
    const loaded = deserialize(text);
    if (!loaded.ok) throw new Error('falhou');
    expect(loaded.project.revision).toBe(12);
  });

  it('recusa um arquivo v6 sem revision ou com revision inválida', () => {
    const data = JSON.parse(serialize(sampleProject()));
    delete data.revision;
    expect(deserialize(JSON.stringify(data)).ok).toBe(false);
    for (const bad of [-1, 1.5, '1']) {
      expect(deserialize(JSON.stringify({ ...data, revision: bad })).ok).toBe(false);
    }
  });
});
