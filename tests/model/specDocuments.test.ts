// `formatVersion` 21 (stage #1901, CX5; decision 21): library documents. `documents` at the root of
// the specialization: a non-empty list of `{ id, name, doc }`, where `doc` follows the type's `doc`
// rules (a package `.md` or `{ repo, path }` of `docRepos`). A text document is a cited package
// file (level 1 checks it, it is not "unreferenced", `usesPackageFiles` is true); a `{ repo, path }`
// document counts as a use of its repository. The key is outside the version contract.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseSpec, specWarnings, usesPackageFiles } from '../../src/model';
import { validateLibrary, type LibraryFile } from '../../src/model/library';
import { diffSpecs } from '../../src/model/specVersions';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const jsonSchema = JSON.parse(readFileSync('docs/spec.schema.json', 'utf8')) as Record<
  string,
  unknown
>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

const ONLY_V21 = 'only allowed with formatVersion 21';
const SPEC = 'events.spec.json';

/** A v21 specialization with one text document and one in an external repository. */
function v21(edit?: (spec: Json) => void, formatVersion = 21): Json {
  const spec: Json = {
    format: 'mapping-spec',
    formatVersion,
    id: 'events',
    name: 'Events',
    version: 1,
    docRepos: [{ id: 'handbook', url: 'https://example.com/handbook' }],
    documents: [
      { id: 'conventions', name: 'Event conventions', doc: 'docs/conventions.md' },
      {
        id: 'glossary',
        name: 'Glossary',
        doc: { repo: 'handbook', path: 'docs/glossary.md' },
      },
    ],
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#112233',
        annotationTypes: [
          { id: 'screen', name: 'Screen', fields: [{ key: 'title', type: 'string' }] },
        ],
      },
    ],
  };
  edit?.(spec);
  return spec;
}

const issuesOf = (raw: Json) => {
  const r = parseSpec(raw);
  return r.ok ? [] : r.issues.map(({ path, message }) => ({ path, message }));
};

const parsed = (edit?: (spec: Json) => void) => {
  const r = parseSpec(v21(edit));
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.spec;
};

/** The package of the spec above: the spec, and the text document unless `without` says. */
function pkg(spec: Json, extra: LibraryFile[] = []): LibraryFile[] {
  return [
    { path: SPEC, text: JSON.stringify(spec) },
    {
      path: 'docs/conventions.md',
      text: '# Conventions\n\nName events in snake_case.\n',
    },
    ...extra,
  ];
}

describe('documents: valid list', () => {
  it('a text and an external document are accepted and read as written', () => {
    expect(issuesOf(v21())).toEqual([]);
    const spec = parsed();
    expect(spec.documents).toEqual(v21().documents);
  });

  it('is valid against the published JSON Schema, and a bad shape is not', () => {
    expect(jsonValidator.safeParse(v21()).success).toBe(true);
    const noName = v21((s) => delete s.documents[0].name);
    expect(jsonValidator.safeParse(noName).success).toBe(false);
    const extraKey = v21((s) => (s.documents[0].extra = 1));
    expect(jsonValidator.safeParse(extraKey).success).toBe(false);
    const emptyList = v21((s) => (s.documents = []));
    expect(jsonValidator.safeParse(emptyList).success).toBe(false);
  });
});

