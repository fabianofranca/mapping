// `formatVersion` 11: children by layer and group, roles on the link and a document in an
// external repository (stage #559, PD1).
// pt-BR kept: shared fixture data (specV11Fixtures: layers `componentes`/`eventos`, groups `navegacao`/`dados`, names `Navegação`/`Dados`), asserted by tests/mcp
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseSpec,
  parseSpecText,
  SPEC_FORMAT_VERSION,
  SPEC_FORMAT_VERSIONS,
} from '../../src/model';
import { issuesOf, OWNER, parsedV11, v11Json, type Json } from './specV11Fixtures';

const EVENTS = 'layers[1]';
const EVENT0 = `${EVENTS}.annotationTypes[0]`;
const EMPTY_GROUPS = 'cannot be empty; remove the key or list at least one group';
const BAD_PATH =
  'invalid path: use a path relative to the repository root, with "/", without "." or ".." and without a drive (e.g. components/button.md)';

const owner = (spec: Json) => spec.layers[0].annotationTypes[0] as Json;
const event = (spec: Json, i: number) => spec.layers[1].annotationTypes[i] as Json;

/** v11 with the `design-docs` repo and an object `doc` on the `button`. */
function withDoc(doc: unknown, edit?: (spec: Json) => void): Json {
  return v11Json((spec) => {
    spec.docRepos = [
      {
        id: 'design-docs',
        url: 'https://gitlab.example.com/group/design-docs',
        urlTemplate: 'https://gitlab.example.com/group/design-docs/-/blob/main/{path}',
        ref: 'main',
      },
    ];
    owner(spec).doc = doc;
    edit?.(spec);
  });
}

describe('formatVersion 11: versions', () => {
  it('the current version is 16 and v1 to v11 are still accepted', () => {
    expect(SPEC_FORMAT_VERSION).toBe(16);
    expect(SPEC_FORMAT_VERSIONS).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
    for (const v of SPEC_FORMAT_VERSIONS) {
      expect(issuesOf(v11Json(undefined, v)), `v${v}`).toEqual([]);
    }
  });

  it('the invalid-version message lists 1 to 16', () => {
    expect(issuesOf(v11Json(undefined, 17))).toContainEqual({
      path: 'formatVersion',
      message: 'must be 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 or 16',
    });
  });

  it('the specializations in examples/ and libraries/ are still valid', () => {
    const files = [
      ...readdirSync('examples/specs').map((f) => join('examples/specs', f)),
      ...['kotlin', 'material3-compose', 'notas'].map((d) =>
        join('libraries', d, `${d}.spec.json`),
      ),
    ];
    expect(files.length).toBe(6);
    for (const file of files) {
      const result = parseSpecText(readFileSync(file, 'utf8'));
      expect(result.ok ? [] : result.errors, file).toEqual([]);
    }
  });
});

