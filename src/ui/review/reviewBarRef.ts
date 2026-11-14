import type { PlaceLimit } from '../Popover';

// The review bar (`ReviewBar`) registers itself here, so the changes popover knows how far
// up it can go (stage #676, decision 5): it does not cover the bar. No global DOM query.

export const reviewBarRef: { current: HTMLElement | null } = { current: null };

/** The area below the review bar; `null` if the bar is not on screen. */
export function belowReviewBar(): PlaceLimit | null {
  const bar = reviewBarRef.current;
  return bar ? { top: bar.getBoundingClientRect().bottom } : null;
}
