/**
 * Layout breakpoints, in px. Media queries do not accept `var()`, so the CSS repeats
 * these numbers; `tests/theme/tokenLiterals.test.ts` checks that the two match.
 */
export const BREAKPOINTS = {
  /** Smallest app width (desktop only): below it, the "Open in a larger window" notice. */
  appMin: 900,
  /**
   * Smallest app height (desktop only): 720 px, a laptop's short window. The review adapts to it
   * (filters collapsed into a popover, marks legend over the Proposals and the minimap; #598).
   */
  appMinHeight: 720,
  /** Largest "compact" desktop width (toolbar buttons with icon only). */
  compact: 1199,
  /** Reference width of the desktop mockups. */
  design: 1440,
} as const;

/** Window below the app's minimum width or height. */
export const NARROW_QUERY = `(max-width: ${BREAKPOINTS.appMin - 1}px), (max-height: ${BREAKPOINTS.appMinHeight - 1}px)`;
