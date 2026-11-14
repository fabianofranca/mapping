// Save on leaving the page (phase 8.4: moved out of the controller, no behavior change).
import type { ProjectSession } from '../store/session';

let bound = false;

/**
 * Saves on leaving the page and warns before closing with unsaved changes. Saving is
 * asynchronous and can die with the tab, so it starts already on `visibilitychange: hidden` and
 * on `pagehide` (iOS Safari does not fire `beforeunload`), without waiting for the debounce.
 * `flush()` joins the session queue (behind a check or write in progress) and never rejects.
 * `currentSession`: the session of the project open right now, read on every event. Call once.
 */
export function bindPageLifecycle(
  currentSession: () => ProjectSession | undefined,
): void {
  if (bound) return;
  bound = true;
  const flushNow = () => void currentSession()?.flush();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
  });
  window.addEventListener('pagehide', flushNow);
  window.addEventListener('beforeunload', (event) => {
    const status = currentSession()?.saveStatus.value;
    if (status && status !== 'saved') {
      // `flushNow()` only schedules the write: the confirmation dialog is modal and pauses the
      // page, so the (asynchronous) write only moves if the person chooses to stay. The
      // protection is that choice; confirming the exit loses what was not saved yet.
      flushNow();
      event.preventDefault();
    }
  });
}
