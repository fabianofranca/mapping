// formatVersion 11 in the specialization's consumers: warnings, version contract and package
// (stage #559, PD1).
// pt-BR kept: shared fixture data (specV11Fixtures: layers `componentes`/`eventos`, groups `navegacao`/`dados`), asserted by tests/mcp
import { withoutMessageCode } from '../support/withoutMessageCode';
import { describe, expect, it } from 'vitest';
import {
  diffSpecs,
  specWarnings,
  usesPackageFiles,
  type Spec,
  type SpecWarning,
} from '../../src/model';
import { validateLibrary } from '../../src/model/library';
import { parsedV11, v11Json, type Json } from './specV11Fixtures';

const owner = (s: Json) => s.layers[0].annotationTypes[0] as Json;

/** Events layer with `n` types `e1`…`en` (the `eventos` layer gets the types). */
function withEvents(spec: Json, n: number): string[] {
  const ids: string[] = [];
  for (let i = 1; i <= n; i++) {
    ids.push(`e${i}`);
    spec.layers[1].annotationTypes.push({ id: `e${i}`, name: `e${i}`, fields: [] });
  }
  return ids;
}

/** The warnings of the code, without the UI message code (`messageCode` and `messageParams`). */
const codes = (warnings: SpecWarning[], code: string) =>
  warnings.filter((w) => w.code === code).map(withoutMessageCode);

describe('specWarnings: formatVersion 11', () => {
  it('allowedChildren with 20 text ids warns; with 19 it does not', () => {
    const twenty = parsedV11((s) => {
      owner(s).allowedChildren = ['navigate', ...withEvents(s, 19)];
    });
    expect(codes(specWarnings(twenty), 'many-children-ids')).toEqual([
      {
        code: 'many-children-ids',
        path: 'layers[0].annotationTypes[0].allowedChildren',
        message:
          '20 types listed one by one; a { layer, groups } clause covers the layer or the groups',
      },
    ]);
    const nineteen = parsedV11((s) => {
      owner(s).allowedChildren = ['navigate', ...withEvents(s, 18)];
    });
    expect(codes(specWarnings(nineteen), 'many-children-ids')).toEqual([]);
  });

  it('clauses do not count as listed ids', () => {
    const spec = parsedV11((s) => {
      owner(s).allowedChildren = [{ layer: 'eventos' }, ...withEvents(s, 5)];
    });
    expect(codes(specWarnings(spec), 'many-children-ids')).toEqual([]);
  });

  it('declared group that no type uses', () => {
    const spec = parsedV11((s) =>
      s.layers[1].groups.push({ id: 'empty', name: 'Empty' }),
    );
    expect(codes(specWarnings(spec), 'unused-group')).toEqual([
      {
        code: 'unused-group',
        path: 'layers[1].groups[2]',
        message:
          'the group "empty" of the layer "eventos" is declared, but no type is in it',
      },
    ]);
    expect(codes(specWarnings(parsedV11()), 'unused-group')).toEqual([]);
  });

  it('docRepos repository that no doc uses', () => {
    const repos = [
      { id: 'used', url: 'https://x.com/a' },
      { id: 'loose', url: 'https://x.com/b' },
    ];
    const spec = parsedV11((s) => {
      s.docRepos = repos;
      owner(s).doc = { repo: 'used', path: 'a.md' };
    });
    expect(codes(specWarnings(spec), 'unused-doc-repo')).toEqual([
      {
        code: 'unused-doc-repo',
        path: 'docRepos[1]',
        message: 'the repository "loose" in docRepos is declared, but no `doc` uses it',
      },
    ]);
  });

  it('a specialization without the new keys gets no warning', () => {
    expect(specWarnings(parsedV11())).toEqual([]);
  });
});

