import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptAllAndApply, errorOf, ok, propose, readProject } from './proposalSupport';
import { connect, type Connection } from './workspace';

// Leitura e escrita espacial no MCP 0.9.0 (ME5): `space`, `floating`, `members` e `arrows` em
// `get_marking`, `canvas` e `floating` em `list_markings`, `parent` do container, `counts`
// novos, `update_marking` com `container` e `floating`, e `get_marking_image` recusando a
// marcação do canvas (`canvas-marking`).

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Plan {
  valid: boolean;
  errors?: { index: number; op: string; code: string; message: string }[];
}

interface MarkingData {
  ref: string;
  name: string | null;
  path: { ref: string | null; name: string }[];
  container: unknown;
  space: string;
  floating: boolean;
  rect: Rect;
  members: {
    markings: { ref: string; name: string | null; rect: Rect }[];
    containers: { ref: string; name: string | null }[];
    markingsTotal?: number;
  };
  arrows?: { outgoing: unknown[]; incoming: { from?: { name: string | null } }[] };
}

interface Row {
  ref: string;
  name: string | null;
  space: string;
  floating: boolean;
}

interface Listing {
  total: number;
  markings: Row[];
}

interface ProjectData {
  counts: Record<string, number>;
  containers: { ref: string; parent: string | null }[];
}

let root: string;
let mcp: Connection;
let dir: string;
const project = 'espacial';

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-spatial-'));
  mcp = await connect([root]);
  ok(await mcp.call('create_project', { path: `projetos/${project}`, name: project }));
  dir = join(root, 'projetos', project);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

const plan = async (operations: unknown[]) =>
  ok(await mcp.call<Plan>('plan_changes', { project, operations }));

const apply = async (operations: unknown[]) => {
  const proposed = await propose(mcp, project, operations);
  expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
  return acceptAllAndApply(dir, proposed.proposal.id);
};

const markingNamed = (name: string) =>
  readProject(dir).markings.find((m) => m.name === name)!;

const get = async (id: string) =>
  ok(await mcp.call<MarkingData>('get_marking', { project, ref: id }));

