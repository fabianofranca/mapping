import { effect, signal } from '@preact/signals';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addContainer,
  createMarking,
  createProject,
  projectIndex,
  renameMarking,
  type Project,
} from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createProjectStore } from '../../src/store/history';
import { projectInPerspective } from '../../src/store/perspectiveShown';
import { createEditorUi } from '../../src/store/ui';
import { propose } from '../model/proposalFixtures';
import { buildLargeProject } from '../model/largeProject';
import { openHarness } from './proposalHarness';

beforeEach(() => localStorage.clear());

const budgetIt = it.skipIf(process.env.PERF_BUDGETS === 'off');
/** One repetition separates runner noise from regression (see tests/model/performance.test.ts). */
const BUDGET_OPTIONS = { retry: 1 };

/** An image with `n` markings; the proposal renames all of them and creates an annotation on each. */
function bigScenario(n: number) {
  let base: Project = createProject({
    name: 'Large',
    now: '2026-09-30T12:00:00.000Z',
    firstLayer: { id: 'L1', name: 'Layer', color: '#D32F2F' },
  });
  base = addContainer(base, {
    id: 'I1',
    file: 'images/a.png',
    width: 20000,
    height: 20000,
  });
  for (let i = 0; i < n; i++) {
    base = createMarking(base, {
      id: `M${i}`,
      containerId: 'I1',
      name: `m${i}`,
      rect: { x: (i % 100) * 150, y: Math.floor(i / 100) * 150, width: 100, height: 100 },
    });
  }
  let after = base;
  for (let i = 0; i < n; i++) {
    after = renameMarking(after, `M${i}`, `new ${i}`);
    after = addAnnotation(after, { id: `A${i}`, markingId: `M${i}`, layerId: 'L1' });
  }
  return { base, proposal: propose(base, after, { id: 'P1' }) };
}

// Large proposal (HANDOFF 5.4): thousands of changes. These limits are wide on purpose:
// they catch a quadratic recomputation (the review would become unusable), not the exact time of the machine.
describe('review of a large proposal', () => {
  budgetIt(
    'opening, deciding and reading the derived state of 2000 changes stays fast',
    BUDGET_OPTIONS,
    async () => {
      const { base, proposal } = bigScenario(1000);
      expect(proposal.changes.length).toBe(2000);
      const { review } = await openHarness({ project: base, proposals: [proposal] });

      let start = performance.now();
      review.open('P1');
      const d = review.derived;
      expect(d.counts.value.total).toBe(2000);
      expect(d.levels.value.get('proposal:')?.total).toBe(2000);
      const open = performance.now() - start;

      start = performance.now();
      for (let i = 0; i < 5; i++) {
        await review.decide({ level: 'item', id: `M${i}` }, 'accepted');
        expect(d.counts.value.accepted).toBeGreaterThan(0);
        expect(d.levels.value.get(`item:M${i}`)?.state).toBe('accepted');
      }
      const decisions = (performance.now() - start) / 5;

      start = performance.now();
      await review.decide({ level: 'proposal', id: null }, 'accepted');
      expect(d.counts.value.accepted).toBe(2000);
      expect(d.canApply.value).toBe(true);
      const batch = performance.now() - start;

      expect(open).toBeLessThan(2000);
      expect(decisions).toBeLessThan(500);
      expect(batch).toBeLessThan(3000);
    },
  );

  // Details in the review (phase 9.6): the "changes by entity and field" index, which the markers
  // and the header read, depends only on the changes. Deciding does not recompute it (the same reference),
  // and building it for thousands of changes costs one pass.
  budgetIt(
    'the per-field index of 2000 changes is built once and does not change on each decision',
    BUDGET_OPTIONS,
    async () => {
      const { base, proposal } = bigScenario(1000);
      const { review } = await openHarness({ project: base, proposals: [proposal] });
      review.open('P1');
      const d = review.derived;

      const start = performance.now();
      const index = d.fieldIndex.value;
      const build = performance.now() - start;
      // 1000 markings renamed and 1000 annotations created.
      expect(index.entities.size).toBe(2000);
      expect(index.annotationsOf.size).toBe(1000);

      let notified = 0;
      const stop = effect(() => {
        void d.fieldIndex.value;
        notified++;
      });
      for (let i = 0; i < 5; i++) {
        await review.decide({ level: 'item', id: `M${i}` }, 'accepted');
        expect(d.fieldIndex.value).toBe(index);
      }
      await review.decide({ level: 'proposal', id: null }, 'accepted');
      expect(d.fieldIndex.value).toBe(index);
      // Only the initial read: no decision notified it again.
      expect(notified).toBe(1);
      stop();
      expect(build).toBeLessThan(1000);
    },
  );
});

