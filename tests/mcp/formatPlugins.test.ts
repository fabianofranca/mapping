import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reviewTree } from '../../src/model';
import {
  acceptAllAndApply,
  errorOf,
  ok,
  propose,
  readProject,
  readProposal,
} from './proposalSupport';
import { connect, type Connection } from './workspace';

// The MCP surface of the format plugins (stage #1923, FP4): `export_format`, the `import_format`
// operation of the batch, `get_project.fileFormats` and `validate_library` running the examples.
// The library is `tests/fixtures/format-library/` (one `notes` format with both functions); the tests
// that need another plugin or another scope edit the copy before applying it.

const FIXTURE = 'tests/fixtures/format-library';
const FORMAT = 'format-lib/notes';
const TEXT = 'Alpha\n  color=red\n  size=2\nBeta\n';

interface Planned {
  valid: boolean;
  proposed?: boolean;
  errors?: {
    index: number;
    op: string;
    code: string;
    message: string;
    path?: string;
    [key: string]: unknown;
  }[];
  summary: string[];
  changes: Record<string, { created: number; updated: number; deleted: number }>;
  created: { op: number; alias?: string; kind: string; ref?: string }[];
  warnings?: { code: string; op?: number; message: string }[];
  imports?: {
    op: number;
    format: string;
    created: string[];
    updated: string[];
    warnings: string[];
  }[];
  proposal?: { id: string };
}

interface Exported {
  text: string;
  fileName: string;
  warnings: string[];
}

