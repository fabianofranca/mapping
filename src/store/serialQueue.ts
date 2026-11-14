// Shared pieces of the proposal and thread sweeps (stage #940, decision 17).

/** Single queue: writes and checks never run in parallel; a failure does not block the queue. */
export function createSerialQueue(): <T>(job: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(job: () => Promise<T>): Promise<T> => {
    const run = tail.then(job, job);
    tail = run.catch(() => undefined);
    return run;
  };
}

/** The file stamp (`stat`), or `null` if the storage does not know it or the read failed. */
export async function stampOr(
  read: (() => Promise<string | null>) | null,
): Promise<string | null> {
  if (read === null) return null;
  try {
    return await read();
  } catch {
    return null;
  }
}

/** Newest first; ties broken by id. */
export function newestFirst(
  a: { readonly createdAt: string; readonly id: string },
  b: { readonly createdAt: string; readonly id: string },
): number {
  return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
}
