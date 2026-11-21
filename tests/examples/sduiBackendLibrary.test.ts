// @vitest-environment node
// Example library `sdui-backend` (EX1): the executable origin (a fictional SDUI backend),
// with `sources`, `slot`, anchors, `scrim`, external-system examples and the version contract.
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { loadLibrary } from '../../src/model/components/library';
import { screenFromSource } from '../../src/model/components/origin';
import { validateLibrary } from '../../src/model/library';
import { parseSpecText } from '../../src/model/spec';
import { acceptAllAndApply, ok, propose, readProject } from '../mcp/proposalSupport';
import { connect, type Connection } from '../mcp/workspace';

const ROOT = join(__dirname, '../../examples/libraries/sdui-backend');
const SPEC_FILE = 'sdui-backend.spec.json';

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

describe('example library sdui-backend', () => {
  it('has the specialization, one component per visual type, one document per type and the external-system JSON', () => {
    expect(files.map((f) => f.path)).toEqual(
      [
        SPEC_FILE,
        'components/sdui-button.json',
        'components/sdui-column.json',
        'components/sdui-fab.json',
        'components/sdui-scrim.json',
        'components/sdui-sheet.json',
        'docs/sdui-button.md',
        'docs/sdui-column.md',
        'docs/sdui-endpoint.md',
        'docs/sdui-fab.md',
        'docs/sdui-scrim.md',
        'docs/sdui-sheet.md',
        'examples/button.sdui.json',
        'examples/home.sdui.json',
        'examples/settings.sdui.json',
        'plugins/sdui.js',
      ].sort(),
    );
  });

  it('validates with no error on the three levels and no warning', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({ level: 3, types: 6, components: 5, docs: 6 });
  });

  it('is version 3, with a migration from 1 (the six steps) and one from 2', () => {
    const parsed = parseSpecText(text(SPEC_FILE));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.version).toBe(3);
    expect(parsed.spec.migrations).toHaveLength(2);
    const steps = parsed.spec.migrations?.[0]?.steps ?? [];
    expect([...new Set(steps.map((s) => s.op))].sort()).toEqual([
      'fill-field',
      'map-values',
      'remove-field',
      'remove-type',
      'rename-field',
      'rename-type',
    ]);
    const modes = steps.flatMap((s) => (s.op === 'remove-type' ? [s.mode] : []));
    expect(modes.sort()).toEqual(['convert', 'delete']);
  });
});

describe('contrato da origem do pacote', () => {
  const library = loadLibrary(
    files
      .filter((f) => f.path.endsWith('.json'))
      .map((f) => ({ path: f.path, text: f.text })),
  );

  it('the declaration translates examples/settings.sdui.json with no warning', () => {
    expect(library.problems).toEqual([]);
    const result = screenFromSource(
      library,
      JSON.parse(text('examples/settings.sdui.json')),
      { measure: approximateMeasurer },
    );
    expect(result.error).toBeUndefined();
    expect(result.warnings).toEqual([]);
    expect(result.screen).toBeDefined();
  });

  it('the screen brings the column, the floating one and the sheet with the scrim', () => {
    const result = screenFromSource(
      library,
      JSON.parse(text('examples/settings.sdui.json')),
      { measure: approximateMeasurer },
    );
    const types = JSON.stringify(result.screen);
    for (const id of [
      'sdui-column',
      'sdui-button',
      'sdui-fab',
      'sdui-sheet',
      'sdui-scrim',
    ]) {
      expect(types, id).toContain(id);
    }
  });
});

