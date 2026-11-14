import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renameMarking } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { ProposalsWindow } from '../../../src/ui/review/ProposalsWindow';
import { sampleProject } from '../../model/fixtures';
import { richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// AC1 (#641): the new-conflicts notice on one line, with the full sentence in the hint and the X.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

async function staleWindow() {
  const { proposal } = richScenario();
  const first = await openReviewHarness({ proposals: [proposal], copyId: 'c' });
  first.review.open('P1');
  first.review.close();
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
  const notice = document.querySelector('.notice-box-line') as HTMLElement;
  return { h, notice };
}

describe('new-conflicts notice on one line', () => {
  it('shows the short text, Show conflicts and the X; the full sentence stays in the hint and for the screen reader', async () => {
    const { notice } = await staleWindow();
    expect(within(notice).getByText('1 new conflict(s)')).toBeTruthy();
    expect(
      within(notice).getByRole('button', { name: 'Show the new conflicts (1)' })
        .textContent,
    ).toBe('Show conflicts');
    expect(within(notice).getByRole('button', { name: 'Dismiss' })).toBeTruthy();
    expect(notice.querySelector('.notice-box-text')?.textContent).toBe(
      '1 new conflict(s)',
    );
    const phrase = within(notice).getAllByText(
      /The project changed since your last session\./,
    );
    expect(phrase.some((n) => n.classList.contains('visually-hidden'))).toBe(true);
    expect(phrase.some((n) => n.getAttribute('data-tooltip') !== null)).toBe(true);
  });

  it('Show conflicts turns on Conflicts only and does not close the notice', async () => {
    const { h, notice } = await staleWindow();
    fireEvent.click(
      within(notice).getByRole('button', { name: 'Show the new conflicts (1)' }),
    );
    expect(h.review.filters.value.onlyConflicts).toBe(true);
    expect(screen.getByRole('button', { name: /^Filters · 1/ })).toBeTruthy();
    expect(document.querySelector('.notice-box-line')).toBeTruthy();
  });

  it('the X removes the notice and focus goes to the review list', async () => {
    const { h, notice } = await staleWindow();
    fireEvent.click(within(notice).getByRole('button', { name: 'Dismiss' }));
    expect(document.querySelector('.notice-box-line')).toBeNull();
    expect(h.review.staleNotice.value.size).toBe(0);
    expect(document.activeElement).toBe(screen.getByRole('tree'));
  });
});
