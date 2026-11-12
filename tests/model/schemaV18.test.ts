// Schema v18 (modo do desenho): `drawingMode` no projeto e no container. A migração v17 → v18 só
// muda a versão; o modo ausente é o primeiro modo de cada especialização.
import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  migrateFrom17To18,
  migrations,
  serialize,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';

type Raw = Record<string, unknown>;

const v17Raw = (): Raw => {
  const raw = JSON.parse(
    serialize({ ...sampleProject(), schemaVersion: 18 } as never),
  ) as Raw;
  raw.schemaVersion = 17;
  return raw;
};

function open(raw: Raw): Project {
  const result = deserialize(JSON.stringify(raw), migrations);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.project;
}

describe('schema v18', () => {
  it('a versão atual é 18 e o registro tem a migração v17 → v18', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(18);
    expect(migrations.get(17)).toBe(migrateFrom17To18);
  });

  it('a migração v17 → v18 não muda os dados', () => {
    const data = { project: { id: 'fixo', name: 'X' }, extra: 1 };
    expect(migrateFrom17To18(data)).toEqual(data);
  });

  it('um mapping.json v17 migra para v18 sem alterar nada além da versão', () => {
    const result = deserialize(JSON.stringify(v17Raw()), migrations);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.migratedFrom).toBe(17);
    expect(result.project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.project.drawingMode).toBeUndefined();
    const saved = JSON.parse(serialize(result.project)) as Raw;
    expect(saved.schemaVersion).toBe(SCHEMA_VERSION);
    expect('drawingMode' in saved).toBe(false);
    expect((saved.containers as Raw[]).every((c) => !('drawingMode' in c))).toBe(true);
  });

  it('projeto com drawingMode "dark" e container com null são válidos e fazem round-trip', () => {
    const raw = v17Raw();
    raw.schemaVersion = 18;
    raw.drawingMode = 'dark';
    (raw.containers as Raw[])[0] = { ...(raw.containers as Raw[])[0], drawingMode: null };
    const project = open(raw);
    expect(project.drawingMode).toBe('dark');
    const text = serialize(project);
    const saved = JSON.parse(text) as Raw;
    expect(saved.drawingMode).toBe('dark');
    // `null` é o mesmo que ausente: segue o projeto, e o arquivo não guarda a chave.
    expect('drawingMode' in (saved.containers as Raw[])[0]!).toBe(false);
  });

  it('container com drawingMode fixado é gravado', () => {
    const raw = v17Raw();
    raw.schemaVersion = 18;
    (raw.containers as Raw[])[0] = {
      ...(raw.containers as Raw[])[0],
      drawingMode: 'light',
    };
    const saved = JSON.parse(serialize(open(raw))) as Raw;
    expect((saved.containers as Raw[])[0]!.drawingMode).toBe('light');
  });

  it('drawingMode que não é texto falha', () => {
    const raw = v17Raw();
    raw.schemaVersion = 18;
    raw.drawingMode = 3;
    const result = deserialize(JSON.stringify(raw), migrations);
    expect(result.ok).toBe(false);
    const other = v17Raw();
    other.schemaVersion = 18;
    (other.containers as Raw[])[0] = {
      ...(other.containers as Raw[])[0],
      drawingMode: 3,
    };
    expect(deserialize(JSON.stringify(other), migrations).ok).toBe(false);
  });
});
