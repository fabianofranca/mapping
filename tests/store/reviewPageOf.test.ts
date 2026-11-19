// `reviewPageOf` (stage #883, CL1, pending defect PG4-a): the page of a review item that the
// proposal creates or moves, in the Current and in the Proposed views.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addContainer,
  createMarking,
  moveRootsToPage,
  setMarkingRect,
  type Project,
  type ReviewTarget,
} from '../../src/model';
import { locale } from '../../src/store/settings';
import { reviewPageOf } from '../../src/ui/review/canvasSelection';
import { propose } from '../model/proposalFixtures';
import { pagesProject, rectOf } from './pageHarness';
import { openHarness } from './proposalHarness';

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(() => localStorage.clear());

const item = (id: string): ReviewTarget => ({ level: 'item', id });

async function reviewOf(base: Project, after: Project) {
  const h = await openHarness({ project: base, proposals: [propose(base, after)] });
  expect(h.review.open('P1').ok).toBe(true);
  return h.review;
}

/** PG2 gets a new canvas marking `N` and a new container `I9` with the marking `N2` inside. */
function creating() {
  const base = pagesProject();
  let after = createMarking(base, {
    id: 'N',
    containerId: null,
    rect: rectOf(5000, 6000, 100, 100),
    pageId: 'PG2',
  });
  after = addContainer(after, {
    id: 'I9',
    file: 'images/new.png',
    width: 500,
    height: 500,
    pageId: 'PG2',
  });
  after = createMarking(after, {
    id: 'N2',
    containerId: 'I9',
    rect: rectOf(0, 0, 50, 50),
  });
  return { base, after };
}

describe('reviewPageOf: items the proposal creates', () => {
  it('Current view: a created canvas marking is on the page its creation carries', async () => {
    const { base, after } = creating();
    const review = await reviewOf(base, after);
    review.setView('current');
    expect(reviewPageOf(review, item('N'), 'N')).toBe('PG2');
  });

  it('Current view: a marking inside a created container is on the container page', async () => {
    const { base, after } = creating();
    const review = await reviewOf(base, after);
    review.setView('current');
    expect(reviewPageOf(review, item('N2'), 'N2')).toBe('PG2');
  });

  it('Proposed view: both are found on their page', async () => {
    const { base, after } = creating();
    const review = await reviewOf(base, after);
    review.setView('proposed');
    expect(reviewPageOf(review, item('N'), 'N')).toBe('PG2');
    expect(reviewPageOf(review, item('N2'), 'N2')).toBe('PG2');
  });
});

describe('reviewPageOf: items the proposal moves', () => {
  it('a root moved to another page is on its origin in Current and on its destination in Proposed', async () => {
    const base = pagesProject();
    const after = moveRootsToPage(base, ['I2'], 'PG2');
    const review = await reviewOf(base, after);
    review.setView('current');
    expect(reviewPageOf(review, item('I2'), 'I2')).toBe('PG1');
    review.setView('proposed');
    expect(reviewPageOf(review, item('I2'), 'I2')).toBe('PG2');
  });

  it('a marking changed with its page unchanged answers its own page', async () => {
    const base = pagesProject();
    const after = setMarkingRect(base, 'M5', rectOf(5, 5, 100, 100));
    const review = await reviewOf(base, after);
    review.setView('current');
    expect(reviewPageOf(review, item('M5'), 'M5')).toBe('PG2');
  });
});
