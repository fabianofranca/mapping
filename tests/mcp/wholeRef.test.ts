import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Annotation, Project } from '../../src/model';
import { acceptAllAndApply, ok, propose, readProject } from './proposalSupport';
import { codeOf, connect, type Connection } from './workspace';

// Stage #679 (CF2): the `ref` to the whole annotation in the MCP. The batch accepts
// `{ "annotation": "<ref|id|$alias>" }` alone (field and cell); `get_annotation` and
// `get_marking` show the `ref` and the backlink; `get_code_hints` expands the targets (`targets`).

interface Planned {
  valid: boolean;
  errors?: { index: number; op: string; code: string; message: string }[];
}

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 14,
  id: 'sdui',
  name: 'SDUI',
  version: 1,
  platforms: [{ id: 'web', name: 'Web', language: 'typescript' }],
  layers: [
    {
      id: 'componentes',
      name: 'Components',
      color: '#1565C0',
      annotationTypes: [
        {
          id: 'item',
          name: 'Item',
          labelField: 'titulo',
          allowedChildren: [{ layer: 'eventos' }],
          childRoles: [{ id: 'click', name: 'Click' }],
          code: { web: { symbol: 'Item', params: { titulo: 'title' } } },
          fields: [
            { key: 'titulo', type: 'string' },
            {
              key: 'origem',
              type: 'ref',
              accepts: { annotations: ['replace-plugins'] },
            },
          ],
        },
        {
          id: 'outro',
          name: 'Other',
          fields: [{ key: 'titulo', type: 'string' }],
        },
      ],
    },
    {
      id: 'eventos',
      name: 'Events',
      color: '#E53935',
      annotationTypes: [
        {
          id: 'replace-plugins',
          name: 'Replace plugins',
          labelField: 'titulo',
          code: { web: { symbol: 'replacePlugins', params: { plugins: 'plugins' } } },
          fields: [
            { key: 'titulo', type: 'string' },
            {
              key: 'unico',
              type: 'ref',
              accepts: { annotations: ['item'] },
            },
            {
              key: 'plugins',
              type: 'table',
              columns: [
                { key: 'nota', type: 'string' },
                {
                  key: 'item',
                  type: 'ref',
                  accepts: { annotations: [{ layer: 'componentes' }] },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

let root: string;
let dir: string;
let mcp: Connection;
const project = 'whole';

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-wholeref-'));
  mkdirSync(join(root, 'fontes'), { recursive: true });
  writeFileSync(join(root, 'fontes', 'sdui.json'), JSON.stringify(SPEC));
  dir = join(root, 'projetos', project);
  mcp = await connect([root]);
  ok(await mcp.call('create_project', { path: `projetos/${project}`, name: project }));
  const proposed = await propose(mcp, project, [
    { op: 'apply_specialization', file: 'fontes/sdui.json' },
  ]);
  expect(proposed.valid).toBe(true);
  acceptAllAndApply(dir, proposed.proposal.id);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

const rect = { x: 0, y: 0, width: 100, height: 50 };
const plan = async (operations: unknown[]) =>
  ok(await mcp.call<Planned>('plan_changes', { project, operations }));

async function apply(operations: unknown[]): Promise<Project> {
  const proposed = await propose(mcp, project, operations);
  expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
  acceptAllAndApply(dir, proposed.proposal.id);
  return readProject(dir);
}

const byTitle = (p: Project, title: string): Annotation =>
  p.annotations.filter((a) => a.values?.titulo === title).at(-1)!;
const aRef = (a: Annotation) => `mapping://${project}/a/${codeOf(a.id)}`;
const mRef = (id: string) => `mapping://${project}/m/${codeOf(id)}`;

const item = (as: string, ann: string, title: string, x: number) => ({
  op: 'create_marking',
  as,
  rect: { ...rect, x },
  annotationAs: ann,
  annotation: { type: 'sdui/item', values: { titulo: title } },
});

describe('batch: ref to the whole annotation', () => {
  it('field and cell with { annotation: "$p1" } alone write { annotationId }', async () => {
    const operations = [
      item('$m1', '$p1', 'Target A', 0),
      item('$m2', '$p2', 'Target B', 200),
      {
        op: 'create_marking',
        as: '$m3',
        rect: { ...rect, x: 400 },
        annotationAs: '$e1',
        annotation: {
          type: 'sdui/replace-plugins',
          values: {
            titulo: 'Evento 1',
            unico: { annotation: '$p1' },
            plugins: [
              { nota: 'a', item: { annotation: '$p1' } },
              { nota: 'b', item: { annotation: '$p2' } },
            ],
          },
        },
      },
    ];
    const planned = await plan(operations);
    expect(planned.valid, JSON.stringify(planned.errors)).toBe(true);
    const p = await apply(operations);
    const a = byTitle(p, 'Target A');
    const b = byTitle(p, 'Target B');
    const event = byTitle(p, 'Evento 1');
    expect(event.values!.unico).toEqual({ annotationId: a.id });
    const rows = event.values!.plugins as { item: unknown }[];
    expect(rows.map((r) => r.item)).toEqual([
      { annotationId: a.id },
      { annotationId: b.id },
    ]);
  });

  it('the stored format { annotationId } is still accepted', async () => {
    const first = await apply([item('$m1', '$p1', 'Target G', 0)]);
    const target = byTitle(first, 'Target G');
    const p = await apply([
      {
        op: 'create_marking',
        rect: { ...rect, x: 400 },
        annotation: {
          type: 'sdui/replace-plugins',
          values: { titulo: 'Saved', unico: { annotationId: target.id } },
        },
      },
    ]);
    expect(byTitle(p, 'Saved').values!.unico).toEqual({ annotationId: target.id });
  });

  it('target of a type the field does not accept: ref-not-accepted on the right operation', async () => {
    const planned = await plan([
      {
        op: 'create_marking',
        as: '$m1',
        rect,
        annotationAs: '$p1',
        annotation: { type: 'sdui/outro', values: { titulo: 'Outside' } },
      },
      {
        op: 'create_marking',
        rect: { ...rect, x: 300 },
        annotation: {
          type: 'sdui/replace-plugins',
          values: { titulo: 'Bad', unico: { annotation: '$p1' } },
        },
      },
    ]);
    expect(planned.valid).toBe(false);
    expect(planned.errors![0]).toMatchObject({ index: 1, code: 'ref-not-accepted' });
  });
});

interface BacklinkField {
  field: string;
  row: number | null;
  column: string | null;
  to: string;
}
interface View {
  refs?: {
    field: string;
    row: number | null;
    column: string | null;
    to: string;
    target: { kind: string };
  }[];
  backlinks?: {
    from: string;
    fromLabel: string;
    fromMarking: string;
    fields: BacklinkField[];
  }[];
}

describe('reads', () => {
  it('get_annotation of the source shows the ref with the label; get_marking of the target, the backlink', async () => {
    const operations = [
      item('$m1', '$p1', 'Target L', 0),
      {
        op: 'create_marking',
        rect: { ...rect, x: 400 },
        annotation: {
          type: 'sdui/replace-plugins',
          values: { titulo: 'Source L', plugins: [{ item: { annotation: '$p1' } }] },
        },
      },
    ];
    const p = await apply(operations);
    const target = byTitle(p, 'Target L');
    const origin = byTitle(p, 'Source L');
    const fromOrigin = ok(await mcp.call<View>('get_annotation', { ref: aRef(origin) }));
    expect(fromOrigin.refs).toEqual([
      expect.objectContaining({
        field: 'plugins[1].item',
        row: 0,
        column: 'item',
        to: 'Target L',
        target: expect.objectContaining({ kind: 'annotation' }),
      }),
    ]);
    const marking = ok(
      await mcp.call<{ layers: { annotations: View[] }[] }>('get_marking', {
        ref: mRef(target.markingId),
      }),
    );
    expect(marking.layers[0]!.annotations[0]!.backlinks).toEqual([
      expect.objectContaining({
        from: aRef(origin),
        fromLabel: 'Replace plugins Source L',
        fields: [{ field: 'plugins[1].item', row: 0, column: 'item', to: 'Target L' }],
      }),
    ]);
  });

  it('refs: row/column of a cell (0-based) and null for a field; field stays 1-based', async () => {
    const p = await apply([
      item('$m1', '$p1', 'Target R1', 0),
      item('$m2', '$p2', 'Target R2', 200),
      {
        op: 'create_marking',
        rect: { ...rect, x: 400 },
        annotation: {
          type: 'sdui/replace-plugins',
          values: {
            titulo: 'Source R',
            unico: { annotation: '$p1' },
            plugins: [{ item: { annotation: '$p1' } }, { item: { annotation: '$p2' } }],
          },
        },
      },
    ]);
    const view = ok(
      await mcp.call<View>('get_annotation', { ref: aRef(byTitle(p, 'Source R')) }),
    );
    expect(view.refs!.map((r) => [r.field, r.row, r.column])).toEqual([
      ['unico', null, null],
      ['plugins[1].item', 0, 'item'],
      ['plugins[2].item', 1, 'item'],
    ]);
  });

  it('backlinks: one entry per source, with the fields in field order', async () => {
    const p = await apply([
      item('$m1', '$p1', 'Target G1', 0),
      item('$m2', '$p2', 'Target G2', 200),
      {
        op: 'create_marking',
        rect: { ...rect, x: 400 },
        annotation: {
          type: 'sdui/replace-plugins',
          values: {
            titulo: 'Source G1',
            unico: { annotation: '$p2' },
            plugins: [{ item: { annotation: '$p1' } }, { item: { annotation: '$p2' } }],
          },
        },
      },
      {
        op: 'create_marking',
        rect: { ...rect, x: 600 },
        annotation: {
          type: 'sdui/replace-plugins',
          values: { titulo: 'Source G2', unico: { annotation: '$p2' } },
        },
      },
    ]);
    const target = byTitle(p, 'Target G2');
    const view = ok(await mcp.call<View>('get_annotation', { ref: aRef(target) }));
    expect(view.backlinks).toEqual([
      expect.objectContaining({
        from: aRef(byTitle(p, 'Source G1')),
        fields: [
          { field: 'unico', row: null, column: null, to: 'Target G2' },
          { field: 'plugins[2].item', row: 1, column: 'item', to: 'Target G2' },
        ],
      }),
      expect.objectContaining({
        from: aRef(byTitle(p, 'Source G2')),
        fields: [{ field: 'unico', row: null, column: null, to: 'Target G2' }],
      }),
    ]);
  });
});

describe('batch: add_container with beside', () => {
  const container = (as: string, name: string, height: number, extra = {}) => ({
    op: 'add_container',
    as,
    name,
    width: 390,
    height,
    background: '#FFFFFF',
    ...extra,
  });

  it('beside "$screen" gives the "after" the scale of the screen', async () => {
    const p = await apply([
      container('$screen', 'Screen BS', 844),
      container('$after', 'After BS', 300, { beside: '$screen' }),
    ]);
    const tela = p.containers.find((c) => c.name === 'Screen BS')!;
    const depois = p.containers.find((c) => c.name === 'After BS')!;
    expect(depois.placement.scale).toBe(tela.placement.scale);
    expect(depois.placement.y).toBe(tela.placement.y);
    expect(depois.placement.x).toBeGreaterThan(tela.placement.x);
  });

  it('without beside the scales stay different (default rule)', async () => {
    const p = await apply([
      container('$screen', 'Screen SB', 844),
      container('$after', 'After SB', 300),
    ]);
    const tela = p.containers.find((c) => c.name === 'Screen SB')!;
    const depois = p.containers.find((c) => c.name === 'After SB')!;
    expect(depois.placement.scale).not.toBe(tela.placement.scale);
  });

  it('beside with center is invalid-arguments', async () => {
    const planned = await plan([
      container('$screen', 'Screen BC', 844),
      container('$after', 'After BC', 300, { beside: '$screen', center: { x: 0, y: 0 } }),
    ]);
    expect(planned.valid).toBe(false);
    expect(planned.errors![0]).toMatchObject({ index: 1, code: 'invalid-arguments' });
  });
});

interface Hint {
  ref: string;
  type: string;
  label: string | null;
  args?: { field: string; value: unknown }[];
  values?: Record<string, unknown>;
  linked?: Hint[];
  targets?: Target[];
}
interface Target {
  field: string;
  row: number | null;
  column: string | null;
  label: string | null;
  repeated?: boolean;
  annotation?: Hint;
  children?: Node[];
}
interface Node {
  ref: string;
  annotations?: Hint[];
  children?: Node[];
}
interface Hints {
  types: Record<string, unknown>;
  tree: Node;
}

describe('get_code_hints: targets', () => {
  it('one target per row, in order, expanded, with events and children; types includes the targets', async () => {
    const operations = [
      {
        op: 'add_container',
        as: '$after',
        name: 'Screen (after)',
        width: 400,
        height: 300,
        background: '#FFFFFF',
      },
      {
        op: 'create_marking',
        as: '$m1',
        container: '$after',
        rect: { x: 10, y: 10, width: 180, height: 100 },
        annotationAs: '$p1',
        annotation: { type: 'sdui/item', values: { titulo: 'First' } },
      },
      {
        op: 'create_marking',
        as: '$child',
        container: '$after',
        rect: { x: 20, y: 20, width: 60, height: 30 },
        annotationAs: '$pf',
        annotation: { type: 'sdui/item', values: { titulo: 'Inside' } },
      },
      {
        op: 'create_marking',
        as: '$m2',
        container: '$after',
        rect: { x: 200, y: 10, width: 180, height: 100 },
        annotationAs: '$p2',
        annotation: { type: 'sdui/item', values: { titulo: 'Second' } },
      },
      {
        op: 'create_annotation',
        marking: '$m2',
        type: 'sdui/replace-plugins',
        owner: '$p2',
        role: 'click',
        values: { titulo: 'Click of the second' },
      },
      {
        op: 'create_marking',
        as: '$origem',
        rect: { x: 600, y: 0, width: 100, height: 50 },
        annotationAs: '$e1',
        annotation: {
          type: 'sdui/replace-plugins',
          values: {
            titulo: 'Event T',
            plugins: [{ item: { annotation: '$p2' } }, { item: { annotation: '$p1' } }],
          },
        },
      },
    ];
    const p = await apply(operations);
    const event = byTitle(p, 'Event T');
    const hints = ok(
      await mcp.call<Hints>('get_code_hints', {
        ref: mRef(event.markingId),
        platform: 'web',
      }),
    );
    const root = hints.tree.annotations![0]!;
    expect(root.targets!.map((t) => [t.field, t.row, t.column, t.label])).toEqual([
      ['plugins', 0, 'item', 'Second'],
      ['plugins', 1, 'item', 'First'],
    ]);
    const [segundo, primeiro] = root.targets!;
    expect(segundo!.annotation).toMatchObject({
      type: 'sdui/item',
      label: 'Second',
      values: { titulo: 'Second' },
      args: [{ field: 'titulo', value: 'Second' }],
    });
    // the item events, in their role
    expect(segundo!.annotation!.linked).toEqual([
      expect.objectContaining({
        type: 'sdui/replace-plugins',
        label: 'Click of the second',
        parentRole: 'click',
      }),
    ]);
    // the target marking has a child with its own component
    expect(primeiro!.children).toHaveLength(1);
    expect(primeiro!.children![0]!.annotations![0]).toMatchObject({ label: 'Inside' });
    // compatibility: the source values still carry the label
    expect(root.values).toMatchObject({
      plugins: [{ item: 'Second' }, { item: 'First' }],
    });
    expect(root.args).toEqual([
      {
        field: 'plugins',
        name: 'plugins',
        value: [
          { nota: null, item: 'Second' },
          { nota: null, item: 'First' },
        ],
      },
    ]);
    expect(Object.keys(hints.types).sort()).toEqual([
      'sdui/item',
      'sdui/replace-plugins',
    ]);
  });

  it('target that points back (A → B → A): the second time comes only with the label', async () => {
    const first = await apply([
      item('$m1', '$p1', 'Item loop', 0),
      {
        op: 'create_marking',
        rect: { ...rect, x: 300 },
        annotationAs: '$e1',
        annotation: {
          type: 'sdui/replace-plugins',
          values: { titulo: 'Event loop', plugins: [{ item: { annotation: '$p1' } }] },
        },
      },
    ]);
    const event = byTitle(first, 'Event loop');
    const itemAnn = byTitle(first, 'Item loop');
    await apply([
      {
        op: 'update_annotation',
        annotation: aRef(itemAnn),
        values: { origem: { annotation: aRef(event) } },
      },
    ]);
    const hints = ok(
      await mcp.call<Hints>('get_code_hints', {
        ref: mRef(event.markingId),
        platform: 'web',
      }),
    );
    const [target] = hints.tree.annotations![0]!.targets!;
    expect(target!.annotation!.label).toBe('Item loop');
    const [back] = target!.annotation!.targets!;
    expect(back).toMatchObject({
      field: 'origem',
      row: null,
      column: null,
      label: 'Event loop',
      repeated: true,
    });
    expect(back!.annotation).toBeUndefined();
  });

  it('cycle through the hierarchy (child that points to the owner): ends with a repeated node', async () => {
    const created = await apply([
      {
        op: 'create_marking',
        as: '$mp',
        rect: { x: 0, y: 1000, width: 200, height: 100 },
        annotationAs: '$ap',
        annotation: { type: 'sdui/item', values: { titulo: 'Owner A' } },
      },
      {
        op: 'create_marking',
        rect: { x: 10, y: 1010, width: 50, height: 30 },
        annotationAs: '$ac',
        annotation: {
          type: 'sdui/replace-plugins',
          values: { titulo: 'Child A', unico: { annotation: '$ap' } },
        },
      },
    ]);
    const hints = ok(
      await mcp.call<Hints>('get_code_hints', {
        ref: mRef(byTitle(created, 'Owner A').markingId),
        platform: 'web',
      }),
    );
    expect(JSON.stringify(hints)).toContain('"repeated":true');
  });

  it('cycle through the owner/child link (whole ref to the owner): ends with a repeated node', async () => {
    const created = await apply([
      {
        op: 'create_marking',
        as: '$mp',
        rect: { x: 0, y: 1200, width: 200, height: 100 },
        annotationAs: '$ap',
        annotation: { type: 'sdui/item', values: { titulo: 'Owner B' } },
      },
      {
        op: 'create_annotation',
        marking: '$mp',
        type: 'sdui/replace-plugins',
        owner: '$ap',
        role: 'click',
        values: { titulo: 'Linked B', unico: { annotation: '$ap' } },
      },
    ]);
    const hints = ok(
      await mcp.call<Hints>('get_code_hints', {
        ref: mRef(byTitle(created, 'Owner B').markingId),
        platform: 'web',
      }),
    );
    expect(JSON.stringify(hints)).toContain('"repeated":true');
  });

  it('field ref (key) is not expanded', async () => {
    const hints = ok(
      await mcp.call<Hints>('get_code_hints', {
        ref: mRef(byTitle(readProject(dir), 'Event T').markingId),
        platform: 'web',
      }),
    );
    expect(hints.tree.annotations![0]!.targets!.every((t) => t.column === 'item')).toBe(
      true,
    );
  });
});

describe('the AGENT-GUIDE batch', () => {
  it('the batch of "Content outside the image", as written, is valid, applies and reaches get_code_hints', async () => {
    const guide = readFileSync('docs/AGENT-GUIDE.md', 'utf8');
    const block = /### Content outside the image[^]*?```json\n([^]*?)```/.exec(guide);
    expect(block, 'json block of the guide').not.toBeNull();
    const operations = JSON.parse(block![1]!) as unknown[];
    const planned = await plan(operations);
    expect(planned.valid, JSON.stringify(planned.errors)).toBe(true);
    const p = await apply(operations);
    const button = p.annotations.find(
      (x) => x.type?.typeId === 'item' && x.values?.titulo === 'Trocar plugins',
    )!;
    const a = byTitle(p, 'Plugin A');
    const b = byTitle(p, 'Plugin B');
    const event = p.annotations
      .filter(
        (x) =>
          x.type?.typeId === 'replace-plugins' && x.values?.titulo === 'Trocar plugins',
      )
      .at(-1)!;
    const tela = p.containers.filter((c) => c.name === 'Pedido').at(-1)!;
    const depois = p.containers
      .filter((c) => c.name === 'Pedido (depois de Trocar plugins)')
      .at(-1)!;
    expect(depois.placement.scale).toBe(tela.placement.scale);
    expect(event.parentAnnotationId).toBe(button.id);
    expect(event.parentRole).toBe('click');
    expect(p.arrows.length).toBeGreaterThan(0);
    expect((event.values!.plugins as { item: unknown }[]).map((r) => r.item)).toEqual([
      { annotationId: a.id },
      { annotationId: b.id },
    ]);
    const hints = ok(
      await mcp.call<Hints>('get_code_hints', {
        ref: mRef(button.markingId),
        platform: 'web',
      }),
    );
    const linked = hints.tree.annotations![0]!.linked![0]!;
    expect(linked.targets!.map((t) => t.label)).toEqual(['Plugin A', 'Plugin B']);
    expect(Object.keys(hints.types).sort()).toEqual([
      'sdui/item',
      'sdui/replace-plugins',
    ]);
  });
});