interface Issue {
  file: string;
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

interface Validated {
  valid: boolean;
  spec?: Record<string, unknown>;
  summary: { level: number };
  errors: Issue[];
  warnings: Issue[];
}

let base: string;
let root: string;
let mcp: Connection;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-formats-'));
  root = join(base, 'root');
  mkdirSync(root, { recursive: true });
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

/** A library copy in the root; `edit` changes it before anyone reads it. */
function library(name: string, edit?: (dir: string) => void): string {
  const dir = join(root, 'lib', name);
  cpSync(FIXTURE, dir, { recursive: true });
  edit?.(dir);
  return `lib/${name}`;
}

function writeIn(dir: string, file: string, text: string): void {
  writeFileSync(join(dir, file), text);
}

function editSpec(dir: string, edit: (spec: Record<string, unknown>) => void): void {
  const file = join(dir, 'format-library.spec.json');
  const spec = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  edit(spec);
  writeFileSync(file, JSON.stringify(spec));
}

/** A project with the library of `edit` applied (through a proposal accepted on disk). */
async function makeProject(name: string, edit?: (dir: string) => void): Promise<string> {
  ok(await mcp.call('create_project', { path: name, name: 'Format test', notes: false }));
  const dir = join(root, name);
  const proposed = await propose(mcp, name, [
    { op: 'apply_specialization', file: library(name, edit) },
  ]);
  expect(proposed.proposed).toBe(true);
  acceptAllAndApply(dir, proposed.proposal.id);
  // The app's session copies the package folder next to the specialization; the helper does not.
  cpSync(join(dir, 'proposals', proposed.proposal.id, 'specs'), join(dir, 'specs'), {
    recursive: true,
    force: false,
  });
  return dir;
}

const item = (title: string, tags: { key: string; value: string }[] = []) => ({
  type: 'format-lib/item',
  values: { title, tags },
});

/** Two containers, "First" with Alpha and "Second" with Beta (Alpha has two tags). */
async function seed(project: string, dir: string): Promise<string[]> {
  const proposed = await propose(mcp, project, [
    {
      op: 'add_container',
      as: '$a',
      name: 'First',
      width: 400,
      height: 300,
      background: '#FFFFFF',
    },
    {
      op: 'create_marking',
      container: '$a',
      rect: { x: 10, y: 10, width: 100, height: 50 },
      annotation: item('Alpha', [
        { key: 'color', value: 'red' },
        { key: 'size', value: '2' },
      ]),
    },
    {
      op: 'add_container',
      as: '$b',
      name: 'Second',
      width: 400,
      height: 300,
      background: '#FFFFFF',
    },
    {
      op: 'create_marking',
      container: '$b',
      rect: { x: 10, y: 10, width: 100, height: 50 },
      annotation: item('Beta'),
    },
  ]);
  acceptAllAndApply(dir, proposed.proposal.id);
  return proposed.created.filter((c) => c.kind === 'container').map((c) => c.ref!);
}

const plan = async (project: string, operations: unknown[]) =>
  ok(await mcp.call<Planned>('plan_changes', { project, operations }));

const importOp = (extra: Record<string, unknown> = { text: TEXT }) => ({
  op: 'import_format',
  format: FORMAT,
  ...extra,
});

const kinds = (planned: Planned, kind: string) =>
  planned.created.filter((c) => c.kind === kind);

describe('export_format', () => {
  let dir: string;
  let containers: string[];

  beforeAll(async () => {
    dir = await makeProject('export');
    containers = await seed('export', dir);
  });

  it("gives the plugin's text and the file name of the project", async () => {
    const result = ok(
      await mcp.call<Exported>('export_format', { project: 'export', format: FORMAT }),
    );
    expect(result).toEqual({ text: TEXT, fileName: 'Format test.txt', warnings: [] });
  });

  it('scope container without `container` is invalid-arguments; with it, only that container is exported', async () => {
    const scoped = await makeProject('export-container', (lib) =>
      editSpec(lib, (spec) => {
        (spec.fileFormats as { scope?: string }[])[0]!.scope = 'container';
      }),
    );
    const [first] = await seed('export-container', scoped);
    const missing = errorOf(
      await mcp.call('export_format', { project: 'export-container', format: FORMAT }),
    );
    expect(missing.code).toBe('invalid-arguments');
    const result = ok(
      await mcp.call<Exported>('export_format', {
        project: 'export-container',
        format: FORMAT,
        container: first,
      }),
    );
    expect(result.text).toBe('Alpha\n  color=red\n  size=2\n');
    expect(result.fileName).toBe('First.txt');
  });

  it('with scope project, `container` is ignored with a warning', async () => {
    const result = ok(
      await mcp.call<Exported>('export_format', {
        project: 'export',
        format: FORMAT,
        container: containers[0],
      }),
    );
    expect(result.text).toBe(TEXT);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/container/);
  });

  it('an unknown format is format-not-found, with the available ones', async () => {
    for (const format of ['format-lib/nope', 'ghost/notes', 'notes']) {
      const error = errorOf(
        await mcp.call('export_format', { project: 'export', format }),
      );
      expect(error.code, format).toBe('format-not-found');
      expect(error.formats, format).toEqual([FORMAT]);
    }
  });

  it('a plugin failure comes back as the typed error', async () => {
    await makeProject('export-throws', (lib) =>
      writeIn(
        lib,
        'plugins/notes.js',
        'function generate() { throw new Error("boom"); }',
      ),
    );
    const error = errorOf(
      await mcp.call('export_format', { project: 'export-throws', format: FORMAT }),
    );
    expect(error.code).toBe('plugin-failed');
    expect(error.message).toMatch(/boom/);
  });
});