describe('marcação do canvas lida com space, floating, members e arrows', () => {
  it('uma proposta cria o container e a marcação dentro dele; a app (modelo) a aplica', async () => {
    const saved = await apply([
      {
        op: 'add_container',
        as: '$tela',
        name: 'Tela',
        width: 400,
        height: 400,
        background: '#FFFFFF',
      },
      {
        op: 'create_marking',
        container: '$tela',
        rect: { x: 10, y: 10, width: 100, height: 60 },
        name: 'Botão',
      },
    ]);
    expect(saved.containers).toHaveLength(1);
    expect(saved.markings[0]).toMatchObject({ name: 'Botão', floating: false });
  });

  it('criar marcação do canvas numa proposta: nasce sem container e a app a aplica', async () => {
    const tela = readProject(dir).containers[0]!;
    const { x, y, scale } = tela.placement;
    const painel = {
      x: x - 20,
      y: y - 20,
      width: tela.width * scale + 40,
      height: tela.height * scale + 40,
    };
    const saved = await apply([
      { op: 'create_marking', as: '$painel', rect: painel, name: 'Painel' },
      {
        op: 'create_marking',
        rect: { x: painel.x + 5, y: painel.y + 5, width: 10, height: 10 },
        name: 'Interno',
      },
      {
        op: 'create_marking',
        rect: { x: -5000, y: -5000, width: 100, height: 80 },
        name: 'Solta',
      },
      {
        op: 'create_marking',
        near: tela.id,
        annotation: { type: 'notas/nota' },
        name: 'Nota',
      },
      {
        op: 'create_arrow',
        from: readProject(dir).markings.find((m) => m.name === 'Botão')!.id,
        to: '$painel',
      },
    ]);
    const byName = (n: string) => saved.markings.find((m) => m.name === n)!;
    expect(byName('Painel')).toMatchObject({ containerId: null, floating: false });
    expect(byName('Interno')).toMatchObject({
      containerId: null,
      parentId: byName('Painel').id,
    });
    expect(byName('Nota')).toMatchObject({ containerId: null, floating: true });
    expect(saved.containers[0]!.parentId).toBe(byName('Painel').id);
    expect(saved.arrows).toHaveLength(1);
  });

  it('get_marking do Painel: space canvas, members (marcações e containers) e arrows', async () => {
    const view = await get(markingNamed('Painel').id);
    expect(view).toMatchObject({ space: 'canvas', floating: false, container: null });
    expect(view.path[0]).toEqual({ ref: null, name: 'Canvas' });
    expect(view.members.markings.map((m) => m.name)).toEqual(['Interno']);
    expect(view.members.containers.map((c) => c.name)).toEqual(['Tela']);
    expect(view.members.markings[0]!.rect).toMatchObject({ width: 10, height: 10 });
    expect(view.arrows?.incoming).toHaveLength(1);
    expect(view.arrows?.incoming[0]?.from?.name).toBe('Botão');
  });

  it('get_marking de uma marcação de container e de uma flutuante', async () => {
    const botao = await get(markingNamed('Botão').id);
    expect(botao).toMatchObject({ space: 'container', floating: false });
    expect(botao.path[0]!.ref).toMatch(/^mapping:\/\//);
    expect(botao.members).toMatchObject({ markings: [], containers: [] });
    const nota = await get(markingNamed('Nota').id);
    expect(nota).toMatchObject({ space: 'canvas', floating: true });
  });

  it('list_markings: canvas, floating e a recusa de canvas com container', async () => {
    const canvas = ok(
      await mcp.call<Listing>('list_markings', { project, canvas: true }),
    );
    expect(canvas.markings.every((m) => m.space === 'canvas')).toBe(true);
    // Em profundidade: o Painel antes do Interno.
    const names = canvas.markings.map((m) => m.name);
    expect(names.indexOf('Painel')).toBeLessThan(names.indexOf('Interno'));
    expect([...names].sort()).toEqual(['Interno', 'Nota', 'Painel', 'Solta']);

    const floating = ok(
      await mcp.call<Listing>('list_markings', { project, floating: true }),
    );
    expect(floating.markings.map((m) => m.name)).toEqual(['Nota']);
    expect(floating.markings[0]).toMatchObject({ floating: true, space: 'canvas' });

    const inContainer = ok(await mcp.call<Listing>('list_markings', { project }));
    expect(inContainer.markings.map((m) => m.name)).toEqual(['Botão']);
    expect(inContainer.markings[0]).toMatchObject({ space: 'container' });

    for (const extra of [{ container: 'Tela' }, { image: 'Tela' }]) {
      const error = errorOf(
        await mcp.call('list_markings', { project, canvas: true, ...extra }),
      );
      expect(error.code).toBe('invalid-arguments');
    }
  });

  it('get_container e get_project trazem parent; counts somam canvas, flutuantes e setas', async () => {
    const painel = await get(markingNamed('Painel').id);
    const tela = readProject(dir).containers[0]!;
    const container = ok(
      await mcp.call<{ parent: string | null }>('get_container', {
        project,
        ref: tela.id,
      }),
    );
    expect(container.parent).toContain(painel.ref.split('/').slice(0, -1).join('/'));
    expect(container.parent).toMatch(/\/m\//);

    const summary = ok(await mcp.call<ProjectData>('get_project', { project }));
    expect(summary.containers[0]!.parent).toBe(container.parent);
    expect(summary.counts).toMatchObject({
      containers: 1,
      markings: 5,
      canvasMarkings: 4,
      floatingMarkings: 1,
      arrows: 1,
    });
  });
});

describe('update_marking com container e floating', () => {
  it('trocar de container exige rect', async () => {
    const result = await plan([
      {
        op: 'update_marking',
        marking: markingNamed('Solta').id,
        container: readProject(dir).containers[0]!.id,
      },
    ]);
    expect(result.errors?.[0]?.code).toBe('invalid-arguments');
  });

  it('do canvas para o container, com o rect nos pixels dele', async () => {
    const tela = readProject(dir).containers[0]!;
    const rect = { x: 200, y: 200, width: 50, height: 50 };
    const saved = await apply([
      {
        op: 'update_marking',
        marking: markingNamed('Solta').id,
        container: tela.id,
        rect,
      },
    ]);
    expect(saved.markings.find((m) => m.name === 'Solta')).toMatchObject({
      containerId: tela.id,
      rect,
    });
    expect((await get(markingNamed('Solta').id)).space).toBe('container');
  });

  it('do container para o canvas (null), com o rect em unidades do canvas', async () => {
    const rect = { x: -5000, y: -5000, width: 100, height: 80 };
    const saved = await apply([
      { op: 'update_marking', marking: markingNamed('Solta').id, container: null, rect },
    ]);
    expect(saved.markings.find((m) => m.name === 'Solta')).toMatchObject({
      containerId: null,
      rect,
    });
  });

  it('rect fora do container novo falha com rect-out-of-image', async () => {
    const result = await plan([
      {
        op: 'update_marking',
        marking: markingNamed('Solta').id,
        container: readProject(dir).containers[0]!.id,
        rect: { x: 390, y: 390, width: 50, height: 50 },
      },
    ]);
    expect(result.errors?.[0]?.code).toBe('rect-out-of-image');
  });

  it('flutuante com container não nulo falha com invalid-space', async () => {
    const result = await plan([
      {
        op: 'update_marking',
        marking: markingNamed('Nota').id,
        container: readProject(dir).containers[0]!.id,
        rect: { x: 10, y: 10, width: 50, height: 50 },
      },
    ]);
    expect(result.errors?.[0]?.code).toBe('invalid-space');
  });

  it('floating: true tira a marcação do container e converte o rect para o canvas', async () => {
    const tela = readProject(dir).containers[0]!;
    const before = markingNamed('Botão');
    const saved = await apply([
      { op: 'update_marking', marking: before.id, floating: true },
    ]);
    const after = saved.markings.find((m) => m.id === before.id)!;
    expect(after).toMatchObject({ floating: true, containerId: null, parentId: null });
    const { x, y, scale } = tela.placement;
    expect(after.rect).toEqual({
      x: Math.round(x + before.rect.x * scale),
      y: Math.round(y + before.rect.y * scale),
      width: Math.round(before.rect.width * scale),
      height: Math.round(before.rect.height * scale),
    });
    expect((await get(before.id)).floating).toBe(true);
  });

  it('floating: false deixa de ser flutuante (a flutuante tem de estar destrancada)', async () => {
    const result = await plan([
      { op: 'update_marking', marking: markingNamed('Nota').id, floating: false },
    ]);
    expect(result.valid).toBe(true);
  });
});

describe('get_marking_image na marcação do canvas', () => {
  it('recusa com canvas-marking e uma dica', async () => {
    const error = errorOf(
      await mcp.call('get_marking_image', {
        project,
        ref: markingNamed('Painel').id,
      }),
    );
    expect(error.code).toBe('canvas-marking');
    expect(String(error.hint)).toContain('get_container_file');
  });

  it('a seta continua recusada com arrow e dica', async () => {
    const arrow = readProject(dir).arrows[0]!;
    const error = errorOf(
      await mcp.call('get_marking_image', { project, ref: arrow.id }),
    );
    expect(error.code).toBe('arrow');
    expect(String(error.hint)).toContain('get_marking');
  });
});
