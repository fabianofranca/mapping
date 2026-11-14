import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../../src/store/settings';
import { ProposalNotices } from '../../../src/ui/review/ProposalNotices';
import { ReviewDetails } from '../../../src/ui/review/ReviewDetails';
import { richScenario, writeOutside } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';
import { revisedScenario } from './revisedFixture';

// Notice of a new revision and refusal by revision (stage #644, CP3): "The agent revised
// <title>: …" with Review, and the `revised` refusal message when deciding on the old version.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

/** The app read the proposal; the agent revises it outside and the app notices. */
async function revisedOutside() {
  const { proposal } = richScenario();
  const s = revisedScenario();
  const h = await openReviewHarness({ proposals: [{ ...proposal, title: 'Checkout' }] });
  writeOutside(h.root, s.proposal);
  return { h, ...s };
}

describe('new revision notice', () => {
  it('shows the text with the counts (without the zero ones) and the Review button that opens the review', async () => {
    const { h } = await revisedOutside();
    renderInEditor(h, <ProposalNotices />);
    await act(async () => {
      await h.session.proposals.scan();
    });
    expect(
      screen.getByText('The agent revised Checkout: 1 replaced, 1 new.'),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review Checkout, revised by the agent' }),
    );
    expect(h.review.proposalId.value).toBe('P1');
    expect(h.session.proposals.notices.value).toEqual([]);
  });

  it('with its review open, the button does not appear', async () => {
    const { h } = await revisedOutside();
    h.review.open('P1');
    renderInEditor(h, <ProposalNotices />);
    await act(async () => {
      await h.session.proposals.scan();
    });
    expect(screen.getByText(/^The agent revised Checkout:/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Review Checkout/ })).toBeNull();
  });

  it('another kind of notice stays without the Review button', async () => {
    const { proposal } = richScenario();
    const h = await openReviewHarness({
      proposals: [{ ...proposal, title: 'Checkout' }],
    });
    writeOutside(h.root, {
      ...proposal,
      title: 'Other',
      revision: proposal.revision + 1,
    });
    renderInEditor(h, <ProposalNotices />);
    await act(async () => {
      await h.session.proposals.scan();
    });
    expect(screen.getByText('Proposal changed outside the app: Other')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /revised by the agent/ })).toBeNull();
  });
});

describe('refusal by revision', () => {
  it('Accept all on the old version shows "The agent revised this proposal while you were looking"', async () => {
    const { h } = await revisedOutside();
    h.review.open('P1');
    act(() => h.review.select({ level: 'proposal', id: null }));
    renderInEditor(h, <ReviewDetails />);
    fireEvent.click(screen.getByRole('button', { name: /^Accept all/ }));
    await waitFor(() =>
      expect(h.ui.toast.value).toBe(
        'The agent revised this proposal while you were looking. Check it before deciding.',
      ),
    );
  });
});
