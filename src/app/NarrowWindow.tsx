import { t } from '../i18n';
import { BREAKPOINTS, NARROW_QUERY } from '../theme/breakpoints';
import { useMediaQuery } from '../ui/useMediaQuery';

/** `true` while the window is below the app's minimum width or height (desktop only). */
export function useNarrowWindow(): boolean {
  return useMediaQuery(NARROW_QUERY);
}

/**
 * Notice in place of the screen when the window gets too narrow. Whoever shows it only hides
 * the rest (`hidden`), without unmounting: the project stays open and saving, and when the
 * window widens everything comes back as it was.
 */
export function NarrowWindowNotice() {
  return (
    <div class="narrow-window" role="status">
      <h1 class="narrow-window-title">{t('narrow.title')}</h1>
      <p class="muted">
        {t('narrow.body', {
          width: BREAKPOINTS.appMin,
          height: BREAKPOINTS.appMinHeight,
        })}
      </p>
    </div>
  );
}