describe('formatVersion 11: what is valid', () => {
  it('clause without groups (the whole layer) and with groups', () => {
    const spec = parsedV11((s) => {
      owner(s).allowedChildren = [{ layer: 'eventos' }];
      s.layers[0].annotationTypes[1].allowedChildren = [
        { layer: 'eventos', groups: ['navegacao', 'dados'] },
      ];
    });
    expect(spec.layers[0]?.annotationTypes[0]?.allowedChildren).toEqual([
      { layer: 'eventos' },
    ]);
    expect(spec.layers[0]?.annotationTypes[1]?.allowedChildren).toEqual([
      { layer: 'eventos', groups: ['navegacao', 'dados'] },
    ]);
  });

  it('mixed list of ids and clauses', () => {
    const spec = parsedV11((s) => {
      owner(s).allowedChildren = ['onHold', { layer: 'eventos', groups: ['dados'] }];
    });
    expect(spec.layers[0]?.annotationTypes[0]?.allowedChildren).toEqual([
      'onHold',
      { layer: 'eventos', groups: ['dados'] },
    ]);
  });

  it('groups on the layer (with description) and on the type', () => {
    const spec = parsedV11();
    // pt-BR kept: shared fixture data (specV11Fixtures group names), asserted by tests/mcp
    expect(spec.layers[1]?.groups).toEqual([
      { id: 'navegacao', name: 'Navegação' },
      { id: 'dados', name: 'Dados', description: 'Eventos de dados' },
    ]);
    expect(spec.layers[1]?.annotationTypes[4]?.groups).toEqual(['dados', 'navegacao']);
  });

  it('childRoles with and without childRolesLabel', () => {
    const roles = [
      { id: 'click', name: 'Click' },
      { id: 'hold', name: 'Press', description: 'Hold the button' },
    ];
    const withoutLabel = parsedV11((s) => (owner(s).childRoles = roles));
    expect(withoutLabel.layers[0]?.annotationTypes[0]?.childRoles).toEqual(roles);
    expect(withoutLabel.layers[0]?.annotationTypes[0]?.childRolesLabel).toBeUndefined();
    const withLabel = parsedV11((s) => {
      owner(s).childRoles = roles;
      owner(s).childRolesLabel = 'Trigger';
    });
    expect(withLabel.layers[0]?.annotationTypes[0]?.childRolesLabel).toBe('Trigger');
  });

  it('docRepos and object doc; text doc is still valid', () => {
    const spec = parsedV11((s) => {
      s.docRepos = [{ id: 'design-docs', url: 'https://gitlab.example.com/g/d' }];
      owner(s).doc = { repo: 'design-docs', path: 'components/button.md' };
      s.layers[0].annotationTypes[1].doc = 'docs/image.md';
    });
    expect(spec.docRepos).toEqual([
      { id: 'design-docs', url: 'https://gitlab.example.com/g/d' },
    ]);
    expect(spec.layers[0]?.annotationTypes[0]?.doc).toEqual({
      repo: 'design-docs',
      path: 'components/button.md',
    });
    expect(spec.layers[0]?.annotationTypes[1]?.doc).toBe('docs/image.md');
  });
});

describe('formatVersion 11: allowedChildren clause', () => {
  const clause = (c: unknown) => (s: Json) => (owner(s).allowedChildren = [c]);
  const at = `${OWNER}.allowedChildren[0]`;

  it('nonexistent layer', () => {
    expect(issuesOf(v11Json(clause({ layer: 'nothing' })))).toContainEqual({
      path: `${at}.layer`,
      message: 'layer "nothing" does not exist in the specialization',
    });
  });

  it("layer equal to the owner's", () => {
    expect(issuesOf(v11Json(clause({ layer: 'componentes' })))).toContainEqual({
      path: `${at}.layer`,
      message: `layer "componentes" is the type's own layer; children must be in another layer`,
    });
  });

  it("nonexistent group in the clause's layer", () => {
    expect(
      issuesOf(v11Json(clause({ layer: 'eventos', groups: ['dados', 'nothing'] }))),
    ).toEqual([
      {
        path: `${at}.groups[1]`,
        message: 'group "nothing" does not exist in the layer "eventos"',
      },
    ]);
  });

  it('groups: [] in the clause', () => {
    expect(issuesOf(v11Json(clause({ layer: 'eventos', groups: [] })))).toEqual([
      { path: `${at}.groups`, message: EMPTY_GROUPS },
    ]);
  });

  it('groups that is not a list is a shape error, without bringing parseSpec down', () => {
    expect(issuesOf(v11Json(clause({ layer: 'eventos', groups: 3 })))).toEqual([
      { path: `${at}.groups`, message: 'must be a list of group ids' },
    ]);
  });

  it('extra property in the clause', () => {
    expect(issuesOf(v11Json(clause({ layer: 'eventos', extra: 1 })))).toEqual([
      { path: at, message: 'unknown property: "extra"' },
    ]);
  });

  it('clause without layer and an item that is neither text nor object', () => {
    expect(issuesOf(v11Json(clause({ groups: ['dados'] })))).toEqual([
      { path: `${at}.layer`, message: 'required' },
    ]);
    expect(issuesOf(v11Json(clause(5)))).toEqual([
      {
        path: at,
        message: 'must be a type id (text) or a clause { layer, groups }',
      },
    ]);
  });

  it('the text id is still checked as before', () => {
    expect(issuesOf(v11Json(clause('nothing')))).toContainEqual({
      path: at,
      message: 'type "nothing" does not exist in the specialization',
    });
    expect(issuesOf(v11Json(clause('image')))).toContainEqual({
      path: at,
      message: 'type "image" is in the same layer; children must be in another layer',
    });
  });
});

