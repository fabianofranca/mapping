import { act, cleanup, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useReviewSync } from '../../../src/app/useReviewSync';
import { t } from '../../../src/i18n';
import { locale } from '../../../src/store/settings';
import { ReviewPanel } from '../../../src/ui/review/ReviewPanel';
import { richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// The review Details follow the selection: clearing the selection (clicking the canvas or
// Tree background) takes the review to the proposal level, instead of leaving the last item
// in view with "Nothing selected" in the status bar.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

function Wired() {
  useReviewSync();
  return <ReviewPanel onGoToAnnotation={() => {}} />;
}

describe('review Details without selection', () => {
  it('clearing the selection swaps the item for the proposal level', async () => {
    const { proposal } = richScenario();
    const h = await openReviewHarness({ proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    renderInEditor(h, <Wired />);
    act(() => {
      h.ui.selection.value = { kind: 'marking', id: 'M1' };
    });
    expect(h.review.selected.value).toEqual({ level: 'item', id: 'M1' });
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeTruthy();
    act(() => {
      h.ui.selection.value = null;
    });
    expect(h.review.selected.value).toEqual({ level: 'proposal', id: null });
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
    expect(
      screen.getByRole('region', { name: t('review.details.decision') }),
    ).toBeTruthy();
  });
});
