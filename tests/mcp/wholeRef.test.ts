import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Annotation, Project } from '../../src/model';
import { acceptAllAndApply, ok, propose, readProject } from './proposalSupport';
import { codeOf, connect, type Connection } from './workspace';

// Etapa #679 (CF2): o `ref` para a anotação inteira no MCP. O lote aceita
// `{ "annotation": "<ref|id|$apelido>" }` sozinho (campo e célula); `get_annotation` e
// `get_marking` mostram o `ref` e o backlink; `get_code_hints` expande os alvos (`targets`).

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
      name: 'Componentes',
      color: '#1565C0',
      annotationTypes: [
        {
          id: 'item',
          name: 'Item',
          labelField: 'titulo',
          allowedChildren: [{ layer: 'eventos' }],
          childRoles: [{ id: 'click', name: 'Clique' }],
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
          name: 'Outro',
          fields: [{ key: 'titulo', type: 'string' }],
        },
      ],
    },
    {
      id: 'eventos',
      name: 'Eventos',
      color: '#E53935',
      annotationTypes: [
        {
          id: 'replace-plugins',
          name: 'Substituir plugins',
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
const project = 'inteira';

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

describe('lote: ref para a anotação inteira', () => {
  it('campo e célula com { annotation: "$p1" } sozinho gravam { annotationId }', async () => {
    const operations = [
      item('$m1', '$p1', 'Alvo A', 0),
      item('$m2', '$p2', 'Alvo B', 200),
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
    const a = byTitle(p, 'Alvo A');
    const b = byTitle(p, 'Alvo B');
    const event = byTitle(p, 'Evento 1');
    expect(event.values!.unico).toEqual({ annotationId: a.id });
    const rows = event.values!.plugins as { item: unknown }[];
    expect(rows.map((r) => r.item)).toEqual([
      { annotationId: a.id },
      { annotationId: b.id },
    ]);
  });

  it('o formato gravado { annotationId } continua aceito', async () => {
    const first = await apply([item('$m1', '$p1', 'Alvo G', 0)]);
    const target = byTitle(first, 'Alvo G');
    const p = await apply([
      {
        op: 'create_marking',
        rect: { ...rect, x: 400 },
        annotation: {
          type: 'sdui/replace-plugins',
          values: { titulo: 'Gravado', unico: { annotationId: target.id } },
        },
      },
    ]);
    expect(byTitle(p, 'Gravado').values!.unico).toEqual({ annotationId: target.id });
  });

  it('alvo de tipo que o campo não aceita: ref-not-accepted na operação certa', async () => {
    const planned = await plan([
      {
        op: 'create_marking',
        as: '$m1',
        rect,
        annotationAs: '$p1',
        annotation: { type: 'sdui/outro', values: { titulo: 'Fora' } },
      },
      {
        op: 'create_marking',
        rect: { ...rect, x: 300 },
        annotation: {
          type: 'sdui/replace-plugins',
          values: { titulo: 'Ruim', unico: { annotation: '$p1' } },
        },
      },
    ]);
    expect(planned.valid).toBe(false);
    expect(planned.errors![0]).toMatchObject({ index: 1, code: 'ref-not-accepted' });
  });
});

interface View {
  refs?: { field: string; to: string; target: { kind: string } }[];
  backlinks?: { from: string; fromLabel: string; field: string; to: string }[];
}

describe('leituras', () => {
  it('get_annotation da origem mostra o ref com o rótulo; get_marking do alvo, o backlink', async () => {
    const operations = [
      item('$m1', '$p1', 'Alvo L', 0),
      {
        op: 'create_marking',
        rect: { ...rect, x: 400 },
        annotation: {
          type: 'sdui/replace-plugins',
          values: { titulo: 'Origem L', plugins: [{ item: { annotation: '$p1' } }] },
        },
      },
    ];
    const p = await apply(operations);
    const target = byTitle(p, 'Alvo L');
    const origin = byTitle(p, 'Origem L');
    const fromOrigin = ok(await mcp.call<View>('get_annotation', { ref: aRef(origin) }));
    expect(fromOrigin.refs).toEqual([
      expect.objectContaining({
        field: 'plugins[1].item',
        to: 'Alvo L',
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
        fromLabel: 'Substituir plugins Origem L',
        field: 'plugins[1].item',
        to: 'Alvo L',
      }),
    ]);
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
  it('um alvo por linha, na ordem, expandido, com eventos e filhas; types inclui os alvos', async () => {
    const operations = [
      {
        op: 'add_container',
        as: '$depois',
        name: 'Tela (depois)',
        width: 400,
        height: 300,
        background: '#FFFFFF',
      },
      {
        op: 'create_marking',
        as: '$m1',
        container: '$depois',
        rect: { x: 10, y: 10, width: 180, height: 100 },
        annotationAs: '$p1',
        annotation: { type: 'sdui/item', values: { titulo: 'Primeiro' } },
      },
      {
        op: 'create_marking',
        as: '$filha',
        container: '$depois',
        rect: { x: 20, y: 20, width: 60, height: 30 },
        annotationAs: '$pf',
        annotation: { type: 'sdui/item', values: { titulo: 'Dentro' } },
      },
      {
        op: 'create_marking',
        as: '$m2',
        container: '$depois',
        rect: { x: 200, y: 10, width: 180, height: 100 },
        annotationAs: '$p2',
        annotation: { type: 'sdui/item', values: { titulo: 'Segundo' } },
      },
      {
        op: 'create_annotation',
        marking: '$m2',
        type: 'sdui/replace-plugins',
        owner: '$p2',
        role: 'click',
        values: { titulo: 'Clique do segundo' },
      },
      {
        op: 'create_marking',
        as: '$origem',
        rect: { x: 600, y: 0, width: 100, height: 50 },
        annotationAs: '$e1',
        annotation: {
          type: 'sdui/replace-plugins',
          values: {
            titulo: 'Evento T',
            plugins: [{ item: { annotation: '$p2' } }, { item: { annotation: '$p1' } }],
          },
        },
      },
    ];
    const p = await apply(operations);
    const event = byTitle(p, 'Evento T');
    const hints = ok(
      await mcp.call<Hints>('get_code_hints', {
        ref: mRef(event.markingId),
        platform: 'web',
      }),
    );
    const root = hints.tree.annotations![0]!;
    expect(root.targets!.map((t) => [t.field, t.row, t.column, t.label])).toEqual([
      ['plugins', 0, 'item', 'Segundo'],
      ['plugins', 1, 'item', 'Primeiro'],
    ]);
    const [segundo, primeiro] = root.targets!;
    expect(segundo!.annotation).toMatchObject({
      type: 'sdui/item',
      label: 'Segundo',
      values: { titulo: 'Segundo' },
      args: [{ field: 'titulo', value: 'Segundo' }],
    });
    // eventos do item, no papel deles
    expect(segundo!.annotation!.linked).toEqual([
      expect.objectContaining({
        type: 'sdui/replace-plugins',
        label: 'Clique do segundo',
        parentRole: 'click',
      }),
    ]);
    // a marcação do alvo tem uma filha com o próprio componente
    expect(primeiro!.children).toHaveLength(1);
    expect(primeiro!.children![0]!.annotations![0]).toMatchObject({ label: 'Dentro' });
    // compatibilidade: values da origem continuam com o rótulo
    expect(root.values).toMatchObject({
      plugins: [{ item: 'Segundo' }, { item: 'Primeiro' }],
    });
    expect(root.args).toEqual([
      {
        field: 'plugins',
        name: 'plugins',
        value: [
          { nota: null, item: 'Segundo' },
          { nota: null, item: 'Primeiro' },
        ],
      },
    ]);
    expect(Object.keys(hints.types).sort()).toEqual([
      'sdui/item',
      'sdui/replace-plugins',
    ]);
  });

  it('alvo que aponta de volta (A → B → A): a segunda vez vem só com o rótulo', async () => {
    const first = await apply([
      item('$m1', '$p1', 'Item volta', 0),
      {
        op: 'create_marking',
        rect: { ...rect, x: 300 },
        annotationAs: '$e1',
        annotation: {
          type: 'sdui/replace-plugins',
          values: { titulo: 'Evento volta', plugins: [{ item: { annotation: '$p1' } }] },
        },
      },
    ]);
    const event = byTitle(first, 'Evento volta');
    const itemAnn = byTitle(first, 'Item volta');
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
    expect(target!.annotation!.label).toBe('Item volta');
    const [back] = target!.annotation!.targets!;
    expect(back).toMatchObject({
      field: 'origem',
      row: null,
      column: null,
      label: 'Evento volta',
      repeated: true,
    });
    expect(back!.annotation).toBeUndefined();
  });

  it('ref de campo (key) não é expandido', async () => {
    const hints = ok(
      await mcp.call<Hints>('get_code_hints', {
        ref: mRef(byTitle(readProject(dir), 'Evento T').markingId),
        platform: 'web',
      }),
    );
    expect(hints.tree.annotations![0]!.targets!.every((t) => t.column === 'item')).toBe(
      true,
    );
  });
});

describe('o lote do AGENT-GUIDE', () => {
  it('o lote de "Conteúdo fora da imagem", como está escrito, é válido, aplica e chega ao get_code_hints', async () => {
    const guide = readFileSync('docs/AGENT-GUIDE.md', 'utf8');
    const block = /### Conteúdo fora da imagem[^]*?```json\n([^]*?)```/.exec(guide);
    expect(block, 'bloco json do guia').not.toBeNull();
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