describe('formatVersion 11: groups', () => {
  it("nonexistent type group in the type's layer", () => {
    const spec = v11Json((s) => (event(s, 1).groups = ['navegacao', 'nothing']));
    expect(issuesOf(spec)).toEqual([
      {
        path: `${EVENTS}.annotationTypes[1].groups[1]`,
        message: 'group "nothing" does not exist in the layer "eventos"',
      },
    ]);
  });

  it('type group in a layer that declares no groups', () => {
    const spec = v11Json((s) => (s.layers[0].annotationTypes[1].groups = ['navegacao']));
    expect(issuesOf(spec)).toEqual([
      {
        path: 'layers[0].annotationTypes[1].groups[0]',
        message: 'group "navegacao" does not exist in the layer "componentes"',
      },
    ]);
  });

  it('repeated group id in the layer', () => {
    const spec = v11Json((s) => s.layers[1].groups.push({ id: 'dados', name: 'Other' }));
    expect(issuesOf(spec)).toEqual([
      { path: `${EVENTS}.groups[2].id`, message: 'id "dados" repeated' },
    ]);
  });

  it('empty or missing name in the group', () => {
    const spec = v11Json((s) => (s.layers[1].groups[0].name = ''));
    expect(issuesOf(spec)).toEqual([
      { path: `${EVENTS}.groups[0].name`, message: 'cannot be empty' },
    ]);
  });

  it('groups: [] and repeated group on the type', () => {
    expect(issuesOf(v11Json((s) => (event(s, 0).groups = [])))).toEqual([
      { path: `${EVENT0}.groups`, message: EMPTY_GROUPS },
    ]);
    expect(
      issuesOf(v11Json((s) => (event(s, 0).groups = ['navegacao', 'navegacao']))),
    ).toEqual([{ path: `${EVENT0}.groups[1]`, message: 'group "navegacao" repeated' }]);
  });
});

describe('formatVersion 11: childRoles and childRolesLabel', () => {
  const roles = [{ id: 'click', name: 'Click' }];

  it('empty childRoles', () => {
    expect(issuesOf(v11Json((s) => (owner(s).childRoles = [])))).toEqual([
      {
        path: `${OWNER}.childRoles`,
        message: 'cannot be empty; remove the key or declare at least one role',
      },
    ]);
  });

  it('repeated role id', () => {
    const spec = v11Json(
      (s) =>
        (owner(s).childRoles = [
          { id: 'click', name: 'Click' },
          { id: 'click', name: 'Other' },
        ]),
    );
    expect(issuesOf(spec)).toEqual([
      { path: `${OWNER}.childRoles[1].id`, message: 'id "click" repeated' },
    ]);
  });

  it('childRoles on a type without allowedChildren', () => {
    const spec = v11Json((s) => (s.layers[0].annotationTypes[1].childRoles = roles));
    expect(issuesOf(spec)).toEqual([
      {
        path: 'layers[0].annotationTypes[1].childRoles',
        message: 'only allowed in a type with allowedChildren',
      },
    ]);
  });

  it('childRolesLabel without childRoles; empty with childRoles', () => {
    expect(issuesOf(v11Json((s) => (owner(s).childRolesLabel = 'Trigger')))).toEqual([
      { path: `${OWNER}.childRolesLabel`, message: 'only allowed with childRoles' },
    ]);
    const empty = v11Json((s) => {
      owner(s).childRoles = roles;
      owner(s).childRolesLabel = '';
    });
    expect(issuesOf(empty)).toEqual([
      { path: `${OWNER}.childRolesLabel`, message: 'cannot be empty' },
    ]);
  });

  it('role without name or with an extra property', () => {
    expect(issuesOf(v11Json((s) => (owner(s).childRoles = [{ id: 'a' }])))).toEqual([
      { path: `${OWNER}.childRoles[0].name`, message: 'required' },
    ]);
    expect(
      issuesOf(v11Json((s) => (owner(s).childRoles = [{ id: 'a', name: 'A', x: 1 }]))),
    ).toEqual([{ path: `${OWNER}.childRoles[0]`, message: 'Unrecognized key: "x"' }]);
  });
});

