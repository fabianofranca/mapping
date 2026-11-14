import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addContainer,
  applySpecialization,
  createProject,
  parseSpecText,
  serialize,
  type Project,
} from '../../src/model';
import { runBatch } from '../../mcp/batch';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject } from '../../mcp/projects';
import { createServer } from '../../mcp/server';
import { NOW } from '../model/fixtures';

// CF10 (decisões 27 e 28): `plan_changes` e `propose_changes` instanciam o componente de cada
// marcação criada ou alterada e devolvem o "não cabe" em `issues` (`component-overflow`, sem
// bloquear o lote); `operationsFile` traz o lote de um arquivo dentro das raízes.

const LAYER = 'cccccccc-0000-4000-8000-000000000001';
const PHOTO = 'bbbbbbbb-0000-4000-8000-000000000001';

const spec = (withFonts: boolean) => ({
  format: 'mapping-spec',
  formatVersion: 15,
  id: 'lib',
  name: 'Lib',
  version: 1,
  ...(withFonts ? { fonts: [{ family: 'Acme', file: 'fonts/Acme.ttf' }] } : {}),
  tokens: {
    modes: ['light', 'dark'],
    values: { face: { light: 'sans-serif', dark: 'Acme' } },
  },
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
          fields: [{ key: 'label', type: 'string', default: 'Confirmar pagamento' }],
        },
        {
          id: 'chip',
          name: 'Chip',
          component: 'components/chip.json',
          fields: [],
        },
        {
          id: 'botao',
          name: 'Botão',
          component: 'components/botao.json',
          fields: [{ key: 'label', type: 'string', default: 'Salvar' }],
        },
        {
          id: 'dir',
          name: 'Direção',
          component: 'components/dir.json',
          fields: [],
        },
        {
          id: 'face',
          name: 'Rótulo',
          component: 'components/face.json',
          fields: [{ key: 'label', type: 'string', default: 'Confirmar pagamento' }],
        },
      ],
    },
  ],
});

const textNode = (family?: unknown) => ({
  type: 'text',
  name: 'rotulo',
  text: { $field: 'label', default: 'Confirmar pagamento' },
  width: 'fill',
  height: 'fill',
  font: { size: 14, lineHeight: 20, ...(family === undefined ? {} : { family }) },
  color: '#000000',
});

const component = (id: string, family?: unknown) => ({
  format: 'mapping-component',
  formatVersion: 4,
  id,
  name: id,
  size: { width: 120, height: 40 },
  template: { type: 'frame', layout: { type: 'row' }, children: [textNode(family)] },
});

/** A #1093: raiz `none` com um quadro `hug` de padding 24 nas laterais e uma barra de 39 (87×36). */
const chipComponent = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'chip',
  name: 'chip',
  size: { width: 87, height: 40 },
  template: {
    type: 'frame',
    name: 'chip',
    layout: { type: 'none' },
    children: [
      {
        type: 'frame',
        name: 'miolo',
        width: 'hug',
        height: 'hug',
        anchors: { centerX: true, centerY: true },
        layout: { type: 'row', padding: [0, 24] },
        children: [{ type: 'rect', name: 'barra', width: 39, height: 36 }],
      },
    ],
  },
};

/** A #1631: o rótulo de um botão com padding 24 nas laterais (58 de largura deixam 10 para a palavra). */
const botaoComponent = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'botao',
  name: 'botao',
  size: { width: 96, height: 40 },
  template: {
    type: 'frame',
    name: 'botao',
    layout: { type: 'row', padding: [0, 24] },
    children: [
      {
        ...textNode(),
        name: 'rótulo',
        text: { $field: 'label', default: 'Salvar' },
      },
    ],
  },
};

/** Estoura só em `rtl`: uma barra de 300 de largura, visível só nessa direção, num quadro de 120. */
const dirComponent = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'dir',
  name: 'dir',
  size: { width: 120, height: 40 },
  template: {
    type: 'frame',
    name: 'dir',
    layout: { type: 'row' },
    children: [
      { type: 'rect', name: 'curta', width: 30, height: 10, fill: '#000000' },
      {
        type: 'rect',
        name: 'larga',
        width: 300,
        height: 10,
        fill: '#000000',
        visible: { $direction: 'rtl' },
      },
    ],
  },
};

interface Workspace {
  base: string;
  client: Client;
}