describe('file format sdui (stage #1923, FP6)', () => {
  const SDUI = 'sdui-backend/sdui';
  const HOME = text('examples/home.sdui.json');
  let base: string;
  let root: string;
  let mcp: Connection;

  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'mapping-sdui-'));
    root = join(base, 'root');
    mkdirSync(root, { recursive: true });
    cpSync(ROOT, join(root, 'lib'), { recursive: true });
    mcp = await connect([root]);
  });

  afterAll(async () => {
    await mcp?.close();
    rmSync(base, { recursive: true, force: true });
  });

  interface Planned {
    valid: boolean;
    errors?: { code: string; message: string }[];
    created: { kind: string }[];
    imports?: { created: string[]; updated: string[]; warnings: string[] }[];
  }

  async function makeProject(name: string): Promise<string> {
    ok(await mcp.call('create_project', { path: name, name: 'Screens', notes: false }));
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

  async function importHome(project: string, dir: string, body = HOME) {
    const proposed = await propose(mcp, project, [
      { op: 'import_format', format: SDUI, text: body },
    ]);
    return acceptAllAndApply(dir, proposed.proposal.id);
  }

  const containerRef = (project: string, name: string) =>
    `mapping://${project}/i/${name}`;

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

  it('importing home.sdui.json without a container creates the screen, the components, the slot children and the bottom bar', async () => {
    await makeProject('home');
    const planned = await plan('home', [
      { op: 'import_format', format: SDUI, text: HOME },
    ]);
    expect(planned.errors).toBeUndefined();
    expect(planned.valid).toBe(true);
    expect(planned.created.filter((c) => c.kind === 'container')).toHaveLength(1);
    // content + 2 buttons, bottom bar + 1 button, the FAB.
    expect(planned.created.filter((c) => c.kind === 'marking')).toHaveLength(6);
    expect(planned.imports![0]!.warnings).toEqual([]);
  });

  it('the created container has the screen size and background, the buttons sit in the column slot and the bar is at the bottom', async () => {
    const dir = await makeProject('shape');
    const project = await importHome('shape', dir);
    expect(project.containers).toHaveLength(1);
    const container = project.containers[0]!;
    expect(container).toMatchObject({ name: 'Home' });
    const markings = project.markings.filter((m) => m.containerId === container.id);
    const rects = markings.map((m) => m.rect);
    const bar = rects.find((r) => r.y > 0 && r.y + r.height === 917);
    expect(bar).toMatchObject({ x: 0, width: 412 });
    const children = markings.filter((m) => m.parentId !== null);
    expect(children.length).toBeGreaterThanOrEqual(4);
    expect(container).toMatchObject({ width: 412, height: 917, background: '#FEF7FF' });
  });

  it('exporting that container gives the same JSON', async () => {
    const dir = await makeProject('roundtrip');
    const project = await importHome('roundtrip', dir);
    const exported = ok(
      await mcp.call<{ text: string; fileName: string; warnings: string[] }>(
        'export_format',
        {
          project: 'roundtrip',
          format: SDUI,
          container: containerRef('roundtrip', project.containers[0]!.id),
        },
      ),
    );
    expect(exported.text).toBe(HOME);
    expect(exported.fileName).toBe('Home.json');
    expect(exported.warnings).toEqual([]);
  });

  it('a document with a modal warns and creates no scrim and no sheet', async () => {
    await makeProject('modal');
    const withModal = JSON.stringify({
      ...JSON.parse(HOME),
      modal: { type: 'BottomSheet', props: { title: 'Sort by' } },
    });
    const planned = await plan('modal', [
      { op: 'import_format', format: SDUI, text: withModal },
    ]);
    expect(planned.valid).toBe(true);
    expect(planned.imports![0]!.warnings.join('\n')).toMatch(/modal/);
    expect(planned.created.filter((c) => c.kind === 'marking')).toHaveLength(6);
  });

  it('re-reading the same file creates nothing new', async () => {
    const dir = await makeProject('again');
    await importHome('again', dir);
    const planned = await plan('again', [
      { op: 'import_format', format: SDUI, text: HOME },
    ]);
    expect(planned.valid).toBe(true);
    expect(planned.created).toEqual([]);
    expect(readProject(dir).containers).toHaveLength(1);
  });
});
