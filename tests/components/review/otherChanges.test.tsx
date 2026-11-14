import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { replaceContainer, setMarkingLocked } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { sampleProject } from '../../model/fixtures';
import { changeOf, propose } from '../../model/proposalFixtures';
import { showReviewPanel } from './reviewHarness';

// "Other changes" (phase 9.6, HANDOFF-REVIEW-DETAILS 5.6): what has no field in the normal
// panel goes in a row with the kind, the summary and the same marker and popover as the
// fields; the replaced image has the marker on the File field, with Compare in the popover.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

describe('Other changes', () => {
  it('marking: the lock becomes a row with kind, summary and marker; collapsed, the section counts', async () => {
    const base = sampleProject();
    const proposal = propose(base, setMarkingLocked(base, 'M4', true));
    const h = await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M4' },
    );
    const section = screen.getByRole('region', { name: 'Other changes' });
    const row = within(section).getByRole('listitem');
    expect(within(row).getByText('Lock')).toBeTruthy();
    expect(within(row).getByRole('img', { name: 'Changed' })).toBeTruthy();
    const mark = within(row).getByRole('button', {
      name: /^Lock: changed, pending\./,
    });
    expect(mark.getAttribute('data-change')).toBe(proposal.changes[0]?.id);
    // The popover is the same as the fields', with the decision.
    fireEvent.click(mark);
    const pop = screen.getByRole('dialog', { name: 'Lock · changed' });
    fireEvent.click(within(pop).getByRole('button', { name: 'Accept: Lock' }));
    await waitFor(() =>
      expect(h.review.derived.levels.value.get('item:M4')?.state).toBe('accepted'),
    );
    expect(mark.getAttribute('data-state')).toBe('accepted');

    // Collapsed, the section says how many changes it has.
    fireEvent.click(within(section).getByRole('button', { name: /^Other changes/ }));
    expect(
      within(screen.getByRole('region', { name: 'Other changes' })).getByText(
        '1 change(s)',
      ),
    ).toBeTruthy();
  });

  it('replaced image: the File marker has Compare; the position goes to "Other changes"', async () => {
    const base = sampleProject();
    const after = replaceContainer(base, 'I2', {
      file: 'images/front-2.jpg',
      width: 2000,
      height: 2000,
    });
    const proposal = propose(base, after);
    const h = await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'image', id: 'I2' },
    );
    const header = screen.getByRole('region', { name: 'Decision' });
    expect(within(header).getByText('Image changed')).toBeTruthy();
    expect(
      // pt-BR kept: shared fixture data asserted by tests/model (file name images/frente.jpg from sampleProject)
      within(header).getByRole('button', { name: /^Accept .*frente/ }).textContent,
    ).toBe('Accept image');

    const file = screen.getByRole('button', {
      name: /^Image file: replaced, pending\./,
    });
    fireEvent.click(file);
    const pop = screen.getByRole('dialog');
    fireEvent.click(within(pop).getByRole('button', { name: 'Compare' }));
    expect(h.ui.compareImage.value).toBe('I2');
    // The popover closes (focus goes back to the marker, which opens the compare dialog).
    expect(
      screen.queryByRole('dialog', { name: 'Image file · replaced' }),
    ).toBeNull();

    // The canvas position has no field: it stays in "Other changes".
    const others = screen.getByRole('region', { name: 'Other changes' });
    expect(
      within(others).getByRole('button', {
        name: /^Canvas position: (moved|changed)/,
      }),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole('button', { name: /^Canvas position/ })
        .every((el) => others.contains(el)),
    ).toBe(true);
    expect(changeOf(proposal, 'image', 'I2', 'placement').id).toBeTruthy();
  });
});
