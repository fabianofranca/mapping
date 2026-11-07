// Schema v14 (etapa #559, PD2): `parentRole` na anotação, `docRepos` no projeto, o invariante
// do papel e a migração v13 → v14.
import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  migrateFrom13To14,
  migrations,
  serialize,
  specFiles,
  validateProject,
  type Project,
} from '../../src/model';
import { emptyProject, sampleProject } from './fixtures';
import { addChild, roleProject, withDocRepo, withRoles } from './roleFixtures';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function load(text: string, specs = new Map<string, string>()) {
  const result = deserialize(text, migrations, specs);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result;
}

function reload(p: Project): Project {
  return load(serialize(p), specFiles(p)).project;
}

describe('schema v14: leitura e gravação', () => {
  it('a versão atual é 14 e o projeto novo tem docRepos vazio', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(14);
    expect(emptyProject().docRepos).toEqual({});
  });

  it('lê e grava parentRole, e a ordem fixa põe o papel logo depois do dono', () => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    const raw = JSON.parse(serialize(p)) as Raw;
    const child = raw.annotations.find((a: Raw) => a.id === 'E1');
    expect(Object.keys(child).slice(3, 7)).toEqual([
      'name',
      'parentAnnotationId',
      'parentRole',
      'type',
    ]);
    expect(child.parentRole).toBe('click');
    expect(reload(p).annotations.find((a) => a.id === 'E1')?.parentRole).toBe('click');
    expect(serialize(reload(p))).toBe(serialize(p));
  });

  it('lê e grava docRepos, logo depois de platformRepos', () => {
    const p = {
      ...roleProject(withDocRepo),
      docRepos: { 'design-docs': { localPath: '../design-docs' } },
    };
    const text = serialize(p);
    const keys = Object.keys(JSON.parse(text) as Raw);
    expect(keys.indexOf('docRepos')).toBe(keys.indexOf('platformRepos') + 1);
    expect(reload(p).docRepos).toEqual({
      'design-docs': { localPath: '../design-docs' },
    });
  });
});

describe('schema v14: docRepos na leitura', () => {
  const read = (docRepos: unknown) => {
    const raw = JSON.parse(serialize(sampleProject())) as Raw;
    raw.docRepos = docRepos;
    return load(JSON.stringify(raw)).project.docRepos;
  };

  it('a entrada sem localPath sai', () => {
    expect(
      read({
        a: {},
        b: { localPath: '' },
        c: { localPath: null },
        d: { localPath: '../d' },
      }),
    ).toEqual({
      d: { localPath: '../d' },
    });
  });

  it('chave a mais na entrada é descartada', () => {
    expect(read({ a: { localPath: '../a', url: 'x', extra: 1 } })).toEqual({
      a: { localPath: '../a' },
    });
  });

  it('um id que nenhuma especialização declara abre', () => {
    expect(read({ 'sem-spec': { localPath: '../x' } })).toEqual({
      'sem-spec': { localPath: '../x' },
    });
  });
});

describe('schema v14: invariante do papel', () => {
  const open = (edit: (a: Raw) => Raw) => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    const raw = JSON.parse(serialize(p)) as Raw;
    raw.annotations = raw.annotations.map((a: Raw) => (a.id === 'E1' ? edit(a) : a));
    return deserialize(JSON.stringify(raw), migrations, specFiles(p));
  };

  it('um papel sem dono recusa a abertura', () => {
    const result = open((a) => ({ ...a, parentAnnotationId: null }));
    expect(result.ok).toBe(false);
    if (result.ok || result.error.code !== 'invariant-violation')
      throw new Error('esperava violação');
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        code: 'role-without-owner',
        entity: 'annotation',
        id: 'E1',
      }),
    );
  });

  it('um papel vazio recusa a abertura', () => {
    const result = open((a) => ({ ...a, parentRole: '' }));
    expect(result.ok).toBe(false);
    if (result.ok || result.error.code !== 'invariant-violation')
      throw new Error('esperava violação');
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({ code: 'empty-role', id: 'E1' }),
    );
  });

  it('o projeto íntegro e um papel que o dono não oferece abrem (é pendência, não erro)', () => {
    expect(open((a) => a).ok).toBe(true);
    expect(open((a) => ({ ...a, parentRole: 'nao-existe' })).ok).toBe(true);
    expect(
      validateProject(addChild(roleProject(withRoles), 'E1', 'A1', 'click')),
    ).toEqual([]);
  });
});

describe('migração v13 → v14', () => {
  /** O projeto como um mapping.json v13: sem `parentRole` nem `docRepos`. */
  function v13Raw(): Raw {
    const raw = JSON.parse(serialize(sampleProject())) as Raw;
    raw.schemaVersion = 13;
    delete raw.docRepos;
    raw.annotations = raw.annotations.map((a: Raw) => {
      const { parentRole, ...rest } = a;
      void parentRole;
      return rest;
    });
    return raw;
  }

  it('o registro tem a migração v13 → v14', () => {
    expect(migrations.get(13)).toBe(migrateFrom13To14);
  });

  it('toda anotação ganha parentRole: null e o projeto ganha docRepos: {}', () => {
    const raw = v13Raw();
    const result = load(JSON.stringify(raw));
    expect(result.migratedFrom).toBe(13);
    expect(result.readOnly).toBe(false);
    expect(result.project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.project.docRepos).toEqual({});
    expect(result.project.annotations.length).toBe(raw.annotations.length);
    expect(result.project.annotations.every((a) => a.parentRole === null)).toBe(true);
  });

  it('os vínculos existentes ficam sem papel e o projeto abre igual ao original', () => {
    const original = sampleProject();
    const migrated = load(JSON.stringify(v13Raw())).project;
    expect(serialize(migrated)).toBe(serialize(original));
    expect(migrated.annotations.map((a) => a.parentAnnotationId)).toEqual(
      original.annotations.map((a) => a.parentAnnotationId),
    );
  });

  it('um valor já presente é preservado e a releitura é estável', () => {
    const [step] = [migrateFrom13To14];
    const out = step({
      docRepos: { a: { localPath: '../a' } },
      annotations: [{ id: 'X', parentRole: 'click' }, { id: 'Y' }],
    });
    expect(out).toEqual({
      docRepos: { a: { localPath: '../a' } },
      annotations: [
        { id: 'X', parentRole: 'click' },
        { id: 'Y', parentRole: null },
      ],
    });
    const text = serialize(load(JSON.stringify(v13Raw())).project);
    expect(serialize(load(text).project)).toBe(text);
  });
});
