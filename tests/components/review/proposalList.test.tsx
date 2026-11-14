import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supersedeProposal, type Proposal } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { ProposalNotices } from '../../../src/ui/review/ProposalNotices';
import { ProposalsWindow } from '../../../src/ui/review/ProposalsWindow';
import { ProposalList } from '../../../src/ui/review/ProposalList';
import { formatWhen } from '../../../src/ui/review/format';
import { StatusBar } from '../../../src/ui/StatusBar';
import { AT, decided } from '../../model/proposalFixtures';
import { diskProposal, richScenario, writeOutside } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// Proposals window outside the review (HANDOFF-PROPOSALS 5.1, step 3 of section 9): list,
// empty state, the "New" that arrived, the accepted changes awaiting apply and the notice
// of a new proposal over the canvas.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

const noop = () => {};

describe('Proposals window: list', () => {
  it('empty state explains how proposals arrive', async () => {
    const h = await openReviewHarness();
    const onHelp = vi.fn();
    const onScan = vi.fn();
    renderInEditor(h, <ProposalList onHelp={onHelp} onScan={onScan} />);
    expect(screen.getByRole('heading', { name: 'No proposals yet' })).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'How the agent sends proposals' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check the folder now' }));
    expect(onHelp).toHaveBeenCalled();
    expect(onScan).toHaveBeenCalled();
    expect(screen.getByText(/imported zips also show and apply/)).toBeTruthy();
  });

  it('arrived proposal: "New", counts and Review as the primary action', async () => {
    const { proposal } = richScenario();
    const h = await openReviewHarness({
      proposals: [{ ...proposal, title: 'Checkout' }],
    });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('Checkout')).toBeTruthy();
    expect(within(row).getByText('New')).toBeTruthy();
    const action = within(row).getByRole('button', { name: 'Review: Checkout' });
    expect(action.className).toContain('button-primary');
    // ○ pending, ✓ accepted, ✕ rejected.
    expect(within(row).getByTitle('undecided').textContent).toContain(
      String(proposal.changes.length),
    );
    fireEvent.click(action);
    expect(h.review.proposalId.value).toBe('P1');
  });

  it('in progress: "In review", Continue and the accepted changes awaiting apply', async () => {
    const { base, proposal } = richScenario();
    const accepted = decided(proposal, base, { level: 'image', id: 'I3' }, 'accepted');
    const h = await openReviewHarness({ proposals: [accepted] });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('In review')).toBeTruthy();
    expect(within(row).getByText('3 accepted changes awaiting apply')).toBeTruthy();
    expect(within(row).getByRole('button', { name: /^Continue/ })).toBeTruthy();
  });

  it('superseded: what was left behind, in the closed group', async () => {
    const { base, proposal } = richScenario();
    const old = supersedeProposal(
      decided(proposal, base, { level: 'item', id: 'M1' }, 'accepted'),
    );
    const next = {
      ...richScenario('P2').proposal,
      supersedes: 'P1',
      title: 'New version',
    };
    const h = await openReviewHarness({ proposals: [old, next] });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    expect(screen.getByText('Closed')).toBeTruthy();
    expect(screen.getByText('Superseded')).toBeTruthy();
    expect(
      screen.getByText(
        `1 accepted and ${proposal.changes.length - 1} undecided were left behind`,
      ),
    ).toBeTruthy();
    // The closed one does not get "New"; the open one that arrived does.
    expect(screen.getAllByText('New')).toHaveLength(1);
  });

  // Phase 8.2 (P4, O6 of round 4): `rows[].fresh` is the truth; every `fresh` row gets the
  // badge and the primary action, and the status bar counts the same ones.
  it('two proposals that arrived together: two "New" badges, two primary actions and the bar counts 2', async () => {
    const a = { ...richScenario('P1').proposal, title: 'Checkout' };
    const b = {
      ...richScenario('P2').proposal,
      title: 'Fixes',
      createdAt: '2026-10-10T12:00:00.000Z',
    };
    const h = await openReviewHarness({ proposals: [a, b] });
    renderInEditor(
      h,
      <>
        <ProposalList onHelp={noop} onScan={noop} />
        <StatusBar />
      </>,
    );
    expect(screen.getAllByText('New')).toHaveLength(2);
    for (const title of ['Checkout', 'Fixes']) {
      const action = screen.getByRole('button', { name: `Review: ${title}` });
      expect(action.className).toContain('button-primary');
    }
    expect(screen.getByRole('button', { name: '2 new proposal(s)' })).toBeTruthy();
    // Opening one of them removes its badge and its count, and only its own.
    act(() => {
      h.review.open('P2');
      h.review.close();
    });
    expect(screen.getAllByText('New')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '1 new proposal(s)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Review: Fixes' }).className).not.toContain(
      'button-primary',
    );
  });

  it('applied with a single change says "1 change applied" (singular)', async () => {
    const { base, proposal } = richScenario();
    const accepted = decided(proposal, base, { level: 'proposal', id: null }, 'accepted');
    const [first, ...rest] = accepted.changes;
    if (!first || rest.length === 0) throw new Error('scenario needs several changes');
    const one: Proposal = {
      ...accepted,
      status: 'applied',
      applied: { [first.id]: { at: AT } },
    };
    const h = await openReviewHarness({ proposals: [one] });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    expect(screen.getByText('1 change applied')).toBeTruthy();
    cleanup();
    const many: Proposal = {
      ...accepted,
      status: 'applied',
      applied: Object.fromEntries(accepted.changes.map((c) => [c.id, { at: AT }])),
    };
    const h2 = await openReviewHarness({ proposals: [many] });
    renderInEditor(h2, <ProposalList onHelp={noop} onScan={noop} />);
    expect(screen.getByText(`${accepted.changes.length} changes applied`)).toBeTruthy();
  });

  // Finding 13 (app part): a proposal already reviewed and applied does not change status when
  // superseded; the row shows who superseded it and leads to the new one.
  it('applied and superseded: "Applied · superseded by …" and Open the new one, without changing the file', async () => {
    const { base, proposal } = richScenario();
    const accepted = decided(proposal, base, { level: 'proposal', id: null }, 'accepted');
    const applied: Proposal = {
      ...accepted,
      status: 'applied',
      applied: Object.fromEntries(accepted.changes.map((c) => [c.id, { at: AT }])),
    };
    const next = {
      ...richScenario('P2').proposal,
      supersedes: 'P1',
      title: 'Only the fix',
    };
    const h = await openReviewHarness({ proposals: [applied, next] });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    const row = screen
      .getAllByRole('listitem')
      .find((r) => r.getAttribute('data-proposal') === 'P1');
    if (!row) throw new Error('row of P1');
    expect(within(row).getByText('Applied')).toBeTruthy();
    expect(within(row).getByText('superseded by Only the fix')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'View: Teste' })).toBeTruthy();
    fireEvent.click(
      within(row).getByRole('button', { name: 'Open the new one: Only the fix' }),
    );
    expect(h.review.proposalId.value).toBe('P2');
    expect((await diskProposal(h.root)).status).toBe('applied');
  });

  it('search by title, origin and author and Open/Closed filter', async () => {
    const a = { ...richScenario('P1').proposal, title: 'Checkout', origin: 'Figma' };
    const b = { ...richScenario('P2').proposal, title: 'Home', author: 'Agent X' };
    const h = await openReviewHarness({ proposals: [a, b] });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.input(screen.getByRole('searchbox', { name: 'Search proposals' }), {
      target: { value: 'agent' },
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Home')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Closed 0' }));
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText('No proposal matches this filter.')).toBeTruthy();
  });
});

