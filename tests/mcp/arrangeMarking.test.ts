import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applySpecialization,
  arrangeMarking,
  componentMinSize,
  createProject,
  parseSpecText,
  serialize,
  setMarkingLocked,
  type Project,
  type Rect,
} from '../../src/model';
import { runBatch, type BatchResult } from '../../mcp/batch';
import { planChanges } from '../../mcp/changes';
import { decodeImage } from '../../mcp/image/codecs';
import { builtinFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject, type LoadedProject } from '../../mcp/projects';
import { NOW } from '../model/fixtures';
import { acceptAllAndApply, ok, propose } from './proposalSupport';
import { connect, type Connection } from './workspace';

// AR1 (decisions 1 to 7 of #2927): `arrange_marking` in the batch is the model's Arrange. The batch creates the
// parent and its children with `inside` (born at the start of the slot) and ends with one `arrange_marking`
// on the outermost parent; the rectangles must be the ones `arrangeMarking` gives in the app.

const LIBRARY = resolve('tests/fixtures/arrange-slots');
const LAYER = 'cccccccc-0000-4000-8000-000000000001';

let base: string;
let roots: Roots;
let loaded: LoadedProject;
let mcp: Connection;

const dir = () => join(base, 'telas');

function project(): Project {
  const parsed = parseSpecText(
    readFileSync(join(LIBRARY, 'arrange-slots.spec.json'), 'utf8'),
  );
  if (!parsed.ok) throw new Error('invalid arrange-slots');
  const p = createProject({
    name: 'Screens',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Layer 1', color: '#D32F2F' },
  });
  return applySpecialization(p, parsed.spec, {
    packageSpecName: 'arrange-slots.spec.json',
  });
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-arrange-'));
  mkdirSync(join(dir(), 'specs'), { recursive: true });
  cpSync(LIBRARY, join(dir(), 'specs', 'arrange'), { recursive: true });
  writeFileSync(join(dir(), 'mapping.json'), serialize(project()));
  roots = new Roots([base]);
  loaded = await loadProject(roots, await findProject(roots, 'telas'));
  mcp = await connect([base]);
});

afterAll(async () => {
  await mcp.close();
  rmSync(base, { recursive: true, force: true });
});

const io = {
  readSource: () => Promise.reject(new Error('no files')),
  readSpecInput: () => Promise.reject(new Error('no files')),
  takenImageFiles: new Set<string>(),
  now: () => new Date(NOW),
};

const run = (
  operations: Operation[],
  from: LoadedProject = loaded,
): Promise<BatchResult> => runBatch(from, operations, io);

const SCREEN: Operation = {
  op: 'add_container',
  as: '$screen',
  name: 'Screen',
  width: 360,
  height: 640,
  background: '#FFFFFF',
};

const TYPE = (id: string) => ({ type: `arrange/${id}` });

/** A parent (`$p`) at (x, y) with one child per type in `kinds` (`$c0`, `$c1`, …), created with `inside`. */
function creation(parent: string, x: number, y: number, kinds: string[]): Operation[] {
  return [
    SCREEN,
    {
      op: 'create_marking',
      as: '$p',
      container: '$screen',
      annotation: TYPE(parent),
      rect: { x, y, ...SIZE[parent]! },
    } as Operation,
    ...kinds.map(
      (kind, i) =>
        ({
          op: 'create_marking',
          as: `$c${i}`,
          inside: '$p',
          annotation: TYPE(kind),
        }) as Operation,
    ),
  ];
}

const SIZE: Record<string, { width: number; height: number }> = {
  'centered-row': { width: 300, height: 60 },
  'end-column': { width: 120, height: 200 },
  'spread-row': { width: 200, height: 80 },
  'centered-box': { width: 200, height: 120 },
};

const ARRANGE = { op: 'arrange_marking', marking: '$p' } as Operation;

const idOf = (result: BatchResult, alias: string) =>
  (result.aliases.get(alias) as { id: string }).id;
const rectOf = (result: BatchResult, alias: string): Rect =>
  result.project.markings.find((m) => m.id === idOf(result, alias))!.rect;
const pos = (result: BatchResult, aliases: string[]) =>
  aliases.map((a) => {
    const r = rectOf(result, a);
    return [r.x, r.y, r.width, r.height];
  });

interface Case {
  name: string;
  parent: string;
  at: [number, number];
  kinds: string[];
  /** `[x, y, width, height]` of each child after `arrange_marking`. */
  arranged: number[][];
  /** The same with `inside` alone (decision 7 gives the numbers of the first case only). */
  started?: number[][];
}

