import { describe, expect, it } from 'vitest';
import { deserialize, migrateFrom4To5, serialize } from '../../src/model';
import { sampleProject } from './fixtures';

const strip = (item: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(item).filter(([k]) => k !== key));

/** Um mapping.json v4: sem `locked` nas imagens nem nas marcações. */
function v4Text(): string {
  const data = JSON.parse(serialize(sampleProject())) as Record<string, unknown>;
  return JSON.stringify({
    ...data,
    schemaVersion: 4,
    images: (data.images as Record<string, unknown>[]).map((i) => strip(i, 'locked')),
    markings: (data.markings as Record<string, unknown>[]).map((m) => strip(m, 'locked')),
  });
}

describe('migração v4 → v5 (trava)', () => {
  it('imagens e marcações ganham locked: false e o resto fica igual', () => {
    const result = deserialize(v4Text());
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.migratedFrom).toBe(4);
    expect(result.readOnly).toBe(false);
    expect(result.project.schemaVersion).toBe(6);
    expect(result.project.images.every((i) => i.locked === false)).toBe(true);
    expect(result.project.markings.every((m) => m.locked === false)).toBe(true);
    expect(result.project).toEqual(sampleProject());
  });

  it('o v4 migrado salva como v6 estável (round-trip)', () => {
    const first = deserialize(v4Text());
    if (!first.ok) throw new Error('falhou');
    const saved = serialize(first.project);
    expect(JSON.parse(saved).schemaVersion).toBe(6);
    const again = deserialize(saved);
    if (!again.ok) throw new Error('falhou');
    expect(serialize(again.project)).toBe(saved);
  });

  it('preserva um locked que já exista e não toca em itens que não são objetos', () => {
    const migrated = migrateFrom4To5({
      images: [{ id: 'I1', locked: true }, 7],
      markings: [{ id: 'M1' }],
    });
    expect(migrated.images).toEqual([{ id: 'I1', locked: true }, 7]);
    expect(migrated.markings).toEqual([{ id: 'M1', locked: false }]);
  });

  it('serializa locked na ordem fixa, no fim de cada imagem e marcação', () => {
    const data = JSON.parse(serialize(sampleProject()));
    expect(Object.keys(data.images[0]).at(-1)).toBe('locked');
    expect(Object.keys(data.markings[0]).at(-1)).toBe('locked');
  });

  it('recusa um arquivo v5 sem locked', () => {
    const data = JSON.parse(serialize(sampleProject()));
    delete data.markings[0].locked;
    const result = deserialize(JSON.stringify(data));
    expect(result.ok).toBe(false);
  });
});
