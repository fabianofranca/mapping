// @vitest-environment node
// Example library `data-model` (stage #1923, FP5): the data model (classes with the `attributes` table,
// endpoints) as OpenAPI YAML and as CSV, through the format plugins. The tests drive the MCP server
// (QuickJS) with the package copied to a root, as an agent would.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptAllAndApply, ok, propose } from '../mcp/proposalSupport';
import { connect, type Connection } from '../mcp/workspace';

const PACKAGE = 'examples/libraries/data-model';
const OPENAPI = 'data-model/openapi';
const CSV = 'data-model/attributes-csv';
const YAML_TEXT = readFileSync(join(PACKAGE, 'examples/shop.openapi.yaml'), 'utf8');
const CSV_TEXT = readFileSync(join(PACKAGE, 'examples/shop.attributes.csv'), 'utf8');

interface Planned {
  valid: boolean;
  errors?: { index: number; code: string; message: string }[];
  changes: Record<string, { created: number; updated: number; deleted: number }>;
  created: { op: number; kind: string; ref?: string }[];
  warnings?: { message: string }[];
  imports?: {
    format: string;
    created: string[];
    updated: string[];
    warnings: string[];
  }[];
}

interface Validated {
  valid: boolean;
  summary: { level: number };
  spec?: Record<string, unknown>;
  errors: { path: string; message: string }[];
  warnings: { path: string; message: string }[];
}

let base: string;
let root: string;
let mcp: Connection;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-data-model-'));
  root = join(base, 'root');
  mkdirSync(root, { recursive: true });
  cpSync(PACKAGE, join(root, 'lib'), { recursive: true });
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

/** A project with the package applied (through a proposal accepted on disk), as the app does. */
async function makeProject(name: string): Promise<string> {
  ok(
    await mcp.call('create_project', { path: name, name: 'Shop project', notes: false }),
  );
  const dir = join(root, name);
  const proposed = await propose(mcp, name, [
    { op: 'apply_specialization', file: 'lib' },
  ]);
  acceptAllAndApply(dir, proposed.proposal.id);
  cpSync(join(dir, 'proposals', proposed.proposal.id, 'specs'), join(dir, 'specs'), {
    recursive: true,
    force: false,
  });
  return dir;
}

const plan = async (project: string, operations: unknown[]) =>
  ok(await mcp.call<Planned>('plan_changes', { project, operations }));

const importOp = (format: string, text: string) => ({
  op: 'import_format',
  format,
  text,
});

const exportText = async (project: string, format: string): Promise<string> =>
  ok(await mcp.call<{ text: string }>('export_format', { project, format })).text;

/** Imports `text` and applies it, as a reviewed proposal. */
async function importInto(project: string, dir: string, format: string, text: string) {
  const proposed = await propose(mcp, project, [importOp(format, text)]);
  acceptAllAndApply(dir, proposed.proposal.id);
}

const kinds = (planned: Planned, kind: string) =>
  planned.created.filter((c) => c.kind === kind);

describe('example library data-model', () => {
  it('validates on the three levels with no warning and declares two formats', async () => {
    const result = ok(await mcp.call<Validated>('validate_library', { path: 'lib' }));
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.summary.level).toBe(3);
    expect(result.spec).toMatchObject({ fileFormats: 2 });
  });

  it('importing the OpenAPI file into an empty project creates the classes and the endpoints in the container named after info.title', async () => {
    await makeProject('openapi');
    const planned = await plan('openapi', [importOp(OPENAPI, YAML_TEXT)]);
    expect(planned.errors).toBeUndefined();
    expect(planned.valid).toBe(true);
    expect(kinds(planned, 'container')).toHaveLength(1);
    // Three classes and three endpoints, one marking and one annotation each.
    expect(kinds(planned, 'marking')).toHaveLength(6);
    expect(kinds(planned, 'annotation')).toHaveLength(6);
    expect(planned.imports![0]!.updated).toEqual([]);
    expect(planned.imports![0]!.warnings).toEqual([]);
  });

  it('the project exports the same OpenAPI text and the CSV, after one import of either file', async () => {
    const dir = await makeProject('both');
    await importInto('both', dir, OPENAPI, YAML_TEXT);
    expect(await exportText('both', OPENAPI)).toBe(YAML_TEXT);
    expect(await exportText('both', CSV)).toBe(CSV_TEXT);

    const csvDir = await makeProject('csv');
    await importInto('csv', csvDir, CSV, CSV_TEXT);
    expect(await exportText('csv', CSV)).toBe(CSV_TEXT);
  });

  it('the CSV round-trips a quoted comma and an apostrophe', () => {
    expect(CSV_TEXT).toContain('"Doe, Jane"');
    expect(CSV_TEXT).toContain("O'Brien");
  });

  it('re-reading the same file creates nothing new, in both formats', async () => {
    const dir = await makeProject('again');
    await importInto('again', dir, OPENAPI, YAML_TEXT);
    for (const [format, text] of [
      [OPENAPI, YAML_TEXT],
      [CSV, CSV_TEXT],
    ] as const) {
      const planned = await plan('again', [importOp(format, text)]);
      expect(planned.valid, format).toBe(true);
      expect(planned.created, format).toEqual([]);
      expect(planned.imports![0]!.created, format).toEqual([]);
      expect(planned.changes.markings!.created, format).toBe(0);
      expect(planned.changes.annotations!.created, format).toBe(0);
    }
  });

  it('an edited copy (a new property, a changed timeoutMs) gives only updates', async () => {
    const dir = await makeProject('edited');
    await importInto('edited', dir, OPENAPI, YAML_TEXT);
    const edited = YAML_TEXT.replace(
      '        email:\n',
      "        phone:\n          type: string\n          example: '555-0100'\n        email:\n",
    ).replace('x-timeout-ms: 15000', 'x-timeout-ms: 20000');
    expect(edited).not.toBe(YAML_TEXT);
    const planned = await plan('edited', [importOp(OPENAPI, edited)]);
    expect(planned.valid).toBe(true);
    expect(planned.created).toEqual([]);
    expect(planned.imports![0]!.created).toEqual([]);
    // Only the Customer class and the POST /orders endpoint changed.
    expect(planned.imports![0]!.updated).toHaveLength(2);
    expect(planned.changes.annotations).toMatchObject({ created: 0, updated: 2 });
  });
});