describe('import_format in plan_changes', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await makeProject('import');
  });

  it('with `text` creates the container, the markings and the annotations', async () => {
    const planned = await plan('import', [importOp()]);
    expect(planned.valid).toBe(true);
    expect(planned.errors).toBeUndefined();
    expect(kinds(planned, 'container')).toHaveLength(1);
    expect(kinds(planned, 'marking')).toHaveLength(2);
    expect(kinds(planned, 'annotation')).toHaveLength(2);
    expect(planned.created.every((c) => c.op === 0)).toBe(true);
    expect(planned.summary).toHaveLength(1);
    expect(planned.summary[0]).toContain(FORMAT);
    expect(planned.changes.markings!.created).toBe(2);
    expect(planned.imports).toEqual([
      {
        op: 0,
        format: FORMAT,
        created: expect.any(Array),
        updated: [],
        warnings: [],
      },
    ]);
    expect(planned.imports![0]!.created).toHaveLength(5);
  });

  it('with `file` reads it inside the roots; another extension or a path outside them is invalid-path, before reading', async () => {
    writeIn(dir, 'data.txt', TEXT);
    writeIn(dir, 'data.csv', TEXT);
    writeIn(base, 'outside.txt', TEXT);
    const planned = await plan('import', [importOp({ file: 'data.txt' })]);
    expect(planned.valid).toBe(true);
    expect(kinds(planned, 'marking')).toHaveLength(2);

    const wrong = await plan('import', [importOp({ file: 'data.csv' })]);
    expect(wrong.errors![0]).toMatchObject({ index: 0, code: 'invalid-path' });
    // The extension is checked before anything is read: a file that does not exist gets the same error.
    const missing = await plan('import', [importOp({ file: 'nowhere.csv' })]);
    expect(missing.errors![0]!.code).toBe('invalid-path');
    const outside = await plan('import', [importOp({ file: join(base, 'outside.txt') })]);
    expect(outside.errors![0]!.code).toBe('invalid-path');
  });

  it('`text` and `file` together, or neither, are invalid-arguments', async () => {
    const both = await plan('import', [importOp({ text: TEXT, file: 'data.txt' })]);
    expect(both.errors![0]!.code).toBe('invalid-arguments');
    const neither = await plan('import', [importOp({})]);
    expect(neither.errors![0]!.code).toBe('invalid-arguments');
  });

  it('an unknown format is format-not-found at the step', async () => {
    const planned = await plan('import', [
      { op: 'import_format', format: 'format-lib/nope', text: TEXT },
    ]);
    expect(planned.errors![0]).toMatchObject({ index: 0, code: 'format-not-found' });
  });

  it('the projection sees the earlier operations of the same batch', async () => {
    const planned = await plan('import', [
      {
        op: 'add_container',
        as: '$c',
        name: 'Notes',
        width: 400,
        height: 600,
        background: '#FFFFFF',
      },
      {
        op: 'create_marking',
        container: '$c',
        rect: { x: 10, y: 10, width: 100, height: 50 },
        annotation: item('Alpha'),
      },
      importOp({ text: 'Alpha\n  color=red\nGamma\n' }),
    ]);
    expect(planned.valid).toBe(true);
    // Alpha (op 1) is updated by the import, not duplicated; Gamma (op 2) is new; "Notes" is reused.
    expect(kinds(planned, 'container')).toHaveLength(1);
    expect(planned.created.filter((c) => c.kind === 'marking').map((c) => c.op)).toEqual([
      1, 2,
    ]);
    expect(planned.imports![0]!.updated).toHaveLength(1);
    expect(planned.imports![0]!.created).toHaveLength(2);
  });

  it('re-reading the same text updates and creates nothing new', async () => {
    const twice = await plan('import', [importOp(), importOp()]);
    expect(twice.valid).toBe(true);
    expect(twice.created.filter((c) => c.op === 1)).toEqual([]);
    expect(twice.imports![1]!.created).toEqual([]);
    expect(twice.imports![1]!.updated).toHaveLength(2);

    const proposed = await propose(mcp, 'import', [importOp()]);
    acceptAllAndApply(dir, proposed.proposal.id);
    const again = await plan('import', [importOp()]);
    expect(again.valid).toBe(true);
    expect(again.created).toEqual([]);
    expect(again.changes.markings!.created).toBe(0);
    expect(again.changes.annotations!.created).toBe(0);
  });

  it("the plugin's aliases do not leak to the next operations", async () => {
    const planned = await plan('import', [
      importOp({ text: 'Zeta\n' }),
      {
        op: 'create_marking',
        container: '$notes',
        rect: { x: 0, y: 0, width: 20, height: 20 },
      },
    ]);
    expect(planned.valid).toBe(false);
    expect(planned.errors).toHaveLength(1);
    expect(planned.errors![0]).toMatchObject({ index: 1, code: 'unknown-alias' });
  });

  it("the plugin's warnings come in the step's warnings", async () => {
    const planned = await plan('import', [importOp({ text: '\n' })]);
    expect(planned.valid).toBe(true);
    expect(planned.warnings).toContainEqual(
      expect.objectContaining({ op: 0, message: 'no items in the text' }),
    );
    expect(planned.imports![0]!.warnings).toEqual(['no items in the text']);
  });
});

