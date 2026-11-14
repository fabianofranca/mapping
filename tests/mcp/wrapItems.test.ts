import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { wrapItems, type Project } from '../../src/model';
import {
  acceptAllAndApply,
  hashOf,
  ok,
  propose,
  readProject,
  readProposal,
} from './proposalSupport';
import { connect, type Connection } from './workspace';

// The MCP `wrap_items` operation (Wrap stage, EV2): the batch applies the model `wrapItems`
// (no rule of its own), with optional alias, name and source, warnings for ignored note and
// arrow items and a clear error when nothing goes in. The review shows the same as a `create_marking`.

interface Plan {
  valid: boolean;
  errors?: { index: number; op: string; code: string; message: string }[];
  warnings?: { code: string; op: number; message: string }[];
  summary: string[];
  changes: Record<string, { created: number; updated: number; deleted: number }>;
  created?: { op: number; alias?: string; kind: string; id?: string }[];
}

let root: string;
let mcp: Connection;
let dir: string;
const project = 'wrap';

const plan = async (operations: unknown[]) =>
  ok(await mcp.call<Plan>('plan_changes', { project, operations }));

const byName = (p: Project, name: string) => p.markings.find((m) => m.name === name)!;
const containerByName = (p: Project, name: string) =>
  p.containers.find((c) => c.name === name)!;

/** The marking that the new project has and the previous one did not (the response brings only the reference). */
const created = (before: Project, after: Project) =>
  after.markings.find((m) => !before.markings.some((b) => b.id === m.id))!;

/**
 * The project without what varies between one run and another (revision and date): the id of the new
 * marking becomes `NEW`. The order of each list is kept: the applied one has the same order as the
 * app `wrapItems` (the formatVersion 4 proposal carries the position of the created one).
 */
const shape = (p: Project, newId: string) => {
  const normalized = (list: readonly unknown[]) =>
    list.map((x) =>
      JSON.stringify(
        Object.entries(x as object).sort(([a], [b]) => a.localeCompare(b)),
      ).replaceAll(newId, 'NEW'),
    );
  return {
    containers: normalized(p.containers),
    markings: normalized(p.markings),
    arrows: normalized(p.arrows),
    annotations: normalized(p.annotations),
  };
};

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-wrap-'));
  mcp = await connect([root]);
  ok(await mcp.call('create_project', { path: `projetos/${project}`, name: project }));
  dir = join(root, 'projetos', project);
  const base = await propose(mcp, project, [
    {
      op: 'add_container',
      as: '$home',
      name: 'Home',
      width: 300,
      height: 200,
      background: '#FFFFFF',
    },
    { op: 'add_container', name: 'Screen', width: 300, height: 200, background: '#FFFFFF' },
    {
      op: 'create_marking',
      as: '$a',
      container: 'Home',
      rect: { x: 50, y: 50, width: 40, height: 30 },
      name: 'A',
    },
    {
      op: 'create_marking',
      as: '$b',
      container: 'Home',
      rect: { x: 120, y: 60, width: 40, height: 30 },
      name: 'B',
    },
    {
      op: 'create_marking',
      container: 'Home',
      rect: { x: 200, y: 100, width: 30, height: 30 },
      name: 'C',
    },
    {
      op: 'create_marking',
      near: '$home',
      annotation: { type: 'notas/nota' },
      name: 'N',
    },
    { op: 'create_arrow', from: '$a', to: '$b', name: 'S' },
  ]);
  expect(base.valid, JSON.stringify(base.errors)).toBe(true);
  acceptAllAndApply(dir, base.proposal.id);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

