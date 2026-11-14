export type InstallPlatform = 'ios' | 'android' | 'other';

/** iPadOS 13+ presents itself as "Macintosh", but has a touch screen. */
export function detectPlatform(
  userAgent: string,
  maxTouchPoints: number,
): InstallPlatform {
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  return 'other';
}

/** The app is open as an installed PWA (without the browser bar). */
export function isStandalone(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    return (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

/**
 * The browser runs on macOS (Ctrl+click there is the right click). Pure: it receives the strings.
 */
export function isApplePlatform(userAgent: string, platform: string): boolean {
  return /^Mac/i.test(platform) || /Macintosh/.test(userAgent);
}

/**
 * Reads the browser's platform on the spot (no cache: the test and the app swap the `navigator`).
 */
export function onApplePlatform(): boolean {
  return isApplePlatform(
    globalThis.navigator?.userAgent ?? '',
    globalThis.navigator?.platform ?? '',
  );
}

/**
 * The click belongs to multi-selection: Shift, Cmd (`metaKey`) or, outside macOS, Ctrl. On macOS
 * Ctrl+click is the right click (context menu) and does not add.
 */
export function isMultiSelectClick(
  e: Pick<MouseEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>,
  apple: boolean = onApplePlatform(),
): boolean {
  return e.shiftKey || e.metaKey || (e.ctrlKey && !apple);
}
