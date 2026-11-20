import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  createMarking,
  createProject,
  serialize,
  setMarkingAnchor,
  type Project,
  type Rect,
} from '../../src/model';
import { runBatch, type BatchResult } from '../../mcp/batch';
import { operationSchema, type Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject, type LoadedProject } from '../../mcp/projects';
import {
  CORNER_COMPONENTS,
  CORNER_SPEC_ID,
  CORNER_SPEC_JSON,
  cornerCatalog,
  cornerSpec,
} from '../model/cornerFixtures';
import { NOW } from '../model/fixtures';
import { ok, propose, readProposal } from './proposalSupport';
import { connect, type Connection } from './workspace';

// Corner alignment in the MCP (stage #2093, CC3, decisions 12, 13 and 15): `create_marking` with
// `anchor: { to, side: top, align: corner-end }` and no `rect` is born centered on the corner,
// `fit_marking` + `snap_to_anchor` keep it there while the count grows, `get_marking` and
// `get_code_hints` return the alignment, and the proposal stays at `formatVersion` 9.

const IMAGE = 'bbbbbbbb-0000-4000-8000-000000000001';
const LAYER = 'cccccccc-0000-4000-8000-000000000001';
const ICON = 'dddddddd-0000-4000-8000-000000000001';
const ICON_RECT: Rect = { x: 200, y: 200, width: 100, height: 40 };
/** The top-end corner of the bare icon (ltr). */
const CORNER = { x: 300, y: 200 };
// Two badges already on the icon: one that states the corner and one that takes the component default.
const BADGE = 'dddddddd-0000-4000-8000-000000000002';
const BADGE_A = 'eeeeeeee-0000-4000-8000-000000000002';
const DEFAULT_BADGE = 'dddddddd-0000-4000-8000-000000000003';
const DEFAULT_BADGE_A = 'eeeeeeee-0000-4000-8000-000000000003';

let base: string;
let roots: Roots;
let loaded: LoadedProject;
let mcp: Connection;

