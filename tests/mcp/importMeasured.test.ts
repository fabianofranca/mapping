import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ModelError,
  addContainer,
  applySpecialization,
  createProject,
  parseSpecText,
  serialize,
} from '../../src/model';
import { runBatch } from '../../mcp/batch';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject } from '../../mcp/projects';
import { createServer } from '../../mcp/server';
import { NOW } from '../model/fixtures';

// CF11 (decisão 29): a op de lote `import_measured` lê uma árvore de retângulos medidos (inline ou
// de um `.json` dentro das raízes) e cria uma marcação por nó com tipo, pelas `sources` dos tipos
// da origem `measured`. O pertencimento sai da geometria; a prova de desenho da CF10 vale.

const LAYER = 'cccccccc-0000-4000-8000-000000000001';

const spec = {
  format: 'mapping-spec',
  formatVersion: 15,
  id: 'lib',
  name: 'Lib',
  version: 1,
  origins: [{ system: 'dom', kind: 'measured' }],
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#6750A4',
      annotationTypes: [
        {
          id: 'btn',
          name: 'Botão',
          component: 'components/btn.json',
          sources: [{ system: 'dom', name: 'btn' }],
          fields: [
            {
              key: 'label',
              type: 'string',
              default: 'Ok',
              sources: [{ system: 'dom', path: 'label' }],
            },
          ],
        },
        {
          id: 'box',
          name: 'Caixa',
          sources: [{ system: 'dom', name: 'box' }],
          fields: [],
        },
      ],
    },
  ],
};

const component = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'btn',
  name: 'btn',
  size: { width: 120, height: 40 },
  template: {
    type: 'frame',
    layout: { type: 'row' },
    children: [
      {
        type: 'text',
        name: 'rotulo',
        text: { $field: 'label', default: 'Ok' },
        width: 'fill',
        height: 'fill',
        font: { size: 14, lineHeight: 20 },
        color: '#000000',
      },
    ],
  },
};

const btn = (x: number, y: number, w: number, h: number, label?: string) => ({
  type: 'button',
  classes: ['btn'],
  rect: { x, y, width: w, height: h },
  ...(label === undefined ? {} : { props: { label } }),
});

// A caixa é irmã do botão na árvore, mas o retângulo do botão está dentro dela.
const tree = {
  type: 'div',
  classes: ['x-misterioso'],
  rect: { x: 0, y: 0, width: 300, height: 200 },
  children: [
    {
      type: 'section',
      classes: ['box'],
      rect: { x: 10, y: 10, width: 200, height: 100 },
    },
    btn(20, 20, 120, 40, 'Salvar'),
  ],
};

let base: string;
let client: Client;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-measured-'));
  const dir = join(base, 'telas');
  const lib = join(dir, 'specs', 'lib');
  mkdirSync(join(lib, 'components'), { recursive: true });
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(lib, 'lib.spec.json'), JSON.stringify(spec));
  writeFileSync(join(lib, 'components', 'btn.json'), JSON.stringify(component));
  const parsed = parseSpecText(JSON.stringify(spec));
  if (!parsed.ok) throw new Error(`spec inválida: ${JSON.stringify(parsed)}`);
  let p = createProject({
    name: 'Telas',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Camada 1', color: '#D32F2F' },
  });
  p = addContainer(p, {
    id: 'dddddddd-0000-4000-8000-000000000001',
    file: 'images/foto.png',
    width: 400,
    height: 300,
  });
  p = applySpecialization(p, parsed.spec, { packageSpecName: 'lib.spec.json' });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
  writeFileSync(join(dir, 'images', 'foto.png'), Buffer.from([0]));
  writeFileSync(join(dir, 'tree.json'), JSON.stringify(tree));
  writeFileSync(join(base, 'fora.json'), JSON.stringify(tree));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ roots: [dir] }).connect(serverSide);
  client = new Client({ name: 'teste', version: '0' });
  await client.connect(clientSide);
});

afterAll(async () => {
  await client.close();
  rmSync(base, { recursive: true, force: true });
});

