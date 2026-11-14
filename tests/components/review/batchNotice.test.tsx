import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locale } from '../../../src/store/settings';
import { ReviewHeader } from '../../../src/ui/review/ReviewHeader';
import { richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// Stage #950, item 6 (#963): "Accept the N missing" and "Reject the N that cause it" are a
// single decision (one write, one Undo), not N decisions.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

/**
 * A dependency notice with several changes: the validation is replaced by an assembled
 * notice (the natural scenario requires a tampered proposal).
 */
async function openWithIssue() {
  const { base, proposal, ids } = richScenario();
  const h = await openReviewHarness({ project: base, proposals: [proposal] });
  expect(h.review.open('P1').ok).toBe(true);
  const real = h.review.derived.validation.value;
  if (!real) throw new Error('no validation');
  vi.spyOn(h.review.derived.validation, 'value', 'get').mockReturnValue({
    ...real,
    ok: false,
    issues: [
      {
        code: 'missing-specialization',
        id: 'M1',
        changeIds: [ids.name, ids.rect],
        related: [ids.marking, ids.annotation],
      },
    ],
  });
  act(() => h.review.select({ level: 'proposal', id: null }));
  renderInEditor(h, <ReviewHeader target={{ level: 'proposal', id: null }} />);
  return { h, ids };
}

const stateOf = (h: Awaited<ReturnType<typeof openWithIssue>>['h'], id: string) =>
  h.review.derived.proposal.value?.decisions[id]?.state ?? null;

describe('dependency notice: batch decision', () => {
  it('"Accept the N missing" decides in a single call and Undo returns all of them to pending', async () => {
    const { h, ids } = await openWithIssue();
    const decideMany = vi.spyOn(h.review, 'decideMany');
    const decide = vi.spyOn(h.review, 'decide');
    fireEvent.click(
      await screen.findByRole('button', { name: /^Accept the missing one\(s\)/ }),
    );
    await waitFor(() => expect(stateOf(h, ids.annotation)).toBe('accepted'));
    expect(stateOf(h, ids.marking)).toBe('accepted');
    expect(decideMany).toHaveBeenCalledTimes(1);
    expect(decide).not.toHaveBeenCalled();
    await act(async () => {
      await h.review.undoLastDecision();
    });
    expect(stateOf(h, ids.marking)).toBeNull();
    expect(stateOf(h, ids.annotation)).toBeNull();
  });

  it('"Reject the N that cause it" decides in a single call and Undo returns all of them', async () => {
    const { h, ids } = await openWithIssue();
    const decideMany = vi.spyOn(h.review, 'decideMany');
    fireEvent.click(await screen.findByRole('button', { name: /^Reject the cause/ }));
    await waitFor(() => expect(stateOf(h, ids.name)).toBe('rejected'));
    expect(stateOf(h, ids.rect)).toBe('rejected');
    expect(decideMany).toHaveBeenCalledTimes(1);
    await act(async () => {
      await h.review.undoLastDecision();
    });
    expect(stateOf(h, ids.name)).toBeNull();
    expect(stateOf(h, ids.rect)).toBeNull();
  });
});
