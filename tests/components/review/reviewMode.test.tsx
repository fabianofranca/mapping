import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locale } from '../../../src/store/settings';
import { ReviewBar } from '../../../src/ui/review/ReviewBar';
import { ProposalsWindow } from '../../../src/ui/review/ProposalsWindow';
import { NEW_IMAGE_PATH, richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor, type ReviewHarness } from './reviewHarness';

// Review mode (HANDOFF-PROPOSALS 5.2, step 4 of section 9): the strip with the four actions,
// the levels with the three-state decision, the filters and the list keyboard.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openRich(): Promise<ReviewHarness> {
  const { proposal } = richScenario();
  const h = await openReviewHarness({
    proposals: [{ ...proposal, title: 'Checkout' }],
    files: { [NEW_IMAGE_PATH]: 'image' },
  });
  expect(h.review.open('P1').ok).toBe(true);
  return h;
}

const rowOf = (name: string | RegExp) => screen.getByRole('treeitem', { name });

describe('proposal levels', () => {
  it('Proposal → Image → Item → Change, with the decision at each level', async () => {
    const h = await openRich();
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    // pt-BR kept: shared fixture data (item 'Botão') asserted by tests/store and tests/components
  const proposal = rowOf('Checkout');
    expect(proposal.getAttribute('aria-level')).toBe('1');
    // The new image and the item created in it, with the kind badge.
    const image = rowOf('images/nova.webp');
    expect(image.getAttribute('aria-level')).toBe('2');
    expect(within(image).getByRole('img', { name: 'Created' })).toBeTruthy();
    expect(rowOf('Botão').getAttribute('aria-level')).toBe('3');
    // The position change of M4 with the "before → after" summary.
    const moved = rowOf('Position');
    expect(within(moved).getByRole('img', { name: 'Moved' })).toBeTruthy();
    expect(moved.textContent).toContain('→');
    expect(within(proposal).getByRole('img', { name: 'Undecided' })).toBeTruthy();
  });

  it('deciding an image decides everything below it and the proposal becomes partial', async () => {
    const h = await openRich();
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    fireEvent.click(
      within(rowOf('images/nova.webp')).getByRole('button', {
        name: 'Accept images/nova.webp',
      }),
    );
    await waitFor(() =>
      expect(
        within(rowOf('Checkout')).getByRole('img', { name: /^Partial: 3 accepted/ }),
      ).toBeTruthy(),
    );
    expect(
      within(rowOf('Botão')).getByRole('button', { name: 'Accepted: Botão' }),
    ).toBeTruthy();
    // Pressing the marked one clears the decision.
    fireEvent.click(
      within(rowOf('images/nova.webp')).getByRole('button', {
        name: 'Accepted: images/nova.webp',
      }),
    );
    await waitFor(() =>
      expect(
        within(rowOf('Checkout')).getByRole('img', { name: 'Undecided' }),
      ).toBeTruthy(),
    );
  });

  it('filter by kind shows only its changes; Accept all becomes "shown"', async () => {
    const h = await openRich();
    renderInEditor(
      h,
      <>
        <ReviewBar onExit={() => {}} />
        <ProposalsWindow onHelp={() => {}} />
      </>,
    );
    expect(screen.getByRole('button', { name: /Accept all changes/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Moved/ }));
    expect(screen.queryByRole('treeitem', { name: 'images/nova.webp' })).toBeNull();
    expect(rowOf('Position')).toBeTruthy();
    expect(screen.getByText('Filters on')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Accept 1 shown/ }));
    await waitFor(() => expect(h.review.derived.counts.value.accepted).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(rowOf('images/nova.webp')).toBeTruthy();
  });

  it('keyboard: arrows move through the levels; ← and → collapse and expand', async () => {
    const h = await openRich();
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    const tree = screen.getByRole('tree', { name: 'Proposal levels' });
    act(() => h.review.select({ level: 'image', id: 'I3' }));
    fireEvent.keyDown(tree, { key: 'ArrowLeft' });
    expect(screen.queryByRole('treeitem', { name: 'Botão' })).toBeNull();
    fireEvent.keyDown(tree, { key: 'ArrowRight' });
    expect(rowOf('Botão')).toBeTruthy();
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    expect(h.review.selected.value?.level).not.toBe('image');
  });
});

describe('review strip', () => {
  it('Apply accepted · N: disabled without accepted ones; applying takes effect only for the accepted ones', async () => {
    const h = await openRich();
    renderInEditor(
      h,
      <>
        <ReviewBar onExit={() => {}} />
        <ProposalsWindow onHelp={() => {}} />
      </>,
    );
    const bar = screen.getByRole('region', { name: 'Proposal review' });
    expect(within(bar).getByText('Checkout')).toBeTruthy();
    const apply = within(bar).getByRole('button', { name: /Apply accepted · 0/ });
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    expect(apply.getAttribute('title')).toBe('Nothing accepted yet  Ctrl+Enter');

    fireEvent.click(
      within(rowOf('Position')).getByRole('button', { name: 'Accept Position' }),
    );
    const ready = await within(bar).findByRole('button', { name: /Apply accepted · 1/ });
    await waitFor(() => expect((ready as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(ready);
    await waitFor(() =>
      expect(
        h.session.store.committed.value?.markings.find((m) => m.id === 'M4')?.rect,
      ).toEqual({
        x: 10,
        y: 10,
        width: 100,
        height: 100,
      }),
    );
    // What was not decided stays pending in the same proposal.
    expect(h.review.derived.counts.value.undecided).toBeGreaterThan(0);
  });
});
