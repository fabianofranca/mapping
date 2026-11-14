import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { needsExitReminder, renameMarking, supersedeProposal } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { ExitReviewDialog } from '../../../src/ui/review/ExitReviewDialog';
import { ProposalsWindow } from '../../../src/ui/review/ProposalsWindow';
import { sampleProject } from '../../model/fixtures';
import { decided } from '../../model/proposalFixtures';
import { diskProposal, richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// Resuming the review (HANDOFF-PROPOSALS 5.3, step 7 of section 9): the reminder on exit, the
// new conflicts after an edit between sessions and the superseded proposal.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

describe('reminder on exit', () => {
  it('only asks with accepted changes awaiting apply in an applicable proposal', () => {
    expect(needsExitReminder('open', 0)).toBe(false);
    expect(needsExitReminder('open', 3)).toBe(true);
    expect(needsExitReminder('superseded', 1)).toBe(true);
    expect(needsExitReminder('applied', 2)).toBe(false);
  });

  it('Exit anyway closes without losing the decisions', async () => {
    const { base, proposal } = richScenario();
    const accepted = decided(proposal, base, { level: 'item', id: 'M1' }, 'accepted');
    const h = await openReviewHarness({ proposals: [accepted] });
    h.review.open('P1');
    const onClose = vi.fn();
    renderInEditor(h, <ExitReviewDialog onClose={onClose} />);
    expect(
      screen.getByText(
        'There are 1 accepted change(s) not yet applied to the project.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apply now · 1' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Exit anyway' }));
    expect(onClose).toHaveBeenCalled();
    expect(h.review.proposalId.value).toBeNull();
    const disk = await diskProposal(h.root);
    expect(Object.values(disk.decisions).map((d) => d.state)).toEqual(['accepted']);
  });

  it('Apply now applies the accepted ones and exits', async () => {
    const { base, proposal } = richScenario();
    const accepted = decided(proposal, base, { level: 'item', id: 'M1' }, 'accepted');
    const h = await openReviewHarness({ proposals: [accepted] });
    h.review.open('P1');
    renderInEditor(h, <ExitReviewDialog onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply now · 1' }));
    await waitFor(() => expect(h.review.proposalId.value).toBeNull());
    expect(
      h.session.store.committed.value?.markings.find((m) => m.id === 'M1')?.name,
    ).toBe('Porta dianteira');
  });
});

describe('on reopening', () => {
  it('new conflicts after an edit between sessions: notice and "Show the new conflicts"', async () => {
    const { proposal } = richScenario();
    // First session: opens and exits (the device now knows the proposal in this copy).
    const first = await openReviewHarness({ proposals: [proposal], copyId: 'c' });
    first.review.open('P1');
    first.review.close();
    // The project was edited outside: the name of M1 changed.
    const edited = renameMarking(sampleProject(), 'M1', 'Rear door');
    const h = await openReviewHarness({
      project: edited,
      proposals: [proposal],
      copyId: 'c',
    });
    act(() => {
      h.review.open('P1');
    });
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    expect(screen.getByText('1 new conflict(s)')).toBeTruthy();
    expect(screen.getByText('New conflict')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show the new conflicts (1)' }));
    expect(h.review.filters.value.onlyConflicts).toBe(true);
    expect(h.review.selected.value?.level).toBe('change');
  });

  it('superseded proposal: what was left behind grouped, the pending ones undecided', async () => {
    const { base, proposal } = richScenario();
    const old = supersedeProposal(
      decided(proposal, base, { level: 'item', id: 'M1' }, 'accepted'),
    );
    const next = { ...richScenario('P2').proposal, supersedes: 'P1', title: 'New' };
    const h = await openReviewHarness({ proposals: [old, next] });
    h.review.open('P1');
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    expect(screen.getByText('Proposal superseded')).toBeTruthy();
    expect(screen.getByText('Accepted, not applied')).toBeTruthy();
    expect(screen.getByText('Undecided')).toBeTruthy();
    // Each change says how it stands in the new one (both proposals are equal here).
    expect(screen.getAllByText('same in the new one').length).toBe(proposal.changes.length);
    // The pending ones can no longer be decided.
    const accept = screen.getAllByRole('button', { name: /^Accept / })[0];
    expect((accept as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Open the new one: New' }));
    expect(h.review.proposalId.value).toBe('P2');
  });
});
