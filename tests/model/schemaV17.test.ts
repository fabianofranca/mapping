// Schema v17 (ref de anotação inteira): migração v16 → v17 só muda a versão. Um projeto v16
// abre, migra (migratedFrom 16) e grava v17 sem mudar nenhum dado.
import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  migrateFrom16To17,
  migrations,
  serialize,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';

type Raw = Record<string, unknown>;

/** O projeto de exemplo como um mapping.json v16: só a versão do arquivo muda. */
const v16Raw = (): Raw => {
  const raw = JSON.parse(serialize(sampleProject())) as Raw;
  raw.schemaVersion = 16;
  return raw;
};

describe('schema v17', () => {
  it('a versão atual é 17 e o registro tem a migração v16 → v17', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(17);
    expect(migrations.get(16)).toBe(migrateFrom16To17);
  });

  it('a migração v16 → v17 não muda os dados', () => {
    const data = { project: { id: 'fixo', name: 'X' }, extra: 1, perspectives: [] };
    expect(migrateFrom16To17(data)).toEqual(data);
  });

  it('um projeto v16 abre, migra até a versão atual com backup e não muda dados', () => {
    const text = JSON.stringify(v16Raw(), null, 2);
    const result = deserialize(text, migrations);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.migratedFrom).toBe(16);
    expect(result.readOnly).toBe(false);
    const project: Project = result.project;
    expect(project.schemaVersion).toBe(19);
    // Nada além da versão muda: o projeto migrado grava igual ao original, com a versão atual.
    const original = sampleProject();
    expect(serialize(project)).toBe(
      serialize({ ...original, schemaVersion: SCHEMA_VERSION }),
    );
    const saved = JSON.parse(serialize(project)) as Raw;
    expect(saved.schemaVersion).toBe(19);
  });
});
