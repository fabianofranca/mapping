// Tracks the in-flight promises of a store module, so the tests can wait on `whenIdle`.

export interface PendingTracker {
  /** Registers the promise until it finishes (successfully or not) and returns it. */
  track<T>(promise: Promise<T>): Promise<T>;
  /** Resolves when nothing is pending (including what came in while waiting). */
  whenIdle(): Promise<void>;
}

export function createPendingTracker(): PendingTracker {
  const pending = new Set<Promise<unknown>>();
  return {
    track<T>(promise: Promise<T>): Promise<T> {
      pending.add(promise);
      const done = () => void pending.delete(promise);
      promise.then(done, done);
      return promise;
    },
    async whenIdle() {
      while (pending.size > 0) await Promise.allSettled([...pending]);
    },
  };
}
