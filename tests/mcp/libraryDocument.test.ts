import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applySpecialization,
  createProject,
  parseSpecText,
  serialize,
} from '../../src/model';
import { MAX_DOC_BYTES } from '../../mcp/docFiles';
import { NOW } from '../model/fixtures';
import { errorOf, ok } from './proposalSupport';
import { connect, type Connection } from './workspace';

// `get_library_document` (stage #1901, CX5; decision 22): a document of the library at the root of
// the specialization (`documents`, formatVersion 21), read from the applied copy (`project` +
// `specId`) or from the package `path`. A package `.md` comes from the package; a `{ repo, path }`
// one through the project's clone, with the same rules as `doc` in `get_component`.

const REPO_URL = 'https://gitlab.example.com/g/handbook';

interface Document {
  spec: { id: string; name: string; version: number };
  id: string;
  name: string;
  doc: string | null;
  path: string;
  repo?: string;
  url?: string | null;
  localFile?: string | null;
  exists?: boolean | null;
  tooLarge?: true;
  hint?: string;
}

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 21,
  id: 'events',
  name: 'Events',
  version: 1,
  docRepos: [
    {
      id: 'handbook',
      url: REPO_URL,
      urlTemplate: `${REPO_URL}/-/blob/main/{path}`,
      ref: 'main',
    },
  ],
  documents: [
    { id: 'conventions', name: 'Event conventions', doc: 'docs/conventions.md' },
    {
      id: 'rules',
      name: 'Rules',
      doc: { repo: 'handbook', path: 'docs/rules.md' },
    },
    {
      id: 'huge',
      name: 'Huge',
      doc: { repo: 'handbook', path: 'docs/huge.md' },
    },
    {
      id: 'gone',
      name: 'Gone',
      doc: { repo: 'handbook', path: 'docs/gone.md' },
    },
    { id: 'lost', name: 'Lost', doc: 'docs/lost.md' },
  ],
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#112233',
      annotationTypes: [{ id: 'screen', name: 'Screen', fields: [] }],
    },
  ],
};

let base: string;
let root: string;
let mcp: Connection;

const put = (file: string, text: string): void => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};

