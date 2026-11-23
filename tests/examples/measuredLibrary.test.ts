// @vitest-environment node
// Example library `measured` (stage #2035, AF7): the measured page as a file format. The `dom`
// format's plugin reads the tree of measured rectangles (bare or `{ tree, scale?, offset? }`) and
// creates the markings through the types' `sources`, with the result `import_measured` gives for a
// specialization up to formatVersion 21 (decision 2).
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';
import { parseSpecText } from '../../src/model/spec';
import type { Project } from '../../src/model';
import { acceptAllAndApply, ok, propose, readProject } from '../mcp/proposalSupport';
import { connect, type Connection } from '../mcp/workspace';

const ROOT = join(__dirname, '../../examples/libraries/measured');
const SPEC_FILE = 'measured.spec.json';
const FROZEN = join(__dirname, '../fixtures/measured-v15.spec.json');

function listDisk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listDisk(join(dir, e.name))
      : [relative(ROOT, join(dir, e.name)).split('\\').join('/')],
  );
}

const files = listDisk(ROOT)
  .sort()
  .map((path) => ({ path, text: readFileSync(join(ROOT, path), 'utf8') }));
const text = (path: string): string => files.find((f) => f.path === path)?.text ?? '';
const PAGE = text('examples/page.measured.json');

describe('example library measured', () => {
  it('has the specialization, the plugin, the example, one component and one document per type', () => {
    expect(files.map((f) => f.path)).toEqual(
      [
        SPEC_FILE,
        'components/button.json',
        'components/card.json',
        'docs/button.md',
        'docs/card.md',
        'examples/page.measured.json',
        'plugins/dom.js',
      ].sort(),
    );
  });

  it('validates without errors on the three levels and without warnings', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({ level: 3, types: 2, components: 2, docs: 2 });
  });

  it('declares the dom format (parse only, scope container) and no origins', () => {
    const parsed = parseSpecText(text(SPEC_FILE));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.id).toBe('measured');
    expect(parsed.spec.version).toBe(1);
    expect(parsed.spec.origins).toBeUndefined();
    expect(parsed.spec.fileFormats).toMatchObject([
      {
        id: 'dom',
        extension: 'json',
        plugin: 'plugins/dom.js',
        scope: 'container',
        examples: [{ file: 'examples/page.measured.json' }],
      },
    ]);
    expect(text('plugins/dom.js')).not.toMatch(/function generate\b/);
  });
});