function project(): Project {
  let p = createProject({
    name: 'Screens',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Layer 1', color: '#D32F2F' },
  });
  p = addContainer(p, { id: IMAGE, file: 'images/photo.png', width: 600, height: 400 });
  p = applySpecialization(p, cornerSpec(), { packageSpecName: 'corner.spec.json' });
  p = createMarking(p, {
    id: ICON,
    containerId: IMAGE,
    name: 'Icon',
    rect: ICON_RECT,
  });
  const badge = (id: string, annotationId: string, x: number) =>
    addComponentMarking(
      p,
      cornerCatalog(),
      {
        markingId: id,
        annotationId,
        containerId: IMAGE,
        parentId: null,
        specId: CORNER_SPEC_ID,
        typeId: 'badge',
        rect: { x, y: 300, width: 16, height: 16 },
      },
      approximateMeasurer,
    );
  p = badge(BADGE, BADGE_A, 20);
  p = setMarkingAnchor(p, BADGE, { to: ICON, side: 'top', align: 'corner-end' });
  p = badge(DEFAULT_BADGE, DEFAULT_BADGE_A, 60);
  return setMarkingAnchor(p, DEFAULT_BADGE, { to: ICON });
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-anchor-corner-'));
  const dir = join(base, 'screens');
  mkdirSync(join(dir, 'specs', 'corner', 'components'), { recursive: true });
  writeFileSync(
    join(dir, 'specs', 'corner', 'corner.spec.json'),
    JSON.stringify(CORNER_SPEC_JSON),
  );
  for (const [id, component] of Object.entries(CORNER_COMPONENTS)) {
    writeFileSync(
      join(dir, 'specs', 'corner', 'components', `${id}.json`),
      JSON.stringify(component),
    );
  }
  writeFileSync(join(dir, 'mapping.json'), serialize(project()));
  roots = new Roots([base]);
  loaded = await loadProject(roots, await findProject(roots, 'screens'));
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

const run = (operations: Operation[]): Promise<BatchResult> =>
  runBatch(loaded, operations, io);
const aliasId = (result: BatchResult, alias: string) =>
  (result.aliases.get(alias) as { id: string }).id;
const rectOf = (result: BatchResult, alias: string): Rect =>
  result.project.markings.find((m) => m.id === aliasId(result, alias))!.rect;
const centerOf = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const expectOnCorner = (rect: Rect) => {
  const center = centerOf(rect);
  expect(Math.abs(center.x - CORNER.x)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(center.y - CORNER.y)).toBeLessThanOrEqual(0.5);
};

const createBadge = (anchor: Record<string, unknown>, count?: string): Operation =>
  ({
    op: 'create_marking',
    as: '$badge',
    container: IMAGE,
    annotation: {
      type: `${CORNER_SPEC_ID}/badge`,
      ...(count === undefined ? {} : { values: { count } }),
    },
    anchor,
  }) as Operation;

describe('create_marking with a corner anchor', () => {
  it('without rect it is born with its center on the corner (explicit align)', async () => {
    const result = await run([
      createBadge({ to: ICON, side: 'top', align: 'corner-end' }),
    ]);
    expect(result.errors).toEqual([]);
    expectOnCorner(rectOf(result, '$badge'));
    expect(
      result.project.markings.find((m) => m.id === aliasId(result, '$badge'))!.anchor,
    ).toEqual({ to: ICON, side: 'top', align: 'corner-end' });
    expect(result.invariantIssues).toEqual([]);
  });

  it("the component root's `corner-end` applies when the anchor does not say", async () => {
    const result = await run([createBadge({ to: ICON })]);
    expect(result.errors).toEqual([]);
    expectOnCorner(rectOf(result, '$badge'));
  });

  it('`corner-start` is the other corner', async () => {
    const result = await run([
      createBadge({ to: ICON, side: 'top', align: 'corner-start' }),
    ]);
    expect(result.errors).toEqual([]);
    const center = centerOf(rectOf(result, '$badge'));
    expect(Math.abs(center.x - 200)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(center.y - 200)).toBeLessThanOrEqual(0.5);
  });

  it('the operation schema accepts the five alignments and refuses any other', () => {
    const parse = (align: string) =>
      operationSchema.safeParse(createBadge({ to: ICON, side: 'top', align })).success;
    for (const align of ['start', 'center', 'end', 'corner-start', 'corner-end']) {
      expect(parse(align), align).toBe(true);
    }
    expect(parse('corner-middle')).toBe(false);
  });
});

describe('fit_marking + snap_to_anchor keep the center on the corner', () => {
  const relabel = (count: string): Operation =>
    ({ op: 'update_annotation', annotation: BADGE_A, values: { count } }) as Operation;
  const widthAfter = async (count: string) => {
    const result = await run([
      relabel(count),
      { op: 'fit_marking', marking: BADGE } as Operation,
      { op: 'snap_to_anchor', marking: BADGE } as Operation,
    ]);
    expect(result.errors).toEqual([]);
    const rect = result.project.markings.find((m) => m.id === BADGE)!.rect;
    expectOnCorner(rect);
    return rect.width;
  };

  it.each(['3', '12', '99+'])('count %s', async (count) => {
    await widthAfter(count);
  });

  it('the badge grows with the text and the center stays', async () => {
    expect(await widthAfter('99+')).toBeGreaterThan(await widthAfter('3'));
  });
});

describe('reading: get_marking and get_code_hints return the corner alignment', () => {
  const ref = async (id: string): Promise<string> =>
    ok(await mcp.call<{ ref: string }>('get_marking', { ref: id, project: 'screens' }))
      .ref;

  it('get_marking returns the declared `corner-end`', async () => {
    const marking = ok(
      await mcp.call<{ anchor: Record<string, unknown> }>('get_marking', {
        ref: BADGE,
        project: 'screens',
      }),
    );
    expect(marking.anchor).toEqual({
      to: await ref(ICON),
      side: 'top',
      align: 'corner-end',
    });
  });

  it('get_code_hints returns align `corner-end`, declared or from the component root', async () => {
    for (const id of [BADGE, DEFAULT_BADGE]) {
      const hints = ok(
        await mcp.call<{ anchor?: unknown; tree: { anchor?: unknown } }>(
          'get_code_hints',
          { ref: id, platform: 'web', project: 'screens' },
        ),
      );
      expect(hints.anchor).toEqual({
        marking: await ref(ICON),
        side: 'top',
        align: 'corner-end',
      });
      expect(hints.tree.anchor).toEqual(hints.anchor);
    }
  });
});

describe('the proposal with a corner anchor', () => {
  it('stays at formatVersion 9 and carries `corner-end` in the anchor change', async () => {
    const proposed = await propose(
      mcp,
      'screens',
      [
        createBadge({ to: ICON, side: 'top', align: 'corner-end' }),
        { op: 'snap_to_anchor', marking: '$badge' } as Operation,
      ],
      { title: 'Badge on the icon' },
    );
    expect(proposed.valid).toBe(true);
    // The schema raise does not raise the proposal format (decision 14 of #2093).
    const proposal = readProposal(join(base, 'screens'), proposed.proposal.id);
    expect(proposal.formatVersion).toBe(9);
    expect(JSON.stringify(proposal.changes)).toContain('"align":"corner-end"');
  });
});