async function workspace(withFonts: boolean): Promise<Workspace> {
  const base = mkdtempSync(join(tmpdir(), 'mapping-overflow-'));
  const dir = join(base, 'telas');
  const lib = join(dir, 'specs', 'lib');
  mkdirSync(join(lib, 'components'), { recursive: true });
  mkdirSync(join(lib, 'fonts'), { recursive: true });
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(lib, 'lib.spec.json'), JSON.stringify(spec(withFonts)));
  writeFileSync(join(lib, 'components', 'btn.json'), JSON.stringify(component('btn')));
  writeFileSync(join(lib, 'components', 'chip.json'), JSON.stringify(chipComponent));
  writeFileSync(join(lib, 'components', 'botao.json'), JSON.stringify(botaoComponent));
  writeFileSync(join(lib, 'components', 'dir.json'), JSON.stringify(dirComponent));
  writeFileSync(
    join(lib, 'components', 'face.json'),
    JSON.stringify(component('face', { $token: 'face' })),
  );
  // "Acme" é a mono em negrito: bem mais larga que a sans nos mesmos caracteres.
  cpSync('mcp/fonts/MappingMono-Bold.ttf', join(lib, 'fonts', 'Acme.ttf'));
  writeFileSync(join(dir, 'images', 'foto.png'), Buffer.from([0]));
  const parsed = parseSpecText(JSON.stringify(spec(withFonts)));
  if (!parsed.ok) throw new Error(`spec inválida: ${JSON.stringify(parsed)}`);
  let p = createProject({
    name: 'Telas',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Camada 1', color: '#D32F2F' },
  });
  p = addContainer(p, { id: PHOTO, file: 'images/foto.png', width: 400, height: 300 });
  p = applySpecialization(p, parsed.spec, { packageSpecName: 'lib.spec.json' });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ roots: [base] }).connect(serverSide);
  const client = new Client({ name: 'teste', version: '0' });
  await client.connect(clientSide);
  return { base, client };
}

/** Grava no `mapping.json` o resultado de um lote (o projeto já nasce com marcações). */
async function seed(ws: Workspace, operations: Operation[]): Promise<Project> {
  const roots = new Roots([ws.base]);
  const loaded = await loadProject(roots, await findProject(roots, 'telas'));
  const result = await runBatch(loaded, operations, {
    readSource: () => Promise.reject(new Error('sem arquivos')),
    readSpecInput: () => Promise.reject(new Error('sem arquivos')),
    takenImageFiles: new Set<string>(),
    now: () => new Date(NOW),
  });
  expect(result.errors).toEqual([]);
  writeFileSync(join(ws.base, 'telas', 'mapping.json'), serialize(result.project));
  return result.project;
}

interface Data {
  valid?: boolean;
  errors?: unknown;
  issues?: { new?: { annotation: string; issues: { code: string }[] }[] };
  error?: { code?: string; message?: string };
  [key: string]: unknown;
}

interface Reply {
  isError: boolean;
  data: Data;
}

async function call(
  ws: Workspace,
  name: string,
  args: Record<string, unknown>,
): Promise<Reply> {
  const result = await ws.client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0]!.text;
  try {
    return { isError: result.isError === true, data: JSON.parse(text) };
  } catch {
    // Recusa do próprio SDK (argumento fora do schema): texto puro, sem `code`.
    return { isError: result.isError === true, data: { message: text } };
  }
}

const SCREEN = {
  op: 'add_container',
  as: '$tela',
  width: 300,
  height: 200,
  background: '#FFEBEE',
};
const create = (
  rect: { x: number; y: number; width: number; height: number },
  type = 'lib/btn',
  extra: Record<string, unknown> = {},
) => ({
  op: 'create_marking',
  as: '$m',
  container: '$tela',
  rect,
  annotation: { type },
  ...extra,
});
const plan = (ws: Workspace, operations: unknown[]) =>
  call(ws, 'plan_changes', { project: 'telas', operations });
/** Os itens `component-overflow` de `issues.new` (cada um com a anotação a que pertence). */
const overflows = (reply: Reply): Record<string, unknown>[] =>
  (
    (reply.data.issues?.new ?? []) as { annotation: string; issues: { code: string }[] }[]
  ).flatMap((entry) =>
    entry.issues
      .filter((i) => i.code === 'component-overflow')
      .map((i) => ({ annotation: entry.annotation, ...i })),
  );

let aprox: Workspace;
let real: Workspace;
let seeded: Workspace;

beforeAll(async () => {
  aprox = await workspace(false);
  real = await workspace(true);
  seeded = await workspace(false);
});

