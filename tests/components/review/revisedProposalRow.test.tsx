import { act, cleanup, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../../src/store/settings';
import { ProposalList } from '../../../src/ui/review/ProposalList';
import { richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';
import { revisedScenario } from './revisedFixture';

// Proposals window row with a visible mark (stage #644, CP3): "Revised · N to check".

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

const noop = () => {};

describe('revised proposal row', () => {
  it('says "Revised · 2 to check" and keeps Review; `fresh` does not change', async () => {
    const { proposal } = revisedScenario();
    const h = await openReviewHarness({ proposals: [proposal] });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('Revised · 2 to check')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Review: Checkout' })).toBeTruthy();
    expect(h.review.derived.rows.value[0]?.revised).toBe(2);
    // It arrived revised and nobody opened it: it stays "New" and in the bar count.
    expect(h.review.derived.rows.value[0]?.fresh).toBe(true);
    expect(within(row).getByText('New')).toBeTruthy();
  });

  it('deciding a revised change lowers the count; with all decided, the row disappears', async () => {
    const { proposal, changedId, addedId } = revisedScenario();
    const h = await openReviewHarness({ proposals: [proposal] });
    h.review.open('P1');
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    await act(async () => {
      await h.review.decide({ level: 'change', id: changedId }, 'accepted');
    });
    expect(screen.getByText('Revised · 1 to check')).toBeTruthy();
    await act(async () => {
      await h.review.decide({ level: 'change', id: addedId }, 'rejected');
    });
    expect(screen.queryByText(/^Revised ·/)).toBeNull();
  });

  it('proposal without a revision does not carry the text', async () => {
    const { proposal } = richScenario();
    const h = await openReviewHarness({ proposals: [proposal] });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    expect(screen.queryByText(/^Revised ·/)).toBeNull();
    expect(h.review.derived.rows.value[0]?.revised).toBe(0);
  });
});
