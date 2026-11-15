import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SCREEN, slotsWorkspace, type Workspace } from './slotsWorkspace';

// `create_marking` with `slot` (stage #1080, SL5, decision 13): together with `inside` it puts the child in
// the slot asked for; `slot` without `inside`, or a slot the target does not have, is `invalid-arguments` with
// the target's slots in `detail`; a type the slot does not accept is created, with `slot-not-accepted`.

interface Reply {
  valid: boolean;
  errors?: { index: number; code: string; message: string; detail?: unknown }[];
  summary: string[];
  issues: {
    new: { annotation: string; issues: { code: string; slot?: { id: string } }[] }[];
  };
}

let ws: Workspace;
let barRef: string;
let plainRef: string;

async function call(name: string, args: Record<string, unknown>) {
  const result = await ws.client.callTool({ name, arguments: args });
  return JSON.parse((result.content as { text: string }[])[0]!.text);
}

async function plan(operation: Record<string, unknown>): Promise<Reply> {
  return call('plan_changes', { project: 'slots', operations: [operation] });
}

/** The `x` of the marking the first step creates, read from the summary line. */
function createdX(reply: Reply): number {
  const match = /\(x (-?\d+), y (-?\d+)/.exec(reply.summary[0] ?? '');
  if (match === null) throw new Error(`no position in ${reply.summary[0]}`);
  return Number(match[1]);
}

beforeAll(async () => {
  ws = await slotsWorkspace((add) => {
    add('bar', 'bar', { name: 'bar', rect: { x: 100, y: 100, width: 360, height: 56 } });
    add('plain', 'pin', {
      name: 'plain',
      rect: { x: 100, y: 400, width: 24, height: 24 },
    });
  });
  const rows = (await call('list_markings', { project: 'slots', container: SCREEN }))
    .markings as { ref: string; name: string }[];
  barRef = rows.find((r) => r.name === 'bar')!.ref;
  plainRef = rows.find((r) => r.name === 'plain')!.ref;
});

afterAll(async () => {
  await ws.client.close();
  rmSync(ws.base, { recursive: true, force: true });
});

describe('create_marking with inside + slot', () => {
  const pin = { type: 'slots/pin' };

  it('puts the child in the slot asked for; without slot, in the first one that takes the type', async () => {
    const first = await plan({ op: 'create_marking', inside: barRef, annotation: pin });
    expect(first.errors).toBeUndefined();
    const left = createdX(first);
    const actions = await plan({
      op: 'create_marking',
      inside: barRef,
      slot: 'actions',
      annotation: pin,
    });
    expect(actions.errors).toBeUndefined();
    // `navigationIcon` is on the left of the bar and `actions` on the right.
    expect(left).toBeLessThan(200);
    expect(createdX(actions)).toBeGreaterThan(300);
  });

  it('slot without inside is invalid-arguments, with a message that says so', async () => {
    const reply = await plan({
      op: 'create_marking',
      container: SCREEN,
      slot: 'actions',
      rect: { x: 10, y: 10, width: 20, height: 20 },
    });
    expect(reply.valid).toBe(false);
    expect(reply.errors?.map((e) => e.code)).toEqual(['invalid-arguments']);
    expect(reply.errors?.[0]?.message).toMatch(/`slot` only applies with `inside`/);
  });

  it('a slot the target does not have is invalid-arguments, with the target slots in detail', async () => {
    const reply = await plan({
      op: 'create_marking',
      inside: barRef,
      slot: 'nope',
      annotation: pin,
    });
    expect(reply.errors?.map((e) => e.code)).toEqual(['invalid-arguments']);
    expect(reply.errors?.[0]?.detail).toEqual({
      slots: [
        { id: 'navigationIcon', name: 'Navigation icon' },
        { id: 'actions', name: 'Actions' },
      ],
    });
  });

  it('a type the slot does not accept is created, with slot-not-accepted in the step', async () => {
    const reply = await plan({
      op: 'create_marking',
      inside: barRef,
      slot: 'actions',
      annotation: { type: 'slots/rounded-bar' },
    });
    expect(reply.errors).toBeUndefined();
    expect(reply.issues.new.flatMap((e) => e.issues.map((i) => i.code))).toEqual([
      'slot-not-accepted',
    ]);
  });

  it('slot with a target that has no slot with an id keeps the invalid-parent of inside', async () => {
    const reply = await plan({
      op: 'create_marking',
      inside: plainRef,
      slot: 'actions',
      annotation: pin,
    });
    expect(reply.errors?.map((e) => e.code)).toEqual(['invalid-parent']);
  });
});
