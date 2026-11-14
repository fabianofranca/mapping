import { act, cleanup, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createArrow, renameMarking } from '../../../src/model';
import { t } from '../../../src/i18n';
import { locale } from '../../../src/store/settings';
import { ReviewPanel } from '../../../src/ui/review/ReviewPanel';
import { sampleProject } from '../../model/fixtures';
import { propose } from '../../model/proposalFixtures';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// "Linked by arrow" in the review (stage #658, decision 7): the review Details mount the same
// MarkingPanel, and the section reads the project on view (Current or Proposed), without
// review marks.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

describe('review Details — "Linked by arrow" section', () => {
  it('shows up and reads the project on view, without review markers inside it', async () => {
    const base = createArrow(sampleProject(), { id: 'R1', from: 'M1', to: 'M4' });
    const after = renameMarking(base, 'M4', 'Destination screen');
    const proposal = propose(base, after, { id: 'P1' });
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    renderInEditor(h, <ReviewPanel onGoToAnnotation={() => {}} />);

    const section = () => screen.getByRole('region', { name: t('arrowLinks.section') });
    // Proposed (default): the other end already has the new name.
    expect(
      within(section()).getByRole('button', {
        name: t('arrow.select', { name: 'Destination screen' }),
      }),
    ).toBeTruthy();
    expect(within(section()).queryAllByRole('button', { name: /: changed, / })).toEqual(
      [],
    );

    act(() => h.review.setView('current'));
    expect(
      within(section()).getByRole('button', {
        name: t('arrow.select', { name: t('marking.unnamed') }),
      }),
    ).toBeTruthy();
    expect(within(section()).queryAllByRole('button', { name: /: changed, / })).toEqual(
      [],
    );
  });
});
