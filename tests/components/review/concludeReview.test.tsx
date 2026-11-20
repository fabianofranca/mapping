import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../../src/store/settings';
import { ReviewBar } from '../../../src/ui/review/ReviewBar';
import { ReviewPanel } from '../../../src/ui/review/ReviewPanel';
import { decided } from '../../model/proposalFixtures';
import { richScenario, writeOutside } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// "Conclude review" (stage #2085): a decided review (nothing undecided, nothing accepted but
// unapplied) closes the proposal. The apply button of the bar changes its label and keeps its
// place; the Details header says the proposal was rejected; nothing is written to `mapping.json`.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

const files = { 'proposals/P1/images/nova.webp': 'WEBP' };

async function rejectedHarness() {
  const { base, proposal } = richScenario();
  const rejected = decided(proposal, base, { level: 'proposal', id: null }, 'rejected');
  const h = await openReviewHarness({ proposals: [rejected], files });
  h.review.open('P1');
  return { h, base, proposal: rejected };
}

function Screen() {
  return (
    <>
      <ReviewBar onExit={() => {}} />
      <ReviewPanel onGoToAnnotation={() => {}} />
    </>
  );
}

describe('Conclude review: the review bar', () => {
  it('with everything rejected the apply button reads Conclude review, with its tooltip and the same shortcut', async () => {
    const { h } = await rejectedHarness();
    renderInEditor(h, <Screen />);
    const button = screen.getByRole('button', { name: 'Conclude review' });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.getAttribute('title')).toContain(
      'Nothing left to decide or apply: close the proposal',
    );
    expect(button.getAttribute('title')).toContain('Ctrl+Enter');
    expect(button.getAttribute('aria-keyshortcuts')).toBe('Control+Enter');
    expect(screen.queryByRole('button', { name: /^Apply accepted/ })).toBeNull();
  });

  it('with something to decide the button is today’s Apply accepted · 0, disabled', async () => {
    const { proposal } = richScenario();
    const h = await openReviewHarness({ proposals: [proposal], files });
    h.review.open('P1');
    renderInEditor(h, <ReviewBar onExit={() => {}} />);
    const apply = screen.getByRole('button', { name: /^Apply accepted · 0/ });
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Conclude review' })).toBeNull();
  });

  it('with accepted changes still unapplied the button is Apply accepted, not Conclude', async () => {
    const { base, proposal } = richScenario();
    const accepted = decided(proposal, base, { level: 'item', id: 'M1' }, 'accepted');
    const h = await openReviewHarness({ proposals: [accepted], files });
    h.review.open('P1');
    renderInEditor(h, <ReviewBar onExit={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Conclude review' })).toBeNull();
    expect(screen.getByRole('button', { name: /^Apply accepted · 1/ })).toBeTruthy();
  });

  it('concluding closes the proposal as rejected: toast, header notice, nothing to decide and no apply button', async () => {
    const { h } = await rejectedHarness();
    renderInEditor(h, <Screen />);
    fireEvent.click(screen.getByRole('button', { name: 'Conclude review' }));
    await waitFor(() => expect(h.review.derived.proposal.value?.status).toBe('rejected'));
    await waitFor(() =>
      expect(h.ui.toast.value).toBe('Review concluded: proposal rejected.'),
    );
    expect(
      screen.getByText("Proposal rejected. View only: decisions can't change."),
    ).toBeTruthy();
    // The review stays open, view only: the button went back to the apply label, disabled.
    expect(h.review.proposalId.value).toBe('P1');
    expect(screen.queryByRole('button', { name: 'Conclude review' })).toBeNull();
    const apply = screen.getByRole('button', { name: /^Apply accepted/ });
    expect((apply as HTMLButtonElement).disabled).toBe(true);
  });

  it('after a partial application, concluding says the proposal was applied', async () => {
    const { proposal, ids } = richScenario();
    const h = await openReviewHarness({ proposals: [proposal], files });
    h.review.open('P1');
    await h.review.decide({ level: 'change', id: ids.name }, 'accepted');
    await h.review.apply();
    await h.review.decide({ level: 'proposal', id: null }, 'rejected');
    renderInEditor(h, <Screen />);
    fireEvent.click(screen.getByRole('button', { name: 'Conclude review' }));
    await waitFor(() => expect(h.review.derived.proposal.value?.status).toBe('applied'));
    await waitFor(() =>
      expect(h.ui.toast.value).toBe('Review concluded: proposal applied.'),
    );
  });

  it('an agent revision that adds changes makes the click refuse with the toast and writes nothing', async () => {
    const { h, proposal } = await rejectedHarness();
    renderInEditor(h, <Screen />);
    const [first] = proposal.changes;
    if (!first) throw new Error('no change');
    writeOutside(h.root, {
      ...proposal,
      changes: [...proposal.changes, { ...first, id: 'c99' }],
      revision: 9,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Conclude review' }));
    await waitFor(() =>
      expect(h.ui.toast.value).toBe(
        'The proposal changed: there is something new to decide.',
      ),
    );
    const onDisk = JSON.parse((await h.root.read('proposals/P1/proposal.json')) ?? '{}');
    expect(onDisk.status).toBe('open');
    expect(onDisk.revision).toBe(9);
  });

  it('pt-BR: label, toast and notice', async () => {
    // pt-BR kept: the test checks the pt-BR text of the button, the toast and the notice
    locale.value = 'pt-BR';
    const { h } = await rejectedHarness();
    renderInEditor(h, <Screen />);
    fireEvent.click(screen.getByRole('button', { name: 'Concluir revisão' }));
    await waitFor(() => expect(h.review.derived.proposal.value?.status).toBe('rejected'));
    await waitFor(() =>
      expect(h.ui.toast.value).toBe('Revisão concluída: proposta rejeitada.'),
    );
    expect(
      screen.getByText('Proposta rejeitada. Só visualização: as decisões não mudam.'),
    ).toBeTruthy();
  });
});

describe('Conclude review: the header of a rejected proposal', () => {
  it('shows the notice and keeps the decisions disabled', async () => {
    const { base, proposal } = richScenario();
    const rejected = {
      ...decided(proposal, base, { level: 'proposal', id: null }, 'rejected'),
      status: 'rejected' as const,
    };
    const h = await openReviewHarness({ proposals: [rejected], files });
    h.review.open('P1');
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    renderInEditor(h, <ReviewPanel onGoToAnnotation={() => {}} />);
    expect(
      screen.getByText("Proposal rejected. View only: decisions can't change."),
    ).toBeTruthy();
    const header = screen.getByRole('region', { name: 'Decision' });
    const accept = within(header).getByRole('button', { name: /^Accept marking/ });
    expect((accept as HTMLButtonElement).disabled).toBe(true);
  });
});