afterAll(async () => {
  for (const ws of [aprox, real, seeded]) {
    await ws.client.close();
    rmSync(ws.base, { recursive: true, force: true });
  }
});

describe('plan_changes: prova de desenho por instância', () => {
  it('60×20 com "Confirmar pagamento" não cabe: component-overflow com o nó e quanto falta, sem bloquear', async () => {
    const reply = await plan(aprox, [
      SCREEN,
      create({ x: 10, y: 10, width: 60, height: 20 }),
    ]);
    expect(reply.data.errors).toBeUndefined();
    expect(reply.isError).toBe(false);
    expect(reply.data.valid).toBe(true);
    const items = overflows(reply);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ code: 'component-overflow', node: 'rotulo' });
    expect(items[0]!.missing).toBeGreaterThan(0);
    expect(items[0]!.message).toMatch(/falta.*px/);
  });

  it('o mesmo lote com 200×40 não traz component-overflow', async () => {
    const reply = await plan(aprox, [
      SCREEN,
      create({ x: 10, y: 10, width: 200, height: 40 }),
    ]);
    expect(reply.data.valid).toBe(true);
    expect(overflows(reply)).toEqual([]);
  });

  it('(aproximado) sem as fonts da biblioteca; com elas, não', async () => {
    const ops = [SCREEN, create({ x: 10, y: 10, width: 60, height: 20 })];
    const without = overflows(await plan(aprox, ops));
    const withFonts = overflows(await plan(real, ops));
    expect(without[0]!.message).toContain('(aproximado)');
    expect(without[0]!.approximate).toBe(true);
    expect(withFonts[0]!.message).not.toContain('(aproximado)');
    expect(withFonts[0]!.approximate).toBeUndefined();
  });

  it('update_marking que encolhe gera o item; marcação não tocada pelo lote não gera', async () => {
    // O projeto já tem uma marcação que não cabe ("velha") e outra que cabe ("boa").
    const project = await seed(seeded, [
      { ...SCREEN, as: '$s' } as Operation,
      create({ x: 10, y: 10, width: 60, height: 20 }, 'lib/btn', {
        as: '$velha',
        container: '$s',
        name: 'velha',
      }) as Operation,
      create({ x: 10, y: 60, width: 200, height: 40 }, 'lib/btn', {
        as: '$boa',
        container: '$s',
        name: 'boa',
      }) as Operation,
    ]);
    const id = (name: string) => project.markings.find((m) => m.name === name)!.id;

    // Mexer só na que cabe, sem encolher: nenhum item (a "velha" não foi tocada pelo lote).
    const untouched = await plan(seeded, [
      { op: 'update_marking', marking: id('boa'), name: 'boa agora' },
      { op: 'update_marking', marking: id('boa'), move: { dx: 1, dy: 0 } },
    ]);
    expect(untouched.data.errors).toBeUndefined();
    expect(overflows(untouched)).toEqual([]);

    // Encolher a "boa" para 60×20: ela passa a não caber e só ela é reportada.
    const shrink = await plan(seeded, [
      {
        op: 'update_marking',
        marking: id('boa'),
        rect: { x: 10, y: 60, width: 60, height: 20 },
      },
    ]);
    expect(shrink.data.errors).toBeUndefined();
    expect(overflows(shrink)).toHaveLength(1);
  });

  it('usa o modo efetivo do container: com "dark" a fonte do token muda e o resultado também', async () => {
    const rect = { x: 10, y: 10, width: 140, height: 20 };
    const light = await plan(real, [SCREEN, create(rect, 'lib/face')]);
    const dark = await plan(real, [
      { ...SCREEN, drawingMode: 'dark' },
      create(rect, 'lib/face'),
    ]);
    expect(overflows(light)).toEqual([]);
    expect(overflows(dark)).toHaveLength(1);
  });

  it('propose_changes devolve os mesmos itens em issues', async () => {
    const operations = [SCREEN, create({ x: 10, y: 10, width: 60, height: 20 })];
    const planned = overflows(await plan(aprox, operations));
    const proposed = await call(aprox, 'propose_changes', {
      project: 'telas',
      title: 'Prova',
      operations,
    });
    expect(proposed.isError).toBe(false);
    // A referência da anotação muda a cada chamada (ids novos); o resto é igual.
    const bare = (items: Record<string, unknown>[]) =>
      items.map((item) => ({ ...item, annotation: undefined }));
    expect(bare(overflows(proposed))).toEqual(bare(planned));
    expect(planned).toHaveLength(1);
  });
});

