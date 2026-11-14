import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Project } from '../../src/model';
import { acceptAllAndApply, ok, propose, readProject } from './proposalSupport';
import { codeOf, connect, type Connection } from './workspace';

// Batch replies (stage #467, PF2): a `move_marking` that changes nothing says so, and the
// result of `plan_changes` and `propose_changes` lists in `membership` whoever changed parent or
// space through geometry (the R9.15 case of `docs/TESTING.md`).

interface Place {
  parent: string | null;
  container: string | null;
}
interface MembershipEntry {
  kind: 'marking' | 'container';
  ref: string;
  name: string | null;
  from: Place;
  to: Place;
  message: string;
}
interface Plan {
  valid: boolean;
  errors?: { index: number; op: string; code: string; message: string }[];
  summary: string[];
  membership?: MembershipEntry[];
  created?: { op: number; alias?: string; kind: string; ref?: string }[];
}

let root: string;
let mcp: Connection;
let dir: string;
const project = 'membership';

const plan = async (operations: unknown[]) =>
  ok(await mcp.call<Plan>('plan_changes', { project, operations }));

const byName = (p: Project, name: string) => p.markings.find((m) => m.name === name)!;

/** Container Details with Top (0, 0, 360×432) and Button (20, 380, 100×40) inside it. */
beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-membership-'));
  mcp = await connect([root]);
  ok(await mcp.call('create_project', { path: `projetos/${project}`, name: project }));
  dir = join(root, 'projetos', project);
  const base = await propose(mcp, project, [
    {
      op: 'add_container',
      name: 'Details',
      width: 400,
      height: 500,
      background: '#FFFFFF',
    },
    {
      op: 'create_marking',
      container: 'Details',
      rect: { x: 0, y: 0, width: 360, height: 432 },
      name: 'Top',
    },
    {
      op: 'create_marking',
      container: 'Details',
      rect: { x: 20, y: 380, width: 100, height: 40 },
      name: 'Button',
    },
  ]);
  expect(base.valid, JSON.stringify(base.errors)).toBe(true);
  acceptAllAndApply(dir, base.proposal.id);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

/** The R9.15 request: the Button moves down 40 (leaves the Top) and the Top goes to index 0. */
const buttonLeaves = (p: Project) => [
  {
    op: 'update_marking',
    marking: byName(p, 'Button').id,
    rect: { x: 20, y: 420, width: 100, height: 40 },
  },
  { op: 'move_marking', marking: byName(p, 'Top').id, index: 0 },
];

describe('move_marking with no effect', () => {
  it('says the marking is already in position and nothing changes', async () => {
    const result = await plan(buttonLeaves(readProject(dir)));
    expect(result.valid).toBe(true);
    expect(result.summary[1]).toContain('already at position 0 among its 2 siblings');
    expect(result.summary[1]).toContain('nothing changes');
    expect(result.summary[1]).not.toContain('Move');
  });

  it('what changes the order keeps the usual description', async () => {
    const p = readProject(dir);
    const result = await plan([
      buttonLeaves(p)[0],
      { op: 'move_marking', marking: byName(p, 'Button').id, index: 0 },
    ]);
    expect(result.summary[1]).toContain('Move the marking');
    expect(result.summary[1]).toContain('to position 0 among its 2 siblings');
  });
});

describe('membership', () => {
  it('plan_changes lists the Button, which leaves the Top and sits directly in the Details', async () => {
    const p = readProject(dir);
    const result = await plan(buttonLeaves(p));
    expect(result.membership).toHaveLength(1);
    const [entry] = result.membership!;
    expect(entry!.kind).toBe('marking');
    expect(entry!.name).toBe('Button');
    expect(entry!.ref).toContain(codeOf(byName(p, 'Button').id));
    expect(entry!.from.parent).toContain(codeOf(byName(p, 'Top').id));
    expect(entry!.to.parent).toBeNull();
    expect(entry!.to.container).toBe(entry!.from.container);
    expect(entry!.to.container).toContain(
      p.containers[0]!.id.replaceAll('-', '').slice(0, 8),
    );
    expect(entry!.message).toBe('Button leaves Top; now directly in Details');
  });

  it('propose_changes returns the same, and the applied result matches the `to`', async () => {
    const before = readProject(dir);
    const planned = await plan(buttonLeaves(before));
    const proposed = await propose(mcp, project, buttonLeaves(before));
    expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
    const { membership } = proposed as unknown as Plan;
    expect(membership).toHaveLength(1);
    expect(membership![0]!.message).toBe('Button leaves Top; now directly in Details');
    expect(membership).toEqual(planned.membership);
    const after = acceptAllAndApply(dir, proposed.proposal.id);
    const button = byName(after, 'Button');
    expect(button.parentId).toBeNull();
    expect(button.containerId).toBe(before.containers[0]!.id);
  });

  it('a batch without a membership change does not carry the field', async () => {
    const p = readProject(dir);
    const result = await plan([
      { op: 'update_marking', marking: byName(p, 'Top').id, name: 'Top 2' },
    ]);
    expect(result.valid).toBe(true);
    expect(result).not.toHaveProperty('membership');
  });

  it('wrap_items lists both items, with the created one (by alias) as the new parent', async () => {
    const p = readProject(dir);
    const items = [byName(p, 'Top').id, byName(p, 'Button').id];
    const result = await plan([{ op: 'wrap_items', as: '$grupo', items, name: 'Grupo' }]);
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
    const grupo = result.created!.find((c) => c.alias === '$grupo')!;
    const entries = result.membership!;
    expect(entries.map((e) => e.name).sort()).toEqual(['Button', 'Top']);
    for (const entry of entries) {
      expect(entry.to.parent).toBe(grupo.ref);
      expect(entry.message).toContain('Grupo');
    }
  });
});

describe('membership on a rectangle tie', () => {
  it('the marking that fills the container ends up inside the created one, and the list matches what was applied', async () => {
    const seed = await propose(mcp, project, [
      {
        op: 'add_container',
        name: 'Full',
        width: 200,
        height: 200,
        background: '#FFFFFF',
      },
      {
        op: 'create_marking',
        container: 'Full',
        rect: { x: 0, y: 0, width: 200, height: 200 },
        name: 'Everything',
      },
    ]);
    expect(seed.valid, JSON.stringify(seed.errors)).toBe(true);
    const before = acceptAllAndApply(dir, seed.proposal.id);
    const everything = byName(before, 'Everything');
    const operations = [
      { op: 'wrap_items', as: '$g', items: [everything.id], name: 'Wrapper' },
    ];
    const planned = await plan(operations);
    const proposed = await propose(mcp, project, operations);
    expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
    const { membership } = proposed as unknown as Plan;
    expect(membership).toHaveLength(1);
    expect(planned.membership).toHaveLength(1);
    // The created one's id changes with every computation; the rest of the entry is the same.
    expect({ ...membership![0]!, to: null, ref: null }).toEqual({
      ...planned.membership![0]!,
      to: null,
      ref: null,
    });
    const after = acceptAllAndApply(dir, proposed.proposal.id);
    const wrapper = byName(after, 'Wrapper');
    expect(byName(after, 'Everything').parentId).toBe(wrapper.id);
    expect(membership![0]!.to.parent).toContain(codeOf(wrapper.id));
    expect(membership![0]!.message).toBe('Everything enters Wrapper');
  });
});