describe('import_format with a specialization applied in the same batch', () => {
  it('reads the plugin from the package the batch brings', async () => {
    ok(
      await mcp.call('create_project', { path: 'staged', name: 'Staged', notes: false }),
    );
    const planned = await plan('staged', [
      { op: 'apply_specialization', file: library('staged') },
      importOp(),
    ]);
    expect(planned.errors).toBeUndefined();
    expect(planned.valid).toBe(true);
    expect(kinds(planned, 'annotation')).toHaveLength(2);
  });
});

describe('a result the contract or the model refuses', () => {
  it('delete_marking is plugin-output-invalid, with the path inside the result', async () => {
    await makeProject('refuses-delete', (lib) =>
      writeIn(
        lib,
        'plugins/notes.js',
        "function parse() { return { operations: [{ op: 'delete_marking', marking: 'm/aaaaaaaa' }] }; }",
      ),
    );
    const planned = await plan('refuses-delete', [importOp()]);
    expect(planned.valid).toBe(false);
    expect(planned.errors![0]).toMatchObject({
      index: 0,
      op: 'import_format',
      code: 'plugin-output-invalid',
      path: 'operations[0].op',
    });
    expect(planned.errors![0]!.message).toContain(
      'operations[0].op: not allowed in a plugin result: delete_marking',
    );
  });

  it('an operation the model refuses is the batch error at operations[i].result[j], and nothing of the step stays', async () => {
    await makeProject('refuses-model', (lib) =>
      writeIn(
        lib,
        'plugins/notes.js',
        `function parse() {
  return { operations: [
    { op: 'add_container', as: '$c', name: 'X', width: 100, height: 100, background: '#FFFFFF' },
    { op: 'create_marking', container: '$c', rect: { x: 0, y: 0, width: 10, height: 10 },
      annotation: { type: 'format-lib/ghost' } },
  ] };
}`,
      ),
    );
    const planned = await plan('refuses-model', [
      // The step before the import stays: only the failed step is undone.
      {
        op: 'add_container',
        name: 'Before',
        width: 50,
        height: 50,
        background: '#FFFFFF',
      },
      importOp(),
    ]);
    expect(planned.valid).toBe(false);
    expect(planned.errors).toHaveLength(1);
    expect(planned.errors![0]).toMatchObject({
      index: 1,
      op: 'import_format',
      path: 'operations[1].result[1]',
      resultOp: 'create_marking',
    });
    expect(planned.errors![0]!.code).not.toMatch(/^plugin-/);
    expect(planned.changes.containers!.created).toBe(1);
  });

  it('a plugin that runs past the limits is the typed error, not a crash', async () => {
    await makeProject('refuses-loop', (lib) =>
      writeIn(
        lib,
        'plugins/notes.js',
        'function parse() { return { operations: new Array(6000).fill({ op: "create_arrow" }) }; }',
      ),
    );
    const planned = await plan('refuses-loop', [importOp()]);
    expect(planned.errors![0]!.code).toBe('plugin-limit');
  });
});

describe('propose_changes with import_format', () => {
  it('stores the op with `text` omitted, and the review reads the proposal as any other', async () => {
    const dir = await makeProject('proposal');
    const proposed = await propose(mcp, 'proposal', [importOp()]);
    expect(proposed.proposed).toBe(true);
    const proposal = readProposal(dir, proposed.proposal.id);
    expect(proposal.operations).toEqual([
      {
        op: 'import_format',
        format: FORMAT,
        text: `(omitted: ${TEXT.length} characters)`,
      },
    ]);
    const project = readProject(dir);
    expect(() => reviewTree(proposal, project)).not.toThrow();
    const applied = acceptAllAndApply(dir, proposed.proposal.id);
    expect(
      applied.annotations.filter((a) => a.type?.specId === 'format-lib'),
    ).toHaveLength(2);
    expect(applied.containers.map((c) => c.name)).toEqual(['Notes']);
  });
});

