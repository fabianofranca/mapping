// Rastreia as promessas em voo de um módulo da store, para os testes esperarem `whenIdle`.

export interface PendingTracker {
  /** Registra a promessa até ela terminar (com sucesso ou não) e a devolve. */
  track<T>(promise: Promise<T>): Promise<T>;
  /** Resolve quando nada está pedido (inclusive o que entrou enquanto esperava). */
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