describe('wrap_items: creation', () => {
  it('around two containers: canvas marking with an 8 px margin and the two children', async () => {
    const before = readProject(dir);
    const items = [
      containerByName(before, 'Home').id,
      containerByName(before, 'Screen').id,
    ];
    const proposed = await propose(mcp, project, [{ op: 'wrap_items', items }]);
    expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
    const after = acceptAllAndApply(dir, proposed.proposal.id);
    const id = created(before, after).id;
    const wrapper = after.markings.find((m) => m.id === id)!;
    expect(wrapper.containerId).toBeNull();
    expect(wrapper.name).toBeNull();
    for (const container of items) {
      expect(after.containers.find((c) => c.id === container)!.parentId).toBe(id);
    }
    // Margin: the rectangle is the same as the model's, which gives 8 px around the set.
    const expected = wrapItems(
      before,
      { id, items: items.map((i) => ({ kind: 'image' as const, id: i })) },
      { settle: true },
    );
    expect(wrapper.rect).toEqual(expected.markings.find((m) => m.id === id)!.rect);
    const first = containerByName(before, 'Home');
    expect(wrapper.rect.x).toBe(first.placement.x - 8);
    expect(wrapper.rect.y).toBe(first.placement.y - 8);
  });

  it('with markings of the same container: the new one belongs to that container, with an 8 px margin', async () => {
    const before = readProject(dir);
    const a = byName(before, 'A');
    const b = byName(before, 'B');
    const result = await plan([{ op: 'wrap_items', items: [a.id, b.id] }]);
    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(result.changes.markings?.created).toBe(1);
    const proposed = await propose(mcp, project, [
      { op: 'wrap_items', items: [a.id, b.id] },
    ]);
    const after = acceptAllAndApply(dir, proposed.proposal.id);
    const id = created(before, after).id;
    const wrapper = after.markings.find((m) => m.id === id)!;
    expect(wrapper.containerId).toBe(a.containerId);
    expect(wrapper.rect).toEqual({ x: 42, y: 42, width: 126, height: 56 });
    expect(after.markings.find((m) => m.id === a.id)!.parentId).toBe(id);
    expect(after.markings.find((m) => m.id === b.id)!.parentId).toBe(id);
  });

  it('as gives the new one an alias (cited in the next operation); name and source end up on it', async () => {
    const before = readProject(dir);
    const items = [byName(before, 'A').id, byName(before, 'C').id];
    const proposed = await propose(mcp, project, [
      {
        op: 'wrap_items',
        as: '$group',
        items,
        name: 'Group',
        source: { system: 'figma', id: '1:2' },
      },
      { op: 'create_annotation', marking: '$group', type: 'notas/nota' },
    ]);
    expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
    expect(proposed.created.find((c) => c.alias === '$group')?.kind).toBe('marking');
    const after = acceptAllAndApply(dir, proposed.proposal.id);
    const wrapper = created(before, after);
    expect(wrapper.name).toBe('Group');
    expect(wrapper.source).toMatchObject({ system: 'figma', id: '1:2' });
    expect(after.annotations.some((n) => n.markingId === wrapper.id)).toBe(true);
  });

  it('the result is that of the model wrapItems, with no rule of the MCP itself', async () => {
    const before = readProject(dir);
    const items = [byName(before, 'B').id, byName(before, 'C').id];
    const proposed = await propose(mcp, project, [{ op: 'wrap_items', items }]);
    const after = acceptAllAndApply(dir, proposed.proposal.id);
    const id = created(before, after).id;
    const expected = wrapItems(
      before,
      { id, items: items.map((i) => ({ kind: 'marking' as const, id: i })) },
      { settle: true },
    );
    expect(shape(after, id)).toEqual(shape(expected, id));
  });
});

describe('wrap_items: noise in the placement', () => {
  it('the floating-point noise from the drag does not remove the 8 px margin', async () => {
    const name = 'ruido';
    ok(await mcp.call('create_project', { path: `projetos/${name}`, name }));
    const noisyDir = join(root, 'projetos', name);
    const base = await propose(mcp, name, [
      { op: 'add_container', name: 'One', width: 300, height: 200, background: '#FFFFFF' },
    ]);
    expect(base.valid, JSON.stringify(base.errors)).toBe(true);
    acceptAllAndApply(noisyDir, base.proposal.id);
    // The back-and-forth drag left noise on disk (the round report: -2.27e-13).
    const file = join(noisyDir, 'mapping.json');
    const onDisk = JSON.parse(readFileSync(file, 'utf8')) as Project;
    const noisy: Project = {
      ...onDisk,
      containers: onDisk.containers.map((c, i) =>
        i === 0 ? { ...c, placement: { x: -2.2737367544323206e-13, y: 0, scale: 1 } } : c,
      ),
    };
    writeFileSync(file, JSON.stringify(noisy, null, 2));

    const before = readProject(noisyDir);
    const items = [before.containers[0]!.id];
    const proposed = await propose(mcp, name, [{ op: 'wrap_items', items }]);
    expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
    const after = acceptAllAndApply(noisyDir, proposed.proposal.id);
    const wrapper = created(before, after);
    expect(wrapper.rect).toEqual({ x: -8, y: -8, width: 316, height: 216 });
  });
});

