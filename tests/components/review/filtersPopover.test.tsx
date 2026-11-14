import { act, cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../../src/store/settings';
import { ProposalsWindow } from '../../../src/ui/review/ProposalsWindow';
import { NEW_IMAGE_PATH, richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor, type ReviewHarness } from './reviewHarness';

// Review filters collapsed into the "Filters" button (#598, decision 4): the controls only
// exist inside the popover; the button count is of groups, not of values.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

async function openRich(): Promise<ReviewHarness> {
  const { proposal } = richScenario();
  const h = await openReviewHarness({
    proposals: [{ ...proposal, title: 'Checkout' }],
    files: { [NEW_IMAGE_PATH]: 'image' },
  });
  expect(h.review.open('P1').ok).toBe(true);
  return h;
}

const trigger = () => screen.getByRole('button', { name: /^Filters/ });

describe('collapsed filters', () => {
  it('the controls only show up after pressing Filters', async () => {
    const h = await openRich();
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    expect(screen.queryByRole('group', { name: 'Change type' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Review filters' })).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger());
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    const pop = screen.getByRole('dialog', { name: 'Review filters' });
    expect(pop.contains(screen.getByRole('group', { name: 'Change type' }))).toBe(
      true,
    );
  });

  it('choosing decision and type does not close the popover; the button counts groups', async () => {
    const h = await openRich();
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    expect(trigger().textContent).toBe('Filters');
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('button', { name: /^Undecided/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Moved/ }));
    // Both filters on, and the popover stays open.
    expect(screen.getByRole('dialog', { name: 'Review filters' })).toBeTruthy();
    expect(trigger().textContent).toBe('Filters · 2');
    // Two kinds still count as a single group.
    fireEvent.click(screen.getByRole('button', { name: /^Created/ }));
    expect(trigger().textContent).toBe('Filters · 2');
    expect(screen.getByText(/^Showing \d+ of \d+$/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(trigger().textContent).toBe('Filters');
  });

  it('Esc closes and returns focus to the button', async () => {
    const h = await openRich();
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    fireEvent.click(trigger());
    const radio = screen.getByRole('button', { name: /^Undecided/ });
    radio.focus();
    fireEvent.keyDown(radio, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Review filters' })).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('the new-conflicts notice turns Conflicts only on without opening the popover', async () => {
    const h = await openRich();
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    act(() => h.review.setFilters({ onlyConflicts: true }));
    expect(screen.queryByRole('dialog', { name: 'Review filters' })).toBeNull();
    expect(trigger().textContent).toBe('Filters · 1');
  });
});
