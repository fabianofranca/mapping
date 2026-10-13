import { signal, type ReadonlySignal } from '@preact/signals';
import { reportError } from '../utils/report';

/**
 * Debounce entre a última alteração e a gravação. As edições gravam uma vez por ação (campos
 * de texto, inclusive a chave e o valor das anotações livres, ao confirmar com Enter ou ao
 * sair do campo; gestos; painéis): o debounce agrupa ações em sequência, como mover com as
 * setas. Curto para encolher a janela em que uma edição só existe em memória (fechar a aba).
 * Operações caras (imagens, especializações) e sair da página gravam na hora com `flush()`.
 */
export const AUTOSAVE_DELAY_MS = 250;

/**
 * `saving` cobre a espera do debounce, a espera na fila e a gravação em andamento: enquanto
 * há uma gravação rodando o status é sempre `saving`, mesmo que a anterior tenha falhado.
 */
export type SaveStatus = 'saved' | 'saving' | 'error';

/**
 * O que `flush` conseguiu: `ok` se não ficou nada pendente (gravou, ou não havia o que
 * gravar). Nunca rejeita: quem não precisa saber (o timer, fechar a aba) ignora o retorno.
 */
export type FlushResult =
  { readonly ok: true } | { readonly ok: false; readonly error: unknown };

export interface AutoSaver {
  readonly status: ReadonlySignal<SaveStatus>;
  /** Avisa que houve alteração: grava depois do debounce. */
  schedule(): void;
  /** Enfileira a gravação do pendente agora (ou a nova tentativa após um erro) e diz se gravou. */
  flush(): Promise<FlushResult>;
  /**
   * Enfileira um trabalho que não pode cruzar com uma gravação (conferir o arquivo,
   * recarregar o projeto, decidir o conflito). O trabalho roda quando a gravação ou o
   * trabalho anterior terminar, e a gravação seguinte espera por ele. Um trabalho **nunca**
   * chama `flush()` nem `enqueue()`: a espera ficaria atrás dele mesmo.
   */
  enqueue<T>(job: () => Promise<T>): Promise<T>;
  /**
   * Descarta o que estiver pendente (o projeto foi recarregado do disco): cancela o debounce
   * e a gravação enfileirada ainda não iniciada; uma gravação em curso termina sem mexer no
   * estado. Volta a `saved` (ou assim que a gravação em curso terminar).
   */
  reset(): void;
  dispose(): void;
}

/**
 * Salvamento automático com debounce e **uma fila só**: gravações e os trabalhos de
 * `enqueue` nunca rodam em paralelo; uma alteração feita durante a gravação agenda outra.
 * Após um erro, a próxima alteração (ou `flush`) tenta de novo.
 *
 * Invariantes (teste em `tests/storage/autosave.test.ts`): `status === 'saved'` ⇒ nenhuma
 * gravação em curso, nada pendente e nenhum timer; gravação em curso ⇒ `status === 'saving'`;
 * `status === 'error'` ⇒ nenhuma gravação em curso.
 */
export function createAutoSaver(
  save: () => Promise<void>,
  delay: number = AUTOSAVE_DELAY_MS,
): AutoSaver {
  const status = signal<SaveStatus>('saved');
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Houve alteração desde a última gravação bem-sucedida.
  let dirty = false;
  // `save()` rodando agora.
  let inFlight = false;
  // Sobe a cada `reset()`: a gravação em curso naquele momento não mexe mais no estado.
  let generation = 0;
  let disposed = false;
  // A fila: cada trabalho começa quando o anterior termina (bem ou mal).
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

  /** O trabalho de gravação: grava tudo que está pendente neste instante. */
  const write = async (): Promise<FlushResult> => {
    if (!dirty) {
      // Nada a gravar (o pendente foi gravado ou descartado antes de este trabalho começar).
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
        // O pendente foi descartado por um `reset()` no meio: a falha dele não conta.
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