describe('wrap_items: rectangle tie', () => {
  const tieProject = 'wrap-tie';
  let tieDir: string;

  beforeAll(async () => {
    ok(
      await mcp.call('create_project', {
        path: `projetos/${tieProject}`,
        name: tieProject,
      }),
    );
    tieDir = join(root, 'projetos', tieProject);
    const base = await propose(mcp, tieProject, [
      {
        op: 'add_container',
        name: 'Full',
        width: 300,
        height: 200,
        background: '#FFFFFF',
      },
      {
        op: 'create_marking',
        container: 'Full',
        rect: { x: 0, y: 0, width: 300, height: 200 },
        name: 'A',
      },
      {
        op: 'create_marking',
        container: 'Full',
        rect: { x: 50, y: 50, width: 40, height: 30 },
        name: 'B',
      },
      {
        op: 'create_marking',
        container: 'Full',
        rect: { x: 100, y: 100, width: 40, height: 30 },
        name: 'D',
      },
    ]);
    expect(base.valid, JSON.stringify(base.errors)).toBe(true);
    acceptAllAndApply(tieDir, base.proposal.id);
  });

  const parentOf = (p: Project, id: string) =>
    p.markings.find((m) => m.id === id)!.parentId;

  it('item that fills the container: the new one gets its rectangle and, when applied, the hierarchy and the order are those of the model', async () => {
    const before = readProject(tieDir);
    const a = byName(before, 'A');
    const b = byName(before, 'B');
    expect(parentOf(before, b.id)).toBe(a.id);

    const proposed = await propose(mcp, tieProject, [
      { op: 'wrap_items', items: [a.id] },
    ]);
    expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
    const after = acceptAllAndApply(tieDir, proposed.proposal.id);
    const id = created(before, after).id;
    const wrapper = after.markings.find((m) => m.id === id)!;
    // No margin to grow: the new rectangle is A's (the 8 px crop).
    expect(wrapper.rect).toEqual(a.rect);

    // The app Wrap (and the plan) puts the new one BEFORE A: it is the parent of A, and A of B.
    const model = wrapItems(
      before,
      { id, items: [{ kind: 'marking', id: a.id }] },
      { settle: true },
    );
    expect(parentOf(model, a.id)).toBe(id);
    expect(parentOf(model, b.id)).toBe(a.id);

    // Once applied, the formatVersion 4 proposal takes the new one to the same place in the array: the
    // hierarchy and order are the model's (the new one without a parent, A its child, B a child of A).
    expect(parentOf(after, id)).toBeNull();
    expect(parentOf(after, a.id)).toBe(id);
    expect(parentOf(after, b.id)).toBe(a.id);
    expect(after.markings.map((m) => m.id)).toEqual(model.markings.map((m) => m.id));
    expect(shape(after, id)).toEqual(shape(model, id));
  });

  it('without a tie (the rectangle grows), the applied hierarchy is that of the model', async () => {
    const before = readProject(tieDir);
    const b = byName(before, 'B');
    const d = byName(before, 'D');
    const proposed = await propose(mcp, tieProject, [
      { op: 'wrap_items', items: [b.id, d.id] },
    ]);
    expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
    const after = acceptAllAndApply(tieDir, proposed.proposal.id);
    const id = created(before, after).id;
    expect(after.markings.find((m) => m.id === id)!.rect).not.toEqual(b.rect);
    const model = wrapItems(
      before,
      {
        id,
        items: [
          { kind: 'marking', id: b.id },
          { kind: 'marking', id: d.id },
        ],
      },
      { settle: true },
    );
    for (const m of model.markings) {
      expect(parentOf(after, m.id), m.name ?? m.id).toBe(m.parentId);
    }
  });
});

