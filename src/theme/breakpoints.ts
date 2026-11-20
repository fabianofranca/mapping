/**
 * Layout breakpoints, in px. Media and container queries do not accept `var()`, so the CSS
 * repeats these numbers (`BREAKPOINTS` for `@media`, `CONTAINER_BREAKPOINTS` for `@container`);
 * `tests/theme/tokenLiterals.test.ts` checks that the two match.
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

/**
 * Container query thresholds, in px (the `max-width` of the rule; a `min-width` rule uses the
 * threshold plus 1). Each one is measured on the container the rule names, not on the viewport.
 */
export const CONTAINER_BREAKPOINTS = {
  /** Properties pair (`@container props-pair`, `details.css`): the width of the pair's own row. */
  propsPair: 170,
  /**
   * Bottom window (`@container bottom-window` and the unnamed rules of `editor.css` and
   * `panels.css`): below it the tabs and the toolbars go icon-only; the width is the window's.
   */
  bottomWindow: 470,
  /** Comments window (`@container comments-window`, `panels.css`): the dialog's own width. */
  commentsWindow: 640,
  /** Editor container (unnamed `@container` of `editor.css`): the width of the editor area. */
  editor: 1100,
} as const;