describe('get_project.fileFormats', () => {
  it('lists the formats of the applied specializations, and is absent when there is none', async () => {
    await makeProject('listed');
    const project = ok(
      await mcp.call<{ fileFormats?: Record<string, unknown>[] }>('get_project', {
        project: 'listed',
      }),
    );
    expect(project.fileFormats).toEqual([
      { format: FORMAT, name: 'Notes', extension: 'txt', scope: 'project' },
    ]);
    ok(await mcp.call('create_project', { path: 'plain', name: 'Plain', notes: false }));
    const plain = ok(
      await mcp.call<Record<string, unknown>>('get_project', { project: 'plain' }),
    );
    expect(plain).not.toHaveProperty('fileFormats');
  });
});

describe('validate_library with file formats', () => {
  const validate = async (path: string, level?: 1 | 2 | 3) =>
    ok(
      await mcp.call<Validated>('validate_library', {
        path,
        ...(level === undefined ? {} : { level }),
      }),
    );

  it('the fixture is valid, runs its example in both directions and counts the format', async () => {
    const result = await validate(library('valid'));
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.summary.level).toBe(3);
    expect(result.spec).toMatchObject({ fileFormats: 1 });
  });

  it('an example that does not round-trip is an error at fileFormats[0].examples[0], citing the first differing line', async () => {
    const path = library('no-round-trip', (lib) =>
      writeIn(lib, 'examples/notes.txt', 'Alpha\n\n  color=red\nBeta\n'),
    );
    const result = await validate(path);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      file: 'format-library.spec.json',
      path: 'fileFormats[0].examples[0]',
      severity: 'error',
    });
    expect(result.errors[0]!.message).toMatch(/round-trip/);
    expect(result.errors[0]!.message).toMatch(/line 2/);
    // Level 2 does not run the examples.
    expect((await validate(path, 2)).valid).toBe(true);
  });

  it('a plugin that throws on load is an error at fileFormats[0]', async () => {
    const result = await validate(
      library('throws-on-load', (lib) =>
        writeIn(lib, 'plugins/notes.js', 'throw new Error("boom");'),
      ),
      2,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatchObject({ path: 'fileFormats[0]', severity: 'error' });
    expect(result.errors[0]!.message).toMatch(/boom/);
  });

  it('a plugin that defines neither function is an error at fileFormats[0]', async () => {
    const result = await validate(
      library('empty-plugin', (lib) => writeIn(lib, 'plugins/notes.js', 'const a = 1;')),
      2,
    );
    expect(result.errors[0]).toMatchObject({ path: 'fileFormats[0]' });
    expect(result.errors[0]!.message).toMatch(/neither generate nor parse/);
  });

  it('a plugin whose function throws makes the example fail with the typed message', async () => {
    const result = await validate(
      library('throws-in-call', (lib) =>
        writeIn(
          lib,
          'plugins/notes.js',
          'function generate() { throw new Error("nope"); }\nfunction parse() { return { operations: [] }; }',
        ),
      ),
    );
    expect(result.errors[0]).toMatchObject({ path: 'fileFormats[0].examples[0]' });
    expect(result.errors[0]!.message).toMatch(/nope/);
  });

  it('a parse-only format only has to apply its example, and a generate-only one compares with `file`', async () => {
    const parseOnly = await validate(
      library('parse-only', (lib) =>
        writeIn(
          lib,
          'plugins/notes.js',
          readFileSync(join(FIXTURE, 'plugins/notes.js'), 'utf8').replace(
            /function generate[\s\S]*?\n}\n/,
            '',
          ),
        ),
      ),
    );
    expect(parseOnly.errors).toEqual([]);

    const generateOnly = await validate(
      library('generate-only', (lib) => {
        editSpec(lib, (spec) => {
          (spec.fileFormats as { examples: unknown[] }[])[0]!.examples = [
            { name: 'one', input: 'examples/input.json', file: 'examples/notes.txt' },
          ];
        });
        writeIn(
          lib,
          'plugins/notes.js',
          'function generate(input) { return "Alpha\\n  color=red\\n  size=2\\nBeta\\n"; }',
        );
        writeIn(lib, 'examples/input.json', '{}');
      }),
    );
    expect(generateOnly.errors).toEqual([]);
  });
});
