import { cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../../src/i18n';
import {
  citationUrl,
  renameMarking,
  type Proposal,
  type Thread,
} from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { selectedThreadId } from '../../../src/store/threadUi';
import { hideToolWindow, isToolWindowOpen } from '../../../src/store/toolWindows';
import { ThreadView } from '../../../src/ui/comments/ThreadView';
import { ProposalList } from '../../../src/ui/review/ProposalList';
import { decided, propose } from '../../model/proposalFixtures';
import { HUMAN, T0, message, sampleThread } from '../../model/threadFixtures';
import { sampleProject } from '../../model/fixtures';
import { richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor, type ReviewHarness } from './reviewHarness';

// The proposal linked to a thread (decision 36): the card in the thread and the "from the
// thread" in the row of the Proposals window.

beforeEach(() => {
  localStorage.clear();
  locale.value = 'en-US';
});
afterEach(cleanup);

const noop = () => {};

function proposalThread(
  id: string,
  proposalId: string,
  text: string,
  at: string = T0,
): Thread {
  const url = citationUrl('project', sampleProject(), [], {
    kind: 'proposal',
    id: proposalId,
  });
  return sampleThread({
    id,
    messages: [
      {
        ...message('m1', at, HUMAN, `${text} [Checkout](${url ?? ''})`),
        proposal: proposalId,
      },
    ],
  });
}

async function open(proposals: readonly Proposal[], threads: readonly Thread[]) {
  const h = await openReviewHarness({ proposals });
  for (const th of threads) await h.session.threads.create(th);
  return h;
}

const card = () => document.querySelector<HTMLElement>('[data-proposal-card]');

describe('proposal card in the thread', () => {
  it('title, "N changes to review" and Review opens the review', async () => {
    const { proposal } = richScenario();
    const thread = proposalThread('tp1', 'P1', 'Proposal:');
    const h = await open([{ ...proposal, title: 'Checkout' }], [thread]);
    renderInEditor(h, <ThreadView thread={thread} />);
    const el = card() as HTMLElement;
    expect(within(el).getByText('Checkout')).toBeTruthy();
    expect(
      within(el).getByText(
        t('thread.proposal.changesMany', { count: proposal.changes.length }),
      ),
    ).toBeTruthy();
    await userEvent.click(within(el).getByRole('button', { name: 'Review: Checkout' }));
    expect(h.review.proposalId.value).toBe('P1');
  });

  it('a single change: singular', async () => {
    const base = sampleProject();
    const one = propose(base, renameMarking(base, 'M1', 'New door'), {
      id: 'P1',
      title: 'Checkout',
    });
    expect(one.changes).toHaveLength(1);
    const thread = proposalThread('tp1', 'P1', 'Proposal:');
    const h = await open([one], [thread]);
    renderInEditor(h, <ThreadView thread={thread} />);
    expect(screen.getByText(t('thread.proposal.changesOne'))).toBeTruthy();
  });

  it('only counts the undecided changes', async () => {
    const { base, proposal } = richScenario();
    const accepted = decided(proposal, base, { level: 'image', id: 'I3' }, 'accepted');
    const thread = proposalThread('tp1', 'P1', 'Proposal:');
    const h = await open([accepted], [thread]);
    const undecided = h.review.derived.rows.value[0]?.progress.undecided ?? -1;
    expect(undecided).toBeLessThan(proposal.changes.length);
    renderInEditor(h, <ThreadView thread={thread} />);
    expect(
      screen.getByText(t('thread.proposal.changesMany', { count: undecided })),
    ).toBeTruthy();
  });

  it('applied proposal: the state as text, without "to review"', async () => {
    const { proposal } = richScenario();
    const thread = proposalThread('tp1', 'P1', 'Proposal:');
    const h = await open([{ ...proposal, status: 'applied' }], [thread]);
    renderInEditor(h, <ThreadView thread={thread} />);
    const el = card() as HTMLElement;
    expect(within(el).getByText(t('proposals.status.applied'))).toBeTruthy();
    expect(within(el).queryByText(/to review/)).toBeNull();
  });

  it('proposal that no longer exists: "Proposal removed", no button', async () => {
    const thread = proposalThread('tp1', 'P9', 'Proposal:');
    const h = await open([], [thread]);
    renderInEditor(h, <ThreadView thread={thread} />);
    const el = card() as HTMLElement;
    expect(within(el).getByText(t('thread.proposal.removed'))).toBeTruthy();
    expect(within(el).queryByRole('button')).toBeNull();
  });

  it('the message text stays readable', async () => {
    const { proposal } = richScenario();
    const thread = proposalThread('tp1', 'P1', 'I sent the proposal:');
    const h = await open([{ ...proposal, title: 'Checkout' }], [thread]);
    renderInEditor(h, <ThreadView thread={thread} />);
    expect(screen.getByText(/I sent the proposal:/)).toBeTruthy();
  });

  it('message without a proposal has no card', async () => {
    const h = await open([], []);
    renderInEditor(h, <ThreadView thread={sampleThread()} />);
    expect(card()).toBeNull();
  });
});

describe('"from the thread" in the proposal row', () => {
  async function mount(threads: readonly Thread[]): Promise<ReviewHarness> {
    const { proposal } = richScenario();
    const h = await open([{ ...proposal, title: 'Checkout' }], threads);
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    return h;
  }

  it('shows "from the thread" and the chip of the thread that linked it; clicking opens the thread', async () => {
    const thread = proposalThread('tp1', 'P1', 'Review the checkout');
    const h = await mount([thread]);
    hideToolWindow('details');
    const row = screen.getByRole('listitem');
    expect(within(row).getByText(t('proposals.fromThread'))).toBeTruthy();
    const chip = within(row).getByRole('button', { name: /, citation$/ });
    expect(chip.textContent).toContain('Review the checkout');
    await userEvent.click(chip);
    expect(selectedThreadId(h.ui)).toBe('tp1');
    expect(isToolWindowOpen('details')).toBe(true);
  });

  it('proposal without a thread does not show the link', async () => {
    await mount([]);
    expect(screen.queryByText(t('proposals.fromThread'))).toBeNull();
  });

  it('with two threads, the first one that linked it counts', async () => {
    const late = proposalThread('tp2', 'P1', 'Second');
    const early = proposalThread('tp1', 'P1', 'First', '2026-11-05T09:00:00.000Z');
    await mount([late, early]);
    const row = screen.getByRole('listitem');
    expect(
      within(row).getByRole('button', { name: /, citation$/ }).textContent,
    ).toContain('First');
  });
});