describe('plan_changes: aviso no pai none (#1093)', () => {
  it('chip de raiz none em 58×40 devolve component-overflow de conteúdo; em 87×40 nada', async () => {
    const small = await plan(aprox, [
      SCREEN,
      create({ x: 10, y: 10, width: 58, height: 40 }, 'lib/chip'),
    ]);
    expect(small.data.errors).toBeUndefined();
    const items = overflows(small);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      code: 'component-overflow',
      kind: 'content',
      node: 'chip',
      missing: 29,
    });
    const fits = await plan(aprox, [
      SCREEN,
      create({ x: 10, y: 10, width: 87, height: 40 }, 'lib/chip'),
    ]);
    expect(overflows(fits)).toEqual([]);
  });
});

describe('plan_changes: palavra mais larga que a caixa (#1631)', () => {
  const botao = (width: number) =>
    create({ x: 10, y: 10, width, height: 40 }, 'lib/botao');

  it('botão "Salvar" em 58×40 devolve component-overflow de texto no rótulo; em 96×40 nada', async () => {
    const small = await plan(aprox, [SCREEN, botao(58)]);
    expect(small.data.errors).toBeUndefined();
    const items = overflows(small);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      code: 'component-overflow',
      kind: 'text',
      node: 'rótulo',
    });
    expect(items[0]!.missing).toBeGreaterThan(0);
    const fits = await plan(aprox, [SCREEN, botao(96)]);
    expect(overflows(fits)).toEqual([]);
  });
});

describe('plan_changes: prova de desenho × densidade (#1085)', () => {
  const SCREEN3 = { ...SCREEN, width: 1200, height: 800, density: 3 };

  it('update_container density 3 com um botão de 200×40 devolve component-overflow com missing em pixels', async () => {
    const project = await seed(seeded, [
      { ...SCREEN3, density: undefined, as: '$s' } as Operation,
      create({ x: 10, y: 10, width: 200, height: 40 }, 'lib/btn', {
        as: '$b',
        container: '$s',
        name: 'botao',
      }) as Operation,
    ]);
    const container = project.containers.find((c) => c.file === null)!;
    const flat = await plan(seeded, [
      { op: 'update_container', container: container.id },
    ]);
    expect(overflows(flat)).toEqual([]);
    const dense = await plan(seeded, [
      { op: 'update_container', container: container.id, density: 3 },
    ]);
    expect(dense.data.errors).toBeUndefined();
    const items = overflows(dense);
    const text = items.find((i) => i.node === 'rotulo');
    expect(text).toMatchObject({ code: 'component-overflow', kind: 'text' });
    expect(text!.missing as number).toBeGreaterThan(0);
  });

  it('a falta é em pixels: o mesmo botão em 180×60 a 3x falta 3× o de 60×20 a 1x', async () => {
    const one = overflows(
      await plan(aprox, [SCREEN, create({ x: 10, y: 10, width: 60, height: 20 })]),
    );
    const three = overflows(
      await plan(aprox, [SCREEN3, create({ x: 30, y: 30, width: 180, height: 60 })]),
    );
    expect(one).toHaveLength(1);
    expect(three).toHaveLength(1);
    expect(three[0]!.missing as number).toBeCloseTo((one[0]!.missing as number) * 3, 0);
  });

  it('a 3x o botão de 600×120 (200×40 unidades) cabe e não gera nada', async () => {
    const reply = await plan(aprox, [
      SCREEN3,
      create({ x: 30, y: 30, width: 600, height: 120 }),
    ]);
    expect(reply.data.valid).toBe(true);
    expect(overflows(reply)).toEqual([]);
  });
});

describe('plan_changes: prova de desenho × direção', () => {
  const seedDir = () =>
    seed(seeded, [
      { ...SCREEN, as: '$s' } as Operation,
      create({ x: 10, y: 10, width: 120, height: 40 }, 'lib/dir', {
        as: '$b',
        container: '$s',
        name: 'dir',
      }) as Operation,
    ]);

  it('um lote só mudando a direção do container prova o componente que estoura só em rtl', async () => {
    const project = await seedDir();
    const container = project.containers.find((c) => c.file === null)!;
    const same = await plan(seeded, [
      { op: 'update_container', container: container.id },
    ]);
    expect(overflows(same)).toEqual([]);
    const rtl = await plan(seeded, [
      { op: 'update_container', container: container.id, direction: 'rtl' },
    ]);
    expect(rtl.data.errors).toBeUndefined();
    expect(overflows(rtl).length).toBeGreaterThan(0);
  });

  it('um lote só mudando a direção do projeto prova o componente que estoura só em rtl', async () => {
    await seedDir();
    const rtl = await plan(seeded, [{ op: 'update_project', direction: 'rtl' }]);
    expect(rtl.data.errors).toBeUndefined();
    expect(overflows(rtl).length).toBeGreaterThan(0);
  });
});

