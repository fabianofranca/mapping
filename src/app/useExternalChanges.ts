import { effect } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { t } from '../i18n';
import { resolveShownSelection } from '../store/shownSelection';
import { showToast } from '../store/ui';
import { useEditor } from '../ui/EditorContext';
import { reportError } from '../utils/report';

/** Minimum interval between `mapping.json` checks (only with the window visible). */
export const EXTERNAL_POLL_MS = 3000;
/** Maximum interval: on a slow folder (Android, cloud) the check spreads out up to this. */
export const EXTERNAL_POLL_MAX_MS = 30_000;
/** The next cycle starts `EXTERNAL_POLL_FACTOR` × the last one's duration after it ended. */
export const EXTERNAL_POLL_FACTOR = 4;

/**
 * How long to wait after a cycle of `durationMs`: `clamp(4 × duration, minimum, 30 s)`. On a
 * fast folder the cycle lasts well under 750 ms and the interval stays at the minimum (3 s); on a
 * slow one,
 * the folder is never busy all the time (at most ~1/5 of the time checking).
 */
export function nextPollDelay(durationMs: number, minMs = EXTERNAL_POLL_MS): number {
  const wanted = EXTERNAL_POLL_FACTOR * durationMs;
  return Math.min(Math.max(wanted, minMs), Math.max(EXTERNAL_POLL_MAX_MS, minMs));
}

/**
 * Notices changes made from outside (the MCP server, a text editor, git) in folder
 * projects: checks `mapping.json` while the window is visible and, when focus returns, also checks
 * the image files and the final proposals. The cycle is a chained `setTimeout`: the
 * next one starts `nextPollDelay(duration of the last)` after the last one ended (3 s on a fast
 * folder, up to 30 s on a slow one), and with work in progress (`session.busy()`: save, gesture,
 * proposal decision or application) it is postponed to the next minimum interval. With no pending
 * local changes the project is reloaded on its own, with a discreet notice; with the save in error, the
 * session opens the "Project changed outside the app" dialog (`session.conflict`), without
 * reloading. Calls
 * to `session.sync` join the session queue and concurrent ones are merged (a `focus`
 * during the cycle does not lose the image check), so this hook does not control
 * concurrency. Selection, visible layers and viewport stay as they are (they are UI state); the
 * selection is only cleared if the item no longer exists.
 */
export function useExternalChanges(interval = EXTERNAL_POLL_MS): void {
  const { session, review, ui } = useEditor();

  useEffect(() => {
    if (!session.watchable) return;
    const visible = () => document.visibilityState === 'visible';
    const check = (images: boolean): Promise<void> =>
      session.sync({ images }).then(
        (result) => {
          if (result === 'reloaded') showToast(ui, t('editor.externalUpdated'));
        },
        (e: unknown) => reportError('session.sync', e),
      );
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cycle = async () => {
      let delay = interval;
      if (visible() && !session.busy()) {
        const started = performance.now();
        await check(false);
        delay = nextPollDelay(performance.now() - started, interval);
      }
      if (!stopped) timer = setTimeout(() => void cycle(), delay);
    };
    timer = setTimeout(() => void cycle(), interval);
    const onFocus = () => {
      if (visible()) void check(true);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [session, ui, interval]);

  // After reloading (on its own or through the dialog), a selection that vanished from the file is
  // cleared.
  // By the project in view: in the review's Proposed view, an item that only exists in the preview
  // stays selected (phase 8.2, P1), and so does one from a rejected creation.
  useEffect(
    () =>
      effect(() => {
        void session.reloads.value;
        if (!resolveShownSelection(review, ui.selection.peek(), true)) {
          ui.selection.value = null;
        }
      }),
    [session, review, ui],
  );
}
