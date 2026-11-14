// Schema v14 (stage #559, PD2): `parentRole` on the annotation, `docRepos` on the project, the role
// invariant and the v13 → v14 migration.
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

describe('schema v14: reading and writing', () => {
  it('the current version is 14 and the new project has empty docRepos', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(14);
    expect(emptyProject().docRepos).toEqual({});
  });

  it('reads and writes parentRole, and the fixed order puts the role right after the owner', () => {
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

  it('reads and writes docRepos, right after platformRepos', () => {
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

describe('schema v14: docRepos on reading', () => {
  const read = (docRepos: unknown) => {
    const raw = JSON.parse(serialize(sampleProject())) as Raw;
    raw.docRepos = docRepos;
    return load(JSON.stringify(raw)).project.docRepos;
  };

  it('an entry without localPath goes away', () => {
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

  it('an extra key on the entry is discarded', () => {
    expect(read({ a: { localPath: '../a', url: 'x', extra: 1 } })).toEqual({
      a: { localPath: '../a' },
    });
  });

  it('an id that no specialization declares opens', () => {
    expect(read({ 'no-spec': { localPath: '../x' } })).toEqual({
      'no-spec': { localPath: '../x' },
    });
  });
});

describe('schema v14: role invariant', () => {
  const open = (edit: (a: Raw) => Raw) => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    const raw = JSON.parse(serialize(p)) as Raw;
    raw.annotations = raw.annotations.map((a: Raw) => (a.id === 'E1' ? edit(a) : a));
    return deserialize(JSON.stringify(raw), migrations, specFiles(p));
  };

  it('a role without an owner refuses opening', () => {
    const result = open((a) => ({ ...a, parentAnnotationId: null }));
    expect(result.ok).toBe(false);
    if (result.ok || result.error.code !== 'invariant-violation')
      throw new Error('expected a violation');
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        code: 'role-without-owner',
        entity: 'annotation',
        id: 'E1',
      }),
    );
  });

  it('an empty role refuses opening', () => {
    const result = open((a) => ({ ...a, parentRole: '' }));
    expect(result.ok).toBe(false);
    if (result.ok || result.error.code !== 'invariant-violation')
      throw new Error('expected a violation');
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({ code: 'empty-role', id: 'E1' }),
    );
  });

  it('the intact project and a role the owner does not offer open (it is an issue, not an error)', () => {
    expect(open((a) => a).ok).toBe(true);
    expect(open((a) => ({ ...a, parentRole: 'does-not-exist' })).ok).toBe(true);
    expect(
      validateProject(addChild(roleProject(withRoles), 'E1', 'A1', 'click')),
    ).toEqual([]);
  });
});

describe('migration v13 → v14', () => {
  /** The project as a v13 mapping.json: without `parentRole` or `docRepos`. */
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

  it('the registry has the v13 → v14 migration', () => {
    expect(migrations.get(13)).toBe(migrateFrom13To14);
  });

  it('every annotation gets parentRole: null and the project gets docRepos: {}', () => {
    const raw = v13Raw();
    const result = load(JSON.stringify(raw));
    expect(result.migratedFrom).toBe(13);
    expect(result.readOnly).toBe(false);
    expect(result.project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.project.docRepos).toEqual({});
    expect(result.project.annotations.length).toBe(raw.annotations.length);
    expect(result.project.annotations.every((a) => a.parentRole === null)).toBe(true);
  });

  it('existing links stay without a role and the project opens the same as the original', () => {
    const original = sampleProject();
    const migrated = load(JSON.stringify(v13Raw())).project;
    expect(serialize(migrated)).toBe(serialize(original));
    expect(migrated.annotations.map((a) => a.parentAnnotationId)).toEqual(
      original.annotations.map((a) => a.parentAnnotationId),
    );
  });

  it('an existing value is preserved and re-reading is stable', () => {
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
