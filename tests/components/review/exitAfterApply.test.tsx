import { cleanup, fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorDialogs } from '../../../src/app/useEditorDialogs';
import { useExitReview } from '../../../src/app/useExitReview';
import { locale } from '../../../src/store/settings';
import { useDialogSlot } from '../../../src/ui/focus';
import { ExitReviewDialog } from '../../../src/ui/review/ExitReviewDialog';
import { ReviewBar } from '../../../src/ui/review/ReviewBar';
import { decided } from '../../model/proposalFixtures';
import { richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// Finding from the #898 round (R25): leaving the review right after applying opened "Exit
// the review?" with "0 accepted, awaiting apply" and "Apply blocked". The click decided by
// the state from before the apply finished; the dialog, already open, saw the state after.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

function Shell() {
  const dialogs = useDialogSlot<{ readonly kind: 'exitReview' }>();
  const exit = useExitReview(dialogs as unknown as EditorDialogs);
  return (
    <>
      <main data-canvas-area tabIndex={-1} aria-label="canvas" />
      <ReviewBar onExit={exit} />
      {dialogs.current && <ExitReviewDialog onClose={dialogs.close} />}
    </>
  );
}

describe('Exiting the review right after applying', () => {
  it('does not leave the contradictory dialog (0 awaiting) open: exits directly', async () => {
    const { base, proposal } = richScenario();
    const p = decided(proposal, base, { level: 'item', id: 'M1' }, 'accepted');
    const h = await openReviewHarness({ proposals: [p] });
    h.review.open('P1');
    renderInEditor(h, <Shell />);
    const applying = h.review.apply();
    fireEvent.click(screen.getByRole('button', { name: 'Exit review' }));
    await applying;
    await waitFor(() => expect(h.review.proposalId.value).toBeNull());
    expect(screen.queryByText(/0 accepted/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Exit anyway' })).toBeNull();
  });
});