describe('wrap_items: warnings and errors', () => {
  it('a note and an arrow in the list are ignored with a warning', async () => {
    const p = readProject(dir);
    const items = [
      byName(p, 'A').id,
      byName(p, 'B').id,
      byName(p, 'N').id,
      p.arrows[0]!.id,
    ];
    const result = await plan([{ op: 'wrap_items', items }]);
    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(result.warnings?.[0]).toMatchObject({ code: 'ignored-argument', op: 0 });
  });

  it('only a note and an arrow: clear error and nothing proposed', async () => {
    const p = readProject(dir);
    const items = [byName(p, 'N').id, p.arrows[0]!.id];
    const hash = hashOf(join(dir, 'mapping.json'));
    const result = await plan([{ op: 'wrap_items', items }]);
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toMatchObject({
      op: 'wrap_items',
      code: 'invalid-parent',
    });
    expect(JSON.stringify(result.errors?.[0])).toMatch(/notes|arrows|floating/i);
    const proposed = await propose(mcp, project, [{ op: 'wrap_items', items }]);
    expect(proposed.valid).toBe(false);
    expect(proposed.proposed).not.toBe(true);
    expect(hashOf(join(dir, 'mapping.json'))).toBe(hash);
  });

  it('missing item: the usual error of the other operations', async () => {
    const missing = await plan([{ op: 'wrap_items', items: ['m/deadbeef'] }]);
    const other = await plan([
      { op: 'update_marking', marking: 'm/deadbeef', name: 'x' },
    ]);
    expect(missing.errors?.[0]?.code).toBe(other.errors?.[0]?.code);
    expect(missing.errors?.[0]?.code).toBe('not-found');
  });

  it('empty list is refused by the schema', async () => {
    const result = await mcp.client.callTool({
      name: 'plan_changes',
      arguments: { project, operations: [{ op: 'wrap_items', items: [] }] },
    });
    expect(result.isError).toBe(true);
  });
});

describe('wrap_items: plan and review', () => {
  it('plan_changes describes the operation and does not write', async () => {
    const p = readProject(dir);
    const hash = hashOf(join(dir, 'mapping.json'));
    const result = await plan([
      { op: 'wrap_items', items: [byName(p, 'A').id, byName(p, 'B').id] },
    ]);
    expect(result.summary.join('\n')).toMatch(/Wrap 2 items/);
    expect(hashOf(join(dir, 'mapping.json'))).toBe(hash);
  });

  it('the review shows the same as a create_marking with the same rectangle', async () => {
    const p = readProject(dir);
    const items = [byName(p, 'A').id, byName(p, 'C').id];
    const wrapped = await propose(mcp, project, [{ op: 'wrap_items', items }]);
    const wrapProposal = readProposal(dir, wrapped.proposal.id);
    const made = wrapProposal.changes.find(
      (c) => c.entity === 'marking' && c.kind === 'create',
    )!;
    const rect = (made.to as { rect: unknown }).rect;
    const marked = await propose(mcp, project, [
      { op: 'create_marking', container: 'Home', rect },
    ]);
    const markProposal = readProposal(dir, marked.proposal.id);
    const markId = markProposal.changes.find(
      (c) => c.entity === 'marking' && c.kind === 'create',
    )!.entityId;
    expect(wrapped.reviewChanges).toEqual(marked.reviewChanges);
    expect(wrapped.levels).toEqual(marked.levels);
    expect(wrapped.changes).toEqual(marked.changes);
    // The changes are the same, apart from the id of the new one, the id of each change and the position
    // of the created one: the wrap puts it before the first wrapped item (`insertBefore`), and the
    // create_marking, at the end (without the field).
    expect(made.insertBefore).toBe(p.markings.find((m) => items.includes(m.id))!.id);
    expect(
      markProposal.changes.find((c) => c.entity === 'marking' && c.kind === 'create')!
        .insertBefore,
    ).toBeUndefined();
    const norm = (proposal: typeof wrapProposal, id: string) =>
      proposal.changes
        .map((c) => ({ ...c, id: undefined, insertBefore: undefined }))
        .map((c) => JSON.stringify(c).replaceAll(id, 'NEW'))
        .sort();
    expect(norm(wrapProposal, made.entityId)).toEqual(norm(markProposal, markId));
  });
});
