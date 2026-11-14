import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  createDrawingCache,
  createMarking,
  createProject,
  imageCanvasRect,
  serialize,
  setMarkingAnchor,
  setMarkingLocked,
  type Project,
} from '../../src/model';
import { walk } from '../../src/model/components/scene';
import { runBatch, type BatchResult } from '../../mcp/batch';
import { planChanges } from '../../mcp/changes';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject, type LoadedProject } from '../../mcp/projects';
import { NOW } from '../model/fixtures';
import {
  TIP_COMPONENTS,
  TIP_SPEC_ID,
  TIP_SPEC_JSON,
  tipCatalog,
  tipSpec,
} from '../model/tooltipFixtures';
import {
  acceptAllAndApply,
  applyAcceptedOnDisk,
  errorOf,
  ok,
  propose,
  readProposal,
  reviewDecide,
} from './proposalSupport';
import { connect, type Connection } from './workspace';

// R3 of stage #1096: the anchor in the MCP. `anchor` in `create_marking` (without `rect` it is born snapped) and
// in `update_marking` (`null` removes it), the `snap_to_anchor` op (in the batch and in the proposal), `get_marking`
// (`anchor`, `anchoredBy`) and `get_code_hints` (`anchor`). The server never writes the project:
// "direct" is the batch (`runBatch`) and the preview (`plan_changes`).

const IMAGE = 'bbbbbbbb-0000-4000-8000-000000000001';
const LAYER = 'cccccccc-0000-4000-8000-000000000001';
const TARGET = 'dddddddd-0000-4000-8000-000000000001';
const TIP = 'dddddddd-0000-4000-8000-000000000002';
const TIP_A = 'eeeeeeee-0000-4000-8000-000000000002';
const LOCKED = 'dddddddd-0000-4000-8000-000000000003';
const LOOSE = 'dddddddd-0000-4000-8000-000000000004';
const LOOSE2 = 'dddddddd-0000-4000-8000-000000000006';
const LOOSE3 = 'dddddddd-0000-4000-8000-000000000007';
const CANVAS = 'dddddddd-0000-4000-8000-000000000005';
const TARGET_RECT = { x: 200, y: 200, width: 100, height: 40 };

let base: string;
let roots: Roots;
let loaded: LoadedProject;
let mcp: Connection;

