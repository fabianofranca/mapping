import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { imageCanvasRect, rectsOverlap, type ProjectContainer } from '../../src/model';
import { Roots } from '../../mcp/paths';
import { openPreview } from '../../mcp/renderPreview';
import {
  acceptAllAndApply,
  ok,
  propose,
  readProject,
  readProposal,
} from './proposalSupport';
import { PNG_1X1, connect, type Connection } from './workspace';

// Stage #2523: `plan_changes` and the batch-only preview (`render_container` / `render_marking`
// with a batch and no `proposal`) reserve what `propose_changes` reserves: the `images/` names and
// the canvas space of the other open proposals.

interface Plan {
  valid: boolean;
  summary: string[];
}

let root: string;
let mcp: Connection;
let png: string;
const dir = () => join(root, 'screens');

const addPhoto = (name: string) => [{ op: 'add_container', file: png, name }];
const addScreen = (name: string) => [
  { op: 'add_container', name, width: 360, height: 64, background: '#FFFFFF' },
];

/** The `images/<file>` that a summary line names ("with the image images/photo.webp"). */
function imageNamed(summary: readonly string[]): string {
  const match = summary.join('\n').match(/with the image (images\/\S+?)(?: \(|$)/m);
  if (match === null) throw new Error(`no image in the summary: ${summary.join(' | ')}`);
  return match[1]!;
}

async function plan(operations: unknown[]): Promise<Plan> {
  const data = ok(
    await mcp.call<Plan>('plan_changes', { project: 'screens', operations }),
  );
  expect(data.valid).toBe(true);
  return data;
}

/** The place of the container a proposal creates (its `to` in the `image` create change). */
function placementOf(id: string, projectDir = dir()): unknown {
  const change = readProposal(projectDir, id).changes.find(
    (c) => c.entity === 'image' && c.kind === 'create',
  );
  return (change!.to as unknown as ProjectContainer).placement;
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-plan-reserve-'));
  png = join(root, 'photo.png');
  writeFileSync(png, PNG_1X1);
  mcp = await connect([root]);
  ok(await mcp.call('create_project', { path: 'screens', name: 'Screens' }));
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

describe('plan_changes reserves the image files of the open proposals (#2523)', () => {
  it('names the file that propose_changes writes, and the freed name returns after a withdrawal', async () => {
    const free = imageNamed((await plan(addPhoto('Free'))).summary);
    expect(free).toMatch(/^images\/photo\.\w+$/);
    const ext = free.split('.').pop()!;

    const holder = await propose(mcp, 'screens', addPhoto('Holder'));
    expect(imageNamed(holder.summary)).toBe(free);

    // Another proposal holds `images/photo.<ext>`: the plan names the next free name,
    // the same one a `propose_changes` of the batch writes.
    const planned = imageNamed((await plan(addPhoto('Second'))).summary);
    expect(planned).toBe(`images/photo-2.${ext}`);
    const second = await propose(mcp, 'screens', addPhoto('Second'));
    expect(imageNamed(second.summary)).toBe(planned);
    expect(second.files.images.map((f) => f.split('/').slice(2).join('/'))).toEqual([
      planned,
    ]);

    // Withdrawn proposals release their names: the plan names the first free one again.
    ok(await mcp.call('withdraw_proposal', { ref: second.proposal.ref }));
    ok(await mcp.call('withdraw_proposal', { ref: holder.proposal.ref }));
    expect(imageNamed((await plan(addPhoto('Third'))).summary)).toBe(free);
  });
});

describe('the batch-only preview reserves the space of the open proposals (#2523)', () => {
  it('places a new container where propose_changes places it, and a withdrawal frees the spot', async () => {
    const previewPlacement = async (name: string): Promise<unknown> => {
      const preview = await openPreview(new Roots([root]), () => Date.now(), {
        ref: '$s',
        project: 'screens',
        operations: addScreen(name).map((op) => ({ ...op, as: '$s' })) as never,
      });
      return preview.refs.project.containers.find((c) => c.name === name)?.placement;
    };

    const holder = await propose(mcp, 'screens', addScreen('Space A'));
    const held = placementOf(holder.proposal.id);

    const previewed = await previewPlacement('Space B');
    expect(previewed).toBeDefined();
    expect(previewed).not.toEqual(held);
    const second = await propose(mcp, 'screens', addScreen('Space B'));
    expect(previewed).toEqual(placementOf(second.proposal.id));

    ok(await mcp.call('withdraw_proposal', { ref: second.proposal.ref }));
    ok(await mcp.call('withdraw_proposal', { ref: holder.proposal.ref }));
    expect(await previewPlacement('Space C')).toEqual(held);
  });
});

// Stage #2924: a container that the same open proposal deletes does not hold its replacement's
// place a second time, so a batch that does not touch that spot is valid. The old container
// exists until the proposal is applied, so nothing new is placed on it either.
describe('an open proposal that replaces a container (#2924)', () => {
  interface Result extends Plan {
    invariantIssues?: string[];
    errors?: unknown[];
  }

  it('a batch on another page is valid, and nothing new lands on the replaced spot', async () => {
    ok(await mcp.call('create_project', { path: 'swap', name: 'Swap' }));
    const swapDir = join(root, 'swap');
    const first = await propose(mcp, 'swap', [
      { op: 'add_container', name: 'A', width: 360, height: 800, background: '#FFFFFF' },
    ]);
    acceptAllAndApply(swapDir, first.proposal.id);
    const old = readProject(swapDir).containers.find((c) => c.name === 'A')!;
    const oldRect = imageCanvasRect(old, old.placement);

    // P1 deletes A and creates B of the same size centered on A (it stays open).
    const swap = await propose(mcp, 'swap', [
      { op: 'delete_container', container: first.created[0]!.ref },
      {
        op: 'add_container',
        name: 'B',
        width: 360,
        height: 800,
        background: '#FFFFFF',
        center: {
          x: oldRect.x + oldRect.width / 2,
          y: oldRect.y + oldRect.height / 2,
        },
      },
    ]);
    const held = placementOf(swap.proposal.id, swapDir) as ProjectContainer['placement'];
    expect(held).toEqual(old.placement);

    const onNewPage = [
      { op: 'add_page', name: 'Extra', as: '$p' },
      { op: 'add_container', width: 100, height: 100, background: '#FFFFFF', page: '$p' },
    ];
    // On the same page, a new container asked for the same spot goes elsewhere: not on A (which
    // exists until P1 is applied) and not on B (the place P1 holds).
    const third = await propose(mcp, 'swap', [
      {
        op: 'add_container',
        name: 'C',
        width: 100,
        height: 100,
        background: '#FFFFFF',
        center: {
          x: oldRect.x + oldRect.width / 2,
          y: oldRect.y + oldRect.height / 2,
        },
      },
    ]);
    expect(third.proposed, JSON.stringify(third)).toBe(true);
    const placed = placementOf(
      third.proposal.id,
      swapDir,
    ) as ProjectContainer['placement'];
    const thirdRect = imageCanvasRect({ width: 100, height: 100 }, placed);
    expect(rectsOverlap(thirdRect, oldRect)).toBe(false);

    const planned = ok(
      await mcp.call<Result>('plan_changes', { project: 'swap', operations: onNewPage }),
    );
    expect(planned.errors).toBeUndefined();
    expect(planned.invariantIssues).toBeUndefined();
    expect(planned.valid).toBe(true);
    const extra = await propose(mcp, 'swap', onNewPage);
    expect(extra.proposed).toBe(true);

    for (const item of [extra, third, swap]) {
      ok(await mcp.call('withdraw_proposal', { ref: item.proposal.ref }));
    }
  });
});
