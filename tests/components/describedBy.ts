/**
 * Accessible description of an element: the text of the `aria-describedby` elements
 * (including the offscreen ones). No jest-dom dependency.
 */
export function descriptionOf(el: HTMLElement): string {
  const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  return ids
    .map((id) => el.ownerDocument.getElementById(id)?.textContent?.trim() ?? '')
    .filter(Boolean)
    .join(' ');
}
