import { describe, expect, it } from 'vitest';
import { deserialize, migrations, serialize } from '../../src/model';
import { sampleProject } from './fixtures';

// Preparo do R3.8 (v8) e do R3.8b (v10) do `docs/TESTING.md`: o guia manda editar um
// `mapping.json` v14 na mão. Este teste faz as mesmas trocas de texto e confere que a abertura
// (a migração) aceita o arquivo, para o preparo não voltar a gerar um que a app recusa.

/**
 * O v14 do modelo, como a app grava. A marcação M4 vai para o canvas (`containerId` nulo), como a
 * que se desenha no preparo: é o caso que a troca só da versão deixava sem `containerId`.
 */
function v14Text(): string {
  const data = JSON.parse(serialize(sampleProject())) as {
    markings: { id: string; containerId: string | null }[];
  };
  for (const m of data.markings) if (m.id === 'M4') m.containerId = null;
  return JSON.stringify(data, null, 2);
}

/** Troca como o preparo manda: versão, `containers` → `images` e `containerId` → `imageId`. */
function prepared(text: string, version: number, renameKeys: boolean): string {
  let out = text.replace('"schemaVersion": 14', `"schemaVersion": ${version}`);
  if (renameKeys) {
    out = out
      .replaceAll('"containers"', '"images"')
      .replaceAll('"containerId"', '"imageId"');
  }
  return out;
}

describe('preparo do guia (R3.8 e R3.8b): o arquivo editado à mão abre', () => {
  it('o v14 gravado usa containers/containerId e a troca de versão sozinha é recusada', () => {
    const text = v14Text();
    expect(text).toContain('"schemaVersion": 14');
    expect(text).toContain('"containers"');
    expect(text).toContain('"containerId"');
    const result = deserialize(prepared(text, 8, false), migrations, new Map());
    expect(result.ok).toBe(false);
  });

  it.each([8, 10])(
    'o v%i do preparo (com images/imageId) migra para o v14',
    (version) => {
      const result = deserialize(
        prepared(v14Text(), version, true),
        migrations,
        new Map(),
      );
      if (!result.ok) throw new Error(JSON.stringify(result.error));
      expect(result.migratedFrom).toBe(version);
      expect(result.project.schemaVersion).toBe(14);
      expect(result.project.containers.length).toBeGreaterThan(0);
      expect(result.project.markings.length).toBeGreaterThan(0);
    },
  );
});
