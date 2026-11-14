import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptAllAndApply, errorOf, ok, propose, readProject } from './proposalSupport';
import { connect, type Connection } from './workspace';

// Arrows and `near` in the MCP (ME4): `create_arrow`, `update_arrow`, `delete_arrow` in the batch and in the
// proposal, `near` in `create_marking`, `arrows` in `get_marking`, the arrow read and annotated by id
// and `get_marking_image` refusing the arrow (`arrow`).

interface Plan {
  valid: boolean;
  errors?: { index: number; op: string; code: string; message: string }[];
  summary: string[];
  changes: Record<string, { created: number; updated: number; deleted: number }>;
  created: { op: number; alias?: string; kind: string; ref?: string }[];
  warnings?: { code: string; op: number; message: string }[];
}

interface ArrowRow {
  ref: string;
  id: string;
  from?: { ref: string; name: string | null; path: string[] };
  to?: { ref: string; name: string | null; path: string[] };
  name: string | null;
  style: string;
  locked: boolean;
}

interface MarkingData {
  ref: string;
  kind?: string;
  name: string | null;
  rect: { x: number; y: number; width: number; height: number };
  arrows?: { outgoing: ArrowRow[]; incoming: ArrowRow[] };
  from?: { name: string | null };
  to?: { name: string | null };
  style?: string;
  layers: { annotations: { name: string | null }[] }[];
}

let root: string;
let mcp: Connection;
let dir: string;
const project = 'setas';

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-arrows-'));
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

const build = [
  {
    op: 'add_container',
    as: '$tela',
    name: 'Screen',
    width: 400,
    height: 400,
    background: '#FFFFFF',
  },
  {
    op: 'create_marking',
    as: '$botao',
    container: '$tela',
    rect: { x: 10, y: 10, width: 100, height: 60 },
    name: 'Button',
  },
  {
    op: 'create_marking',
    as: '$nota',
    annotationAs: '$nota-a',
    near: '$botao',
    annotation: { type: 'notas/nota' },
    name: 'Button note',
  },
  { op: 'create_arrow', as: '$seta', from: '$botao', to: '$nota', style: 'elbow' },
];

describe('create_marking with near', () => {
  it('the floating note is born in the container margin, to the right of the screen', async () => {
    const result = await plan(build);
    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(result.changes).toMatchObject({
      markings: { created: 2 },
      arrows: { created: 1 },
    });
    expect(result.created.map((c) => c.kind)).toEqual(
      expect.arrayContaining(['container', 'marking', 'arrow']),
    );
  });

  it('in an applied proposal: the note is floating, outside the container, and the arrow links the two', async () => {
    const proposed = await propose(mcp, project, build);
    expect(proposed.valid).toBe(true);
    const saved = acceptAllAndApply(dir, proposed.proposal.id);
    const nota = saved.markings.find((m) => m.name === 'Button note');
    const tela = saved.containers[0]!;
    expect(nota).toMatchObject({ floating: true, containerId: null });
    // To the right of the container (24-unit margin), at the height of the marking.
    const width = tela.width * tela.placement.scale;
    expect(nota!.rect.x).toBe(tela.placement.x + width + 24);
    expect(nota!.rect.y).toBe(tela.placement.y + 10 * tela.placement.scale);
    expect(saved.arrows).toHaveLength(1);
    expect(saved.arrows[0]).toMatchObject({ style: 'elbow', points: [] });
    expect(readProject(dir).arrows).toHaveLength(1);
  });

  it('near with a nonexistent reference fails with not-found', async () => {
    const result = await plan([
      {
        op: 'create_marking',
        as: '$outra',
        near: 'm/00000000',
        annotation: { type: 'notas/nota' },
      },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]?.code).toBe('not-found');
  });

  it('near on a non-floating marking is ignored with a warning', async () => {
    const result = await plan([
      {
        op: 'create_marking',
        container: readProject(dir).containers[0]!.id,
        near: readProject(dir).markings[0]!.id,
        rect: { x: 200, y: 200, width: 50, height: 50 },
      },
    ]);
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'ignored-argument', op: 0 }),
    ]);
  });
});

