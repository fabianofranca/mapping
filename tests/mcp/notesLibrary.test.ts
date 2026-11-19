import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NOTES_FILES } from '../../libraries/notas';
import { deserialize } from '../../src/model';
import { decodeImage } from '../../mcp/image/codecs';
import { acceptAllAndApply, errorOf, ok, propose, readProject } from './proposalSupport';
import { connect, type Connection } from './workspace';

// The embedded notes library (ME3) through `create_project`: applied by default, with the folder
// `specs/notas/` written before the `mapping.json`; `notes: false` creates the project as before.

let base: string;
let root: string;
let mcp: Connection;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-notes-'));
  root = join(base, 'raiz');
  mkdirSync(root, { recursive: true });
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

describe('create_project with the notes library', () => {
  it('default: Notas layer, specialization applied and specs/notas/ identical to the package', async () => {
    const created = ok(
      await mcp.call<{ counts: { layers: number } }>('create_project', {
        path: 'with-notes',
        name: 'With notes',
      }),
    );
    expect(created.counts.layers).toBe(2);
    const dir = join(root, 'with-notes');
    for (const [path, text] of NOTES_FILES) {
      const onDisk = readFileSync(
        join(dir, 'specs', 'notas', ...path.split('/')),
        'utf8',
      );
      // The specialization JSON is rewritten by the model serialization; the rest is the package.
      if (path === 'notas.spec.json') {
        expect(JSON.parse(onDisk)).toEqual(JSON.parse(text));
      } else {
        expect(onDisk, path).toBe(text);
      }
    }
    const parsed = deserialize(readFileSync(join(dir, 'mapping.json'), 'utf8'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.project.specializations).toEqual([
      expect.objectContaining({ id: 'notas', file: 'specs/notas/notas.spec.json' }),
    ]);
    expect(parsed.project.layers.map((l) => [l.name, l.spec])).toEqual([
      ['Layer 1', null],
      ['Notes', { specId: 'notas', layerId: 'notas' }],
    ]);
  });

  it('get_project reads the created project: notas specialization available and Notas layer', async () => {
    const project = ok(
      await mcp.call<{
        layers: { name: string; spec: unknown; annotations: number }[];
        specializations: Record<string, unknown>[];
        issues: { total: number };
      }>('get_project', { project: 'with-notes' }),
    );
    expect(project.specializations).toEqual([
      expect.objectContaining({
        id: 'notas',
        name: 'Notes',
        available: true,
        annotations: 0,
      }),
    ]);
    expect(project.specializations[0]).not.toHaveProperty('problem');
    expect(project.layers.map((l) => l.name)).toEqual(['Layer 1', 'Notes']);
    expect(project.issues.total).toBe(0);
  });

  it('get_specialization returns notas: formatVersion 7, the floating note and table and the plain text', async () => {
    const data = ok(
      await mcp.call<{
        id: string;
        file: string;
        spec: {
          formatVersion: number;
          layers: {
            id: string;
            annotationTypes: { id: string; floating?: boolean; component?: string }[];
          }[];
        };
      }>('get_specialization', { project: 'with-notes', specId: 'notas' }),
    );
    expect(data).toMatchObject({ id: 'notas', file: 'specs/notas/notas.spec.json' });
    expect(data.spec.formatVersion).toBe(7);
    const types = data.spec.layers.flatMap((l) => l.annotationTypes);
    expect(types.map((t) => t.id)).toEqual(['nota', 'tabela', 'texto']);
    expect(types[0]).toMatchObject({
      floating: true,
      component: 'components/nota.json',
    });
  });

  it('notes: false creates only the "Layer 1", without specs/', async () => {
    const created = ok(
      await mcp.call<{ counts: { layers: number } }>('create_project', {
        path: 'without-notes',
        name: 'Without notes',
        notes: false,
      }),
    );
    expect(created.counts.layers).toBe(1);
    const dir = join(root, 'without-notes');
    expect(existsSync(join(dir, 'specs'))).toBe(false);
    expect(existsSync(join(dir, 'mapping.json'))).toBe(true);
    const parsed = deserialize(readFileSync(join(dir, 'mapping.json'), 'utf8'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.project.layers.map((l) => l.name)).toEqual(['Layer 1']);
    expect(parsed.project.specializations).toEqual([]);

    const project = ok(
      await mcp.call<{ specializations: unknown[] }>('get_project', {
        project: 'without-notes',
      }),
    );
    expect(project.specializations).toEqual([]);
    expect(
      errorOf(
        await mcp.call('get_specialization', {
          project: 'without-notes',
          specId: 'notas',
        }),
      ).code,
    ).toBe('not-found');
  });
});

describe('the Text type of the notes library through the MCP', () => {
  const name = 'with-text';
  let dir: string;

  interface Plan {
    valid: boolean;
    errors?: { index: number; op: string; code: string; message: string }[];
    warnings?: { code: string; op: number; message: string }[];
  }

  interface MarkingData {
    ref: string;
    space: string;
    floating: boolean;
    container: unknown;
  }

  const markingNamed = (markingName: string) =>
    readProject(dir).markings.find((m) => m.name === markingName)!;

  const get = async (id: string) =>
    ok(await mcp.call<MarkingData>('get_marking', { project: name, ref: id }));

  beforeAll(async () => {
    const created = ok(
      await mcp.call<{ specs: unknown }>('create_project', { path: name, name }),
    );
    expect(created).toBeDefined();
    dir = join(root, name);
    const proposed = await propose(mcp, name, [
      {
        op: 'add_container',
        name: 'Screen',
        width: 400,
        height: 300,
        background: '#FFFFFF',
      },
    ]);
    expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
    acceptAllAndApply(dir, proposed.proposal.id);
  });

  it('lists the three types in the notes layer', async () => {
    const data = ok(
      await mcp.call<{
        spec: { layers: { annotationTypes: { id: string; floating?: boolean }[] }[] };
      }>('get_specialization', { project: name, specId: 'notas' }),
    );
    const types = data.spec.layers.flatMap((l) => l.annotationTypes);
    expect(types.map((t) => t.id)).toEqual(['nota', 'tabela', 'texto']);
    expect(types.find((t) => t.id === 'texto')?.floating).toBeUndefined();
  });

  const operations = (): unknown[] => [
    {
      op: 'create_marking',
      container: 'Screen',
      rect: { x: 20, y: 20, width: 80, height: 20 },
      annotation: { type: 'notas/texto', values: { texto: 'In the container' } },
      name: 'Inside',
    },
    {
      op: 'create_marking',
      annotation: { type: 'notas/texto', values: { texto: 'On the canvas' } },
      name: 'Loose',
    },
  ];

  it('plan_changes: with container and rect, and without container (canvas), with no ignored-argument', async () => {
    const result = ok(
      await mcp.call<Plan>('plan_changes', { project: name, operations: operations() }),
    );
    expect(result.errors, JSON.stringify(result.errors)).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(result.warnings?.filter((w) => w.code === 'ignored-argument') ?? []).toEqual(
      [],
    );
  });

  it('propose_changes, once applied: space container and floating false; on the canvas, floating false', async () => {
    const proposed = await propose(mcp, name, operations());
    expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
    expect(proposed.warnings?.filter((w) => w.code === 'ignored-argument') ?? []).toEqual(
      [],
    );
    acceptAllAndApply(dir, proposed.proposal.id);
    const inside = await get(markingNamed('Inside').id);
    expect(inside).toMatchObject({ space: 'container', floating: false });
    expect(inside.container).not.toBeNull();
    const loose = await get(markingNamed('Loose').id);
    expect(loose).toMatchObject({ space: 'canvas', floating: false, container: null });
  });

  it('render_container draws the text over the white container', async () => {
    const view = ok(
      await mcp.call<{ containers: { ref: string; name: string }[] }>('get_project', {
        project: name,
      }),
    );
    const screen = view.containers.find((c) => c.name === 'Screen')!;
    const result = await mcp.client.callTool({
      name: 'render_container',
      arguments: { ref: screen.ref },
    });
    expect(result.isError).not.toBe(true);
    const image = (result.content as { type: string; data?: string }[]).find(
      (c) => c.type === 'image',
    );
    expect(image?.data).toBeTruthy();
    const { raster } = await decodeImage(Buffer.from(image!.data!, 'base64'));
    let dark = 0;
    for (let i = 0; i < raster.data.length; i += 4) {
      if (raster.data[i]! < 128 && raster.data[i + 3]! > 0) dark += 1;
    }
    expect(dark).toBeGreaterThan(20);
  });
});
