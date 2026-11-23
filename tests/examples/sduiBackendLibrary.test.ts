// @vitest-environment node
// Example library `sdui-backend` (EX1): a fictional SDUI backend described by `sources` (plain data)
// and the `sdui` file format plugin, with `slot`, anchors, `scrim`, container classes and the
// version contract. Stage #2035 (AF7): no `origins` and no external-system examples any more.
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
import { buildCatalog } from '../../src/model';
import { resolveSlotLayout } from '../../src/model/components/arrange';
import { withContainer } from '../../src/model/components/container';
import { parseComponentText } from '../../src/model/components/parseComponent';
import { componentSlots } from '../../src/model/components/slots';
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
  it('is at formatVersion 22 with no origins and no external-system example', () => {
    const parsed = parseSpecText(text(SPEC_FILE));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.formatVersion).toBe(22);
    expect(parsed.spec.origins).toBeUndefined();
    const examples = parsed.spec.layers
      .flatMap((l) => l.annotationTypes)
      .flatMap((t) => t.examples ?? []);
    expect(examples.some((e) => e.system !== undefined || e.file !== undefined)).toBe(
      false,
    );
    expect(parsed.spec.fileFormats).toHaveLength(1);
  });

  it('has the specialization, one component per visual type, one document per type, the plugin and its example', () => {
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
        'examples/home.sdui.json',
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

  it('is version 4, with a migration from 1 (the six steps) and one from 2', () => {
    const parsed = parseSpecText(text(SPEC_FILE));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.version).toBe(4);
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

describe('container classes (stage #1901, CX1; decision 27)', () => {
  const parsed = parseSpecText(text(SPEC_FILE));
  const spec = parsed.ok ? parsed.spec : undefined;
  const typeOf = (id: string) =>
    spec?.layers.flatMap((l) => l.annotationTypes).find((t) => t.id === id);

  it('is at formatVersion 22 and parses with no issue', () => {
    expect(parsed.ok).toBe(true);
    expect(spec?.formatVersion).toBe(22);
  });

  it('declares the two sets: platform (chosen) and window (by width: 600 and 840)', () => {
    expect(spec?.containerClasses).toEqual([
      {
        id: 'platform',
        name: 'Platform',
        classes: [
          { id: 'android', name: 'Android' },
          { id: 'ios', name: 'iOS' },
          { id: 'web', name: 'Web' },
        ],
      },
      {
        id: 'window',
        name: 'Window',
        by: 'width',
        classes: [
          { id: 'compact', name: 'Compact', below: 600 },
          { id: 'medium', name: 'Medium', below: 840 },
          { id: 'expanded', name: 'Expanded' },
        ],
      },
    ]);
  });

  it('the Phone size chooses android and the new web-desktop size (1440 x 900) chooses web', () => {
    expect(spec?.containers?.map((c) => [c.id, c.width, c.height, c.classes])).toEqual([
      ['phone', 412, 917, { platform: 'android' }],
      ['web-desktop', 1440, 900, { platform: 'web' }],
    ]);
  });

  it('sdui-sheet is meant for android and ios, sdui-fab for the compact and medium windows', () => {
    expect(typeOf('sdui-sheet')?.appliesIn).toEqual({ platform: ['android', 'ios'] });
    expect(typeOf('sdui-fab')?.appliesIn).toEqual({ window: ['compact', 'medium'] });
    expect(typeOf('sdui-button')?.appliesIn).toBeUndefined();
  });
});

describe('sdui-column reads the container (stage #1901, CX4; decision 27)', () => {
  const parsed = parseComponentText(text('components/sdui-column.json'));
  const slot = parsed.ok ? componentSlots(parsed.component)[0] : undefined;
  const padding = (window: string | undefined, values = {}) =>
    resolveSlotLayout(
      slot!,
      withContainer(values, window === undefined ? undefined : { classes: { window } }),
    ).padding;
  const all = (n: number) => ({ top: n, right: n, bottom: n, left: n });

  it('pads 16 px in a compact container and 24 px in the others', () => {
    expect(parsed.ok).toBe(true);
    expect(padding('compact')).toEqual(all(16));
    expect(padding('medium')).toEqual(all(24));
    expect(padding('expanded')).toEqual(all(24));
  });

  it('keeps 24 px without a container class and the type padding wins when informed', () => {
    expect(padding(undefined)).toEqual(all(24));
    expect(padding('compact', { padding: 8 })).toEqual(all(8));
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
    issues?: { new?: { issues: { code: string; node?: string }[] }[] };
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
    expect(result.spec).toMatchObject({ origins: 0 });
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

  it('the imported screen draws with no component-overflow under the server measurer (R32-F3)', async () => {
    // The app, which measures with the real font, may still warn "Button content larger than the box"
    // on the slot buttons (sized by the server's embedded font): `docs/MCP.md`, "(approximate)".
    await makeProject('draws');
    const planned = await plan('draws', [
      { op: 'import_format', format: SDUI, text: HOME },
    ]);
    const overflows = (planned.issues?.new ?? []).flatMap((e) =>
      e.issues.filter((i) => i.code === 'component-overflow'),
    );
    expect(overflows).toEqual([]);
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

describe('the Catalog of sdui-backend (stage #2035, AF7)', () => {
  const catalog = buildCatalog(files);

  it('has no "From the external system" example on any type', () => {
    const examples = catalog.layers.flatMap((l) => l.entries).flatMap((t) => t.examples);
    expect(examples.filter((e) => e.mode === 'system')).toEqual([]);
    expect(examples.map((e) => e.name)).not.toContain('From the external system');
  });

  it('lists the sdui format with its home.sdui.json example', () => {
    expect(catalog.formats.map((f) => f.id)).toEqual(['sdui']);
    expect(catalog.formats[0]!.examples.map((e) => e.file)).toEqual([
      'examples/home.sdui.json',
    ]);
  });
});

describe('accessibility variants (stage CX6; decision 27)', () => {
  const parsed = parseSpecText(text(SPEC_FILE));
  const button = parsed.ok
    ? parsed.spec.layers
        .flatMap((l) => l.annotationTypes)
        .find((t) => t.id === 'sdui-button')
    : undefined;

  it('the button declares the link case of its `mode` field: role link over the base button', () => {
    expect(button?.accessibility?.role).toBe('button');
    expect(button?.accessibility?.variants).toEqual({
      field: 'mode',
      cases: {
        link: { role: 'link', label: { fields: ['label'], required: true } },
      },
    });
    const mode = button?.fields.find((f) => f.key === 'mode');
    expect(mode?.type === 'enum' && mode.options.includes('link')).toBe(true);
  });

  it('the library still validates with no error', () => {
    expect(validateLibrary({ files, specPath: SPEC_FILE }).errors).toEqual([]);
  });
});