describe('diffSpecs: the new keys stay outside the version contract', () => {
  const edits: Record<string, (s: Json) => void> = {
    clause: (s) =>
      (owner(s).allowedChildren = [{ layer: 'eventos', groups: ['navegacao'] }]),
    'groups of the layer': (s) => s.layers[1].groups.push({ id: 'new', name: 'New' }),
    'groups of the type': (s) => (s.layers[1].annotationTypes[1].groups = ['dados']),
    docRepos: (s) => (s.docRepos = [{ id: 'd', url: 'https://x.com/a' }]),
    'object doc': (s) => {
      s.docRepos = [{ id: 'd', url: 'https://x.com/a' }];
      owner(s).doc = { repo: 'd', path: 'a.md' };
    },
  };

  it.each(Object.keys(edits))(
    'adding, changing and removing %s generates no change',
    (name) => {
      const edit = edits[name] as (s: Json) => void;
      const plain = parsedV11();
      const added = parsedV11(edit);
      expect(diffSpecs(plain, added)).toEqual([]);
      expect(diffSpecs(added, plain)).toEqual([]);
      const changed = parsedV11((s) => {
        edit(s);
        s.layers[1].groups[0].name = 'Other name';
      });
      expect(diffSpecs(added, changed)).toEqual([]);
    },
  );

  // `childRoles` as a whole left here in formatVersion 12 (decisions 1 to 5 of stage #557): a removed
  // role is `removed-role`, and a type that starts to have roles is `roles-required` (specVersions.test.ts).
  it('childRolesLabel, name and description of the roles stay outside the contract', () => {
    const roles = (s: Json) => (owner(s).childRoles = [{ id: 'a', name: 'A' }]);
    const plain = parsedV11(roles);
    const labelled = parsedV11((s) => {
      roles(s);
      owner(s).childRolesLabel = 'Trigger';
    });
    const renamed = parsedV11((s) => {
      owner(s).childRoles = [{ id: 'a', name: 'Other', description: 'd' }];
      owner(s).childRolesLabel = 'Slot';
    });
    expect(diffSpecs(plain, labelled)).toEqual([]);
    expect(diffSpecs(labelled, plain)).toEqual([]);
    expect(diffSpecs(labelled, renamed)).toEqual([]);
  });

  it('switching the doc between text and object generates no change', () => {
    const text = parsedV11((s) => (owner(s).doc = 'docs/button.md'));
    const object = parsedV11((s) => {
      s.docRepos = [{ id: 'd', url: 'https://x.com/a' }];
      owner(s).doc = { repo: 'd', path: 'button.md' };
    });
    expect(diffSpecs(text, object)).toEqual([]);
    expect(diffSpecs(object, text)).toEqual([]);
  });
});

describe('usesPackageFiles: doc in an external repository', () => {
  const external = (extra?: (s: Json) => void): Spec =>
    parsedV11((s) => {
      s.docRepos = [{ id: 'd', url: 'https://x.com/a' }];
      owner(s).doc = { repo: 'd', path: 'components/button.md' };
      extra?.(s);
    });

  it('only an object doc counts as an isolated file', () => {
    expect(usesPackageFiles(external())).toBe(false);
  });

  it('a text doc requires the package folder', () => {
    expect(usesPackageFiles(parsedV11((s) => (owner(s).doc = 'docs/button.md')))).toBe(
      true,
    );
  });

  it('an object doc on one type and a text doc on another: requires the package', () => {
    const spec = external((s) => (s.layers[0].annotationTypes[1].doc = 'docs/image.md'));
    expect(usesPackageFiles(spec)).toBe(true);
  });

  it('an object doc with component, examples or fonts: still requires the package', () => {
    const spec = external((s) => (s.layers[0].annotationTypes[1].component = 'c/a.json'));
    expect(usesPackageFiles(spec)).toBe(true);
  });
});

describe('validateLibrary: doc in an external repository', () => {
  it('level 1 does not check the external doc, but counts it among the documents', () => {
    const json = v11Json((s) => {
      s.docRepos = [{ id: 'd', url: 'https://x.com/a' }];
      owner(s).doc = { repo: 'd', path: 'components/button.md' };
      s.layers[0].annotationTypes[1].doc = 'docs/image.md';
    });
    const report = validateLibrary({
      level: 1,
      files: [
        { path: 'pkg.spec.json', text: JSON.stringify(json) },
        { path: 'docs/image.md', text: '# Image' },
      ],
    });
    expect(report.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(report.issues.filter((i) => i.message.includes('button.md'))).toEqual([]);
    expect(report.summary.docs).toBe(2);
  });
});
