import { act, cleanup } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useReviewSync } from '../../../src/app/useReviewSync';
import { createArrow, renameMarking, setArrowName } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { propose } from '../../model/proposalFixtures';
import { pagesProject } from '../../store/pageHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// The review across pages (stage #883, PG2, decisions 12 and 16): choosing a level of the review
// whose item is on another page opens that page (the review keeps the Completa locked) and
// selects the item there.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

function Wired() {
  useReviewSync();
  return null;
}

async function openReview() {
  const base = createArrow(pagesProject(), { id: 'R1', from: 'M5', to: 'K' });
  let after = renameMarking(base, 'M5', 'Renamed on page 2');
  after = renameMarking(after, 'M1', 'Renamed on page 1');
  after = setArrowName(after, 'R1', 'Flow');
  const h = await openReviewHarness({
    project: base,
    proposals: [propose(base, after, { id: 'P1' })],
  });
  expect(h.review.open('P1').ok).toBe(true);
  renderInEditor(h, <Wired />);
  return h;
}

describe('review: items on other pages', () => {
  it('choosing an item of another page opens that page and selects the item', async () => {
    const h = await openReview();
    const { page } = h.session;
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    expect(page.id.value).toBe('PG1');
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });

    act(() => h.review.select({ level: 'item', id: 'M5' }));
    expect(page.id.value).toBe('PG2');
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M5' });
  });

  it('an arrow of another page is selected as an arrow', async () => {
    const h = await openReview();
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    act(() => h.review.select({ level: 'item', id: 'R1' }));
    expect(h.session.page.id.value).toBe('PG2');
    expect(h.ui.selection.value).toEqual({ kind: 'arrow', id: 'R1' });
  });

  it('a change of another page selects its item on its page; the Completa stays locked', async () => {
    const h = await openReview();
    const change = h.review.derived.proposal.value?.changes.find(
      (c) => c.entity === 'marking' && c.entityId === 'M5',
    );
    if (!change) throw new Error('no change on M5');
    act(() => h.review.select({ level: 'change', id: change.id }));
    expect(h.session.page.id.value).toBe('PG2');
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M5' });
    expect(h.session.perspective.locked.value).toBe(true);
    expect(h.session.perspective.id.value).toBeNull();
  });

  it('an item on the open page does not switch', async () => {
    const h = await openReview();
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    expect(h.session.page.id.value).toBe('PG1');
  });
});