const CASES: Case[] = [
  {
    name: 'centered-row: justify center',
    parent: 'centered-row',
    at: [20, 20],
    kinds: ['chip', 'chip', 'chip'],
    arranged: [
      [72, 38, 60, 24],
      [140, 38, 60, 24],
      [208, 38, 60, 24],
    ],
    started: [
      [28, 38, 60, 24],
      [96, 38, 60, 24],
      [164, 38, 60, 24],
    ],
  },
  {
    name: 'end-column: justify end with a weighted child',
    parent: 'end-column',
    at: [20, 100],
    kinds: ['chip', 'grow-chip', 'chip'],
    arranged: [
      [28, 108, 60, 24],
      [28, 140, 60, 120],
      [28, 268, 60, 24],
    ],
  },
  {
    name: 'end-column: justify end pushes two chips to the end',
    parent: 'end-column',
    at: [160, 100],
    kinds: ['chip', 'chip'],
    arranged: [
      [168, 236, 60, 24],
      [168, 268, 60, 24],
    ],
  },
  {
    name: 'spread-row: wrap with space-between',
    parent: 'spread-row',
    at: [20, 320],
    kinds: ['chip', 'chip', 'chip', 'chip'],
    arranged: [
      [28, 328, 60, 24],
      [152, 328, 60, 24],
      [28, 360, 60, 24],
      [152, 360, 60, 24],
    ],
  },
  {
    name: 'centered-box: the aligned none slot',
    parent: 'centered-box',
    at: [20, 420],
    kinds: ['chip'],
    arranged: [[90, 468, 60, 24]],
  },
];