describe('the dom format and import_measured agree (decision 2)', () => {
  let base: string;
  let root: string;
  let mcp: Connection;

  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'mapping-measured-'));
    root = join(base, 'root');
    mkdirSync(root, { recursive: true });
    cpSync(ROOT, join(root, 'lib'), { recursive: true });
    // The frozen formatVersion 15 specialization (with `origins`) over the same components.
    cpSync(ROOT, join(root, 'lib15'), { recursive: true });
    rmSync(join(root, 'lib15', 'plugins'), { recursive: true });
    rmSync(join(root, 'lib15', 'examples'), { recursive: true });
    writeFileSync(join(root, 'lib15', SPEC_FILE), readFileSync(FROZEN, 'utf8'));
    mcp = await connect([root]);
  });

  afterAll(async () => {
    await mcp?.close();
    rmSync(base, { recursive: true, force: true });
  });

  it('validate_library is valid on the three levels and counts one file format', async () => {
    const result = ok(
      await mcp.call<{
        valid: boolean;
        summary: { level: number };
        spec?: Record<string, unknown>;
        errors: unknown[];
        warnings: unknown[];
      }>('validate_library', { path: 'lib' }),
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.summary.level).toBe(3);
    expect(result.spec).toMatchObject({ fileFormats: 1 });
  });

  async function makeProject(name: string, library: string): Promise<string> {
    ok(await mcp.call('create_project', { path: name, name: 'Measured', notes: false }));
    const dir = join(root, name);
    const proposed = await propose(mcp, name, [
      { op: 'apply_specialization', file: library },
      {
        op: 'add_container',
        as: '$page',
        name: 'Page',
        width: 800,
        height: 600,
        background: '#FFFFFF',
      },
    ]);
    const applied = acceptAllAndApply(dir, proposed.proposal.id);
    cpSync(join(dir, 'proposals', proposed.proposal.id, 'specs'), join(dir, 'specs'), {
      recursive: true,
      force: false,
    });
    expect(applied.containers).toHaveLength(1);
    return dir;
  }

  /** What the two routes must agree on: type, values, rectangle and the index of the parent. */
  function shape(project: Project) {
    const markings = project.markings;
    return markings.map((m) => ({
      rect: m.rect,
      parent: m.parentId === null ? null : markings.findIndex((o) => o.id === m.parentId),
      annotations: project.annotations
        .filter((a) => a.markingId === m.id)
        .map((a) => ({ type: a.type, values: a.values })),
    }));
  }

  async function viaImportMeasured(name: string, body: unknown) {
    const dir = await makeProject(name, 'lib15');
    const container = readProject(dir).containers[0]!.id;
    const proposed = await propose(mcp, name, [
      {
        op: 'import_measured',
        container: `mapping://${name}/i/${container}`,
        system: 'dom',
        ...(body as object),
      },
    ]);
    return shape(acceptAllAndApply(dir, proposed.proposal.id));
  }

  async function viaImportFormat(name: string, file: string) {
    const dir = await makeProject(name, 'lib');
    const container = readProject(dir).containers[0]!.id;
    const proposed = await propose(mcp, name, [
      {
        op: 'import_format',
        format: 'measured/dom',
        text: file,
        container: `mapping://${name}/i/${container}`,
      },
    ]);
    return shape(acceptAllAndApply(dir, proposed.proposal.id));
  }

  it('gives the same markings, annotations and parentIds on the example page', async () => {
    const old = await viaImportMeasured('old-plain', { tree: JSON.parse(PAGE) });
    const now = await viaImportFormat('new-plain', PAGE);
    expect(old).toHaveLength(4);
    expect(now).toEqual(old);
    expect(now.filter((m) => m.parent !== null)).toHaveLength(2);
  });

  it('gives the same result with scale and offset', async () => {
    const offset = { x: 10, y: 20 };
    const old = await viaImportMeasured('old-scaled', {
      tree: JSON.parse(PAGE),
      scale: 1.25,
      offset,
    });
    const now = await viaImportFormat(
      'new-scaled',
      JSON.stringify({ tree: JSON.parse(PAGE), scale: 1.25, offset }),
    );
    expect(old).toHaveLength(4);
    expect(now).toEqual(old);
    expect(now[0]!.rect).toEqual({ x: 60, y: 70, width: 500, height: 250 });
  });

  it('creates a container of the root size when no container is given', async () => {
    const dir = join(root, 'bare');
    ok(await mcp.call('create_project', { path: 'bare', name: 'Bare', notes: false }));
    const first = await propose(mcp, 'bare', [
      { op: 'apply_specialization', file: 'lib' },
    ]);
    acceptAllAndApply(dir, first.proposal.id);
    cpSync(join(dir, 'proposals', first.proposal.id, 'specs'), join(dir, 'specs'), {
      recursive: true,
      force: false,
    });
    const proposed = await propose(mcp, 'bare', [
      { op: 'import_format', format: 'measured/dom', text: PAGE },
    ]);
    const project = acceptAllAndApply(dir, proposed.proposal.id);
    expect(project.containers).toHaveLength(1);
    expect(project.containers[0]).toMatchObject({ width: 800, height: 600 });
    expect(project.markings).toHaveLength(4);
  });

  it('warns about a node with no type and an empty rectangle and carries on with the children', async () => {
    const tree = {
      type: 'body',
      rect: { x: 0, y: 0, width: 800, height: 600 },
      children: [
        {
          type: 'div',
          classes: ['x-unknown'],
          rect: { x: 0, y: 0, width: 300, height: 100 },
          children: [
            {
              type: 'button',
              classes: ['btn-primary'],
              rect: { x: 10, y: 10, width: 100, height: 40 },
              props: { label: 'Kept' },
            },
          ],
        },
        {
          type: 'button',
          classes: ['btn-primary'],
          rect: { x: 0, y: 200, width: 0, height: 40 },
        },
      ],
    };
    const dir = await makeProject('warns', 'lib');
    const container = readProject(dir).containers[0]!.id;
    const planned = ok(
      await mcp.call<{ imports?: { warnings: string[] }[] }>('plan_changes', {
        project: 'warns',
        operations: [
          {
            op: 'import_format',
            format: 'measured/dom',
            text: JSON.stringify(tree),
            container: `mapping://warns/i/${container}`,
          },
        ],
      }),
    );
    const warnings = planned.imports![0]!.warnings;
    expect(warnings).toHaveLength(3);
    expect(warnings.some((w) => w.includes('x-unknown'))).toBe(true);
    expect(warnings.some((w) => w.includes('empty'))).toBe(true);
  });
});
