import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SCREEN, slotsWorkspace, type Workspace } from './slotsWorkspace';

// Stage #1080, SL4 (decision 7): the pending items of the drawing (`component-overflow`, `slot-not-accepted`,
// `slot-full`) reach the MCP reads (`get_marking`, `get_annotation`, `list_markings`, the counts of
// `get_project` and `get_container`), through the same drawing cache the app uses; the cache is memoized by
// the content of the project folder, so reading twice instantiates once.

const created: { cache: number; passes: number } = { cache: 0, passes: 0 };

vi.mock('../../src/model', async (importOriginal) => {
  const model = await importOriginal<typeof import('../../src/model')>();
  return {
    ...model,
    createDrawingCache: () => {
      created.cache += 1;
      const cache = model.createDrawingCache();
      const counted: typeof cache = (...args) => {
        created.passes += 1;
        return cache(...args);
      };
      return counted;
    },
  };
});

let ws: Workspace;

async function call(name: string, args: Record<string, unknown>) {
  const result = await ws.client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0]!.text;
  return JSON.parse(text) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

interface Row {
  ref: string;
  name: string | null;
  incomplete?: number;
}

/** The marking and annotation refs by the order the project was built in (list order is stable). */
async function refs() {
  const list = await call('list_markings', { project: 'slots', container: SCREEN });
  const rows = list.markings as Row[];
  return rows;
}

beforeAll(async () => {
  ws = await slotsWorkspace((add) => {
    add('bar', 'bar', { rect: { x: 100, y: 100, width: 360, height: 56 } });
    add('p1', 'pin', { parentId: 'mk-bar', slot: 'navigationIcon' });
    add('p2', 'pin', { parentId: 'mk-bar', slot: 'navigationIcon' });
    add('r', 'rounded-bar', {
      parentId: 'mk-bar',
      slot: 'actions',
      rect: { x: 400, y: 108, width: 30, height: 30 },
    });
    // A second, small bar: its title does not fit the height (component-overflow), with no children.
    add('tiny', 'bar', { rect: { x: 100, y: 400, width: 60, height: 20 } });
  });
});

afterAll(async () => {
  await ws.client.close();
  rmSync(ws.base, { recursive: true, force: true });
});

interface IssueData {
  code: string;
  slot?: { id: string; name: string };
  owner?: string;
  max?: number;
}

async function issuesOf(markingRef: string): Promise<IssueData[]> {
  const marking = await call('get_marking', { ref: markingRef });
  const out: IssueData[] = [];
  for (const layer of marking.layers ?? []) {
    for (const a of layer.annotations) out.push(...(a.issues ?? []));
  }
  return out;
}

describe('MCP reads carry the drawing issues', () => {
  it('get_marking of a child no slot accepts returns slot-not-accepted with slot and owner', async () => {
    const rows = await refs();
    expect(rows.length).toBeGreaterThanOrEqual(5);
    const found = [];
    for (const r of rows) found.push({ ref: r.ref, issues: await issuesOf(r.ref) });
    const notAccepted = found
      .flatMap((f) => f.issues)
      .filter((i) => i.code === 'slot-not-accepted');
    expect(notAccepted).toEqual([
      {
        code: 'slot-not-accepted',
        slot: { id: 'actions', name: 'Actions' },
        owner: 'Bar',
      },
    ]);
  });

  it('get_marking of the second pin in navigationIcon returns slot-full with the max', async () => {
    const rows = await refs();
    const all = [];
    for (const r of rows) all.push(...(await issuesOf(r.ref)));
    expect(all.filter((i) => i.code === 'slot-full')).toEqual([
      {
        code: 'slot-full',
        slot: { id: 'navigationIcon', name: 'Navigation icon' },
        owner: 'Bar',
        max: 1,
      },
    ]);
  });

  it('a marking that overflows returns component-overflow', async () => {
    const rows = await refs();
    const all = [];
    for (const r of rows) all.push(...(await issuesOf(r.ref)));
    expect(all.some((i) => i.code === 'component-overflow')).toBe(true);
  });

  it('get_annotation returns the same slot issue', async () => {
    const rows = await refs();
    let seen = false;
    for (const r of rows) {
      const marking = await call('get_marking', { ref: r.ref });
      for (const layer of marking.layers ?? []) {
        for (const a of layer.annotations) {
          const annotation = await call('get_annotation', { ref: a.ref });
          if (
            (annotation.issues ?? []).some(
              (i: { code: string }) => i.code === 'slot-full',
            )
          ) {
            seen = true;
          }
        }
      }
    }
    expect(seen).toBe(true);
  });

  it('list_markings with incomplete lists the markings with a drawing issue', async () => {
    const list = await call('list_markings', {
      project: 'slots',
      container: SCREEN,
      incomplete: true,
    });
    // The bar and the tiny bar (component-overflow), the extra pin (slot-full) and the rounded bar
    // (slot-not-accepted).
    expect(list.total).toBe(4);
  });

  it('the counts of get_project, get_marking and the list rows count them', async () => {
    const project = await call('get_project', { project: 'slots' });
    expect(project.issues.total).toBe(4);
    expect(project.issues.byCode).toMatchObject({
      'slot-full': 1,
      'slot-not-accepted': 1,
      'component-overflow': 2,
    });
    // The marking view counts its own annotations (the extra pin has the slot-full).
    const all = await refs();
    const counts = [];
    for (const r of all)
      counts.push((await call('get_marking', { ref: r.ref })).incompleteAnnotations);
    expect(counts.filter((n) => n === 1)).toHaveLength(4);
    const rows = await refs();
    expect(rows.filter((r) => r.incomplete === 1)).toHaveLength(4);
  });
});

describe('the drawing is memoized by the content of the folder', () => {
  it('two reads of the same revision, each with its own load, instantiate once; a write or a changed component instantiates again', async () => {
    const [first] = await refs();
    // A write (revision + 1): the key changes, whatever the earlier tests memoized.
    const file = join(ws.dir, 'mapping.json');
    const json = JSON.parse(readFileSync(file, 'utf8'));
    json.revision = (json.revision ?? 0) + 1;
    writeFileSync(file, JSON.stringify(json));
    created.cache = 0;
    created.passes = 0;
    await call('get_marking', { ref: first!.ref });
    const after1 = created.passes;
    expect(after1).toBe(1);
    expect(created.cache).toBe(1);
    await call('get_marking', { ref: first!.ref });
    expect(created.passes).toBe(after1);

    // A changed component file, same revision.
    const bar = join(ws.dir, 'specs', 'slots', 'components', 'bar.json');
    const component = JSON.parse(readFileSync(bar, 'utf8'));
    component.description = 'changed';
    writeFileSync(bar, JSON.stringify(component));
    await call('get_marking', { ref: first!.ref });
    expect(created.passes).toBe(after1 + 1);
    await call('get_marking', { ref: first!.ref });
    expect(created.passes).toBe(after1 + 1);
  });
});