describe('new proposal notice', () => {
  it('appears when the folder brings a new proposal, with Review', async () => {
    const h = await openReviewHarness({ skipProposals: true });
    renderInEditor(h, <ProposalNotices />);
    expect(screen.queryByRole('status')).toBeNull();
    writeOutside(h.root, { ...richScenario().proposal, title: 'Checkout' });
    await act(async () => {
      await h.session.proposals.scan();
    });
    const notice = screen.getByRole('status');
    expect(within(notice).getByText('New proposal')).toBeTruthy();
    expect(within(notice).getByText('Checkout')).toBeTruthy();
    fireEvent.click(within(notice).getByRole('button', { name: 'Review' }));
    expect(h.review.proposalId.value).toBe('P1');
    expect(h.session.proposals.notices.value).toEqual([]);
  });

  // Phase 8.2 (P4): opening the proposal by any path removes its notice from the queue (store
  // action), and it does not come back when leaving the review.
  it('disappears when opening the proposal from the Proposals window and does not come back on leaving the review', async () => {
    const h = await openReviewHarness({ skipProposals: true });
    renderInEditor(
      h,
      <>
        <ProposalNotices />
        <ProposalList onHelp={noop} onScan={noop} />
      </>,
    );
    writeOutside(h.root, { ...richScenario().proposal, title: 'Checkout' });
    await act(async () => {
      await h.session.proposals.scan();
    });
    expect(screen.getByRole('status')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Review: Checkout' }));
    expect(h.review.proposalId.value).toBe('P1');
    expect(screen.queryByRole('status')).toBeNull();
    act(() => h.review.close());
    expect(screen.queryByRole('status')).toBeNull();
    expect(h.session.proposals.notices.value).toEqual([]);
  });
});

describe('formatWhen', () => {
  const now = new Date(2026, 9, 9, 15, 0);
  it('today, yesterday and short date', () => {
    expect(formatWhen(new Date(2026, 9, 9, 9, 40).toISOString(), now, 'en-US')).toBe(
      'today 09:40 AM',
    );
    expect(formatWhen(new Date(2026, 9, 8, 18, 12).toISOString(), now, 'en-US')).toBe(
      'yesterday 06:12 PM',
    );
    expect(formatWhen(new Date(2026, 9, 6, 8, 0).toISOString(), now, 'en-US')).toBe(
      '10/06',
    );
    expect(formatWhen(new Date(2025, 9, 6, 8, 0).toISOString(), now, 'en-US')).toBe(
      '10/06/2025',
    );
  });
});

// Phase 9.2: ⋯ menu "Delete proposal…" only on closed rows, with confirmation and focus.
describe('delete proposal from the ⋯ menu (phase 9.2)', () => {
  /** P1 open, P2 withdrawn and P3 applied: the list shows P1, P2, P3 in that order. */
  async function threeProposals() {
    const open = { ...richScenario('P1').proposal, title: 'Open one' };
    const withdrawn: Proposal = {
      ...richScenario('P2').proposal,
      title: 'Withdrawn by the agent',
      status: 'withdrawn',
    };
    const applied: Proposal = {
      ...richScenario('P3').proposal,
      title: 'Already applied',
      status: 'applied',
    };
    const h = await openReviewHarness({
      proposals: [open, withdrawn, applied],
      files: { 'proposals/P2/images/nova.webp': 'W2' },
    });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    return h;
  }

  const rowOf = (id: string) => {
    const row = screen
      .getAllByRole('listitem')
      .find((r) => r.getAttribute('data-proposal') === id);
    if (!row) throw new Error(`row ${id}`);
    return row;
  };
  const menuOf = (id: string) =>
    within(rowOf(id)).queryByRole('button', { name: /^Proposal actions:/ });
  const actionOf = (id: string) =>
    within(rowOf(id)).getByRole('button', { name: /^(Review|Continue|View):/ });

  async function askToRemove(user: ReturnType<typeof userEvent.setup>, id: string) {
    const trigger = menuOf(id);
    if (!trigger) throw new Error(`no menu on ${id}`);
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Delete proposal…' }));
    return trigger;
  }

  it('the ⋯ menu only exists on closed rows: the open one has no such action', async () => {
    await threeProposals();
    expect(menuOf('P1')).toBeNull();
    expect(menuOf('P2')).not.toBeNull();
    expect(menuOf('P3')).not.toBeNull();
    expect(menuOf('P2')?.getAttribute('aria-label')).toBe(
      'Proposal actions: Withdrawn by the agent',
    );
  });

  it('during the review the action does not exist (the window shows the levels, not the list)', async () => {
    const h = await threeProposals();
    cleanup();
    renderInEditor(h, <ProposalsWindow onHelp={noop} />);
    expect(menuOf('P2')).not.toBeNull();
    act(() => {
      h.review.open('P1');
    });
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /^Proposal actions:/ })).toBeNull();
    expect(screen.queryByText('Delete proposal…')).toBeNull();
  });

  it('the confirmation is an alertdialog with the title and the warning; Cancel does not delete and returns focus to the ⋯', async () => {
    const h = await threeProposals();
    const user = userEvent.setup();
    const trigger = await askToRemove(user, 'P3');

    const dialog = document.querySelector('dialog') as HTMLElement;
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    const body = document.getElementById(dialog.getAttribute('aria-describedby') ?? '');
    expect(body?.textContent).toContain('"Already applied"');
    expect(body?.textContent).toContain('This cannot be undone');
    // The applied one warns that the project does not lose the changes already applied.
    expect(body?.textContent).toContain(
      'The changes already applied stay in the project',
    );

    await user.click(
      within(dialog).getByRole('button', { name: 'Cancel', hidden: true }),
    );
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect(await diskProposal(h.root, 'P3')).toMatchObject({ id: 'P3' });
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('the withdrawn one does not carry the applied-changes warning', async () => {
    await threeProposals();
    const user = userEvent.setup();
    await askToRemove(user, 'P2');
    const dialog = document.querySelector('dialog') as HTMLElement;
    expect(dialog.textContent).toContain('"Withdrawn by the agent"');
    expect(dialog.textContent).not.toContain('already applied');
  });

  it('Delete: removes the folder from disk, the row disappears without a "deleted outside" notice, there is a toast and focus goes to the action of the next row', async () => {
    const h = await threeProposals();
    const user = userEvent.setup();
    await askToRemove(user, 'P2');
    const dialog = document.querySelector('dialog') as HTMLElement;
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete', hidden: true }),
    );

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    expect(screen.queryByText('Withdrawn by the agent')).toBeNull();
    expect(h.root.dirs.get('proposals')?.dirs.has('P2')).toBe(false);
    expect(await h.root.read('proposals/P2/images/nova.webp')).toBeNull();
    expect(h.session.proposals.notices.value).toEqual([]);
    expect(h.ui.toast.value).toBe('Proposal deleted: Withdrawn by the agent');
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    // P3 took its place.
    await waitFor(() => expect(document.activeElement).toBe(actionOf('P3')));
    // The next folder check does not warn about anything either.
    await h.session.proposals.scan();
    expect(h.session.proposals.notices.value).toEqual([]);
  });

  it('deleting the last row moves focus to the previous one', async () => {
    await threeProposals();
    const user = userEvent.setup();
    await askToRemove(user, 'P3');
    const dialog = document.querySelector('dialog') as HTMLElement;
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete', hidden: true }),
    );
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    await waitFor(() => expect(document.activeElement).toBe(actionOf('P2')));
  });

  it('deleting the only proposal shows the empty state and focus stays on it', async () => {
    const only: Proposal = {
      ...richScenario('P1').proposal,
      title: 'Only one',
      status: 'withdrawn',
    };
    const h = await openReviewHarness({ proposals: [only] });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    const user = userEvent.setup();
    await askToRemove(user, 'P1');
    const dialog = document.querySelector('dialog') as HTMLElement;
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete', hidden: true }),
    );
    await screen.findByRole('heading', { name: 'No proposals yet' });
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'How the agent sends proposals' }),
      ),
    );
  });

  it('delete failure: the row stays, the error goes to the toast and focus returns to the ⋯', async () => {
    const h = await threeProposals();
    vi.spyOn(h.storage, 'removeProposal').mockRejectedValue(new Error('no permission'));
    const user = userEvent.setup();
    const trigger = await askToRemove(user, 'P2');
    const dialog = document.querySelector('dialog') as HTMLElement;
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete', hidden: true }),
    );
    await waitFor(() =>
      expect(h.ui.toast.value).toBe('The proposal could not be deleted.'),
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(await diskProposal(h.root, 'P2')).toMatchObject({ id: 'P2' });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('if the agent reopened the proposal outside, the confirmation refuses and explains', async () => {
    const h = await threeProposals();
    const user = userEvent.setup();
    await askToRemove(user, 'P2');
    // The file is open again before the Delete click.
    writeOutside(h.root, {
      ...richScenario('P2').proposal,
      title: 'Reopened',
      revision: 3,
    });
    const dialog = document.querySelector('dialog') as HTMLElement;
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete', hidden: true }),
    );
    await waitFor(() => expect(h.ui.toast.value).toContain('This proposal is open'));
    expect(await diskProposal(h.root, 'P2')).toMatchObject({ status: 'open' });
  });

  it('read-only project: the menu is disabled', async () => {
    const h = await threeProposals();
    act(() => {
      const project = h.session.store.project.value;
      if (project) h.session.store.load(project, { readOnly: true });
    });
    expect(menuOf('P2')?.hasAttribute('disabled')).toBe(true);
  });
});