/** A target, a tooltip already anchored to it (the snap is done), a locked anchored one and a loose one. */
function project(): Project {
  let p = createProject({
    name: 'Screens',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Camada 1', color: '#D32F2F' },
  });
  p = addContainer(p, { id: IMAGE, file: 'images/photo.png', width: 600, height: 400 });
  p = applySpecialization(p, tipSpec(), { packageSpecName: 'tip.spec.json' });
  p = createMarking(p, {
    id: TARGET,
    containerId: IMAGE,
    name: 'Target',
    rect: TARGET_RECT,
  });
  const tip = (id: string, annotationId: string, x: number, y: number) =>
    addComponentMarking(
      p,
      tipCatalog(),
      {
        markingId: id,
        annotationId,
        containerId: IMAGE,
        parentId: null,
        specId: TIP_SPEC_ID,
        typeId: 'tooltip',
        rect: { x, y, width: 100, height: 48 },
      },
      approximateMeasurer,
    );
  p = tip(TIP, TIP_A, 200, 148);
  p = setMarkingAnchor(p, TIP, { to: TARGET, side: 'top' });
  p = tip(LOCKED, 'eeeeeeee-0000-4000-8000-000000000003', 20, 20);
  p = setMarkingAnchor(p, LOCKED, { to: TARGET });
  p = setMarkingLocked(p, LOCKED, true);
  p = createMarking(p, {
    id: LOOSE,
    containerId: IMAGE,
    rect: { x: 400, y: 300, width: 50, height: 50 },
  });
  // Two more loose ones: each proposal test applies on disk and uses its own.
  p = createMarking(p, {
    id: LOOSE2,
    containerId: IMAGE,
    rect: { x: 400, y: 100, width: 50, height: 50 },
  });
  p = createMarking(p, {
    id: LOOSE3,
    containerId: IMAGE,
    rect: { x: 500, y: 100, width: 50, height: 50 },
  });
  return createMarking(p, {
    id: CANVAS,
    containerId: null,
    rect: { x: 1000, y: 1000, width: 80, height: 40 },
  });
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-anchor-'));
  const dir = join(base, 'screens');
  mkdirSync(join(dir, 'specs', 'tip', 'components'), { recursive: true });
  writeFileSync(
    join(dir, 'specs', 'tip', 'tip.spec.json'),
    JSON.stringify(TIP_SPEC_JSON),
  );
  for (const [id, component] of Object.entries(TIP_COMPONENTS)) {
    writeFileSync(
      join(dir, 'specs', 'tip', 'components', `${id}.json`),
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
const markingIn = (result: BatchResult, id: string) =>
  result.project.markings.find((m) => m.id === id)!;
const aliasId = (result: BatchResult, alias: string) =>
  (result.aliases.get(alias) as { id: string }).id;
const snap = (marking: string): Operation => ({ op: 'snap_to_anchor', marking });
const createTip = (extra: Record<string, unknown> = {}): Operation =>
  ({
    op: 'create_marking',
    as: '$tip',
    container: IMAGE,
    annotation: { type: `${TIP_SPEC_ID}/tooltip` },
    anchor: { to: TARGET },
    ...extra,
  }) as Operation;

/** The visible arrow of the tooltip: the top-left corner, relative to its box. */
function arrowOf(project: Project, id: string): [number, number] | undefined {
  const drawing = createDrawingCache()(project, tipCatalog(), approximateMeasurer, 0).get(
    id,
  );
  const node = [...walk(drawing!.root)].find((n) => n.name === 'seta' && n.visible);
  return node === undefined ? undefined : [node.transform[4], node.transform[5]];
}

describe('create_marking with anchor', () => {
  it('without rect it is born at the component size, snapped above the anchor, with the arrow under its center (in a batch)', async () => {
    const result = await run([
      {
        op: 'create_marking',
        as: '$target',
        container: IMAGE,
        rect: { x: 300, y: 250, width: 120, height: 40 },
      } as Operation,
      createTip({ anchor: { to: '$target' } }),
    ]);
    expect(result.errors).toEqual([]);
    const target = aliasId(result, '$target');
    const tip = markingIn(result, aliasId(result, '$tip'));
    // 100 × 48 above the target (y 250), with the component's offset.main 4; centered at 300 + 60.
    expect(tip.rect).toEqual({ x: 310, y: 198, width: 100, height: 48 });
    expect(tip.anchor).toEqual({ to: target });
    expect(arrowOf(result.project, tip.id)).toEqual([42, 40]);
    expect(result.steps[1]!.description).toContain('initial size of the component');
    expect(result.invariantIssues).toEqual([]);
  });

  it('with side, align and offset given, the given ones apply (offset in pixels)', async () => {
    const result = await run([
      createTip({
        anchor: {
          to: TARGET,
          side: 'bottom',
          align: 'start',
          offset: { main: 10, cross: 3 },
        },
      }),
    ]);
    expect(result.errors).toEqual([]);
    expect(markingIn(result, aliasId(result, '$tip')).rect).toEqual({
      x: 203,
      y: 250,
      width: 100,
      height: 48,
    });
  });

  it('with a given rect, it wins and the anchor is stored', async () => {
    const rect = { x: 10, y: 10, width: 100, height: 48 };
    const result = await run([createTip({ rect })]);
    const tip = markingIn(result, aliasId(result, '$tip'));
    expect(tip.rect).toEqual(rect);
    expect(tip.anchor).toEqual({ to: TARGET });
  });

  it('a marking without a component and without rect is still a clear error', async () => {
    const result = await run([
      { op: 'create_marking', container: IMAGE, anchor: { to: TARGET } } as Operation,
    ]);
    expect(result.errors[0]).toMatchObject({ code: 'invalid-arguments' });
    expect(result.errors[0]!.message).toContain('`rect` is required');
  });

  it('without a component and with rect, the anchor is stored without moving', async () => {
    const rect = { x: 10, y: 10, width: 40, height: 40 };
    const result = await run([
      {
        op: 'create_marking',
        as: '$m',
        container: IMAGE,
        rect,
        anchor: { to: TARGET, side: 'start' },
      } as Operation,
    ]);
    expect(result.errors).toEqual([]);
    expect(markingIn(result, aliasId(result, '$m'))).toMatchObject({
      rect,
      anchor: { to: TARGET, side: 'start' },
    });
  });

  it('errors: nonexistent anchor, in another space', async () => {
    const missing = await run([
      createTip({ anchor: { to: 'ffffffff-0000-4000-8000-000000000009' } }),
    ]);
    expect(missing.errors).toHaveLength(1);
    expect(missing.errors[0]!.op).toBe('create_marking');
    const other = await run([createTip({ anchor: { to: CANVAS } })]);
    expect(other.errors[0]).toMatchObject({ code: 'anchor-other-space' });
  });
});

describe('create_marking with anchor: settling takes the new one to a different space than the target', () => {
  /** A canvas target over the right edge of the image and the rectangle (in the canvas) inside it. */
  function edge(): { target: Operation; inside: Record<string, number> } {
    const image = loaded.project.containers.find((c) => c.id === IMAGE)!;
    const box = imageCanvasRect(image, image.placement);
    const x = Math.round(box.x + box.width);
    const top = Math.round(box.y);
    return {
      target: {
        op: 'create_marking',
        as: '$edge',
        rect: { x: x - 20, y: top + 100, width: 100, height: 40 },
      } as Operation,
      inside: { x: x - 200, y: top + 100, width: 50, height: 40 },
    };
  }

  it('without a component: the marking is born without an anchor, with a warning (the operation does not fail)', async () => {
    const { target, inside } = edge();
    const result = await run([
      target,
      {
        op: 'create_marking',
        as: '$m',
        rect: inside,
        anchor: { to: '$edge', side: 'start' },
      } as Operation,
    ]);
    expect(result.errors).toEqual([]);
    const m = markingIn(result, aliasId(result, '$m'));
    expect(m.containerId).toBe(IMAGE);
    expect(m.anchor ?? null).toBeNull();
    expect(result.deprecations.map((d) => d.message).join(' ')).toContain('anchor');
    expect(result.invariantIssues).toEqual([]);
  });
});

describe('update_marking with anchor', () => {
  it('stores the anchor without moving and null removes it', async () => {
    const result = await run([
      {
        op: 'update_marking',
        marking: LOOSE,
        anchor: {
          to: TARGET,
          side: 'end',
          align: 'start',
          offset: { main: 2, cross: 0 },
        },
      } as Operation,
    ]);
    expect(result.errors).toEqual([]);
    expect(markingIn(result, LOOSE).anchor).toEqual({
      to: TARGET,
      side: 'end',
      align: 'start',
      offset: { main: 2, cross: 0 },
    });
    expect(markingIn(result, LOOSE).rect).toEqual({
      x: 400,
      y: 300,
      width: 50,
      height: 50,
    });
    expect(result.steps[0]!.description).toContain('anchor to');
    const removed = await run([
      { op: 'update_marking', marking: TIP, anchor: null } as Operation,
    ]);
    expect(removed.errors).toEqual([]);
    expect(markingIn(removed, TIP).anchor ?? null).toBeNull();
    expect(removed.steps[0]!.description).toContain('remove the anchor');
  });

  it('the errors anchor-self, anchor-cycle and anchor-other-space', async () => {
    const self = await run([
      { op: 'update_marking', marking: LOOSE, anchor: { to: LOOSE } } as Operation,
    ]);
    expect(self.errors[0]).toMatchObject({ op: 'update_marking', code: 'anchor-self' });
    const cycle = await run([
      { op: 'update_marking', marking: TARGET, anchor: { to: TIP } } as Operation,
    ]);
    expect(cycle.errors[0]).toMatchObject({ code: 'anchor-cycle' });
    const other = await run([
      { op: 'update_marking', marking: LOOSE, anchor: { to: CANVAS } } as Operation,
    ]);
    expect(other.errors[0]).toMatchObject({ code: 'anchor-other-space' });
  });

  it('the anchor removed and then the marking moved: nothing to carry along', async () => {
    const result = await run([
      { op: 'update_marking', marking: TIP, anchor: null } as Operation,
      { op: 'update_marking', marking: TARGET, move: { dx: 50, dy: 0 } } as Operation,
    ]);
    expect(markingIn(result, TIP).rect.x).toBe(200);
  });
});

describe('moving the anchor and snapping again', () => {
  it('moving the anchor carries the tooltip along; changing the size and snap_to_anchor snaps it again', async () => {
    const moved = await run([
      { op: 'update_marking', marking: TARGET, move: { dx: 60, dy: 20 } } as Operation,
    ]);
    expect(moved.errors).toEqual([]);
    expect(markingIn(moved, TIP).rect).toEqual({
      x: 260,
      y: 168,
      width: 100,
      height: 48,
    });

    const result = await run([
      {
        op: 'update_marking',
        marking: TIP,
        rect: { x: 200, y: 148, width: 100, height: 70 },
      } as Operation,
      snap(TIP),
    ]);
    expect(result.errors).toEqual([]);
    const tip = markingIn(result, TIP);
    // Taller (70): the snap rises until the bottom edge is 4 above the anchor (y 200).
    expect(tip.rect).toEqual({ x: 200, y: 126, width: 100, height: 70 });
    const step = result.steps[1]!;
    expect(step.description).toContain('Snap the marking');
    expect(step.description).toContain('100×70 px at (200, 148)');
    expect(step.description).toContain('100×70 px at (200, 126)');
    expect(result.invariantIssues).toEqual([]);
  });

  it('the component default (offset.main 4) applies when the anchor does not state the offset', async () => {
    const result = await run([
      {
        op: 'update_marking',
        marking: TIP,
        rect: { x: 0, y: 0, width: 100, height: 48 },
      } as Operation,
      snap(TIP),
    ]);
    expect(markingIn(result, TIP).rect).toEqual({
      x: 200,
      y: 148,
      width: 100,
      height: 48,
    });
  });

  it('nothing to change: the summary says so and the project is the same', async () => {
    const result = await run([snap(TIP)]);
    expect(result.errors).toEqual([]);
    expect(result.steps[0]!.description).toContain('nothing changes');
    expect(result.project.markings).toEqual(loaded.project.markings);
  });

  it('the errors: not-anchored, locked and unknown reference', async () => {
    const loose = await run([snap(LOOSE)]);
    expect(loose.errors[0]).toMatchObject({
      index: 0,
      op: 'snap_to_anchor',
      code: 'not-anchored',
    });
    expect(loose.errors[0]!.hint).toContain('anchor');
    const locked = await run([snap(LOCKED)]);
    expect(locked.errors[0]).toMatchObject({ code: 'locked' });
    const missing = await run([snap('ffffffff-0000-4000-8000-000000000009')]);
    expect(missing.errors).toHaveLength(1);
    expect(missing.errors[0]!.op).toBe('snap_to_anchor');
  });

  it('an alias of a marking created in the same batch works', async () => {
    const result = await run([
      createTip({ rect: { x: 10, y: 10, width: 100, height: 48 } }),
      snap('$tip'),
    ]);
    expect(result.errors).toEqual([]);
    expect(markingIn(result, aliasId(result, '$tip')).rect.y).toBe(148);
  });
});

describe('reading: get_marking and get_code_hints', () => {
  const ref = async (id: string): Promise<string> =>
    ok(await mcp.call<{ ref: string }>('get_marking', { ref: id, project: 'screens' }))
      .ref;

  it('get_marking of the anchored one returns anchor with to as a reference; the anchor returns anchoredBy', async () => {
    const tip = ok(
      await mcp.call<Record<string, unknown>>('get_marking', {
        ref: TIP,
        project: 'screens',
      }),
    );
    expect(tip.anchor).toEqual({ to: await ref(TARGET), side: 'top' });
    expect(tip.anchoredBy).toEqual([]);
    const target = ok(
      await mcp.call<Record<string, unknown>>('get_marking', {
        ref: TARGET,
        project: 'screens',
      }),
    );
    expect(target.anchor).toBeNull();
    expect(target.anchoredBy).toEqual(
      expect.arrayContaining([await ref(TIP), await ref(LOCKED)]),
    );
    expect((target.anchoredBy as string[]).length).toBe(2);
  });

  it('get_marking of a marking without a relation brings anchor null and empty anchoredBy', async () => {
    const loose = ok(
      await mcp.call<Record<string, unknown>>('get_marking', {
        ref: LOOSE,
        project: 'screens',
      }),
    );
    expect(loose.anchor).toBeNull();
    expect(loose.anchoredBy).toEqual([]);
  });

  it("get_code_hints returns anchor with the effective side and alignment (declared or the component's)", async () => {
    const hints = ok(
      await mcp.call<{ anchor?: unknown; tree: { anchor?: unknown } }>('get_code_hints', {
        ref: TIP,
        platform: 'web',
        project: 'screens',
      }),
    );
    expect(hints.anchor).toEqual({
      marking: await ref(TARGET),
      side: 'top',
      align: 'center',
    });
    expect(hints.tree.anchor).toEqual(hints.anchor);
    const defaults = ok(
      await mcp.call<{ anchor?: unknown }>('get_code_hints', {
        ref: LOCKED,
        platform: 'web',
        project: 'screens',
      }),
    );
    expect(defaults.anchor).toEqual({
      marking: await ref(TARGET),
      side: 'top',
      align: 'center',
    });
    const none = ok(
      await mcp.call<{ anchor?: unknown }>('get_code_hints', {
        ref: TARGET,
        platform: 'web',
        project: 'screens',
      }),
    );
    expect(none.anchor).toBeUndefined();
  });
});

describe('plan_changes: the direct preview', () => {
  it('validates the anchor and the snap, summarizes the rectangle and writes nothing', async () => {
    const plan = await planChanges(
      roots,
      loaded.location,
      [
        {
          op: 'update_marking',
          marking: TIP,
          rect: { x: 0, y: 0, width: 100, height: 48 },
        } as Operation,
        snap(TIP),
      ],
      () => Date.parse(NOW),
    );
    expect(plan.valid).toBe(true);
    expect((plan.summary as string[]).join('\n')).toContain('Snap the marking');
    const again = await planChanges(roots, loaded.location, [snap(LOOSE)], () =>
      Date.parse(NOW),
    );
    expect(again.valid).toBe(false);
  });

  it('through the stdio client: the same preview and the not-anchored error', async () => {
    const plan = ok(
      await mcp.call<{ valid: boolean; summary: string[] }>('plan_changes', {
        project: 'screens',
        operations: [
          { op: 'update_marking', marking: TARGET, move: { dx: 10, dy: 0 } },
          snap(TIP),
        ],
      }),
    );
    expect(plan.valid).toBe(true);
    const failed = await mcp.call<{ valid: boolean; errors: { code: string }[] }>(
      'plan_changes',
      { project: 'screens', operations: [snap(LOOSE)] },
    );
    expect(failed.data.valid).toBe(false);
    expect(failed.data.errors[0]!.code).toBe('not-anchored');
    expect(errorOf).toBeDefined();
  });
});

describe('anchor and snap_to_anchor in a proposal', () => {
  const dir = () => join(base, 'screens');
  const operations = (marking = LOOSE): Operation[] => [
    {
      op: 'update_marking',
      marking,
      anchor: { to: TARGET, side: 'bottom' },
    } as Operation,
    snap(marking),
  ];

  it('the review brings the anchor (anchor field) and the Position; the proposal writes formatVersion 9', async () => {
    const proposed = await propose(mcp, 'screens', operations(), {
      title: 'Anchor the loose one',
    });
    expect(proposed.valid).toBe(true);
    const proposal = readProposal(dir(), proposed.proposal.id);
    expect(proposal.formatVersion).toBe(9);
    const anchor = proposal.changes.find(
      (c) => c.entity === 'marking' && c.field === 'anchor',
    )!;
    const rect = proposal.changes.find(
      (c) => c.entity === 'marking' && c.field === 'rect',
    )!;
    expect(anchor).toMatchObject({ from: null, to: { to: TARGET, side: 'bottom' } });
    expect(rect).toMatchObject({ from: { x: 400, y: 300, width: 50, height: 50 } });
    expect(proposed.summary.join('\n')).toContain('Snap the marking');
  });

  it('accepting only the anchor stores the anchor and leaves the rectangle', async () => {
    const proposed = await propose(mcp, 'screens', operations(LOOSE2), {
      title: 'Only the anchor',
    });
    const proposal = readProposal(dir(), proposed.proposal.id);
    const anchor = proposal.changes.find((c) => c.field === 'anchor')!;
    const rect = proposal.changes.find((c) => c.field === 'rect')!;
    reviewDecide(
      dir(),
      proposed.proposal.id,
      { level: 'change', id: anchor.id },
      'accepted',
    );
    reviewDecide(
      dir(),
      proposed.proposal.id,
      { level: 'change', id: rect.id },
      'rejected',
    );
    const applied = applyAcceptedOnDisk(dir(), proposed.proposal.id);
    const marking = applied.markings.find((m) => m.id === LOOSE2)!;
    expect(marking.anchor).toEqual({ to: TARGET, side: 'bottom' });
    expect(marking.rect).toEqual({ x: 400, y: 100, width: 50, height: 50 });
  });

  it('accepting only the Position moves and does not store the anchor', async () => {
    const proposed = await propose(mcp, 'screens', operations(LOOSE3), {
      title: 'Only the position',
    });
    const proposal = readProposal(dir(), proposed.proposal.id);
    const anchor = proposal.changes.find((c) => c.field === 'anchor')!;
    const rect = proposal.changes.find((c) => c.field === 'rect')!;
    reviewDecide(
      dir(),
      proposed.proposal.id,
      { level: 'change', id: rect.id },
      'accepted',
    );
    reviewDecide(
      dir(),
      proposed.proposal.id,
      { level: 'change', id: anchor.id },
      'rejected',
    );
    const applied = applyAcceptedOnDisk(dir(), proposed.proposal.id);
    const marking = applied.markings.find((m) => m.id === LOOSE3)!;
    expect(marking.anchor ?? null).toBeNull();
    expect(marking.rect).toMatchObject({ x: 225, y: 240 });
  });

  it('only snap_to_anchor (on an already anchored one): it is the usual Position, without raising the version', async () => {
    const proposed = await propose(
      mcp,
      'screens',
      [
        {
          op: 'update_marking',
          marking: TIP,
          rect: { x: 200, y: 148, width: 100, height: 70 },
        } as Operation,
        snap(TIP),
      ],
      { title: 'Re-snap' },
    );
    const proposal = readProposal(dir(), proposed.proposal.id);
    expect(proposal.formatVersion).toBeLessThan(9);
    const applied = acceptAllAndApply(dir(), proposed.proposal.id);
    expect(applied.markings.find((m) => m.id === TIP)!.rect).toEqual({
      x: 200,
      y: 126,
      width: 100,
      height: 70,
    });
  });
});
