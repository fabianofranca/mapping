import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { imageCanvasRect, rectsOverlap, type ProjectContainer } from '../../src/model';
import {
  acceptAllAndApply,
  ok,
  propose,
  readProject,
  readProposal,
  reviewDecide,
  applyAcceptedOnDisk,
} from './proposalSupport';
import { connect, type Connection } from './workspace';

// Stage #2164 (CL1, finding 7): a container that a proposal adds is born in free space that also
// counts the containers that the other open proposals add, so two proposals made one after the other
// get different places and both can be applied.

let root: string;
let mcp: Connection;
const dir = () => join(root, 'screens');

const addScreen = (name: string) => [
  { op: 'add_container', name, width: 360, height: 64, background: '#FFFFFF' },
];

/** The container a proposal creates: its `to` in the `image` change. */
function createdContainer(id: string): ProjectContainer {
  const change = readProposal(dir(), id).changes.find(
    (c) => c.entity === 'image' && c.kind === 'create',
  );
  return change!.to as unknown as ProjectContainer;
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-place-'));
  mcp = await connect([root]);
  ok(await mcp.call('create_project', { path: 'screens', name: 'Screens' }));
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

describe('placement of the containers of a proposal (CL1, finding 7)', () => {
  it('a second open proposal gets a free place and both can be applied', async () => {
    const a = await propose(mcp, 'screens', addScreen('Repro A'));
    const b = await propose(mcp, 'screens', addScreen('Repro B'));
    const first = createdContainer(a.proposal.id);
    const second = createdContainer(b.proposal.id);
    expect(second.placement).not.toEqual(first.placement);
    expect(
      rectsOverlap(
        imageCanvasRect(first, first.placement),
        imageCanvasRect(second, second.placement),
      ),
    ).toBe(false);
    acceptAllAndApply(dir(), a.proposal.id);
    // Apply accepted of the second is not blocked by the first one's container.
    reviewDecide(dir(), b.proposal.id, { level: 'proposal', id: null }, 'accepted');
    const applied = applyAcceptedOnDisk(dir(), b.proposal.id);
    expect(applied.containers.map((c) => c.name).sort()).toEqual(['Repro A', 'Repro B']);
    expect(readProject(dir()).containers).toHaveLength(2);
  });

  it('a withdrawn proposal releases its place', async () => {
    const c = await propose(mcp, 'screens', addScreen('Repro C'));
    const taken = createdContainer(c.proposal.id).placement;
    ok(await mcp.call('withdraw_proposal', { ref: c.proposal.ref }));
    const d = await propose(mcp, 'screens', addScreen('Repro D'));
    expect(createdContainer(d.proposal.id).placement).toEqual(taken);
  });
});
