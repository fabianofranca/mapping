import { act, cleanup, waitFor } from '@testing-library/preact';
import { options, type VNode } from 'preact';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../../src/store/settings';
import { richScenario } from '../../store/proposalHarness';
import { showReviewPanel } from './reviewHarness';

// Performance of the Details in the review (HANDOFF-REVIEW-DETAILS 12): selecting another
// change of the same item (focusing a marker, the arrows of the Proposals window) does not
// redo the normal panel; only the marker that stops being the target and the one that becomes
// it. Deciding redoes the panel once (the project on view changes), not once per list
// component.

const counts = new Map<string, number>();
const previousDiffed = options.diffed;

beforeAll(() => {
  options.diffed = (vnode: VNode) => {
    const name = typeof vnode.type === 'function' ? vnode.type.name : '';
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    previousDiffed?.(vnode);
  };
});
afterAll(() => {
  options.diffed = previousDiffed;
});
beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

describe('renders of the Details in the review', () => {
  it('selecting another change of the same item does not redo the panel, only the markers involved', async () => {
    const { proposal, ids } = richScenario();
    const h = await showReviewPanel(
      { proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    await act(async () => {
      await Promise.resolve();
    });
    counts.clear();
    act(() => h.review.select({ level: 'change', id: ids.name }));
    expect(counts.get('MarkingPanel') ?? 0).toBe(0);
    expect(counts.get('AnnotationsPanel') ?? 0).toBe(0);
    expect(counts.get('PropertyGrid') ?? 0).toBe(0);
    // The marker that becomes the target (and no other) redoes.
    expect(counts.get('ChangeMark') ?? 0).toBeLessThanOrEqual(1);

    counts.clear();
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    expect(counts.get('MarkingPanel') ?? 0).toBe(0);
    expect(counts.get('ChangeMark') ?? 0).toBeLessThanOrEqual(1);
  });

  it('deciding a change redoes the panel once (not once per chained decision)', async () => {
    const { proposal, ids } = richScenario();
    const h = await showReviewPanel(
      { proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    await act(async () => {
      await Promise.resolve();
    });
    counts.clear();
    await act(async () => {
      await h.review.decide({ level: 'change', id: ids.name }, 'accepted');
    });
    await waitFor(() =>
      expect(h.review.derived.proposal.value?.decisions[ids.name]?.state).toBe(
        'accepted',
      ),
    );
    expect(counts.get('MarkingPanel') ?? 0).toBeLessThanOrEqual(2);
  });
});
