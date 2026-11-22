import { act, cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorDialogs } from '../../../src/app/useEditorDialogs';
import { useExitReview } from '../../../src/app/useExitReview';
import { t } from '../../../src/i18n';
import { locale } from '../../../src/store/settings';
import { useDialogSlot } from '../../../src/ui/focus';
import { ExitReviewDialog } from '../../../src/ui/review/ExitReviewDialog';
import { ReviewBar } from '../../../src/ui/review/ReviewBar';
import { ReviewReturnNotice } from '../../../src/ui/review/ReviewReturnNotice';
import { decided } from '../../model/proposalFixtures';
import { richScenario, writeOutside } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// The notice in Details after leaving the review (stage #1881, decision 20): the proposal is still
// open, with Review to go back and a dismiss button.

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
      <ReviewBar onExit={exit} />
      <ReviewReturnNotice />
      {dialogs.current && <ExitReviewDialog onClose={dialogs.close} />}
    </>
  );
}

async function mount(accepted = false) {
  const { base, proposal } = richScenario();
  const p = accepted
    ? decided(proposal, base, { level: 'item', id: 'M1' }, 'accepted')
    : proposal;
  const h = await openReviewHarness({ proposals: [{ ...p, title: 'Checkout' }] });
  h.review.open('P1');
  renderInEditor(h, <Shell />);
  return h;
}

const notice = () => screen.queryByText('The proposal "Checkout" is still open.');

describe('ReviewReturnNotice', () => {
  it('is not there during the review or before any exit', async () => {
    const h = await mount();
    expect(h.ui.reviewReturn.value).toBeNull();
    expect(notice()).toBeNull();
  });

  it('appears after leaving with the button, and Review reopens the review', async () => {
    const h = await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Exit review' }));
    expect(h.review.proposalId.value).toBeNull();
    expect(h.ui.reviewReturn.value).toBe('P1');
    expect(notice()).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Review: Checkout' }));
    expect(h.review.proposalId.value).toBe('P1');
    expect(h.ui.reviewReturn.value).toBeNull();
    expect(notice()).toBeNull();
  });

  it('appears after leaving through the dialog (Exit anyway)', async () => {
    const h = await mount(true);
    fireEvent.click(screen.getByRole('button', { name: 'Exit review' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Exit anyway' }));
    expect(h.review.proposalId.value).toBeNull();
    expect(h.ui.reviewReturn.value).toBe('P1');
    expect(notice()).toBeTruthy();
  });

  it('dismiss hides it and clears the state', async () => {
    const h = await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Exit review' }));
    fireEvent.click(screen.getByRole('button', { name: t('review.returnDismiss') }));
    expect(h.ui.reviewReturn.value).toBeNull();
    expect(notice()).toBeNull();
  });

  it('hides when the proposal is no longer open', async () => {
    const h = await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Exit review' }));
    expect(notice()).toBeTruthy();
    const { proposal } = richScenario();
    writeOutside(h.root, {
      ...proposal,
      title: 'Checkout',
      status: 'withdrawn',
      revision: proposal.revision + 1,
    });
    await act(async () => {
      await h.session.proposals.scan();
    });
    expect(notice()).toBeNull();
  });

  it('scrolls itself into view when it appears, so it is not left above a scrolled Details', async () => {
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      await mount();
      expect(scrollIntoView).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Exit review' }));
      expect(notice()).toBeTruthy();
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      const target = scrollIntoView.mock.instances[0] as Element;
      expect(target.contains(notice())).toBe(true);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});