// Pages (stage #883, PG2, decision 20): the project in view is cut by the open page, so what the
// canvas, the panel and the list derive from it costs about its share of the project, not the
// whole of it. Measured on the large project (20 images; here 2,000 markings, where the constant
// cost of each derived value no longer hides the proportion) split into 4 pages.
describe('derived state of the open page', () => {
  function fourPages(): Project {
    const large = buildLargeProject({ images: 20, markingsPerImage: 100 });
    return {
      ...large,
      pages: ['PG1', 'PG2', 'PG3', 'PG4'].map((id, i) => ({ id, name: `Page ${i + 1}` })),
      containers: large.containers.map((c, i) => ({
        ...c,
        pageId: `PG${(i % 4) + 1}`,
      })),
    };
  }

  const median = (values: number[]): number =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

  /** Reads what the canvas, the panel and the list read. */
  function readAll(d: ReturnType<typeof createEditorDerived>): void {
    void [
      d.visibleLayers.value,
      d.issues.value,
      d.annotationsByMarking.value,
      d.layerDots.value,
      d.markingVisibility.value,
      d.canvasVisibility.value,
      d.incompleteMarkings.value,
      d.listing.value,
      d.incompleteList.value,
      d.incompleteCount.value,
    ];
  }

  /**
   * A new project version reaching the derived state, `pageId` open (none = the whole project).
   * `cut` is the page cut and its index; `derive` is everything the canvas, the panel and the list
   * read from the project in view. The index of the committed project is built before the
   * measurement: both ways pay it, whatever the pages.
   */
  function measure(project: Project, pageId: string | undefined) {
    const store = createProjectStore();
    store.load(project);
    const shown = signal<Project | null>(project);
    const derived = createEditorDerived(store, createEditorUi(), shown);
    const once = () => {
      const version = { ...project };
      projectIndex(version);
      const start = performance.now();
      const view = projectInPerspective(version, null, pageId);
      projectIndex(view);
      const cut = performance.now();
      shown.value = view;
      readAll(derived);
      return { cut: cut - start, derive: performance.now() - cut };
    };
    for (let i = 0; i < 12; i++) once();
    const runs = Array.from({ length: 21 }, once);
    return {
      cut: median(runs.map((r) => r.cut)),
      derive: median(runs.map((r) => r.derive)),
    };
  }

  it('the 4 pages hold the whole project, 5 images and 500 markings each', () => {
    const project = fourPages();
    for (const id of ['PG1', 'PG2', 'PG3', 'PG4']) {
      const view = projectInPerspective(project, null, id);
      expect(view.containers).toHaveLength(5);
      expect(view.markings).toHaveLength(500);
    }
  });

  budgetIt(
    'deriving the open page costs at most a third of deriving the whole project, cut included it still costs less',
    BUDGET_OPTIONS,
    () => {
      const project = fourPages();
      const whole = measure(project, undefined);
      const page = measure(project, 'PG1');
      console.info(
        `[perf] derived state: whole ${whole.derive.toFixed(2)} ms; one of 4 pages ${page.derive.toFixed(2)} ms ` +
          `(ratio ${(page.derive / whole.derive).toFixed(2)}) + cut ${page.cut.toFixed(2)} ms`,
      );
      expect(page.derive).toBeLessThan(whole.derive / 3);
      expect(page.cut + page.derive).toBeLessThan(whole.derive);
    },
  );
});
