import { cleanup, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locale } from '../../../src/store/settings';
import { ReviewLevels } from '../../../src/ui/review/ReviewLevels';
import { NEW_IMAGE_PATH, richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// Review shortcuts footer: in a narrow window (up to BREAKPOINTS.compact) shows only
// Accept, Reject and Next pending; above that, all six.

/** `matchMedia` that matches `max-width` queries only when `narrow` is true. */
function stubMatchMedia(narrow: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: /max-width/.test(query) ? narrow : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderLevels() {
  const { proposal } = richScenario();
  const h = await openReviewHarness({
    proposals: [proposal],
    files: { [NEW_IMAGE_PATH]: 'image' },
  });
  expect(h.review.open('P1').ok).toBe(true);
  renderInEditor(h, <ReviewLevels />);
  return screen.getByLabelText('Review shortcuts');
}

describe('review shortcuts footer', () => {
  it('in a narrow window shows only the three main shortcuts', async () => {
    stubMatchMedia(true);
    const footer = await renderLevels();
    expect(footer.querySelectorAll('span')).toHaveLength(3);
    expect(footer.className).toContain('review-footer-compact');
  });

  it('in a wide window shows all six shortcuts', async () => {
    stubMatchMedia(false);
    const footer = await renderLevels();
    expect(footer.querySelectorAll('span')).toHaveLength(6);
    expect(footer.className).not.toContain('review-footer-compact');
  });
});
