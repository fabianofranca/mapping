import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Project } from '../../src/model';
import { acceptAllAndApply, ok, propose, readProject } from './proposalSupport';
import { codeOf, connect, type Connection } from './workspace';

// Stage #2210 (UN1): a component marking that the settle moves between spaces keeps its size in
// units. Through the batch: a Text created on the canvas over a density-2 container enters it with
// twice the size, and `floating: true` takes it back to the canvas at half.

interface MembershipEntry {
  kind: 'marking' | 'container';
  name: string | null;
  from: { parent: string | null; container: string | null };
  to: { parent: string | null; container: string | null };
}
interface Plan {
  valid: boolean;
  errors?: { index: number; op: string; code: string; message: string }[];
  warnings?: { code: string; op: number; message: string }[];
  membership?: MembershipEntry[];
}
interface MarkingData {
  ref: string;
  space: string;
  floating: boolean;
  rect: { x: number; y: number; width: number; height: number };
}

const project = 'settle-units';
let root: string;
let mcp: Connection;
let dir: string;

const plan = async (operations: unknown[]) =>
  ok(await mcp.call<Plan>('plan_changes', { project, operations }));

const byName = (p: Project, name: string) => p.markings.find((m) => m.name === name)!;
const read = async (id: string) =>
  ok(await mcp.call<MarkingData>('get_marking', { project, ref: id }));

/** The container `Screen` (400 × 300, density 2) sits at the canvas origin with scale 1. */
beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-settle-units-'));
  mcp = await connect([root]);
  ok(await mcp.call('create_project', { path: `projetos/${project}`, name: project }));
  dir = join(root, 'projetos', project);
  const base = await propose(mcp, project, [
    {
      op: 'add_container',
      name: 'Screen',
      width: 400,
      height: 300,
      background: '#FFFFFF',
      density: 2,
    },
    { op: 'update_container', container: 'Screen', x: 0, y: 0, scale: 1 },
  ]);
  expect(base.valid, JSON.stringify(base.errors)).toBe(true);
  acceptAllAndApply(dir, base.proposal.id);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

const createText = (): unknown[] => [
  {
    op: 'create_marking',
    rect: { x: 20, y: 20, width: 80, height: 20 },
    annotation: { type: 'notas/texto', values: { texto: 'Label' } },
    name: 'Label',
  },
];

describe('a Text over a density-2 container', () => {
  it('plan_changes accepts the canvas Text over the container', async () => {
    const result = await plan(createText());
    expect(result.errors, JSON.stringify(result.errors)).toBeUndefined();
    expect(result.valid).toBe(true);
  });

  it('once applied, the marking is in the container with twice the size, and the read shows it', async () => {
    const before = readProject(dir);
    const proposed = await propose(mcp, project, createText());
    expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
    const after = acceptAllAndApply(dir, proposed.proposal.id);
    const label = byName(after, 'Label');
    expect(label.containerId).toBe(before.containers[0]!.id);
    expect(label.floating ?? false).toBe(false);
    expect(label.rect).toMatchObject({ x: 20, y: 20, width: 160, height: 40 });
    const data = await read(label.id);
    expect(data.space).toBe('container');
    expect(data.rect).toMatchObject({ width: 160, height: 40 });
  });

  it('floating: true halves it on the canvas, with the same top-left corner on screen', async () => {
    const p = readProject(dir);
    const label = byName(p, 'Label');
    const operations = [{ op: 'update_marking', marking: label.id, floating: true }];
    const result = await plan(operations);
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
    const proposed = await propose(mcp, project, operations);
    expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
    const after = acceptAllAndApply(dir, proposed.proposal.id);
    const floated = byName(after, 'Label');
    expect(floated.containerId).toBeNull();
    expect(floated.floating).toBe(true);
    expect(floated.rect).toMatchObject({ x: 20, y: 20, width: 80, height: 20 });
    const data = await read(label.id);
    expect(data).toMatchObject({ space: 'canvas', floating: true });
    expect(data.rect).toMatchObject({ width: 80, height: 20 });
    expect(data.ref).toContain(codeOf(label.id));
  });

  it('floating: false takes it back in: `membership` lists the move and the rect is doubled again', async () => {
    const p = readProject(dir);
    const label = byName(p, 'Label');
    const operations = [{ op: 'update_marking', marking: label.id, floating: false }];
    const result = await plan(operations);
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
    expect(result.membership).toHaveLength(1);
    const [entry] = result.membership!;
    expect(entry!.name).toBe('Label');
    expect(entry!.from.container).toBeNull();
    expect(entry!.to.container).toContain(
      p.containers[0]!.id.replaceAll('-', '').slice(0, 8),
    );
    const proposed = await propose(mcp, project, operations);
    expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
    const after = acceptAllAndApply(dir, proposed.proposal.id);
    expect(byName(after, 'Label')).toMatchObject({
      containerId: p.containers[0]!.id,
      rect: { x: 20, y: 20, width: 160, height: 40 },
    });
    expect((await read(label.id)).rect).toMatchObject({ width: 160, height: 40 });
  });
});
