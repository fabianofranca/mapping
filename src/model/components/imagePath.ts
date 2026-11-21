// Image files of the library package (a component's `image` node can cite one in `src`):
// the extensions and the path rule. Pure text checks, no DOM and no Node APIs; apart from
// `library.ts` so that `parseComponent.ts` can use it without an import cycle.

/** Extensions of the image files of the package (any case). */
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const;

/** Does the path end in an image extension (any case)? The extension only, like `isFontPath`. */
export function isImagePath(path: string): boolean {
  const lower = path.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** A scheme (`https:`, `file:`) or a drive letter (`C:`) at the start. */
const SCHEME_OR_DRIVE = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/**
 * Is the text a package image path? Relative to the package root, with `/`: no leading `/`, no
 * `\`, no empty, `.` or `..` segment, no scheme or drive letter, and an image extension (any
 * case). The text is taken as written, so one with leading or trailing whitespace is not a path
 * (the engine trims a field's value before asking; a literal in the component is not trimmed).
 */
export function isPackageImagePath(text: string): boolean {
  if (text === '' || text !== text.trim() || text.startsWith('/') || text.includes('\\'))
    return false;
  if (SCHEME_OR_DRIVE.test(text)) return false;
  if (text.split('/').some((part) => part === '' || part === '.' || part === '..'))
    return false;
  return isImagePath(text);
}