describe('the arrange-slots fixture', () => {
  it('passes validate_library with no error', async () => {
    const result = ok(
      await mcp.call<{ valid: boolean; errors: unknown[] }>('validate_library', {
        path: 'telas/specs/arrange',
      }),
    );
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe('arrange_marking in the batch (decision 7)', () => {
  it.each(CASES)('$name', async (c) => {
    const children = c.kinds.map((_, i) => `$c${i}`);
    const create = creation(c.parent, c.at[0], c.at[1], c.kinds);

    // (c) `inside` alone: the children start in the slot.
    const before = await run(create);
    expect(before.errors).toEqual([]);
    if (c.started !== undefined) expect(pos(before, children)).toEqual(c.started);

    // (a) the numbers of decision 7.
    const after = await run([...create, ARRANGE]);
    expect(after.errors).toEqual([]);
    expect(after.invariantIssues).toEqual([]);
    expect(pos(after, children)).toEqual(c.arranged);
    expect(after.steps.at(-1)!.description).toMatch(
      /^Arrange the marking ".*": \d+ marking\(s\) moved or resized$/,
    );

    // (b) every rectangle of the subtree is `arrangeMarking`'s, called directly on the project before the step.
    const direct = arrangeMarking(
      before.project,
      before.catalog,
      idOf(before, '$p'),
      measurerFor(loaded.fonts ?? builtinFontBook()),
      { minSizeOf: (id) => componentMinSize(before.project, before.catalog, id) },
    );
    for (const alias of ['$p', ...children]) {
      const wanted = direct.project.markings.find(
        (m) => m.id === idOf(before, alias),
      )!.rect;
      expect(rectOf(after, alias), alias).toEqual(wanted);
    }
  });
});

describe('arrange_marking: errors and summary', () => {
  it('not-arrangeable on a chip and on a plain marking, with the hint naming fit_marking', async () => {
    const plain: Operation = {
      op: 'create_marking',
      as: '$plain',
      container: '$screen',
      rect: { x: 10, y: 10, width: 50, height: 50 },
    } as Operation;
    const chip: Operation = {
      op: 'create_marking',
      as: '$chip',
      container: '$screen',
      annotation: TYPE('chip'),
      rect: { x: 100, y: 10, width: 60, height: 24 },
    } as Operation;
    for (const marking of ['$chip', '$plain']) {
      const result = await run([
        SCREEN,
        plain,
        chip,
        { op: 'arrange_marking', marking } as Operation,
      ]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        index: 3,
        op: 'arrange_marking',
        code: 'not-arrangeable',
      });
      expect(result.errors[0]!.message).toContain('component with a slot');
      expect(result.errors[0]!.hint).toContain('fit_marking');
    }
  });

  it('a component with a slot and no children is not arrangeable either', async () => {
    const result = await run([...creation('centered-row', 20, 20, []), ARRANGE]);
    expect(result.errors[0]).toMatchObject({ code: 'not-arrangeable' });
  });

  it('locked: a child with locked geometry that would move', async () => {
    const built = await run(creation('centered-row', 20, 20, ['chip', 'chip', 'chip']));
    const lockedId = idOf(built, '$c0');
    const project = setMarkingLocked(built.project, lockedId, true);
    const parentId = idOf(built, '$p');
    const result = await run(
      [{ op: 'arrange_marking', marking: parentId } as Operation],
      {
        ...loaded,
        project,
      },
    );
    expect(result.errors[0]).toMatchObject({
      index: 0,
      op: 'arrange_marking',
      code: 'locked',
    });
  });

  it('an unknown alias and an unknown id are errors of the step', async () => {
    const alias = await run([{ op: 'arrange_marking', marking: '$nobody' } as Operation]);
    expect(alias.errors).toHaveLength(1);
    expect(alias.errors[0]).toMatchObject({
      op: 'arrange_marking',
      code: 'unknown-alias',
    });
    const id = await run([
      {
        op: 'arrange_marking',
        marking: 'ffffffff-0000-4000-8000-000000000009',
      } as Operation,
    ]);
    expect(id.errors).toHaveLength(1);
    expect(id.errors[0]).toMatchObject({ op: 'arrange_marking', code: 'not-found' });
  });

  it('arranging twice: the second step changes nothing', async () => {
    const result = await run([
      ...creation('centered-row', 20, 20, ['chip', 'chip', 'chip']),
      ARRANGE,
      ARRANGE,
    ]);
    expect(result.errors).toEqual([]);
    expect(result.steps.at(-1)!.description).toMatch(
      /^The marking ".*" is already arranged: nothing changes$/,
    );
  });
});

describe('arrange_marking in the preview, the render and the proposal (decision 6)', () => {
  const operations = [
    ...creation('centered-row', 20, 20, ['chip', 'chip', 'chip']),
    ARRANGE,
  ];

  it('plan_changes is valid and summarizes the arrange; repeating the step says nothing changes', async () => {
    const plan = await planChanges(roots, loaded.location, operations, () =>
      Date.parse(NOW),
    );
    expect(plan.valid).toBe(true);
    const summary = (plan.summary as string[]).join('\n');
    expect(summary).toMatch(
      /Arrange the marking ".*": \d+ marking\(s\) moved or resized/,
    );
    const twice = await planChanges(
      roots,
      loaded.location,
      [...operations, ARRANGE],
      () => Date.parse(NOW),
    );
    expect(twice.valid).toBe(true);
    expect((twice.summary as string[]).join('\n')).toContain(
      'is already arranged: nothing changes',
    );
  });

  it('render_container of the batch paints the chip at its arranged place', async () => {
    const result = await mcp.client.callTool({
      name: 'render_container',
      arguments: { project: 'telas', ref: '$screen', operations },
    });
    const content = result.content as { type: string; data?: string }[];
    expect(result.isError, JSON.stringify(content)).not.toBe(true);
    const data = content.find((c) => c.type === 'image')!.data!;
    const { raster } = await decodeImage(Buffer.from(data, 'base64'));
    const at = (x: number, y: number) => {
      const i = (y * raster.width + x) * 4;
      return [...raster.data.slice(i, i + 3)];
    };
    // The first chip is at x 72..132, y 38..62 after the arrange (28..88 before it): the center is (102, 50).
    expect(at(102, 50)).toEqual([0x67, 0x50, 0xa4]);
    expect(at(40, 50)).toEqual([255, 255, 255]);
  });

  it('propose_changes, accept all and apply give the rectangles of the plan', async () => {
    const planned = await run(operations);
    const proposed = await propose(mcp, 'telas', operations);
    expect(proposed.valid, JSON.stringify(proposed)).toBe(true);
    const saved = acceptAllAndApply(dir(), proposed.proposal.id);
    const container = saved.containers.find((c) => c.name === 'Screen')!;
    const markings = saved.markings.filter((m) => m.containerId === container.id);
    expect(markings).toHaveLength(4);
    const rects = (project: Project, containerId: string) =>
      project.markings
        .filter((m) => m.containerId === containerId)
        .map((m) => m.rect)
        .sort((a, b) => a.x - b.x || a.y - b.y);
    const plannedContainer = planned.project.containers.find((c) => c.name === 'Screen')!;
    expect(rects(saved, container.id)).toEqual(
      rects(planned.project, plannedContainer.id),
    );
    ok(await mcp.call('list_projects'));
  });
});