describe('formatVersion 11: doc in an external repository', () => {
  const doc = (path: string) => ({ repo: 'design-docs', path });

  it('repo outside docRepos (and without docRepos)', () => {
    expect(issuesOf(withDoc({ repo: 'other', path: 'a.md' }))).toEqual([
      {
        path: `${OWNER}.doc.repo`,
        message: 'repository "other" is not declared in docRepos',
      },
    ]);
    const none = v11Json((s) => (owner(s).doc = doc('a.md')));
    expect(issuesOf(none)).toEqual([
      {
        path: `${OWNER}.doc.repo`,
        message: 'repository "design-docs" is not declared in docRepos',
      },
    ]);
  });

  it('path without .md', () => {
    expect(issuesOf(withDoc(doc('components/button.txt')))).toEqual([
      { path: `${OWNER}.doc.path`, message: 'invalid extension: expected .md' },
    ]);
  });

  it('path with #', () => {
    expect(issuesOf(withDoc(doc('components/button.md#top')))).toEqual([
      { path: `${OWNER}.doc.path`, message: 'cannot have "#" (anchor)' },
    ]);
  });

  it('path with .. or / at the start', () => {
    for (const path of ['../button.md', 'a/../button.md', '/components/button.md']) {
      expect(issuesOf(withDoc(doc(path))), path).toEqual([
        { path: `${OWNER}.doc.path`, message: BAD_PATH },
      ]);
    }
  });

  it('extra property, missing repo or path, wrong type', () => {
    expect(issuesOf(withDoc({ ...doc('a.md'), x: 1 }))).toEqual([
      { path: `${OWNER}.doc`, message: 'unknown property: "x"' },
    ]);
    expect(issuesOf(withDoc({ path: 'a.md' }))).toContainEqual({
      path: `${OWNER}.doc.repo`,
      message: 'required',
    });
    expect(issuesOf(withDoc({ repo: 'design-docs' }))).toEqual([
      { path: `${OWNER}.doc.path`, message: 'required' },
    ]);
    expect(issuesOf(withDoc(5))).toEqual([
      {
        path: `${OWNER}.doc`,
        message: 'must be text (a package file) or an object { repo, path }',
      },
    ]);
  });

  it('the text doc is still checked as a package file', () => {
    expect(issuesOf(withDoc('docs/button.txt'))).toEqual([
      { path: `${OWNER}.doc`, message: 'invalid extension: expected .md' },
    ]);
  });

  it('docRepos with a repeated id and urlTemplate without {path}', () => {
    const repos = (list: Json[]) => (s: Json) => (s.docRepos = list);
    expect(
      issuesOf(
        v11Json(
          repos([
            { id: 'd', url: 'https://x.com/a' },
            { id: 'd', url: 'https://x.com/b' },
          ]),
        ),
      ),
    ).toEqual([{ path: 'docRepos[1].id', message: 'id "d" repeated' }]);
    expect(
      issuesOf(
        v11Json(
          repos([{ id: 'd', url: 'https://x.com/a', urlTemplate: 'https://x.com/a' }]),
        ),
      ),
    ).toEqual([{ path: 'docRepos[0].urlTemplate', message: 'must contain {path}' }]);
  });
});

