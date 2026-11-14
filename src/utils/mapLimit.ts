/**
 * Like `Promise.all(items.map(fn))`, but with at most `limit` tasks at a time and the
 * result in the order of the items. After the first error no new task starts; the ones in
 * progress finish and only then does the promise reject, with that first error. No DOM
 * dependency.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  let firstError: unknown;
  const worker = async (): Promise<void> => {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index] as T, index);
      } catch (e) {
        if (!failed) {
          failed = true;
          firstError = e;
        }
      }
    }
  };
  const workers = Math.max(1, Math.min(Math.floor(limit), items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  if (failed) throw firstError;
  return results;
}
