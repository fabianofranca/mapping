/**
 * Fixed menus and popovers close on scroll, but the click that opens them may scroll the list (or the
 * page) to the row, and that scroll event arrives together with the opening, or over
 * several frames if the scroll is smooth (stage #515, FN2). The guard ignores scrolling during
 * a short window of time after opening (independent of frame order) and that of
 * containers that do not contain the anchor; scrolling later, by the person, still closes.
 */
export const OPEN_SCROLL_GRACE_MS = 300;

export function createOpenScrollGuard(
  anchor: () => Element | null | undefined,
): (e: Event) => boolean {
  const openedAt = performance.now();
  return (e) => {
    if (performance.now() - openedAt < OPEN_SCROLL_GRACE_MS) return false;
    const target = e.target;
    const el = anchor();
    return !(target instanceof Node && el && !target.contains(el));
  };
}
