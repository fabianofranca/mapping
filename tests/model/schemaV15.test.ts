// Schema v15 (vínculo entre anotações da mesma camada): a mudança é só de regra (formatVersion 13
// da especialização); os dados não mudam. Migração v14 → v15 só troca a versão.
import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  migrateFrom14To15,
  migrations,
  serialize,
  specFiles,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { add, sameLayerProject } from './sameLayerFixtures';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function load(text: string, specs = new Map<string, string>()) {
  const result = deserialize(text, migrations, specs);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result;
}

/** O projeto como um mapping.json v14: a mesma forma, com a versão anterior. */
const v14Text = (): string => {
  const raw = JSON.parse(serialize(sampleProject())) as Raw;
  raw.schemaVersion = 14;
  return JSON.stringify(raw, null, 2);
};

describe('schema v15', () => {
  it('a versão atual é 15 e o registro tem a migração v14 → v15', () => {
    expect(SCHEMA_VERSION).toBe(15);
    expect(migrations.get(14)).toBe(migrateFrom14To15);
  });

  it('a migração não muda os dados', () => {
    const data = { annotations: [{ id: 'X' }], docRepos: {}, extra: 1 };
    expect(migrateFrom14To15(data)).toEqual(data);
  });

  it('o v14 abre, migra (migratedFrom 14) e grava v15 sem mudar dados', () => {
    const result = load(v14Text());
    expect(result.migratedFrom).toBe(14);
    expect(result.readOnly).toBe(false);
    expect(result.project.schemaVersion).toBe(15);
    expect(serialize(result.project)).toBe(serialize(sampleProject()));
    const saved = JSON.parse(serialize(result.project)) as Raw;
    expect(saved.schemaVersion).toBe(15);
    expect(serialize(load(serialize(result.project)).project)).toBe(
      serialize(result.project),
    );
  });

  it('um v15 abre sem migrar; o v16 abre só para leitura ("versão mais nova")', () => {
    const p = add(add(sameLayerProject(), 'R1', 'request'), 'N1', 'navigate', 'R1');
    const text = serialize(p);
    expect(load(text, specFiles(p)).migratedFrom).toBeNull();
    const newer = JSON.stringify({ ...JSON.parse(text), schemaVersion: 16 });
    const loaded = load(newer, specFiles(p));
    expect(loaded.readOnly).toBe(true);
    expect(loaded.project.annotations.map((a) => a.id)).toEqual(['R1', 'N1']);
  });
});
