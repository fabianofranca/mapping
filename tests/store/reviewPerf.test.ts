import { effect } from '@preact/signals';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addContainer,
  createMarking,
  createProject,
  renameMarking,
  type Project,
} from '../../src/model';
import { propose } from '../model/proposalFixtures';
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