describe('plan_changes e propose_changes: operationsFile', () => {
  const operations = [SCREEN, create({ x: 10, y: 10, width: 60, height: 20 })];

  it('aplica o lote do arquivo e o resultado é igual ao de operations inline', async () => {
    writeFileSync(join(aprox.base, 'lote.json'), JSON.stringify(operations));
    const inline = await plan(aprox, operations);
    const file = await call(aprox, 'plan_changes', {
      project: 'telas',
      operationsFile: join(aprox.base, 'lote.json'),
    });
    expect(file.isError).toBe(false);
    // Os ids dos itens criados são novos a cada chamada: só o resto é comparado.
    const strip = (r: Reply) =>
      JSON.parse(JSON.stringify(r.data).replace(/[0-9a-f]{8}/g, '#'));
    expect(strip(file)).toEqual(strip(inline));
    expect(overflows(file)).toHaveLength(1);
  });

  it('aceita o caminho relativo a uma raiz e vale também no propose_changes', async () => {
    writeFileSync(join(aprox.base, 'lote2.json'), JSON.stringify(operations));
    const proposed = await call(aprox, 'propose_changes', {
      project: 'telas',
      title: 'Do arquivo',
      operationsFile: 'lote2.json',
    });
    expect(proposed.isError).toBe(false);
    expect(proposed.data.valid).toBe(true);
    expect(overflows(proposed)).toHaveLength(1);
  });

  it('operations e operationsFile juntos: invalid-arguments', async () => {
    const reply = await call(aprox, 'plan_changes', {
      project: 'telas',
      operations,
      operationsFile: 'lote.json',
    });
    expect(reply.isError).toBe(true);
    expect(reply.data.error?.code).toBe('invalid-arguments');
  });

  it('nenhum dos dois: invalid-arguments', async () => {
    const reply = await call(aprox, 'plan_changes', { project: 'telas' });
    expect(reply.isError).toBe(true);
    expect(reply.data.error?.code).toBe('invalid-arguments');
  });

  it('arquivo fora das raízes: o erro de caminho de hoje (outside-roots)', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'mapping-fora-'));
    writeFileSync(join(outside, 'lote.json'), JSON.stringify(operations));
    try {
      const reply = await call(aprox, 'plan_changes', {
        project: 'telas',
        operationsFile: join(outside, 'lote.json'),
      });
      expect(reply.isError).toBe(true);
      expect(reply.data.error?.code).toBe('outside-roots');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('link simbólico para fora das raízes também é outside-roots', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'mapping-fora-'));
    writeFileSync(join(outside, 'lote.json'), JSON.stringify(operations));
    symlinkSync(join(outside, 'lote.json'), join(aprox.base, 'escapa.json'));
    try {
      const reply = await call(aprox, 'plan_changes', {
        project: 'telas',
        operationsFile: 'escapa.json',
      });
      expect(reply.data.error?.code).toBe('outside-roots');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('invalid JSON: erro com a posição', async () => {
    writeFileSync(join(aprox.base, 'quebrado.json'), '[{"op": "add_container",,}]');
    const reply = await call(aprox, 'plan_changes', {
      project: 'telas',
      operationsFile: 'quebrado.json',
    });
    expect(reply.isError).toBe(true);
    expect(reply.data.error?.code).toBe('invalid-arguments');
    expect(reply.data.error?.message).toMatch(/quebrado\.json/);
    expect(reply.data.error?.message).toMatch(/position|line \d+ column \d+/);
  });

  it('o conteúdo é conferido como as operações inline (op desconhecido)', async () => {
    writeFileSync(join(aprox.base, 'ruim.json'), JSON.stringify([{ op: 'nao_existe' }]));
    const reply = await call(aprox, 'plan_changes', {
      project: 'telas',
      operationsFile: 'ruim.json',
    });
    expect(reply.isError).toBe(true);
    expect(reply.data.error?.code).toBe('invalid-arguments');
  });
});
