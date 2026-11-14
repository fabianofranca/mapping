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
import { ReviewUndoNotice } from '../../../src/ui/review/ProposalNotices';
import { changeOf } from '../../model/proposalFixtures';
import {
  PanelWithShortcuts,
  firstImport,
  openReviewHarness,
  renderInEditor,
} from './reviewHarness';

// R4.5 of docs/TESTING.md (stage #405, decision 4): rejecting the creation of a marking, with
// the marking selected, takes the dependent annotation along. The app shows TWO different
// notices (the one in the canvas corner and the one in the Details header) and the card's
// "together" mark is only an icon, with "decided together" in the accessible name; the
// badge with text stays in the review list.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

describe('R4.5: rejecting the creation with a dependent annotation', () => {
  it('shows the corner notice, the header one with Undo and the "together" mark of the card', async () => {
    const { base, proposal } = firstImport();
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    renderInEditor(
      h,
      <>
        <PanelWithShortcuts />
        <div data-testid="corner">
          <ReviewUndoNotice />
        </div>
      </>,
    );
    const marking = changeOf(proposal, 'marking', 'M1');
    await act(async () => {
      await h.review.decide({ level: 'change', id: marking.id }, 'rejected');
    });

    // Canvas corner notice: `review.undo.rejected` + `review.undo.cascaded`.
    const corner = within(screen.getByTestId('corner'));
    expect(
      corner.getByText(
        /change\(s\) rejected\..*changed along, by the dependencies\./,
      ),
    ).toBeTruthy();

    // Details header notice: `review.panel.together.rejected`, with the name and Undo.
    const headerNotice = screen.getByText(/^1 change\(s\) rejected together: /);
    expect(headerNotice.textContent).toContain('Annotation onClick created');
    expect(
      within(headerNotice.closest('.notice-box') as HTMLElement).getByRole('button', {
        name: 'Undo',
      }),
    ).toBeTruthy();

    // Annotation card: the mark is only an icon; "decided together" is in the accessible name.
    const mark = screen.getByRole('button', {
      name: /^Annotation onClick created: new, rejected, decided together/,
    });
    expect(mark.textContent?.trim()).toBe('');

    fireEvent.click(
      within(headerNotice.closest('.notice-box') as HTMLElement).getByRole('button', {
        name: 'Undo',
      }),
    );
    await waitFor(() => expect(screen.queryByText(/rejected together/)).toBeNull());
  });
});
