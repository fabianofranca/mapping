import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptAllAndApply, ok, propose } from './proposalSupport';
import { connect, type Connection } from './workspace';

// Stage #1998 (CL1): the numbers and the message that script R56 of docs/TESTING.md expects, with the
// `material3-compose` library on a Screen (412×300): Icon A at 100,100, Icon B at 152,100 and a
// 280×56 Text field (its minimum size) at 24,44, whose bottom edge enters both grown areas.

interface Warning {
  code: string;
  marking?: string;
  message: string;
}
interface Planned {
  valid: boolean;
  warnings?: Warning[];
}

const M3 = 'material3-compose';
const icon = (name: string, x: number, label: string) => ({
  op: 'create_marking',
  container: 'Screen',
  name,
  annotation: { type: `${M3}/icon-button`, values: { contentDescription: label } },
  rect: { x, y: 100, width: 40, height: 40 },
});

let base: string;
let mcp: Connection;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-r56-'));
  mkdirSync(join(base, 'root'), { recursive: true });
  mcp = await connect([join(base, 'root')]);
  cpSync('libraries/material3-compose', join(base, 'root', 'm3'), { recursive: true });
  ok(
    await mcp.call('create_project', {
      path: 'overlap-m3',
      name: 'overlap-m3',
      notes: false,
    }),
  );
  const dir = join(base, 'root', 'overlap-m3');
  const proposed = await propose(mcp, 'overlap-m3', [
    { op: 'apply_specialization', file: 'm3' },
    {
      op: 'add_container',
      name: 'Screen',
      width: 412,
      height: 300,
      background: '#FFFFFF',
    },
    icon('Icon A', 100, 'a'),
    icon('Icon B', 152, 'b'),
  ]);
  acceptAllAndApply(dir, proposed.proposal.id);
  cpSync(join(dir, 'proposals', proposed.proposal.id, 'specs'), join(dir, 'specs'), {
    recursive: true,
    force: false,
  });
}, 60_000);

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

const plan = async (operations: unknown[]) =>
  ok(await mcp.call<Planned>('plan_changes', { project: 'overlap-m3', operations }));

describe('R56.4: a Text field above the Icon buttons', () => {
  it('the 280-wide Field overlaps both icons by 48 × 4 units (R56.4)', async () => {
    const reply = await plan([
      {
        op: 'create_marking',
        container: 'Screen',
        name: 'Field',
        annotation: { type: `${M3}/text-field`, values: { label: 'Name' } },
        rect: { x: 24, y: 44, width: 280, height: 56 },
      },
    ]);
    expect(reply.valid).toBe(true);
    const overlaps = (reply.warnings ?? []).filter(
      (w) => w.code === 'touch-target-overlap',
    );
    // `plan_changes` reports only the marking the batch created: one entry per neighbor it touches.
    expect(overlaps.map((w) => w.message).sort()).toEqual([
      'overlaps the touch area of Icon A by 48 × 4 units (48 × 4 px at 1x)',
      'overlaps the touch area of Icon B by 48 × 4 units (48 × 4 px at 1x)',
    ]);
  });
});

describe('R56.8: plan_changes next to Icon B', () => {
  it('(a) x 196 gives one overlap entry with the server message, (b) x 204 none', async () => {
    const at = (x: number) =>
      plan([
        {
          op: 'create_marking',
          container: 'Screen',
          annotation: { type: `${M3}/icon-button`, values: { contentDescription: 'c' } },
          rect: { x, y: 100, width: 40, height: 40 },
        },
      ]);
    const near = await at(196);
    const overlaps = (near.warnings ?? []).filter(
      (w) => w.code === 'touch-target-overlap',
    );
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]?.message).toBe(
      'overlaps the touch area of Icon B by 4 × 48 units (4 × 48 px at 1x)',
    );
    expect((await at(204)).warnings ?? []).toEqual([]);
  });
});
