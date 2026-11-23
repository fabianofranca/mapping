import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptAllAndApply, ok, propose } from './proposalSupport';
import { connect, type Connection } from './workspace';

// Stage #2035 (CL1): the numbers and messages that scripts R9 and R12 of docs/TESTING.md expect from
// `plan_changes` with the `material3-compose` library (the package's own Roboto fonts, shaped like
// the browser) on a Card (300×200) and on a Screen (400×300) with a Target and an anchored Tip.

interface Planned {
  valid: boolean;
  summary: string[];
  warnings?: { code: string; message: string }[];
  errors?: { index: number; code: string; message: string; hint?: string }[];
  issues?: { new?: unknown[] };
}

const M3 = 'material3-compose';
const BUTTON = { type: `${M3}/button`, values: { label: 'Button' } };

let base: string;
let mcp: Connection;
let target: string;
let tip: string;

/** A project with the library applied and `operations` accepted (as the app's review does). */
async function seeded(name: string, operations: unknown[]): Promise<string[]> {
  const root = join(base, 'root');
  ok(await mcp.call('create_project', { path: name, name, notes: false }));
  const dir = join(root, name);
  const proposed = await propose(mcp, name, [
    { op: 'apply_specialization', file: 'm3' },
    ...operations,
  ]);
  acceptAllAndApply(dir, proposed.proposal.id);
  cpSync(join(dir, 'proposals', proposed.proposal.id, 'specs'), join(dir, 'specs'), {
    recursive: true,
    force: false,
  });
  return proposed.created.map((c) => c.ref ?? '');
}

const plan = async (project: string, operations: unknown[]) =>
  ok(await mcp.call<Planned>('plan_changes', { project, operations }));

/** The rectangle of the marking a summary line creates: `x`, `y`, width, height. */
function rectOf(line: string | undefined): number[] {
  const match = /\(x (-?\d+), y (-?\d+), (\d+)×(\d+)/.exec(line ?? '');
  if (match === null) throw new Error(`no rectangle in ${line}`);
  return match.slice(1).map(Number);
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-m3-'));
  mkdirSync(join(base, 'root'), { recursive: true });
  mcp = await connect([join(base, 'root')]);
  cpSync('libraries/material3-compose', join(base, 'root', 'm3'), { recursive: true });
  await seeded('telas', [
    { op: 'add_container', name: 'Card', width: 300, height: 200, background: '#FFFFFF' },
    {
      op: 'add_container',
      name: 'Settings',
      width: 360,
      height: 800,
      background: '#FFFFFF',
    },
  ]);
  const refs = await seeded('ancora', [
    {
      op: 'add_container',
      as: '$s',
      name: 'Screen',
      width: 400,
      height: 300,
      background: '#FFFFFF',
    },
    {
      op: 'create_marking',
      container: '$s',
      name: 'Target',
      rect: { x: 150, y: 140, width: 100, height: 40 },
    },
  ]);
  target = refs.find((ref) => ref.includes('/m/')) ?? '';
  const proposed = await propose(mcp, 'ancora', [
    {
      op: 'create_marking',
      container: 'Screen',
      name: 'Tip',
      annotation: { type: `${M3}/tooltip` },
      anchor: { to: target, side: 'top', align: 'center', offset: { main: 8, cross: 0 } },
    },
  ]);
  acceptAllAndApply(join(base, 'root', 'ancora'), proposed.proposal.id);
  tip = proposed.created.find((c) => c.kind === 'marking')?.ref ?? '';
}, 30_000);

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

describe('R9.24 to R9.26: children in the slot of a Column', () => {
  const column = (height: number, width = 260) => [
    {
      op: 'create_marking',
      container: 'Card',
      as: '$col',
      annotation: { type: `${M3}/column`, values: { spacing: 8 } },
      rect: { x: 20, y: 20, width, height },
    },
    ...[1, 2, 3].map(() => ({
      op: 'create_marking',
      inside: '$col',
      annotation: BUTTON,
    })),
  ];

  it('R9.24: three buttons stacked, 91×40, +0 +48 +96', async () => {
    const reply = await plan('telas', column(160));
    expect(reply.valid).toBe(true);
    expect(reply.warnings).toBeUndefined();
    expect(reply.summary.slice(1).map(rectOf)).toEqual([
      [20, 20, 91, 40],
      [20, 68, 91, 40],
      [20, 116, 91, 40],
    ]);
  });

  it('R9.26a: the third button goes to a second column, at the bottom of the slot', async () => {
    const reply = await plan('telas', column(100));
    expect(reply.valid).toBe(true);
    expect(reply.warnings).toBeUndefined();
    expect(rectOf(reply.summary[3])).toEqual([119, 80, 91, 40]);
  });
});

