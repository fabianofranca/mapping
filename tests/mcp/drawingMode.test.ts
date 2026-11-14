import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PROPOSAL_DRAWING_MODE_FORMAT_VERSION,
  PROPOSAL_FORMAT_VERSION,
} from '../../src/model';
import {
  acceptAllAndApply,
  ok,
  propose,
  readProject,
  readProposal,
} from './proposalSupport';
import { connect, type Connection } from './workspace';

// Phase CF6 (schema v18): the drawing mode in the MCP. `update_project` pins or removes the project's
// mode; `add_container` and `update_container` pin the container's (`null` goes back to following the
// project's); `get_project`, `get_container` and `list_markings` return the mode (effective in the last
// two).

let root: string;
let mcp: Connection;
let counter = 0;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-drawing-mode-'));
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

async function newProject(): Promise<{ name: string; dir: string }> {
  const name = `modo-${++counter}`;
  ok(await mcp.call('create_project', { path: `projetos/${name}`, name }));
  return { name, dir: join(root, 'projetos', name) };
}

/** Applies the batch through the proposal (accepts everything) and returns the saved project. */
async function apply(name: string, dir: string, operations: unknown[]) {
  const proposed = await propose(mcp, name, operations);
  return { proposed, saved: acceptAllAndApply(dir, proposed.proposal.id) };
}

const box = {
  op: 'add_container',
  as: '$c',
  width: 100,
  height: 80,
  background: '#FFFFFF',
};

describe("update_project: the project's drawing mode", () => {
  it('writes the mode, it shows up in proposal.json and in get_project; null removes it', async () => {
    const { name, dir } = await newProject();
    const { proposed, saved } = await apply(name, dir, [
      { op: 'update_project', drawingMode: 'dark' },
    ]);
    expect(saved.drawingMode).toBe('dark');
    const proposal = readProposal(dir, proposed.proposal.id);
    expect(JSON.stringify(proposal.changes)).toContain('drawingMode');
    expect(ok(await mcp.call('get_project', { project: name })).drawingMode).toBe('dark');

    const cleared = await apply(name, dir, [{ op: 'update_project', drawingMode: null }]);
    expect(cleared.saved.drawingMode).toBeUndefined();
    expect(ok(await mcp.call('get_project', { project: name })).drawingMode).toBeNull();
  });

  it('an absent key changes nothing; a wrong type is invalid-arguments; an invalid name is invalid-name', async () => {
    const { name, dir } = await newProject();
    await apply(name, dir, [{ op: 'update_project', drawingMode: 'dark' }]);
    const plan = ok(
      await mcp.call<{ valid: boolean }>('plan_changes', {
        project: name,
        operations: [{ op: 'update_project' }],
      }),
    );
    expect(plan.valid).toBe(true);
    expect(readProject(dir).drawingMode).toBe('dark');

    // Wrong type: the operation's schema refuses it (as with the other operations).
    const wrong = await mcp.client
      .callTool({
        name: 'plan_changes',
        arguments: {
          project: name,
          operations: [{ op: 'update_project', drawingMode: 3 }],
        },
      })
      .then(
        (r) => JSON.stringify(r),
        (e: unknown) => String(e),
      );
    expect(wrong).toMatch(/drawingMode/);

    const bad = ok(
      await mcp.call<{ valid: boolean; errors: { code: string }[] }>('plan_changes', {
        project: name,
        operations: [{ op: 'update_project', drawingMode: 'Dark Mode' }],
      }),
    );
    expect(bad.valid).toBe(false);
    expect(bad.errors.map((e) => e.code)).toEqual(['invalid-name']);
  });
});

describe('container mode', () => {
  it('add_container and update_container pin it; null goes back to following the project', async () => {
    const { name, dir } = await newProject();
    const first = await apply(name, dir, [
      { op: 'update_project', drawingMode: 'light' },
      { ...box, drawingMode: 'dark' },
    ]);
    const container = first.saved.containers[0]!;
    expect(container.drawingMode).toBe('dark');
    const ref = first.proposed.created.find((c) => c.kind === 'container')!.ref!;
    expect(ok(await mcp.call('get_container', { ref }))).toMatchObject({
      drawingMode: 'dark',
      effectiveDrawingMode: 'dark',
    });

    const second = await apply(name, dir, [
      { op: 'update_container', container: ref, drawingMode: 'compact' },
    ]);
    expect(second.saved.containers[0]!.drawingMode).toBe('compact');

    const third = await apply(name, dir, [
      { op: 'update_container', container: ref, drawingMode: null },
    ]);
    expect(third.saved.containers[0]!.drawingMode ?? null).toBeNull();
    expect(ok(await mcp.call('get_container', { ref }))).toMatchObject({
      drawingMode: null,
      effectiveDrawingMode: 'light',
    });
  });

  it("list_markings returns the marking's effective mode", async () => {
    const { name, dir } = await newProject();
    const { proposed } = await apply(name, dir, [
      { op: 'update_project', drawingMode: 'light' },
      { ...box, drawingMode: 'dark' },
      {
        op: 'create_marking',
        container: '$c',
        name: 'A',
        rect: { x: 0, y: 0, width: 10, height: 10 },
      },
    ]);
    expect(proposed.valid).toBe(true);
    const list = ok(
      await mcp.call<{
        markings: { name: string; effectiveDrawingMode: string | null }[];
      }>('list_markings', { project: name }),
    );
    expect(list.markings.map((m) => [m.name, m.effectiveDrawingMode])).toEqual([
      ['A', 'dark'],
    ]);
  });
});

describe('proposal format (conclusion: it rises to 6 only when the mode is used)', () => {
  it('update_project writes formatVersion 6; without a mode the proposal stays at 4', async () => {
    const { name, dir } = await newProject();
    const withMode = await propose(mcp, name, [
      { op: 'update_project', drawingMode: 'dark' },
    ]);
    expect(readProposal(dir, withMode.proposal.id).formatVersion).toBe(
      PROPOSAL_DRAWING_MODE_FORMAT_VERSION,
    );
    const plain = await propose(mcp, name, [{ ...box }]);
    expect(readProposal(dir, plain.proposal.id).formatVersion).toBe(
      PROPOSAL_FORMAT_VERSION,
    );
    // A container created with a mode also carries the new value: 6.
    const container = await propose(mcp, name, [{ ...box, drawingMode: 'dark' }]);
    expect(readProposal(dir, container.proposal.id).formatVersion).toBe(6);
  });
});
