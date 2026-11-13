/**
 * Como `Promise.all(items.map(fn))`, mas com no máximo `limit` tarefas ao mesmo tempo e o
 * resultado na ordem dos itens. Ao primeiro erro nenhuma tarefa nova começa; as em curso
 * terminam e só então a promessa rejeita, com esse primeiro erro. Sem dependência de DOM.
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