describe('R9.26b: no free spot in the slot (CL1-F13)', () => {
  it('the third button is still created, over the second, and the warning says it did not fit', async () => {
    const reply = await plan('telas', [
      {
        op: 'create_marking',
        container: 'Card',
        as: '$col',
        annotation: { type: `${M3}/column`, values: { spacing: 8 } },
        rect: { x: 20, y: 20, width: 100, height: 100 },
      },
      ...[1, 2, 3].map(() => ({
        op: 'create_marking',
        inside: '$col',
        annotation: BUTTON,
      })),
    ]);
    expect(reply.valid).toBe(true);
    expect(reply.warnings?.map((w) => w.code)).toEqual(['ignored-argument']);
    expect(reply.warnings?.[0]?.message).toMatch(/did not fit in the slot/);
    const [second, third] = [rectOf(reply.summary[2]), rectOf(reply.summary[3])];
    // Overlap: the slot has no free spot, so the marking is created where the slot put it.
    expect(
      third[1]! < second[1]! + second[3]! && second[1]! < third[1]! + third[3]!,
    ).toBe(true);
  });
});

describe('R9.27: invalid-parent names its cause (CL1-F12)', () => {
  const column = {
    op: 'create_marking',
    container: 'Card',
    as: '$col',
    annotation: { type: `${M3}/column`, values: { spacing: 8 } },
    rect: { x: 20, y: 20, width: 260, height: 160 },
  };

  it('(a) a target without a slot', async () => {
    const reply = await plan('telas', [
      {
        op: 'create_marking',
        container: 'Card',
        as: '$target',
        annotation: BUTTON,
        rect: { x: 20, y: 20, width: 120, height: 40 },
      },
      { op: 'create_marking', inside: '$target', annotation: BUTTON },
    ]);
    expect(reply.errors).toHaveLength(1);
    expect(reply.errors?.[0]).toMatchObject({ index: 1, code: 'invalid-parent' });
    expect(reply.errors?.[0]?.message).toMatch(/^invalid parent: `inside` .*with a slot/);
  });

  it('(b) a container that is not the Column’s', async () => {
    const reply = await plan('telas', [
      column,
      { op: 'create_marking', inside: '$col', container: 'Settings', annotation: BUTTON },
    ]);
    expect(reply.errors).toHaveLength(1);
    expect(reply.errors?.[0]).toMatchObject({ index: 1, code: 'invalid-parent' });
    expect(reply.errors?.[0]?.message).toMatch(
      /^invalid parent: `container` is not the container of the `inside` target/,
    );
  });
});

describe('R12.39: a failed anchor operation leaves nothing behind (CL1-F10)', () => {
  const resize = (x: number, y: number) => ({
    op: 'update_marking',
    marking: tip,
    rect: { x, y, width: 149, height: 24 },
  });
  const overflows = (reply: Planned) =>
    JSON.stringify(reply.issues?.new ?? []).includes('component-overflow');

  it('the same rect gives the same issues alone and after anchor-self or anchor-other-space', async () => {
    const lens = [
      {
        op: 'create_marking',
        name: 'Lens',
        as: '$lens',
        rect: { x: 3000, y: 3000, width: 100, height: 100 },
      },
      { op: 'update_marking', marking: tip, anchor: { to: '$lens' } },
    ];
    const failing = [[{ op: 'update_marking', marking: tip, anchor: { to: tip } }], lens];
    for (const [x, y] of [
      [126, 108],
      [10, 10],
    ] as const) {
      const alone = await plan('ancora', [resize(x, y)]);
      expect(alone.errors).toBeUndefined();
      for (const before of failing) {
        const batch = await plan('ancora', [...before, resize(x, y)]);
        expect(batch.errors).toHaveLength(1);
        expect(overflows(batch)).toBe(overflows(alone));
      }
    }
    // Snapped to the anchor the tooltip fits; away from it the arrow needs more room (expected).
    expect(overflows(await plan('ancora', [resize(126, 108)]))).toBe(false);
    expect(overflows(await plan('ancora', [resize(10, 10)]))).toBe(true);
  });
});