describe('arrow read, annotated and refused where it does not fit', () => {
  let arrowRef: string;
  let buttonRef: string;

  it('get_marking of the marking lists the arrows leaving and arriving, with the other end', async () => {
    const saved = readProject(dir);
    const botao = saved.markings.find((m) => m.name === 'Button')!;
    const nota = saved.markings.find((m) => m.floating)!;
    const button = ok(
      await mcp.call<MarkingData>('get_marking', { project, ref: botao.id }),
    );
    buttonRef = button.ref;
    expect(button.arrows?.outgoing).toHaveLength(1);
    expect(button.arrows?.incoming).toEqual([]);
    const out = button.arrows!.outgoing[0]!;
    arrowRef = out.ref;
    expect(out).toMatchObject({ style: 'elbow', name: null, locked: false });
    expect(out.to?.name).toBe('Button note');
    expect(out.to?.path.at(0)).toBe('Canvas');

    const note = ok(
      await mcp.call<MarkingData>('get_marking', { project, ref: nota.id }),
    );
    expect(note.arrows?.incoming).toHaveLength(1);
    expect(note.arrows?.incoming[0]?.from?.name).toBe('Button');
  });

  it('get_marking with the arrow reference returns kind arrow, endpoints and style', async () => {
    const arrow = ok(
      await mcp.call<MarkingData>('get_marking', { project, ref: arrowRef }),
    );
    expect(arrow).toMatchObject({ kind: 'arrow', style: 'elbow' });
    expect(arrow.from?.name).toBe('Button');
    expect(arrow.to?.name).toBe('Button note');
    expect(arrow).not.toHaveProperty('points');
  });

  it('create_annotation accepts the arrow as a marking and the annotation shows up in get_marking', async () => {
    const operations = [
      {
        op: 'create_annotation',
        marking: arrowRef,
        layer: 'Camada 1',
        name: 'On tap',
        entries: [{ key: 'evento', value: 'click' }],
      },
    ];
    const result = await plan(operations);
    expect(result.errors).toBeUndefined();
    const proposed = await propose(mcp, project, operations);
    const saved = acceptAllAndApply(dir, proposed.proposal.id);
    expect(saved.annotations.some((a) => a.markingId === saved.arrows[0]!.id)).toBe(true);
    const arrow = ok(
      await mcp.call<MarkingData>('get_marking', { project, ref: arrowRef }),
    );
    expect(arrow.layers[0]?.annotations.map((a) => a.name)).toEqual(['On tap']);
  });

  it('create_annotation with a marking-only type on the arrow fails with type-not-applicable and a hint', async () => {
    const result = await plan([
      { op: 'create_annotation', marking: arrowRef, type: 'notas/nota' },
    ]);
    expect(result.valid).toBe(false);
    const error = result.errors?.[0] as unknown as Record<string, unknown>;
    expect(error.code).toBe('type-not-applicable');
    expect(String(error.hint)).toContain('appliesTo');
  });

  it('update_marking and delete_marking with the id of an arrow point to update_arrow and delete_arrow', async () => {
    const update = await plan([{ op: 'update_marking', marking: arrowRef, name: 'x' }]);
    const updateError = update.errors?.[0] as unknown as Record<string, unknown>;
    expect(updateError.code).toBe('wrong-kind');
    expect(String(updateError.hint)).toContain('update_arrow');
    const del = await plan([{ op: 'delete_marking', marking: arrowRef }]);
    const delError = del.errors?.[0] as unknown as Record<string, unknown>;
    expect(delError.code).toBe('wrong-kind');
    expect(String(delError.hint)).toContain('delete_arrow');
  });

  it('get_marking_image refuses the arrow with the arrow error and a hint', async () => {
    const error = errorOf(
      await mcp.call('get_marking_image', { project, ref: arrowRef }),
    );
    expect(error.code).toBe('arrow');
    expect(String(error.hint)).toContain('get_marking');
  });

  it('create_arrow and update_arrow refuse points', async () => {
    const created = await plan([
      { op: 'create_arrow', from: buttonRef, to: arrowRef, points: [{ x: 1, y: 2 }] },
      { op: 'update_arrow', arrow: arrowRef, points: [] },
    ]);
    expect(created.valid).toBe(false);
    expect(created.errors?.map((e) => e.code)).toEqual([
      'invalid-arguments',
      'invalid-arguments',
    ]);
  });

  it('arrow as an arrow endpoint: arrow-endpoint; same endpoint: arrow-self', async () => {
    const result = await plan([
      { op: 'create_arrow', from: buttonRef, to: arrowRef },
      { op: 'create_arrow', from: buttonRef, to: buttonRef },
    ]);
    expect(result.errors?.map((e) => e.code)).toEqual(['arrow-endpoint', 'arrow-self']);
  });
});

describe('update_arrow and delete_arrow', () => {
  it('update of an existing arrow works in the preview and warns that the proposal does not carry it', async () => {
    const arrow = readProject(dir).arrows[0]!;
    const result = await plan([
      { op: 'update_arrow', arrow: arrow.id, name: 'explains', style: 'straight' },
    ]);
    expect(result.valid).toBe(true);
    expect(result.summary[0]).toContain('style straight');
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'ignored-argument', op: 0 }),
    ]);
  });

  it('update on an arrow created in the same batch is valid: the creation carries name, style and lock', async () => {
    const saved = readProject(dir);
    const [botao, nota] = [
      saved.markings.find((m) => m.name === 'Button')!,
      saved.markings.find((m) => m.floating)!,
    ];
    const operations = [
      { op: 'create_arrow', as: '$s2', from: nota.id, to: botao.id },
      {
        op: 'update_arrow',
        arrow: '$s2',
        name: 'back',
        style: 'straight',
        locked: true,
      },
    ];
    const result = await plan(operations);
    expect(result.warnings).toBeUndefined();
    const proposed = await propose(mcp, project, operations);
    const after = acceptAllAndApply(dir, proposed.proposal.id);
    const created = after.arrows.find((a) => a.name === 'back');
    expect(created).toMatchObject({ style: 'straight', locked: true, points: [] });
  });

  it('delete_arrow: a locked one is refused (locked); an unlocked one goes away with its annotations', async () => {
    const saved = readProject(dir);
    const locked = saved.arrows.find((a) => a.locked)!;
    const refused = await plan([{ op: 'delete_arrow', arrow: locked.id }]);
    expect(refused.errors?.[0]?.code).toBe('locked');

    const free = saved.arrows.find((a) => !a.locked)!;
    const operations = [{ op: 'delete_arrow', arrow: free.id }];
    const result = await plan(operations);
    expect(result.changes).toMatchObject({ arrows: { deleted: 1 } });
    const proposed = await propose(mcp, project, operations);
    const after = acceptAllAndApply(dir, proposed.proposal.id);
    expect(after.arrows.map((a) => a.id)).toEqual([locked.id]);
    expect(after.annotations.some((a) => a.markingId === free.id)).toBe(false);
  });

  it('delete_arrow on a marking (not an arrow) fails with wrong-kind', async () => {
    const botao = readProject(dir).markings.find((m) => m.name === 'Button')!;
    const result = await plan([{ op: 'delete_arrow', arrow: botao.id }]);
    expect(result.errors?.[0]?.code).toBe('wrong-kind');
  });
});
