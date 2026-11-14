import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptAllAndApply, errorOf, ok, propose, readProject } from './proposalSupport';
import { connect, type Connection } from './workspace';

// Spatial reading and writing in MCP 0.9.0 (ME5): `space`, `floating`, `members` and `arrows` in
// `get_marking`, `canvas` and `floating` in `list_markings`, the container's `parent`, new
// `counts`, `update_marking` with `container` and `floating`, and `get_marking_image` refusing the
// canvas marking (`canvas-marking`).

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
const project = 'spatial';

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

describe('canvas marking read with space, floating, members and arrows', () => {
  it('a proposal creates the container and the marking inside it; the app (model) applies it', async () => {
    const saved = await apply([
      {
        op: 'add_container',
        as: '$screen',
        name: 'Screen',
        width: 400,
        height: 400,
        background: '#FFFFFF',
      },
      {
        op: 'create_marking',
        container: '$screen',
        rect: { x: 10, y: 10, width: 100, height: 60 },
        name: 'Button',
      },
    ]);
    expect(saved.containers).toHaveLength(1);
    expect(saved.markings[0]).toMatchObject({ name: 'Button', floating: false });
  });

  it('creating a canvas marking in a proposal: it is born without a container and the app applies it', async () => {
    const screen = readProject(dir).containers[0]!;
    const { x, y, scale } = screen.placement;
    const panel = {
      x: x - 20,
      y: y - 20,
      width: screen.width * scale + 40,
      height: screen.height * scale + 40,
    };
    const saved = await apply([
      { op: 'create_marking', as: '$panel', rect: panel, name: 'Panel' },
      {
        op: 'create_marking',
        rect: { x: panel.x + 5, y: panel.y + 5, width: 10, height: 10 },
        name: 'Inner',
      },
      {
        op: 'create_marking',
        rect: { x: -5000, y: -5000, width: 100, height: 80 },
        name: 'Loose',
      },
      {
        op: 'create_marking',
        near: screen.id,
        annotation: { type: 'notas/nota' },
        name: 'Note',
      },
      {
        op: 'create_arrow',
        from: readProject(dir).markings.find((m) => m.name === 'Button')!.id,
        to: '$panel',
      },
    ]);
    const byName = (n: string) => saved.markings.find((m) => m.name === n)!;
    expect(byName('Panel')).toMatchObject({ containerId: null, floating: false });
    expect(byName('Inner')).toMatchObject({
      containerId: null,
      parentId: byName('Panel').id,
    });
    expect(byName('Note')).toMatchObject({ containerId: null, floating: true });
    expect(saved.containers[0]!.parentId).toBe(byName('Panel').id);
    expect(saved.arrows).toHaveLength(1);
  });

  it('get_marking of the Panel: space canvas, members (markings and containers) and arrows', async () => {
    const view = await get(markingNamed('Panel').id);
    expect(view).toMatchObject({ space: 'canvas', floating: false, container: null });
    expect(view.path[0]).toEqual({ ref: null, name: 'Canvas' });
    expect(view.members.markings.map((m) => m.name)).toEqual(['Inner']);
    expect(view.members.containers.map((c) => c.name)).toEqual(['Screen']);
    expect(view.members.markings[0]!.rect).toMatchObject({ width: 10, height: 10 });
    expect(view.arrows?.incoming).toHaveLength(1);
    expect(view.arrows?.incoming[0]?.from?.name).toBe('Button');
  });

  it('get_marking of a container marking and of a floating one', async () => {
    const button = await get(markingNamed('Button').id);
    expect(button).toMatchObject({ space: 'container', floating: false });
    expect(button.path[0]!.ref).toMatch(/^mapping:\/\//);
    expect(button.members).toMatchObject({ markings: [], containers: [] });
    const note = await get(markingNamed('Note').id);
    expect(note).toMatchObject({ space: 'canvas', floating: true });
  });

  it('list_markings: canvas, floating and the refusal of canvas with container', async () => {
    const canvas = ok(
      await mcp.call<Listing>('list_markings', { project, canvas: true }),
    );
    expect(canvas.markings.every((m) => m.space === 'canvas')).toBe(true);
    // In depth order: the Panel before the Inner.
    const names = canvas.markings.map((m) => m.name);
    expect(names.indexOf('Panel')).toBeLessThan(names.indexOf('Inner'));
    expect([...names].sort()).toEqual(['Inner', 'Loose', 'Note', 'Panel']);

    const floating = ok(
      await mcp.call<Listing>('list_markings', { project, floating: true }),
    );
    expect(floating.markings.map((m) => m.name)).toEqual(['Note']);
    expect(floating.markings[0]).toMatchObject({ floating: true, space: 'canvas' });

    const inContainer = ok(await mcp.call<Listing>('list_markings', { project }));
    expect(inContainer.markings.map((m) => m.name)).toEqual(['Button']);
    expect(inContainer.markings[0]).toMatchObject({ space: 'container' });

    for (const extra of [{ container: 'Screen' }, { image: 'Screen' }]) {
      const error = errorOf(
        await mcp.call('list_markings', { project, canvas: true, ...extra }),
      );
      expect(error.code).toBe('invalid-arguments');
    }
  });

  it('get_container and get_project bring parent; counts add up canvas, floating and arrows', async () => {
    const panel = await get(markingNamed('Panel').id);
    const screen = readProject(dir).containers[0]!;
    const container = ok(
      await mcp.call<{ parent: string | null }>('get_container', {
        project,
        ref: screen.id,
      }),
    );
    expect(container.parent).toContain(panel.ref.split('/').slice(0, -1).join('/'));
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

describe('update_marking with container and floating', () => {
  it('switching container requires rect', async () => {
    const result = await plan([
      {
        op: 'update_marking',
        marking: markingNamed('Loose').id,
        container: readProject(dir).containers[0]!.id,
      },
    ]);
    expect(result.errors?.[0]?.code).toBe('invalid-arguments');
  });

  it('from the canvas to the container, with the rect in its pixels', async () => {
    const screen = readProject(dir).containers[0]!;
    const rect = { x: 200, y: 200, width: 50, height: 50 };
    const saved = await apply([
      {
        op: 'update_marking',
        marking: markingNamed('Loose').id,
        container: screen.id,
        rect,
      },
    ]);
    expect(saved.markings.find((m) => m.name === 'Loose')).toMatchObject({
      containerId: screen.id,
      rect,
    });
    expect((await get(markingNamed('Loose').id)).space).toBe('container');
  });

  it('from the container to the canvas (null), with the rect in canvas units', async () => {
    const rect = { x: -5000, y: -5000, width: 100, height: 80 };
    const saved = await apply([
      { op: 'update_marking', marking: markingNamed('Loose').id, container: null, rect },
    ]);
    expect(saved.markings.find((m) => m.name === 'Loose')).toMatchObject({
      containerId: null,
      rect,
    });
  });

  it('a rect outside the new container fails with rect-out-of-image', async () => {
    const result = await plan([
      {
        op: 'update_marking',
        marking: markingNamed('Loose').id,
        container: readProject(dir).containers[0]!.id,
        rect: { x: 390, y: 390, width: 50, height: 50 },
      },
    ]);
    expect(result.errors?.[0]?.code).toBe('rect-out-of-image');
  });

  it('floating with a non-null container fails with invalid-space', async () => {
    const result = await plan([
      {
        op: 'update_marking',
        marking: markingNamed('Note').id,
        container: readProject(dir).containers[0]!.id,
        rect: { x: 10, y: 10, width: 50, height: 50 },
      },
    ]);
    expect(result.errors?.[0]?.code).toBe('invalid-space');
  });

  it('floating: true takes the marking out of the container and converts the rect to the canvas', async () => {
    const screen = readProject(dir).containers[0]!;
    const before = markingNamed('Button');
    const saved = await apply([
      { op: 'update_marking', marking: before.id, floating: true },
    ]);
    const after = saved.markings.find((m) => m.id === before.id)!;
    expect(after).toMatchObject({ floating: true, containerId: null, parentId: null });
    const { x, y, scale } = screen.placement;
    expect(after.rect).toEqual({
      x: Math.round(x + before.rect.x * scale),
      y: Math.round(y + before.rect.y * scale),
      width: Math.round(before.rect.width * scale),
      height: Math.round(before.rect.height * scale),
    });
    expect((await get(before.id)).floating).toBe(true);
  });

  it('floating: false stops being floating (the floating one must be unlocked)', async () => {
    const result = await plan([
      { op: 'update_marking', marking: markingNamed('Note').id, floating: false },
    ]);
    expect(result.valid).toBe(true);
  });
});

describe('get_marking_image on the canvas marking', () => {
  it('refuses with canvas-marking and a hint', async () => {
    const error = errorOf(
      await mcp.call('get_marking_image', {
        project,
        ref: markingNamed('Panel').id,
      }),
    );
    expect(error.code).toBe('canvas-marking');
    expect(String(error.hint)).toContain('get_container_file');
  });

  it('the arrow is still refused with arrow and a hint', async () => {
    const arrow = readProject(dir).arrows[0]!;
    const error = errorOf(
      await mcp.call('get_marking_image', { project, ref: arrow.id }),
    );
    expect(error.code).toBe('arrow');
    expect(String(error.hint)).toContain('get_marking');
  });
});