interface Reply {
  isError: boolean;
  data: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function plan(operations: unknown[]): Promise<Reply> {
  const result = await client.callTool({
    name: 'plan_changes',
    arguments: { project: 'telas', operations },
  });
  const text = (result.content as { text: string }[])[0]!.text;
  return { isError: result.isError === true, data: JSON.parse(text) };
}

async function run(operations: unknown[]) {
  const roots = new Roots([join(base, 'telas')]);
  const loaded = await loadProject(roots, await findProject(roots, 'telas'));
  return runBatch(loaded, operations as Operation[], {
    readSource: () => Promise.reject(new Error('sem arquivos')),
    readSpecInput: () => Promise.reject(new Error('sem arquivos')),
    takenImageFiles: new Set<string>(),
    now: () => new Date(NOW),
  });
}

const SCREEN = {
  op: 'add_container',
  as: '$tela',
  width: 400,
  height: 300,
  background: '#FFFFFF',
};
const imp = (extra: Record<string, unknown>) => ({
  op: 'import_measured',
  container: '$tela',
  system: 'dom',
  ...extra,
});
const created = (reply: Reply) =>
  ((reply.data.created ?? []) as { kind: string }[]).filter((c) => c.kind === 'marking');

describe('import_measured', () => {
  it('cria uma marcação por nó com tipo e ignora o nó sem tipo, com aviso', async () => {
    const reply = await plan([SCREEN, imp({ tree })]);
    expect(reply.data.errors).toBeUndefined();
    expect(reply.data.valid).toBe(true);
    expect(created(reply)).toHaveLength(2);
    expect(JSON.stringify(reply.data.warnings)).toContain('x-misterioso');
  });

  it('tree inline e file dentro das raízes dão o mesmo resultado', async () => {
    const inline = await plan([SCREEN, imp({ tree })]);
    const file = await plan([SCREEN, imp({ file: 'tree.json' })]);
    expect(file.data.errors).toBeUndefined();
    expect(created(file)).toHaveLength(created(inline).length);
    expect(file.data.summary).toEqual(inline.data.summary);
  });

  it('file fora das raízes falha com o erro de caminho de hoje', async () => {
    const reply = await plan([SCREEN, imp({ file: join(base, 'fora.json') })]);
    expect(reply.data.errors?.[0]?.code).toBe('outside-roots');
  });

  it('exige tree ou file, não os dois nem nenhum', async () => {
    const none = await plan([SCREEN, imp({})]);
    const both = await plan([SCREEN, imp({ tree, file: 'tree.json' })]);
    expect(none.data.errors?.[0]?.code).toBe('invalid-arguments');
    expect(both.data.errors?.[0]?.code).toBe('invalid-arguments');
  });

  it('offset e scale multiplicam e deslocam os retângulos', async () => {
    const result = await run([
      SCREEN,
      imp({ tree: btn(10, 20, 120, 40, 'Salvar'), offset: { x: 100, y: 50 }, scale: 2 }),
    ]);
    expect(result.errors).toEqual([]);
    expect(result.project.markings.at(-1)!.rect).toEqual({
      x: 120,
      y: 90,
      width: 240,
      height: 80,
    });
  });

  it('o pertencimento sai da geometria: o botão dentro da caixa vira filho dela', async () => {
    const result = await run([SCREEN, imp({ tree })]);
    expect(result.errors).toEqual([]);
    const [box, button] = result.project.markings.slice(-2);
    // A caixa (10,10,200×100) contém o botão (20,20,120×40) mesmo irmã dele na árvore.
    expect(box!.parentId).toBeNull();
    expect(button!.parentId).toBe(box!.id);
  });

  it('a prova de desenho vale: texto que não cabe vira component-overflow', async () => {
    const reply = await plan([
      SCREEN,
      imp({ tree: btn(10, 10, 60, 20, 'Confirmar pagamento agora') }),
    ]);
    expect(reply.data.errors).toBeUndefined();
    const items = (
      (reply.data.issues?.new ?? []) as { issues: { code: string }[] }[]
    ).flatMap((e) => e.issues.filter((i) => i.code === 'component-overflow'));
    expect(items.length).toBeGreaterThan(0);
  });

  it('origem que não é measured falha com not-found/invalid-arguments e mensagem clara', async () => {
    const reply = await plan([SCREEN, imp({ tree, system: 'zzz' })]);
    expect(reply.data.errors?.[0]?.message).toContain('zzz');
  });
});

// Achado 12 (CR do MCP): o `catch` por nó pega só `ToolError` e `ModelError`; um erro interno sobe.
describe('import_measured: erro por nó', () => {
  let thrown = 0;
  const failInCreate = (error: Error) => {
    thrown = 0;
    const original = crypto.randomUUID.bind(crypto);
    return vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      if (new Error().stack?.includes('createMarkingOp')) {
        thrown += 1;
        throw error;
      }
      return original();
    });
  };

  it('um erro do modelo vira aviso do nó e o lote segue', async () => {
    const spy = failInCreate(new ModelError('rect-too-small'));
    try {
      const result = await run([SCREEN, imp({ tree: btn(10, 10, 120, 40, 'Ok') })]);
      expect(result.errors).toEqual([]);
      expect(thrown).toBeGreaterThan(0);
      expect(result.deprecations.map((d) => d.message).join('\n')).toContain(
        'não criada',
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('um erro que não é do modelo nem da tool sobe (não vira aviso do nó)', async () => {
    const spy = failInCreate(new TypeError('bug interno'));
    try {
      await expect(
        run([SCREEN, imp({ tree: btn(10, 10, 120, 40, 'Ok') })]),
      ).rejects.toThrow('bug interno');
      expect(thrown).toBeGreaterThan(0);
    } finally {
      spy.mockRestore();
    }
  });
});
