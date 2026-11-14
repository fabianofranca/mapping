import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addPerspective,
  approximateMeasurer,
  componentPlacement,
  placementIsFree,
  buildListing,
  buildPerspective,
  createMarking,
  canMoveItems,
  deserialize,
  getAnnotationIssues,
  getBacklinks,
  itemsDeletionImpact,
  layerDotsByMarking,
  markingVisibility,
  moveItems,
  moveMarking,
  nearestFreeSpot,
  projectIndex,
  projectIssues,
  type Rect,
  refsOf,
  removeItems,
  serialize,
  settleHierarchy,
  validateProject,
  type ItemRef,
  type Project,
} from '../../src/model';
import { expectLinearGrowth, GROWTH_OPTIONS } from '../support/growth';
import { expectBelow } from '../support/perfReport';
import { SPEC_ID, componentProject, testCatalog } from './componentFixtures';
import { buildLargeProject } from './largeProject';
import { buildLargeTypedProject } from './largeTypedProject';

// Loose limits (CI and the phone are slower than the desktop): the goal is
// to catch gross regressions (something turning O(n²) or worse) with 20 images and 500 markings.
const BUDGET_MS = 500;

function time<T>(fn: () => T): { value: T; ms: number } {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
}

describe('large project (20 images, 500 markings)', () => {
  const project = buildLargeProject();

  it('the fixture is valid', () => {
    expect(project.containers).toHaveLength(20);
    expect(project.markings).toHaveLength(500);
    expect(validateProject(project)).toEqual([]);
  });

  it('validates the invariants fast', () => {
    expect(time(() => validateProject(project)).ms).toBeLessThan(BUDGET_MS);
  });

  it('serializes and reads back losslessly, fast', () => {
    const written = time(() => serialize(project));
    const read = time(() => deserialize(written.value));
    expect(written.ms + read.ms).toBeLessThan(BUDGET_MS);
    expect(read.value.ok && serialize(read.value.project)).toBe(written.value);
  });

  it('builds the list fast', () => {
    const { value, ms } = time(() =>
      buildListing(project, project.layers, { showEmpty: true }),
    );
    expect(value.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('settling the large project (containment by geometry) is fast and stable', () => {
    const settled = time(() => settleHierarchy({ ...project }));
    expect(settled.ms).toBeLessThan(BUDGET_MS);
    // The fixture is already settled: there is nothing to change and the result is the same, marking by marking.
    expect(settled.value.markings).toEqual(project.markings);
    expect(settled.value.containers).toEqual(project.containers);
    // Settling again is idempotent (returns the same object).
    expect(settleHierarchy(settled.value)).toBe(settled.value);
  });

  it('settling 500 markings in a single container (the worst case, O(n²) per space) fits the budget', () => {
    const dense = buildLargeProject({
      images: 1,
      markingsPerImage: 500,
      imageWidth: 100000,
    });
    expect(dense.markings).toHaveLength(500);
    expect(validateProject(dense)).toEqual([]);
    // Clears every parent: the settle rebuilds the whole hierarchy.
    const scrambled = {
      ...dense,
      markings: dense.markings.map((m) => ({ ...m, parentId: null })),
    };
    const settled = time(() => settleHierarchy(scrambled));
    expect(settled.ms).toBeLessThan(BUDGET_MS);
    expect(settled.value.markings.map((m) => m.parentId)).toEqual(
      dense.markings.map((m) => m.parentId),
    );
  });

  it('multi-selection: moving 20 containers and 500 markings, and deleting the selection, fits the budget', () => {
    const everything: ItemRef[] = [
      ...project.containers.map((c) => ({ kind: 'image' as const, id: c.id })),
      ...project.markings.map((m) => ({ kind: 'marking' as const, id: m.id })),
    ];
    expect(time(() => canMoveItems(project, everything)).ms).toBeLessThan(BUDGET_MS);
    // The markings go with the container: only the 20 containers get an offset.
    const movedAll = time(() => moveItems(project, everything, 7.5, 3.25));
    expect(movedAll.ms).toBeLessThan(BUDGET_MS);
    expect(movedAll.value.containers[0]?.placement.x).toBe(7.5);
    expect(movedAll.value.markings).toEqual(project.markings);

    // Only the 500 markings (100 parents, the children go with them): 12 and 8 image pixels.
    const onlyMarkings = everything.filter((i) => i.kind === 'marking');
    const movedMarkings = time(() => moveItems(project, onlyMarkings, 3, 2));
    expect(movedMarkings.ms).toBeLessThan(BUDGET_MS);
    expect(movedMarkings.value.markings[0]?.rect.x).toBe(
      (project.markings[0]?.rect.x ?? 0) + 12,
    );

    const impact = time(() => itemsDeletionImpact(project, everything));
    expect(impact.ms).toBeLessThan(BUDGET_MS);
    expect(impact.value).toMatchObject({ markings: 500, containers: 20 });
    const removed = time(() => removeItems(project, everything));
    expect(removed.ms).toBeLessThan(BUDGET_MS);
    expect(removed.value.markings).toEqual([]);
    expect(removed.value.annotations).toEqual([]);
    expect(removed.value.containers).toEqual([]);
  });

  it('editing operations stay fast', () => {
    const parent = project.markings.find((m) => m.parentId === null)!;
    const moved = time(() => moveMarking(project, parent.id, 5, 5));
    expect(moved.ms).toBeLessThan(BUDGET_MS);
    const annotated = time(() =>
      addAnnotation(project, {
        id: 'novo',
        markingId: parent.id,
        layerId: 'L2',
        name: null,
        entries: [],
      }),
    );
    expect(annotated.ms).toBeLessThan(BUDGET_MS);
  });
});

// Per-frame budgets (docs/ARCHITECTURE.md, "Desempenho"): what the canvas, the panel and the list read on
// every project change. The median of several rounds, each on a new
// project version (without the index or the pending items already computed).
const FRAME_BUDGET_MS = 8;
/** Turned off with `--coverage` (vite.config.ts): instrumented code is slower. */
const budgetIt = it.skipIf(process.env.PERF_BUDGETS === 'off');
/**
 * A budget is a time measurement on a shared runner: a busy neighbor exceeds
 * the limit by 1% with no regression at all (deploy of 2026-10-11: 8.108 ms against 8 ms, with the
 * same commit passing 17 min earlier). A retry separates noise from regression: a real
 * regression (something turning O(n²)) exceeds the limit by a lot, both times.
 */
const BUDGET_OPTIONS = { retry: 1 };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * The first rounds measure the JIT, not the code: they drop from ~13 ms to ~3 ms until
 * stabilizing (in the app, this happens in the first frames). Warm up until then before
 * measuring; otherwise a slower runner blows the budget during warmup alone.
 */
const WARMUP_RUNS = 12;

function medianMs(fn: (p: Project) => unknown, p: Project, runs = 9): number {
  for (let i = 0; i < WARMUP_RUNS; i++) fn({ ...p });
  return median(Array.from({ length: runs }, () => time(() => fn({ ...p })).ms));
}

describe('large project with typed annotations and references', () => {
  const project = buildLargeTypedProject();
  const typed = project.annotations.filter((a) => a.type !== null);
  const refs = project.annotations.flatMap((a) => refsOf(project, a));

  it('the fixture has the requested size and is valid', () => {
    expect(project.markings).toHaveLength(500);
    expect(project.annotations).toHaveLength(1500);
    expect(typed).toHaveLength(750);
    expect(refs).toHaveLength(500);
    expect(validateProject(project)).toEqual([]);
    const issues = projectIssues(project);
    expect([...issues.values()].flat().map((i) => i.code)).toEqual(
      expect.arrayContaining(['required-empty', 'broken-ref']),
    );
  });

  budgetIt(
    `index + pending items + indicators + visibility in under ${FRAME_BUDGET_MS} ms`,
    BUDGET_OPTIONS,
    () => {
      const ms = medianMs((p) => {
        projectIndex(p);
        projectIssues(p);
        const dots = layerDotsByMarking(p, p.layers);
        const active = layerDotsByMarking(p, p.layers.slice(0, 1));
        markingVisibility(p, active, 'hide', null);
        return dots;
      }, project);
      expectBelow(ms, FRAME_BUDGET_MS);
    },
  );

  budgetIt(
    'repeated queries on the same version reuse the index',
    BUDGET_OPTIONS,
    () => {
      projectIssues(project);
      const queryAll = () => {
        for (const a of project.annotations) {
          getAnnotationIssues(project, a.id);
          getBacklinks(project, a.id);
        }
      };
      queryAll(); // Warms up the JIT.
      const runs = Array.from({ length: 5 }, () => time(queryAll).ms);
      expectBelow(median(runs), FRAME_BUDGET_MS * 4);
    },
  );
});

// Settle growth (#882, phase 1): the shuffled dense space (all `parentId` cleared, the
// settle rebuilds the whole hierarchy) must not be quadratic. Measures 500 and 2,000 markings in a single container.
describe('settling a dense space: growth', () => {
  const denseScrambled = (n: number): Project => {
    const dense = buildLargeProject({
      images: 1,
      markingsPerImage: n,
      imageWidth: 100000,
    });
    return { ...dense, markings: dense.markings.map((m) => ({ ...m, parentId: null })) };
  };

  it('500 → 2,000 markings in a single container: ratio < 6×', GROWTH_OPTIONS, () => {
    expectLinearGrowth('settle dense space', {
      build: denseScrambled,
      run: (p) => settleHierarchy(p),
      n: 500,
    });
  });

  it('2,000 markings in a single container settle in under 50 ms', GROWTH_OPTIONS, () => {
    const scrambled = denseScrambled(2000);
    settleHierarchy({ ...scrambled });
    const times = Array.from(
      { length: 9 },
      () => time(() => settleHierarchy({ ...scrambled })).ms,
    );
    times.sort((a, b) => a - b);
    expect(times[4]).toBeLessThan(50);
  });
});

// Editing in a large project (#882, phase 2): an edit costs the space it touches, not the whole project.
describe('editing: growth and budget', () => {
  /** The i-th new marking of `I0`: outside the fixture's groups, on a 100-column grid. */
  const newRect = (i: number) => ({
    x: (i % 190) * 21 + 5,
    y: 2750 + Math.floor(i / 190) * 22,
    width: 20,
    height: 20,
  });
  /** Creates `count` markings one by one in each of the containers `I0..I(containers-1)`. */
  const createMany = (p: Project, count: number, containers = 1): Project => {
    let next = p;
    for (let c = 0; c < containers; c++) {
      for (let i = 0; i < count; i++) {
        next = createMarking(next, {
          id: `N${c}-${i}`,
          containerId: `I${c}`,
          rect: newRect(i),
        });
      }
    }
    return next;
  };
  /** A `buildLargeProject` project with `n` markings (25 per image). */
  const largeOf = (n: number): Project => buildLargeProject({ images: n / 25 });

  it(
    'creating markings one by one in a container: 250 → 1,000 creations, ratio < 6×',
    { ...GROWTH_OPTIONS, timeout: 60_000 },
    () => {
      // In a project of 20,000 markings: each creation always copies the array and checks the id (cost of the
      // operation, linear in the project), and that cost barely grows when the container gets another thousand.
      // What the ratio measures is the settle of the container that keeps filling up, which cannot cost more each
      // time (settling the whole container on each creation would give more than 10×).
      const project = buildLargeProject({ images: 800 });
      expectLinearGrowth('create one by one', {
        build: (n) => ({ project, count: n }),
        run: ({ project: p, count }) => createMany(p, count),
        prepare: ({ project: p }) => projectIndex(p),
        n: 250,
        warmup: 4,
        runs: 7,
      });
    },
  );

  it(
    'one edit (create, move): 2,500 → 10,000 markings, ratio < 6×',
    GROWTH_OPTIONS,
    () => {
      for (const [label, edit] of [
        [
          'create a marking',
          (p: Project) =>
            createMarking(p, { id: 'N', containerId: 'I0', rect: newRect(0) }),
        ],
        ['move a marking', (p: Project) => moveMarking(p, 'M0-0', 5, 5)],
      ] as const) {
        expectLinearGrowth(`edit: ${label}`, {
          build: largeOf,
          run: edit,
          prepare: (p) => projectIndex(p),
          n: 2500,
        });
      }
    },
  );

  budgetIt('1,000 creations in a container in under 2 s', BUDGET_OPTIONS, () => {
    const project = buildLargeProject();
    const created = time(() => createMany(project, 1000));
    expect(created.value.markings).toHaveLength(1500);
    expectBelow(created.ms, 2000);
  });

  /** Median of an edit over new project versions whose index is already built (the app reads it every frame). */
  const medianEditMs = (project: Project, edit: (p: Project) => unknown): number => {
    const run = () => {
      const version = { ...project };
      projectIndex(version);
      return time(() => edit(version)).ms;
    };
    for (let i = 0; i < WARMUP_RUNS; i++) run();
    return median(Array.from({ length: 9 }, run));
  };
  const create = (p: Project) =>
    createMarking(p, { id: 'N', containerId: 'I0', rect: newRect(0) });
  const move = (p: Project) => moveMarking(p, 'M0-0', 5, 5);

  budgetIt('one edit with 10,000 markings in under 16 ms', BUDGET_OPTIONS, () => {
    const project = largeOf(10000);
    expect(project.markings).toHaveLength(10000);
    expectBelow(medianEditMs(project, create), 16, 'criar');
    expectBelow(medianEditMs(project, move), 16, 'mover');
  });

  // With perspectives the reconciliation runs on every edit: it looks only at what the edit touched (decision 6),
  // it does not build the whole project's index (which alone took ~17 ms with 10,000 markings).
  budgetIt(
    'one edit with 10,000 markings and two perspectives in under 16 ms',
    BUDGET_OPTIONS,
    () => {
      let project = largeOf(10000);
      project = addPerspective(
        project,
        buildPerspective(project, { id: 'P1', name: 'All', startFrom: null }),
      );
      project = addPerspective(
        project,
        buildPerspective(project, { id: 'P2', name: 'Empty', startFrom: 'empty' }),
      );
      expect(project.perspectives[0]?.items.length).toBeGreaterThan(100);
      expectBelow(medianEditMs(project, create), 16, 'criar');
      expectBelow(medianEditMs(project, move), 16, 'mover');
    },
  );
});

describe('nearestFreeSpot', () => {
  budgetIt('600 obstacles on a tight grid in under 200 ms', BUDGET_OPTIONS, () => {
    // 25 × 24 grid of 100×100 rectangles with a 10 gap: the requested point falls in the middle of it and the
    // nearest free spot is at the edge (the worst case for whoever tests each candidate against each obstacle).
    const obstacles: Rect[] = [];
    for (let i = 0; i < 25; i++) {
      for (let j = 0; j < 24; j++) {
        obstacles.push({ x: i * 110, y: j * 110, width: 100, height: 100 });
      }
    }
    const { value, ms } = time(() =>
      nearestFreeSpot(obstacles, 100, 100, { x: 1300, y: 1300 }),
    );
    expect(
      obstacles.some(
        (o) =>
          o.x < value.x + 100 &&
          value.x < o.x + 100 &&
          o.y < value.y + 100 &&
          value.y < o.y + 100,
      ),
    ).toBe(false);
    expectBelow(ms, 200);
  });
});

describe('placement in free space (#1087)', () => {
  budgetIt(
    'a new piece with 100 siblings that occupy R0 in under 50 ms',
    BUDGET_OPTIONS,
    () => {
      // 10 × 10 grid of 30×30 siblings with a 10 gap around the image center (1000 × 800): R0
      // (450, 380, 100, 40) falls in the middle of it, so the search runs and the free spot lies outside the grid.
      let p = componentProject();
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
          p = createMarking(p, {
            id: `S${i}_${j}`,
            containerId: 'I1',
            rect: { x: 300 + i * 40, y: 200 + j * 40, width: 30, height: 30 },
          });
        }
      }
      const catalog = testCatalog();
      const args = {
        containerId: 'I1',
        parentId: null,
        specId: SPEC_ID,
        typeId: 'text',
      } as const;
      componentPlacement(p, catalog, args, approximateMeasurer);
      const { value, ms } = time(() =>
        componentPlacement(p, catalog, args, approximateMeasurer),
      );
      expect(value).not.toEqual({ x: 450, y: 380, width: 100, height: 40 });
      expect(
        placementIsFree(p, catalog, { ...args, rect: value }, approximateMeasurer),
      ).toBe(true);
      expectBelow(ms, 50);
    },
  );
});
