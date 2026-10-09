import { describe, expect, it } from 'vitest';
import {
  ModelError,
  deserialize,
  serialize,
  setImageMarkingColor,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';

const without = (item: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(Object.entries(item).filter(([key]) => !keys.includes(key)));

/** Um mapping.json v2 (sem `markingColor` nas imagens nem os campos da v4). */
function v2Text(): string {
  const data = JSON.parse(serialize(sampleProject())) as Record<string, unknown>;
  const images = (data.images as Record<string, unknown>[]).map((i) =>
    without(i, ['markingColor']),
  );
  const layers = (data.layers as Record<string, unknown>[]).map((l) =>
    without(l, ['spec']),
  );
  const annotations = (data.annotations as Record<string, unknown>[]).map((a) => ({
    ...without(a, ['type', 'values']),
    entries: (a.entries as Record<string, unknown>[]).map((e) => without(e, ['id'])),
  }));
  return JSON.stringify({
    ...without(data, ['specializations', 'platformRepos']),
    schemaVersion: 2,
    images,
    layers,
    annotations,
  });
}

/** Projeto sem os ids das tuplas (gerados na migração v3 → v4). */
function withoutEntryIds(p: Project) {
  return {
    ...p,
    annotations: p.annotations.map((a) => ({
      ...a,
      entries: a.entries.map((e) => without({ ...e }, ['id'])),
    })),
  };
}

function load(text: string): Project {
  const result = deserialize(text);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.project;
}

describe('migração v2 → v3', () => {
  it('abre um v2 como v8 com markingColor nulo e sem perder nada', () => {
    const result = deserialize(v2Text());
    if (!result.ok) throw new Error('falhou');
    expect(result.migratedFrom).toBe(2);
    expect(result.project.schemaVersion).toBe(8);
    expect(result.project.images.every((i) => i.markingColor === null)).toBe(true);
    expect(withoutEntryIds(result.project)).toEqual(withoutEntryIds(sampleProject()));
  });

  it('salvar o v2 migrado gera v8 estável (round-trip)', () => {
    const saved = serialize(load(v2Text()));
    expect(JSON.parse(saved).schemaVersion).toBe(8);
    expect(serialize(load(saved))).toBe(saved);
  });
});

describe('cor da borda das marcações', () => {
  it('define (normalizando para maiúsculas) e limpa a cor da imagem', () => {
    let p = setImageMarkingColor(sampleProject(), 'I1', '#ffeb3b');
    expect(p.images[0]?.markingColor).toBe('#FFEB3B');
    expect(p.images[1]?.markingColor).toBeNull();
    p = setImageMarkingColor(p, 'I1', null);
    expect(p.images[0]?.markingColor).toBeNull();
  });

  it('rejeita cor inválida e imagem inexistente', () => {
    expect(() => setImageMarkingColor(sampleProject(), 'I1', 'vermelho')).toThrow(
      ModelError,
    );
    expect(() => setImageMarkingColor(sampleProject(), 'nada', '#FFFFFF')).toThrow(
      ModelError,
    );
  });

  it('sobrevive ao round-trip do JSON', () => {
    const p = setImageMarkingColor(sampleProject(), 'I2', '#00E5FF');
    expect(load(serialize(p)).images[1]?.markingColor).toBe('#00E5FF');
  });
});
