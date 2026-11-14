// Focus on returning to the home screen after the library Catalog (stage #515, FN1; #497).
// The "Back" button disappears with the screen and the home screen is a new instance, so the
// request crosses the switch: `CatalogScreen` makes it, `Home` fulfills it in the commit where
// it mounts.

let pending = false;

/** Called by whoever closes the Catalog: the next home screen gets the focus. */
export function requestHomeFocus(): void {
  pending = true;
}

/** Focus target: the control that opened the library; if it does not exist, the first control. */
export const HOME_LIBRARY_BUTTON = '[data-home-open-library]';

/** The home screen, already mounted, fulfills the request (once). Returns whether there was one. */
export function fulfillHomeFocus(root: ParentNode, firstControl: string): boolean {
  if (!pending) return false;
  pending = false;
  const target =
    root.querySelector<HTMLElement>(`${HOME_LIBRARY_BUTTON}:not([disabled])`) ??
    root.querySelector<HTMLElement>(firstControl);
  target?.focus();
  return true;
}