/** A project that applies the package copied in its `specs/events/`, with or without the clone. */
function project(name: string, docRepos: Record<string, { localPath: string }>): void {
  const dir = join(root, name);
  const specFile = 'specs/events/events.spec.json';
  put(join(dir, specFile), JSON.stringify(SPEC));
  put(join(dir, 'specs/events/docs/conventions.md'), '# Conventions\n\nsnake_case.\n');
  const parsed = parseSpecText(JSON.stringify(SPEC));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed));
  let p = createProject({
    name,
    now: NOW,
    firstLayer: {
      id: 'cccccccc-0000-4000-8000-000000000001',
      name: 'Free',
      color: '#D32F2F',
    },
  });
  let n = 0;
  p = applySpecialization(p, parsed.spec, {
    newId: () => `dddddddd-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  });
  p = {
    ...p,
    specializations: p.specializations.map((s) => ({ ...s, file: specFile })),
    docRepos,
  };
  put(join(dir, 'mapping.json'), serialize(p));
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-libdoc-'));
  root = join(base, 'root');
  mkdirSync(root, { recursive: true });
  put(join(root, 'lib/events/events.spec.json'), JSON.stringify(SPEC));
  put(join(root, 'lib/events/docs/conventions.md'), '# Conventions\n\nsnake_case.\n');
  put(join(root, 'clone/docs/rules.md'), '# Rules\n\nExternal text.\n');
  put(join(root, 'clone/docs/huge.md'), 'x'.repeat(MAX_DOC_BYTES + 1));
  project('proj', { handbook: { localPath: '../clone' } });
  project('proj-sem', {});
  mcp = await connect([root], { cwd: root });
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

const read = (args: Record<string, unknown>) =>
  mcp.call<Document>('get_library_document', args);

describe('get_library_document: a package document', () => {
  it('project + specId: the text, the id, the name and the package path', async () => {
    const result = ok(
      await read({ project: 'proj', specId: 'events', document: 'conventions' }),
    );
    expect(result).toMatchObject({
      spec: { id: 'events', name: 'Events', version: 1 },
      id: 'conventions',
      name: 'Event conventions',
      path: 'docs/conventions.md',
    });
    expect(result.doc).toContain('snake_case.');
    expect(result.hint).toBeUndefined();
    expect(result.repo).toBeUndefined();
  });

  it('path: the same document from any package folder', async () => {
    const result = ok(await read({ path: 'lib/events', document: 'conventions' }));
    expect(result.doc).toContain('snake_case.');
    expect(result.path).toBe('docs/conventions.md');
  });

  it('a file missing from the package: doc is null and the hint says to validate', async () => {
    const result = ok(await read({ path: 'lib/events', document: 'lost' }));
    expect(result.doc).toBeNull();
    expect(result.path).toBe('docs/lost.md');
    expect(result.hint).toContain('validate_library');
  });
});

describe('get_library_document: an external document', () => {
  it('with the clone: the text, the repository, the link and the local file', async () => {
    const result = ok(
      await read({ project: 'proj', specId: 'events', document: 'rules' }),
    );
    expect(result.doc).toContain('External text.');
    expect(result).toMatchObject({
      repo: 'handbook',
      path: 'docs/rules.md',
      url: `${REPO_URL}/-/blob/main/docs/rules.md`,
      localFile: 'clone/docs/rules.md',
      exists: true,
    });
    expect(result.hint).toBeUndefined();
  });

  it('without a clone: doc is null, the link comes and the hint teaches set_doc_repo', async () => {
    const result = ok(
      await read({ project: 'proj-sem', specId: 'events', document: 'rules' }),
    );
    expect(result.doc).toBeNull();
    expect(result.url).toBe(`${REPO_URL}/-/blob/main/docs/rules.md`);
    expect(result.exists).toBeNull();
    expect(result.hint).toContain('set_doc_repo');
  });

  it('by path (no project there is no clone): only the link and the hint', async () => {
    const result = ok(await read({ path: 'lib/events', document: 'rules' }));
    expect(result.doc).toBeNull();
    expect(result.repo).toBe('handbook');
    expect(result.url).toBe(`${REPO_URL}/-/blob/main/docs/rules.md`);
    expect(result.hint).toContain('docs/rules.md');
  });

  it('a clone without the file: doc is null and the hint names the clone file', async () => {
    const result = ok(
      await read({ project: 'proj', specId: 'events', document: 'gone' }),
    );
    expect(result.doc).toBeNull();
    expect(result.exists).toBe(false);
    expect(result.hint).toContain('clone/docs/gone.md');
  });

  it('a file above 1 MB is not read: tooLarge and the hint', async () => {
    const result = ok(
      await read({ project: 'proj', specId: 'events', document: 'huge' }),
    );
    expect(result.doc).toBeNull();
    expect(result.tooLarge).toBe(true);
    expect(result.hint).toContain('exceeds');
  });
});

describe('get_library_document: errors', () => {
  it('an unknown id is not-found with the ids next to the message', async () => {
    const error = errorOf(await read({ path: 'lib/events', document: 'nothing' }));
    expect(error.code).toBe('not-found');
    expect(error).toMatchObject({
      document: 'nothing',
      available: ['conventions', 'rules', 'huge', 'gone', 'lost'],
    });
  });

  it('a specialization without documents is not-found with no ids', async () => {
    put(
      join(root, 'plain/plain.spec.json'),
      JSON.stringify({ ...SPEC, id: 'plain', documents: undefined }),
    );
    const error = errorOf(await read({ path: 'plain', document: 'conventions' }));
    expect(error.code).toBe('not-found');
    expect(error).toMatchObject({ available: [] });
  });

  it('project and path together are invalid-arguments, like get_component', async () => {
    const error = errorOf(
      await read({
        project: 'proj',
        specId: 'events',
        path: 'lib/events',
        document: 'rules',
      }),
    );
    expect(error.code).toBe('invalid-arguments');
  });
});
