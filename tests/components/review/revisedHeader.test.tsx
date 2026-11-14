import { act, cleanup, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../../src/store/settings';
import { formatFullDate } from '../../../src/ui/review/format';
import { revisionParts } from '../../../src/ui/review/revisedText';
import { ReviewDetails } from '../../../src/ui/review/ReviewDetails';
import { NEW_IMAGE_PATH, richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';
import { REVISED_AT, revisedScenario } from './revisedFixture';

// Header of the revised proposal (stage #644, CP3): "Revised by the agent on <date>: …",
// without the zero counts.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

async function showProposal(proposal = revisedScenario().proposal) {
  const h = await openReviewHarness({
    proposals: [proposal],
    files: { [NEW_IMAGE_PATH]: 'image' },
  });
  expect(h.review.open('P1').ok).toBe(true);
  act(() => h.review.select({ level: 'proposal', id: null }));
  renderInEditor(h, <ReviewDetails />);
  return h;
}

describe('revision line in the proposal header', () => {
  it('states the date and only the counts greater than zero', async () => {
    await showProposal();
    const date = formatFullDate(REVISED_AT, 'en-US');
    expect(
      screen.getByText(`Revised by the agent on ${date}: 1 replaced, 1 new`),
    ).toBeTruthy();
    expect(screen.queryByText(/withdrawn/)).toBeNull();
  });

  it('proposal without a revision does not show the line', async () => {
    await showProposal(richScenario().proposal);
    expect(screen.queryByText(/^Revised by the agent/)).toBeNull();
  });
});

describe('revisionParts', () => {
  it('omits the zero parts and says "no changes" when all are zero', () => {
    expect(revisionParts({ changed: 0, added: 0, dropped: 2 })).toBe('2 withdrawn');
    expect(revisionParts({ changed: 3, added: 0, dropped: 1 })).toBe(
      '3 replaced, 1 withdrawn',
    );
    expect(revisionParts({ changed: 0, added: 0, dropped: 0 })).toBe('no changes');
  });
});
