/**
 * Address of the interactive guide (`public/guide/index.html`, published at `guide/` next to the
 * `index.html`). Relative to the page: valid at the site root, in `/preview/` and in `vite dev`.
 * Opened as a file (`file:`), the `index.html` is usually alone, without the `guide/` folder (it is
 * the standalone artifact of the deploy): with no address, the UI does not offer a broken link.
 */
export const GUIDE_PATH = 'guide/index.html';

export function guideUrl(
  protocol: string = globalThis.location?.protocol ?? '',
): string | null {
  return protocol === 'file:' ? null : GUIDE_PATH;
}
