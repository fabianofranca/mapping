import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Annotation, Project } from '../../src/model';
import { issueChanges } from '../../mcp/batch';
import { Refs } from '../../mcp/items';
import type { LoadedProject } from '../../mcp/projects';
import { SCREEN, slotsProject, slotsWorkspace, type Workspace } from './slotsWorkspace';

// Stage #1080, SL4 (decisions 7 and 10): the drawing proof of `plan_changes` also reports `slot-not-accepted`
// and `slot-full` in `issues.new`, only for the markings the batch touched; `issueChanges` lists the codes an
// annotation gained, not only annotations that had no issue before.

interface Item {
  code: string;
  slot?: { id: string; name: string };
  owner?: string;
  max?: number;
  message?: string;
}
interface Entry {
  annotation: string;
  issues: Item[];
}

let ws: Workspace;

beforeAll(async () => {
  ws = await slotsWorkspace((add) => {
    // A bar with every slot full: one pin in `navigationIcon` (max 1) and three in `actions` (max 3).
    add('bar', 'bar', { rect: { x: 100, y: 100, width: 360, height: 56 } });
    add('p1', 'pin', { parentId: 'mk-bar', slot: 'navigationIcon' });
    for (const id of ['a1', 'a2', 'a3']) {
      add(id, 'pin', { parentId: 'mk-bar', slot: 'actions' });
    }
    // Another bar that already has a `slot-full`, untouched by the batches below.
    add('bar2', 'bar', { rect: { x: 100, y: 400, width: 360, height: 56 } });
    add('q1', 'pin', { parentId: 'mk-bar2', slot: 'navigationIcon' });
    add('q2', 'pin', { parentId: 'mk-bar2', slot: 'navigationIcon' });
  });
});

afterAll(async () => {
  await ws.client.close();
  rmSync(ws.base, { recursive: true, force: true });
});

async function plan(operations: unknown[]) {
  const result = await ws.client.callTool({
    name: 'plan_changes',
    arguments: { project: 'slots', operations },
  });
  const text = (result.content as { type: string; text: string }[])[0]!.text;
  return JSON.parse(text) as { errors?: unknown; issues: { new: Entry[] } };
}

async function barRef(y: number): Promise<string> {
  const result = await ws.client.callTool({
    name: 'list_markings',
    arguments: { project: 'slots', container: SCREEN },
  });
  const list = JSON.parse((result.content as { text: string }[])[0]!.text);
  return list.markings.find((m: { rect: { x: number; y: number } }) => m.rect.y === y)
    .ref;
}

const slotItems = (entries: Entry[]): Item[] =>
  entries.flatMap((e) => e.issues).filter((i) => i.code.startsWith('slot-'));

describe('plan_changes: slot items of the drawing proof', () => {
  it('a second pin put in the full slot gives slot-full in issues.new, with slot, owner, max and a message', async () => {
    const reply = await plan([
      {
        op: 'create_marking',
        inside: await barRef(100),
        annotation: { type: 'slots/pin' },
      },
    ]);
    expect(reply.errors).toBeUndefined();
    expect(slotItems(reply.issues.new)).toEqual([
      {
        code: 'slot-full',
        slot: { id: 'navigationIcon', name: 'Navigation icon' },
        owner: 'Bar',
        max: 1,
        message: 'the slot Navigation icon of Bar takes 1',
      },
    ]);
  });

  it('a type the slot does not accept gives slot-not-accepted, and the untouched bar`s old slot-full does not show', async () => {
    const reply = await plan([
      {
        op: 'create_marking',
        inside: await barRef(100),
        annotation: { type: 'slots/rounded-bar' },
      },
    ]);
    expect(reply.errors).toBeUndefined();
    const items = slotItems(reply.issues.new);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      code: 'slot-not-accepted',
      slot: { id: 'navigationIcon', name: 'Navigation icon' },
      owner: 'Bar',
    });
    expect(items[0]!.message).toBe(
      'the slot Navigation icon of Bar does not accept Rounded bar',
    );
    expect(items[0]!.max).toBeUndefined();
  });
});

describe('issueChanges: the codes an annotation gained', () => {
  /** The slots project where the annotation of the first pin has a typed field, empty or invalid. */
  function pair(): { before: Project; after: Project; id: string } {
    const base = slotsProject((add) => {
      add('rb', 'rounded-bar', { rect: { x: 100, y: 100, width: 60, height: 60 } });
    });
    const id = 'an-rb';
    const withSpec = (p: Project, required: boolean): Project => ({
      ...p,
      specializations: p.specializations.map((s) => {
        const spec = JSON.parse(JSON.stringify(s.spec));
        const type = spec.layers[0].annotationTypes[2];
        type.fields = [
          { key: 'radius', type: 'number' },
          { key: 'note', type: 'string', required },
        ];
        return { ...s, spec };
      }),
    });
    const edit = (p: Project, values: Record<string, unknown>): Project => ({
      ...p,
      annotations: p.annotations.map((a: Annotation) =>
        a.id === id ? { ...a, values: values as Annotation['values'] } : a,
      ),
    });
    // Before: `radius` is not a number (invalid-value) and `note` is not required.
    const before = edit(withSpec(base, false), { radius: 'abc', note: '' });
    // After: `note` became required and is empty (required-empty): the annotation already had a pending item.
    const after = edit(withSpec(base, true), { radius: 'abc', note: '' });
    return { before, after, id };
  }

  it('an annotation that already had invalid-value and now also gets required-empty lists only the new one', () => {
    const { before, after, id } = pair();
    const loaded = {
      project: after,
      location: { name: 'slots' },
    } as unknown as LoadedProject;
    const result = issueChanges(new Refs(loaded), before) as {
      resolved: number;
      new: { annotation: string; issues: { code: string; key?: string }[] }[];
    };
    expect(result.new).toEqual([
      {
        annotation: expect.stringContaining('/a/'),
        issues: [{ code: 'required-empty', key: 'note' }],
      },
    ]);
    expect(result.resolved).toBe(0);
    expect(id).toBe('an-rb');
  });
});
