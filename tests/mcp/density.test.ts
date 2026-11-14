import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PROPOSAL_DENSITY_FORMAT_VERSION,
  PROPOSAL_FORMAT_VERSION,
} from '../../src/model';
import { acceptAllAndApply, ok, propose, readProposal } from './proposalSupport';
import { connect, type Connection } from './workspace';

// Container density (schema v19) in the MCP: `add_container` and `update_container` accept
// `density` (`null` goes back to 1); `get_container`, `get_project` and `get_marking` return it.

let root: string;
let mcp: Connection;
let counter = 0;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-density-'));
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

async function newProject(): Promise<{ name: string; dir: string }> {
  const name = `densidade-${++counter}`;
  ok(await mcp.call('create_project', { path: `projetos/${name}`, name }));
  return { name, dir: join(root, 'projetos', name) };
}

async function apply(name: string, dir: string, operations: unknown[]) {
  const proposed = await propose(mcp, name, operations);
  return { proposed, saved: acceptAllAndApply(dir, proposed.proposal.id) };
}

const box = {
  op: 'add_container',
  as: '$c',
  width: 1080,
  height: 2400,
  background: '#FFFFFF',
};

describe('density in add_container and update_container', () => {
  it('add_container pins the density; get_container, get_project and get_marking return it', async () => {
    const { name, dir } = await newProject();
    const { proposed, saved } = await apply(name, dir, [
      { ...box, density: 3 },
      {
        op: 'create_marking',
        container: '$c',
        name: 'A',
        rect: { x: 0, y: 0, width: 174, height: 120 },
      },
    ]);
    expect(saved.containers[0]!.density).toBe(3);
    const ref = proposed.created.find((c) => c.kind === 'container')!.ref!;
    expect(ok(await mcp.call('get_container', { ref })).density).toBe(3);
    const project = ok(
      await mcp.call<{ containers: { density: number }[] }>('get_project', {
        project: name,
      }),
    );
    expect(project.containers[0]!.density).toBe(3);
    const marking = proposed.created.find((c) => c.kind === 'marking')!.ref!;
    expect(
      ok(
        await mcp.call<{ container: { density: number } }>('get_marking', {
          ref: marking,
        }),
      ).container.density,
    ).toBe(3);
  });

  it('without density the container returns 1 and the file does not keep the key', async () => {
    const { name, dir } = await newProject();
    const { proposed, saved } = await apply(name, dir, [{ ...box }]);
    expect('density' in saved.containers[0]!).toBe(false);
    const ref = proposed.created.find((c) => c.kind === 'container')!.ref!;
    expect(ok(await mcp.call('get_container', { ref })).density).toBe(1);
  });

  it('update_container changes the density and null goes back to 1', async () => {
    const { name, dir } = await newProject();
    const first = await apply(name, dir, [{ ...box }]);
    const ref = first.proposed.created.find((c) => c.kind === 'container')!.ref!;
    const two = await apply(name, dir, [
      { op: 'update_container', container: ref, density: 2 },
    ]);
    expect(two.saved.containers[0]!.density).toBe(2);
    const back = await apply(name, dir, [
      { op: 'update_container', container: ref, density: null },
    ]);
    expect('density' in back.saved.containers[0]!).toBe(false);
    expect(ok(await mcp.call('get_container', { ref })).density).toBe(1);
  });

  it('density outside 0.5 to 8 is container-density, with detail and hint', async () => {
    const { name } = await newProject();
    for (const density of [12, 0.4]) {
      const bad = ok(
        await mcp.call<{
          valid: boolean;
          errors: { code: string; detail?: string; hint?: string }[];
        }>('plan_changes', {
          project: name,
          operations: [{ ...box, density }],
        }),
      );
      expect(bad.valid).toBe(false);
      expect(bad.errors.map((e) => e.code)).toEqual(['container-density']);
      expect(bad.errors[0]!.hint).toMatch(/from 0\.5 to 8/);
      expect(bad.errors[0]!.detail).toBeTruthy();
    }
  });
});

describe('proposal format (rises to 7 only when density is used)', () => {
  it('add_container and update_container with density write formatVersion 7; without it, it stays at 4', async () => {
    const { name, dir } = await newProject();
    const plain = await propose(mcp, name, [{ ...box }]);
    expect(readProposal(dir, plain.proposal.id).formatVersion).toBe(
      PROPOSAL_FORMAT_VERSION,
    );
    const dense = await propose(mcp, name, [{ ...box, density: 3 }]);
    expect(readProposal(dir, dense.proposal.id).formatVersion).toBe(
      PROPOSAL_DENSITY_FORMAT_VERSION,
    );
  });
});
