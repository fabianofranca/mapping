import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProjectContainer } from '../../src/model';
import { Roots } from '../../mcp/paths';
import { openPreview } from '../../mcp/renderPreview';
import { ok, propose, readProposal } from './proposalSupport';
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
function placementOf(id: string): unknown {
  const change = readProposal(dir(), id).changes.find(
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