describe('formatVersion 11: requiresOwner in the resolved set', () => {
  const requires = (spec: Json) => (event(spec, 2).requiresOwner = true);
  const NOT_OWNED = {
    path: `${EVENTS}.annotationTypes[2].requiresOwner`,
    message: '"navigate" requires an owner, but no type lists it in allowedChildren',
  };

  it('an owner that lists the type by a clause satisfies it', () => {
    expect(issuesOf(v11Json(requires))).toEqual([]);
    const byGroup = v11Json((s) => {
      requires(s);
      owner(s).allowedChildren = [{ layer: 'eventos', groups: ['navegacao'] }];
    });
    expect(issuesOf(byGroup)).toEqual([]);
  });

  it('error when no clause or id covers the type', () => {
    const spec = v11Json((s) => {
      requires(s);
      owner(s).allowedChildren = [{ layer: 'eventos', groups: ['dados'] }];
    });
    expect(issuesOf(spec)).toEqual([NOT_OWNED]);
  });

  it('error when nobody lists anything; another owner by id satisfies it', () => {
    const none = v11Json((s) => {
      requires(s);
      delete owner(s).allowedChildren;
    });
    expect(issuesOf(none)).toEqual([NOT_OWNED]);
    const other = v11Json((s) => {
      requires(s);
      delete owner(s).allowedChildren;
      s.layers[0].annotationTypes[1].allowedChildren = ['navigate'];
    });
    expect(issuesOf(other)).toEqual([]);
  });

  it('a type that only lists itself as a child does not satisfy its own requiresOwner (CR #945, item 46)', () => {
    const self = v11Json((s) => {
      requires(s);
      delete owner(s).allowedChildren;
      event(s, 2).allowedChildren = ['navigate'];
    }, 15);
    expect(issuesOf(self)).toEqual([
      {
        path: NOT_OWNED.path,
        message:
          '"navigate" requires an owner, but no other type accepts it as a child (only itself lists it in allowedChildren)',
      },
    ]);
    const viaLayer = v11Json((s) => {
      requires(s);
      delete owner(s).allowedChildren;
      event(s, 2).allowedChildren = [{ layer: 'eventos', groups: ['navegacao'] }];
    }, 15);
    expect(issuesOf(viaLayer).map((i) => i.path)).toEqual([NOT_OWNED.path]);
  });
});

describe('new keys in a version earlier than 11', () => {
  const ONLY = 'only allowed with formatVersion 11';

  it('clause, groups, childRoles, childRolesLabel, docRepos and object doc give an error at the exact path', () => {
    for (const v of [4, 8, 10]) {
      const spec = v11Json((s) => {
        owner(s).allowedChildren = ['navigate', { layer: 'eventos' }];
        s.layers[0].annotationTypes[1].groups = ['x'];
        owner(s).childRoles = [{ id: 'a', name: 'A' }];
        owner(s).childRolesLabel = 'Trigger';
        s.layers[1].groups = [{ id: 'g', name: 'G' }];
        s.docRepos = [{ id: 'd', url: 'https://x.com/a' }];
        s.layers[0].annotationTypes[2].doc = { repo: 'd', path: 'a.md' };
      }, v);
      expect(issuesOf(spec), `v${v}`).toEqual(
        expect.arrayContaining([
          { path: `${OWNER}.allowedChildren[1]`, message: ONLY },
          { path: 'layers[0].annotationTypes[1].groups', message: ONLY },
          { path: `${OWNER}.childRoles`, message: ONLY },
          { path: `${OWNER}.childRolesLabel`, message: ONLY },
          { path: `${EVENTS}.groups`, message: ONLY },
          { path: 'docRepos', message: ONLY },
          { path: 'layers[0].annotationTypes[2].doc', message: ONLY },
        ]),
      );
      expect(issuesOf(spec).filter((i) => i.message === ONLY)).toHaveLength(7);
    }
  });

  it('a text doc is valid from v4 onward and is still an error before v4', () => {
    expect(issuesOf(v11Json((s) => (owner(s).doc = 'docs/a.md'), 4))).toEqual([]);
    expect(issuesOf(v11Json((s) => (owner(s).doc = 'docs/a.md'), 3))).toEqual([
      { path: `${OWNER}.doc`, message: 'only allowed with formatVersion 4' },
    ]);
  });

  it('parseSpec returns the v10 specialization without the new keys', () => {
    expect(parseSpec(v11Json(undefined, 10)).ok).toBe(true);
  });
});
