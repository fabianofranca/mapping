import { signal, type ReadonlySignal } from '@preact/signals';
import { reportError } from '../utils/report';

/**
 * Debounce between the last change and the write. Edits write once per action (text fields,
 * including the key and value of free annotations, on confirming with Enter or on leaving
 * the field; gestures; panels): the debounce groups actions in sequence, like moving with the
 * arrows. Short to shrink the window in which an edit exists only in memory (closing the tab).
 * Expensive operations (images, specializations) and leaving the page write at once with `flush()`.
 */
export const AUTOSAVE_DELAY_MS = 250;

/**
 * `saving` covers the debounce wait, the wait in the queue and the write in progress: while
 * a write is running the status is always `saving`, even if the previous one failed.
 */
export type SaveStatus = 'saved' | 'saving' | 'error';

/**
 * What `flush` achieved: `ok` if nothing was left pending (it wrote, or there was nothing to
 * write). Never rejects: whoever does not need to know (the timer, closing the tab) ignores the return.
 */
export type FlushResult =
  { readonly ok: true } | { readonly ok: false; readonly error: unknown };

export interface AutoSaver {
  readonly status: ReadonlySignal<SaveStatus>;
  /** Reports that there was a change: writes after the debounce. */
  schedule(): void;
  /** Queues the write of the pending change now (or the retry after an error) and says whether it wrote. */
  flush(): Promise<FlushResult>;
  /**
   * Queues a job that cannot cross with a write (checking the file,
   * reloading the project, deciding the conflict). The job runs when the write or the
   * previous job finishes, and the next write waits for it. A job **never**
   * calls `flush()` or `enqueue()`: the wait would be behind itself.
   */
  enqueue<T>(job: () => Promise<T>): Promise<T>;
  /**
   * Discards whatever is pending (the project was reloaded from disk): cancels the debounce
   * and the queued write not yet started; a write in progress finishes without touching the
   * state. Returns to `saved` (or as soon as the write in progress finishes).
   */
  reset(): void;
  dispose(): void;
}

/**
 * Autosave with debounce and **a single queue**: writes and the `enqueue` jobs
 * never run in parallel; a change made during the write schedules another.
 * After an error, the next change (or `flush`) tries again.
 *
 * Invariants (test in `tests/storage/autosave.test.ts`): `status === 'saved'` ⇒ no write
 * in progress, nothing pending and no timer; write in progress ⇒ `status === 'saving'`;
 * `status === 'error'` ⇒ no write in progress.
 */
export function createAutoSaver(
  save: () => Promise<void>,
  delay: number = AUTOSAVE_DELAY_MS,
): AutoSaver {
  const status = signal<SaveStatus>('saved');
  let timer: ReturnType<typeof setTimeout> | undefined;
  // There was a change since the last successful write.
  let dirty = false;
  // `save()` running now.
  let inFlight = false;
  // Rises on every `reset()`: the write in progress at that moment no longer touches the state.
  let generation = 0;
  let disposed = false;
  // The queue: each job starts when the previous one ends (well or badly).
  let tail: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const run = tail.then(job, job);
    tail = run.catch(() => undefined);
    return run;
  };

  const clearTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  /** The write job: writes everything that is pending at this instant. */
  const write = async (): Promise<FlushResult> => {
    if (!dirty) {
      // Nothing to write (the pending change was written or discarded before this job started).
      if (status.value !== 'error') status.value = 'saved';
      return { ok: true };
    }
    const started = generation;
    clearTimer();
    status.value = 'saving';
    dirty = false;
    inFlight = true;
    try {
      await save();
    } catch (e) {
      inFlight = false;
      reportError('save', e);
      if (started === generation) {
        dirty = true;
        status.value = 'error';
      } else {
        // The pending change was discarded by a `reset()` in the middle: its failure does not count.
        status.value = dirty ? 'saving' : 'saved';
      }
      return { ok: false, error: e };
    }
    inFlight = false;
    if (started !== generation) status.value = dirty ? 'saving' : 'saved';
    else if (!dirty && timer === undefined) status.value = 'saved';
    return { ok: true };
  };

  return {
    status,
    schedule() {
      if (disposed) return;
      dirty = true;
      status.value = 'saving';
      clearTimer();
      timer = setTimeout(() => void this.flush(), delay);
    },
    flush() {
      clearTimer();
      if (dirty) status.value = 'saving';
      return enqueue(write);
    },
    enqueue,
    reset() {
      clearTimer();
      dirty = false;
      generation++;
      if (!inFlight) status.value = 'saved';
    },
    dispose() {
      disposed = true;
      clearTimer();
    },
  };
}
