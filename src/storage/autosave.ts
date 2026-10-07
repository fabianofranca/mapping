import { signal, type ReadonlySignal } from '@preact/signals';
import { reportError } from '../utils/report';

/** Debounce entre a última alteração e a gravação. */
export const AUTOSAVE_DELAY_MS = 800;

/** `saving` cobre tanto a espera do debounce quanto a gravação em andamento. */
export type SaveStatus = 'saved' | 'saving' | 'error';

export interface AutoSaver {
  readonly status: ReadonlySignal<SaveStatus>;
  /** Avisa que houve alteração: grava depois do debounce. */
  schedule(): void;
  /** Grava agora o que estiver pendente (ou tenta de novo após um erro). */
  flush(): Promise<void>;
  /** Descarta o que estiver pendente (recarregar o projeto do disco) e volta a `saved`. */
  reset(): void;
  dispose(): void;
}

/**
 * Salvamento automático com debounce. As gravações nunca rodam em paralelo;
 * uma alteração feita durante a gravação agenda outra. Após um erro, a próxima
 * alteração (ou `flush`) tenta de novo.
 */
export function createAutoSaver(
  save: () => Promise<void>,
  delay: number = AUTOSAVE_DELAY_MS,
): AutoSaver {
  const status = signal<SaveStatus>('saved');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  let queue: Promise<void> = Promise.resolve();
  let disposed = false;

  const clearTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  const flush = (): Promise<void> => {
    clearTimer();
    queue = queue.then(async () => {
      if (!dirty) return;
      dirty = false;
      try {
        await save();
        if (!dirty && timer === undefined) status.value = 'saved';
      } catch (e) {
        reportError('save', e);
        dirty = true;
        status.value = 'error';
      }
    });
    return queue;
  };

  return {
    status,
    schedule() {
      if (disposed) return;
      dirty = true;
      status.value = 'saving';
      clearTimer();
      timer = setTimeout(() => void flush(), delay);
    },
    flush() {
      if (dirty && status.value === 'error') status.value = 'saving';
      return flush();
    },
    reset() {
      clearTimer();
      dirty = false;
      status.value = 'saved';
    },
    dispose() {
      disposed = true;
      clearTimer();
    },
  };
}
