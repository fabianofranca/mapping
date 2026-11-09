// Peças comuns das varreduras de propostas e conversas (etapa #940, decisão 17).

/** Fila única: gravações e conferências nunca rodam em paralelo; uma falha não trava a fila. */
export function createSerialQueue(): <T>(job: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(job: () => Promise<T>): Promise<T> => {
    const run = tail.then(job, job);
    tail = run.catch(() => undefined);
    return run;
  };
}

/** A marca do arquivo (`stat`), ou `null` se o armazenamento não sabe ou a leitura falhou. */
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

/** Mais recente primeiro; empate pelo id. */
export function newestFirst(
  a: { readonly createdAt: string; readonly id: string },
  b: { readonly createdAt: string; readonly id: string },
): number {
  return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
}
