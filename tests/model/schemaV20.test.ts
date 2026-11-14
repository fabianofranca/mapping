// Schema v20 (direção de leitura): `direction` no projeto e no container. A migração v19 → v20 só
// muda a versão; a direção ausente é `ltr`.
import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  migrateFrom19To20,
  migrations,
  serialize,
  setContainerDirection,
  setContainerDrawingMode,
  setContainerDensity,
  setProjectDirection,
  setProjectDrawingMode,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';

type Raw = Record<string, unknown>;

const v19Raw = (): Raw => {
  const raw = JSON.parse(serialize(sampleProject())) as Raw;
  raw.schemaVersion = 19;
  return raw;
};

function open(raw: Raw): Project {
  const result = deserialize(JSON.stringify(raw), migrations);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.project;
}

describe('schema v20', () => {
  it('a versão atual é 20 e o registro tem a migração v19 → v20', () => {
    expect(SCHEMA_VERSION).toBe(20);
    expect(migrations.get(19)).toBe(migrateFrom19To20);
  });

  it('a migração v19 → v20 não muda os dados', () => {
    const data = { project: { id: 'fixo', name: 'X' }, extra: 1 };
    expect(migrateFrom19To20(data)).toEqual(data);
  });

  it('um mapping.json v19 migra para v20 sem alterar nada além da versão', () => {
    const result = deserialize(JSON.stringify(v19Raw()), migrations);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.migratedFrom).toBe(19);
    expect(result.project.schemaVersion).toBe(20);
    expect(result.project.direction).toBeUndefined();
    const saved = JSON.parse(serialize(result.project)) as Raw;
    expect(saved.schemaVersion).toBe(20);
    expect('direction' in saved).toBe(false);
    expect((saved.containers as Raw[]).every((c) => !('direction' in c))).toBe(true);
  });

  it('a gravação só escreve a chave quando presente; null no container não é gravado', () => {
    const { containers } = sampleProject();
    const id = containers[0]!.id;
    const p = setContainerDirection(
      setProjectDirection(sampleProject(), 'rtl'),
      id,
      'ltr',
    );
    const saved = JSON.parse(serialize(p)) as Raw;
    expect(saved.direction).toBe('rtl');
    expect((saved.containers as Raw[])[0]!.direction).toBe('ltr');
    const followed = setContainerDirection(p, id, null);
    expect('direction' in (JSON.parse(serialize(followed)).containers as Raw[])[0]!).toBe(
      false,
    );
    expect(open(JSON.parse(serialize(p)) as Raw).direction).toBe('rtl');
  });

  it('a ordem das chaves: direction logo depois de drawingMode, e density depois', () => {
    const id = sampleProject().containers[0]!.id;
    let p = setProjectDirection(setProjectDrawingMode(sampleProject(), 'dark'), 'rtl');
    p = setContainerDensity(
      setContainerDirection(setContainerDrawingMode(p, id, 'light'), id, 'rtl'),
      id,
      2,
    );
    const saved = JSON.parse(serialize(p)) as Raw;
    const keys = Object.keys(saved);
    expect(keys.indexOf('direction')).toBe(keys.indexOf('drawingMode') + 1);
    expect(keys.indexOf('layers')).toBe(keys.indexOf('direction') + 1);
    const containerKeys = Object.keys((saved.containers as Raw[])[0]!);
    const at = containerKeys.indexOf('drawingMode');
    expect(containerKeys.slice(at)).toEqual(['drawingMode', 'direction', 'density']);
  });

  it('direction fora de ltr/rtl falha', () => {
    const raw = v19Raw();
    raw.schemaVersion = 20;
    raw.direction = 'cima';
    expect(deserialize(JSON.stringify(raw), migrations).ok).toBe(false);
  });
});
