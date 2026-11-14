import { cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Proposal } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { decided, propose } from '../../model/proposalFixtures';
import { richScenario } from '../../store/proposalHarness';
import { ProposalsWindow } from '../../../src/ui/review/ProposalsWindow';
import { openReviewHarness, renderInEditor, showReviewPanel } from './reviewHarness';

// Closed and superseded proposal (phase 9.6, HANDOFF-REVIEW-DETAILS 5.7): the applied one is
// view-only (decisions disabled with the reason, popover without buttons); the superseded one
// shows "Open the new one", the same / different / absent seals and does not let you decide
// what was left undecided.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

/** The whole richScenario accepted and applied. */
function appliedScenario() {
  const { base, proposal } = richScenario();
  const accepted = decided(proposal, base, { level: 'proposal', id: null }, 'accepted');
  return {
    ...accepted,
    status: 'applied' as const,
    applied: Object.fromEntries(
      proposal.changes.map((c) => [c.id, { at: '2026-10-10T10:00:00.000Z' }]),
    ),
  } satisfies Proposal;
}

describe('applied proposal', () => {
  it('view only: the notice, the decisions disabled with the reason and the popover without buttons', async () => {
    await showReviewPanel(
      { proposals: [appliedScenario()] },
      { level: 'item', id: 'M1' },
    );
    expect(screen.getByText(/^Proposal applied on .*View only/)).toBeTruthy();

    const header = screen.getByRole('region', { name: 'Decision' });
    const accept = within(header).getByRole('button', {
      name: /^Accept marking: Porta$/,
    });
    expect((accept as HTMLButtonElement).disabled).toBe(true);
    const reason = document.getElementById(accept.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent).toBe('This proposal no longer takes decisions');

    // The popover shows the decision and the dates, without the buttons; the marker stays focusable.
    const mark = screen.getByRole('button', {
      name: /^Name: changed, accepted, applied\./,
    });
    fireEvent.click(mark);
    const pop = screen.getByRole('dialog');
    expect(within(pop).getByText('Decision: Accepted')).toBeTruthy();
    expect(within(pop).getByText(/^Accepted on .* and applied on /)).toBeTruthy();
    expect(within(pop).queryByRole('button', { name: /^Accept/ })).toBeNull();
    expect(within(pop).queryByRole('button', { name: /^Reject/ })).toBeNull();
    expect(within(pop).getByText('Applied')).toBeTruthy();
  });
});

describe('superseded proposal', () => {
  async function superseded() {
    const { base, after } = richScenario();
    const old: Proposal = { ...propose(base, after, { id: 'P1' }), status: 'superseded' };
    const next = propose(base, after, {
      id: 'P2',
      title: 'Checkout v2',
      supersedes: 'P1',
    });
    const h = await showReviewPanel(
      { proposals: [old, next] },
      { level: 'item', id: 'M1' },
    );
    return { h, old, next };
  }

  it('warns, offers "Open the new one" and shows the same-in-the-new seal below the field', async () => {
    const { h } = await superseded();
    expect(screen.getByText('This proposal was superseded by another one.')).toBeTruthy();
    const open = screen.getByRole('button', { name: 'Open the new one: Checkout v2' });
    // The seal below the field control: the new one carries the same change.
    const below = document.querySelector('.change-below') as HTMLElement;
    expect(within(below).getByText('same in the new one')).toBeTruthy();
    fireEvent.click(open);
    expect(h.review.proposalId.value).toBe('P2');
  });

  it('in the review list the notice is one line: the full sentence only in the hint and for the screen reader; the X hides it and moves focus to the list', async () => {
    const { base, after } = richScenario();
    const old: Proposal = { ...propose(base, after, { id: 'P1' }), status: 'superseded' };
    const next = propose(base, after, {
      id: 'P2',
      title: 'Checkout v2',
      supersedes: 'P1',
    });
    const h = await openReviewHarness({ proposals: [old, next] });
    h.review.open('P1');
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    const line = document.querySelector('.notice-box-line') as HTMLElement;
    expect(line.querySelector('.notice-box-text')?.textContent).toBe(
      'Proposal superseded',
    );
    expect(
      within(line).getByRole('button', { name: 'Open the new one: Checkout v2' }),
    ).toBeTruthy();
    const phrase = within(line).getAllByText(
      /This proposal was superseded by another one\./,
    );
    expect(phrase.some((n) => n.classList.contains('visually-hidden'))).toBe(true);
    expect(phrase.some((n) => n.getAttribute('data-tooltip') !== null)).toBe(true);
    fireEvent.click(within(line).getByRole('button', { name: 'Dismiss' }));
    expect(document.querySelector('.notice-box-line')).toBeNull();
    expect(h.review.supersededDismissed.value).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('tree'));
  });

  it('what was left undecided cannot be decided here: buttons disabled with the reason', async () => {
    await superseded();
    fireEvent.click(screen.getByRole('button', { name: /^Name: changed, pending/ }));
    const pop = screen.getByRole('dialog');
    const accept = within(pop).getByRole('button', { name: 'Accept: Name' });
    expect((accept as HTMLButtonElement).disabled).toBe(true);
    const reason = document.getElementById(accept.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent).toBe(
      'Undecided in a superseded proposal: decide in the new one.',
    );
    expect(within(pop).getByText('same in the new one')).toBeTruthy();
  });
});