describe('documents: errors at documents[i]', () => {
  it('a repeated id is an error at the second one', () => {
    expect(issuesOf(v21((s) => (s.documents[1].id = 'conventions')))).toEqual([
      { path: 'documents[1].id', message: 'id "conventions" repeated' },
    ]);
  });

  it('an id outside [a-z0-9-]+ is an error', () => {
    expect(issuesOf(v21((s) => (s.documents[0].id = 'Event_Rules')))).toEqual([
      { path: 'documents[0].id', message: 'invalid document id; use [a-z0-9-]+' },
    ]);
  });

  it('an empty name is an error', () => {
    expect(issuesOf(v21((s) => (s.documents[0].name = '')))).toEqual([
      { path: 'documents[0].name', message: 'cannot be empty' },
    ]);
  });

  it('the doc follows the type doc rules (extension, "..", anchor, shape)', () => {
    expect(issuesOf(v21((s) => (s.documents[0].doc = 'docs/conventions.txt')))).toEqual([
      { path: 'documents[0].doc', message: 'invalid extension: expected .md' },
    ]);
    expect(issuesOf(v21((s) => (s.documents[0].doc = '../conventions.md')))).toHaveLength(
      1,
    );
    expect(
      issuesOf(v21((s) => (s.documents[1].doc = { repo: 'handbook', path: 'a.md#top' }))),
    ).toHaveLength(1);
    expect(issuesOf(v21((s) => (s.documents[0].doc = 7)))).toEqual([
      {
        path: 'documents[0].doc',
        message: 'must be text (a package file) or an object { repo, path }',
      },
    ]);
  });

  it('a document with no doc is required', () => {
    expect(issuesOf(v21((s) => delete s.documents[0].doc))).toHaveLength(1);
  });

  it('a repository not declared in docRepos is an error at documents[i].doc.repo', () => {
    expect(
      issuesOf(v21((s) => (s.documents[1].doc = { repo: 'elsewhere', path: 'a.md' }))),
    ).toEqual([
      {
        path: 'documents[1].doc.repo',
        message: 'repository "elsewhere" is not declared in docRepos',
      },
    ]);
  });

  it('an empty list is an error at documents', () => {
    expect(issuesOf(v21((s) => (s.documents = [])))).toEqual([
      { path: 'documents', message: 'cannot be empty' },
    ]);
  });

  it('an unknown key in a document is an error', () => {
    expect(issuesOf(v21((s) => (s.documents[0].extra = 1)))).toHaveLength(1);
  });

  it('only allowed with formatVersion 21', () => {
    for (const version of [20, 19, 11]) {
      const issues = issuesOf(
        v21((s) => {
          s.documents = [{ id: 'conventions', name: 'C', doc: 'docs/conventions.md' }];
        }, version),
      );
      expect(issues).toContainEqual({ path: 'documents', message: ONLY_V21 });
    }
  });
});

describe('documents: a text document is a cited package file', () => {
  it('level 1: a missing file is `file not found` at documents[i].doc', () => {
    const files = pkg(v21()).filter((f) => f.path !== 'docs/conventions.md');
    const report = validateLibrary({ files, level: 1 });
    expect(report.errors.map((e) => [e.file, e.path, e.message] as const)).toContainEqual(
      [SPEC, 'documents[0].doc', 'file not found: docs/conventions.md'],
    );
  });

  it('is not an unreferenced file, and the external document is not read', () => {
    const report = validateLibrary({ files: pkg(v21()), level: 1 });
    expect(report.errors).toEqual([]);
    expect(report.warnings.map((w) => w.message)).not.toContain(
      'file not referenced by the specialization',
    );
  });

  it('an empty .md is the usual warning', () => {
    const files = pkg(v21()).map((f) =>
      f.path === 'docs/conventions.md' ? { ...f, text: ' \n' } : f,
    );
    const report = validateLibrary({ files, level: 1 });
    expect(report.warnings.map((w) => [w.file, w.message])).toContainEqual([
      'docs/conventions.md',
      'empty document',
    ]);
  });

  it('the summary counts the documents (text and external)', () => {
    expect(validateLibrary({ files: pkg(v21()), level: 1 }).summary.docs).toBe(2);
  });

  it('a standalone .json cannot carry a text document (it is a package file)', () => {
    expect(usesPackageFiles(parsed())).toBe(true);
    const external = parsed((s) => (s.documents = [s.documents[1]]));
    expect(usesPackageFiles(external)).toBe(false);
  });
});

describe('documents: repositories and the version contract', () => {
  it('a document that uses the repository is not `unused-doc-repo`', () => {
    const used = specWarnings(parsed()).filter((w) => w.code === 'unused-doc-repo');
    expect(used).toEqual([]);
    const loose = specWarnings(parsed((s) => (s.documents = [s.documents[0]]))).filter(
      (w) => w.code === 'unused-doc-repo',
    );
    expect(loose.map((w) => w.path)).toEqual(['docRepos[0]']);
  });

  it('a type doc still counts as a use too', () => {
    const spec = parsed((s) => {
      s.documents = [s.documents[0]];
      s.layers[0].annotationTypes[0].doc = { repo: 'handbook', path: 'screen.md' };
    });
    expect(specWarnings(spec).filter((w) => w.code === 'unused-doc-repo')).toEqual([]);
  });

  it('adding, changing and removing a document produces no diffSpecs difference', () => {
    const without = parsed((s) => delete s.documents);
    const withDocs = parsed();
    const renamed = parsed((s) => {
      s.documents[0].name = 'Other name';
      s.documents[0].doc = 'docs/other.md';
    });
    expect(diffSpecs(without, withDocs)).toEqual([]);
    expect(diffSpecs(withDocs, without)).toEqual([]);
    expect(diffSpecs(withDocs, renamed)).toEqual([]);
  });
});
