import { signal, type ReadonlySignal } from '@preact/signals';
import { createSerialQueue, newestFirst, stampOr } from './serialQueue';
import {
  ThreadError,
  mergeThreadCopies,
  serializeThread,
  threadFilePath,
  threadLocation,
  type Thread,
} from '../model';
import {
  NO_THREADS,
  loadThreads,
  parseThreadFile,
  readThread,
  reportThreadProblem,
  type LoadedThread,
  type LoadedThreads,
  type ThreadProblem,
} from '../storage/loadThreads';
import type { ProjectStorage } from '../storage/types';
import { reportError } from '../utils/report';

// As conversas ancoradas do projeto aberto (etapa Comentários): a lista em memória, a leitura da
// pasta e a gravação. Quem grava `comments/<id>.json` e `comments/resolved/<id>.json` é só este
// módulo, dentro da sessão (`session.threads`); a interface nunca escreve no armazenamento.
// Nada disso toca o `mapping.json` nem o histórico de desfazer (decisão 1).
//
// Conferência do arquivo, como a das propostas: toda gravação relê o arquivo (as duas pastas)
// antes e, se ele difere do que a sessão leu ou gravou por último (o servidor MCP acrescentou
// uma mensagem, um editor mexeu nele), adota a versão do disco e REFAZ a operação sobre ela, em
// vez de sobrescrevê-la. As operações são funções puras da conversa (acrescentar, resolver,
// reabrir) e cada uma devolve `revision + 1`, então refazer é seguro e nada de fora se perde. Um
// arquivo que ficou ilegível nunca é sobrescrito. O campo `resolved` é a verdade; a pasta é só o
// índice: a gravação deixa o arquivo na pasta certa e só então apaga a outra cópia.

export type ThreadStoreError =
  /** Não há conversa com esse id. */
  | 'unknown-thread'
  /** O arquivo sumiu por fora. */
  | 'gone'
  /** O arquivo mudou por fora e ficou ilegível: não se sobrescreve o que não se leu. */
  | 'unreadable'
  /** Já existe uma conversa com esse id (`create`). */
  | 'exists'
  /** A mensagem repetiria o id de uma que já está na conversa. */
  | 'duplicate-message'
  /** A conversa que a operação devolveu não passa na validação do formato. */
  | 'invalid'
  | 'write-failed';

export type ThreadOutcome =
  | { readonly ok: true; readonly thread: Thread }
  | { readonly ok: false; readonly error: ThreadStoreError };

/** O que a conferência da pasta `comments/` encontrou (ids). */
export interface ThreadScan {
  readonly added: readonly string[];
  readonly changed: readonly string[];
  readonly removed: readonly string[];
}

interface MutableScan {
  readonly added: string[];
  readonly changed: string[];
  readonly removed: string[];
}

export interface RemoveManyResult {
  readonly removed: readonly string[];
  readonly failed: readonly string[];
}

/** O que a sessão sabe de cada arquivo da conversa: o aberto e o resolvido. */
interface Copies {
  readonly open: LoadedThread | null;
  readonly resolved: LoadedThread | null;
}

export interface ThreadStore {
  /** Conversas legíveis (abertas e resolvidas já lidas), a mais nova primeiro. */
  readonly list: ReadonlySignal<readonly Thread[]>;
  /** Arquivos de conversa que não puderam ser lidos (a conversa não aparece na lista). */
  readonly problems: ReadonlySignal<readonly ThreadProblem[]>;
  /** `comments/resolved/` já foi lida (na abertura ou por `loadResolved`). */
  readonly resolvedLoaded: ReadonlySignal<boolean>;
  get(id: string): Thread | null;
  /**
   * Muda uma conversa: relê os arquivos, adota a versão do disco se mudou por fora, aplica a
   * operação (pura, de `src/model/threadOps.ts`) e grava com `revision + 1` na pasta que o
   * campo `resolved` manda. As chamadas rodam em fila.
   */
  mutate(id: string, operation: (thread: Thread) => Thread): Promise<ThreadOutcome>;
  /** Grava uma conversa nova em `comments/`. Recusa um id que já existe (nunca sobrescreve). */
  create(thread: Thread): Promise<ThreadOutcome>;
  /** Apaga a conversa (as duas cópias) do armazenamento e da lista. */
  remove(id: string): Promise<{ readonly ok: true } | (ThreadOutcome & { ok: false })>;
  /** Apaga várias, uma por vez, na fila. */
  removeMany(ids: readonly string[]): Promise<RemoveManyResult>;
  /** Confere `comments/` (sem `resolved/`): conversas novas, alteradas e apagadas por fora. */
  scan(): Promise<ThreadScan>;
  /** Lê `comments/resolved/` (na abertura a sessão já a leu; sob pedido, de novo). */
  loadResolved(): Promise<void>;
  /** Espera as gravações em andamento (ao fechar o projeto). */
  settled(): Promise<void>;
  /**
   * Arquivos para exportar (caminho → texto): as conversas como estão no disco, as resolvidas
   * inclusive (lê `resolved/` se ainda não leu) e o texto exato dos arquivos inválidos.
   */
  collect(): Promise<Map<string, string>>;
}

export interface ThreadStoreOptions {
  readonly storage: ProjectStorage;
  readonly initial?: LoadedThreads;
  /**
   * `initial` já trouxe `comments/resolved/` (padrão `true`, o que `loadThreads` faz). `false`
   * quando a sessão abriu lendo só `comments/`.
   */
  readonly resolvedLoaded?: boolean;
  /** Depois de cada gravação ou remoção bem-sucedida (o indicador "Alterações não exportadas"). */
  readonly onChanged?: () => void;
}

const slot = (resolvedDir: boolean): 'open' | 'resolved' =>
  resolvedDir ? 'resolved' : 'open';

/** Roda a operação pura; os erros dela viram o código da loja. */
function runOperation(
  thread: Thread,
  operation: (thread: Thread) => Thread,
):
  | { readonly ok: true; readonly next: Thread }
  | { readonly ok: false; readonly error: ThreadStoreError } {
  try {
    return { ok: true, next: operation(thread) };
  } catch (e) {
    if (!(e instanceof ThreadError)) throw e;
    const duplicate = e.code === 'thread-message-duplicate';
    return { ok: false, error: duplicate ? 'duplicate-message' : 'invalid' };
  }
}

/** O arquivo existe mas não passou na validação. */
const unreadable = (raw: string | null, copy: LoadedThread | null): boolean =>
  raw !== null && copy === null;

/** A conversa das cópias lidas (a junção, se são duas). */
const mergedOf = (open: LoadedThread | null, resolved: LoadedThread | null): Thread =>
  mergeThreadCopies(open?.thread ?? null, resolved?.thread ?? null).thread;

/** A operação não mudou nada, mas havia duas cópias: a gravação que as une sobe a `revision`. */
const bumped = (thread: Thread): Thread => ({ ...thread, revision: thread.revision + 1 });

const problemKey = (p: { readonly id: string; readonly resolvedDir: boolean }): string =>
  threadFilePath(p.id, p.resolvedDir);

export function createThreadStore(options: ThreadStoreOptions): ThreadStore {
  const { storage } = options;
  const known = new Map<string, Copies>();
  const problemMap = new Map<
    string,
    { problem: ThreadProblem; stamp: string | null; text: string | null }
  >();
  const list = signal<readonly Thread[]>([]);
  const problems = signal<readonly ThreadProblem[]>([]);
  const resolvedLoaded = signal(options.resolvedLoaded ?? true);

  const viewOf = (copies: Copies): Thread | null => {
    if (copies.open === null && copies.resolved === null) return null;
    return mergeThreadCopies(copies.open?.thread ?? null, copies.resolved?.thread ?? null)
      .thread;
  };

  const publish = () => {
    const threads: Thread[] = [];
    for (const copies of known.values()) {
      const view = viewOf(copies);
      if (view) threads.push(view);
    }
    list.value = threads.sort(newestFirst);
    problems.value = [...problemMap.values()].map((p) => p.problem);
  };

  const setCopy = (item: LoadedThread) => {
    const id = item.thread.id;
    const copies = known.get(id) ?? { open: null, resolved: null };
    known.set(
      id,
      item.resolvedDir ? { ...copies, resolved: item } : { ...copies, open: item },
    );
    problemMap.delete(problemKey({ id, resolvedDir: item.resolvedDir }));
  };

  const clearCopy = (id: string, resolvedDir: boolean) => {
    const copies = known.get(id);
    if (!copies) return;
    const next = resolvedDir ? { ...copies, resolved: null } : { ...copies, open: null };
    if (next.open === null && next.resolved === null) known.delete(id);
    else known.set(id, next);
  };

  const recordProblem = (
    problem: ThreadProblem,
    stamp: string | null,
    text: string | null,
  ) => {
    const key = problemKey(problem);
    const previous = problemMap.get(key);
    problemMap.set(key, { problem, stamp, text });
    // Uma vez por arquivo: a conferência que o encontra de novo, igual, não repete o aviso.
    if (!previous || previous.text !== text) reportThreadProblem(problem);
  };

  for (const item of (options.initial ?? NO_THREADS).threads) setCopy(item);
  for (const problem of (options.initial ?? NO_THREADS).problems) {
    const text = options.initial?.problemTexts?.get(problemKey(problem)) ?? null;
    recordProblem(problem, null, text);
  }
  publish();

  // Fila única: gravações e conferências nunca rodam em paralelo.
  const enqueue = createSerialQueue();

  const stampOf = (id: string, resolved: boolean): Promise<string | null> =>
    stampOr(storage.statThread ? () => storage.statThread!(id, resolved) : null);

  /** Texto cru de uma cópia, `undefined` se a leitura falhou. */
  const rawOf = async (
    id: string,
    resolved: boolean,
  ): Promise<string | null | undefined> => {
    try {
      return await storage.readThread(id, resolved);
    } catch (e) {
      reportError('threads.read', e);
      return undefined;
    }
  };

  /** Uma cópia lida do disco: a que a sessão já conhece, se o texto é o mesmo, senão a nova. */
  const readCopy = async (
    id: string,
    resolvedDir: boolean,
    text: string,
  ): Promise<LoadedThread | null> => {
    const previous = known.get(id)?.[slot(resolvedDir)] ?? null;
    if (previous?.text === text) return previous;
    const parsed = parseThreadFile(id, text, await stampOf(id, resolvedDir), resolvedDir);
    return parsed.ok ? parsed : null;
  };

  /** Lê as duas cópias do disco e atualiza o que a sessão sabe delas. */
  const refresh = async (
    id: string,
  ): Promise<
    | {
        readonly ok: true;
        readonly open: LoadedThread | null;
        readonly resolved: LoadedThread | null;
      }
    | { readonly ok: false; readonly error: 'unreadable' | 'gone' }
  > => {
    const raws = [await rawOf(id, false), await rawOf(id, true)] as const;
    if (raws[0] === undefined || raws[1] === undefined)
      return { ok: false, error: 'unreadable' };
    const copies: Copies = {
      open: raws[0] === null ? null : await readCopy(id, false, raws[0]),
      resolved: raws[1] === null ? null : await readCopy(id, true, raws[1]),
    };
    // Existe o arquivo mas não passa na validação: não se sobrescreve o que não se leu.
    if (unreadable(raws[0], copies.open) || unreadable(raws[1], copies.resolved)) {
      return { ok: false, error: 'unreadable' };
    }
    if (copies.open === null && copies.resolved === null) {
      known.delete(id);
      publish();
      return { ok: false, error: 'gone' };
    }
    known.set(id, copies);
    publish();
    return { ok: true, ...copies };
  };

  const mutateNow = async (
    id: string,
    operation: (thread: Thread) => Thread,
  ): Promise<ThreadOutcome> => {
    if (!known.has(id)) return { ok: false, error: 'unknown-thread' };
    const read = await refresh(id);
    if (!read.ok) return read;
    const merged = mergedOf(read.open, read.resolved);
    const ran = runOperation(merged, operation);
    if (!ran.ok) return ran;
    const duplicated = read.open !== null && read.resolved !== null;
    if (ran.next === merged && !duplicated) return { ok: true, thread: merged };
    // As duas cópias juntadas sem mudança nenhuma ainda precisam de uma gravação que as una.
    const next = ran.next === merged ? bumped(merged) : ran.next;
    return writeThread(next, {
      hadOpen: read.open !== null,
      hadResolved: read.resolved !== null,
    });
  };

  const writeThread = async (
    next: Thread,
    existing: { readonly hadOpen: boolean; readonly hadResolved: boolean },
  ): Promise<ThreadOutcome> => {
    const id = next.id;
    const toResolved = threadLocation(next) === 'resolved';
    const text = serializeThread(next);
    try {
      await storage.writeThread(id, toResolved, text);
    } catch (e) {
      reportError('threads.write', e);
      return { ok: false, error: 'write-failed' };
    }
    const hadOther = toResolved ? existing.hadOpen : existing.hadResolved;
    if (hadOther) {
      // Gravou no destino; a origem sai agora. Se isto falhar, as duas cópias ficam e a
      // próxima leitura as junta (decisão 7): nada se perde.
      try {
        await storage.removeThread(id, !toResolved);
      } catch (e) {
        reportError('threads.move', e);
      }
    }
    const stamp = await stampOf(id, toResolved);
    const item: LoadedThread = { thread: next, text, stamp, resolvedDir: toResolved };
    known.set(
      id,
      toResolved ? { open: null, resolved: item } : { open: item, resolved: null },
    );
    publish();
    options.onChanged?.();
    return { ok: true, thread: next };
  };

  const createNow = async (thread: Thread): Promise<ThreadOutcome> => {
    const [inOpen, inResolved] = [
      await rawOf(thread.id, false),
      await rawOf(thread.id, true),
    ];
    if (inOpen === undefined || inResolved === undefined)
      return { ok: false, error: 'unreadable' };
    if (inOpen !== null || inResolved !== null || known.has(thread.id)) {
      return { ok: false, error: 'exists' };
    }
    return writeThread(thread, { hadOpen: false, hadResolved: false });
  };

  const removeNow = async (
    id: string,
  ): Promise<{ ok: true } | { ok: false; error: ThreadStoreError }> => {
    if (!known.has(id)) return { ok: false, error: 'unknown-thread' };
    try {
      await storage.removeThread(id, false);
      await storage.removeThread(id, true);
    } catch (e) {
      reportError('threads.remove', e);
      return { ok: false, error: 'write-failed' };
    }
    known.delete(id);
    for (const resolvedDir of [false, true])
      problemMap.delete(problemKey({ id, resolvedDir }));
    publish();
    options.onChanged?.();
    return { ok: true };
  };

  /** O carimbo já diz que nada mudou (ou que o problema conhecido é o mesmo)? */
  const stampSaysSkip = (
    id: string,
    resolvedDir: boolean,
    stamp: string | null,
  ): 'same' | 'skipped' | null => {
    if (stamp === null) return null;
    const entry = known.get(id)?.[slot(resolvedDir)] ?? null;
    if (entry) return stamp === entry.stamp ? 'same' : null;
    const bad = problemMap.get(problemKey({ id, resolvedDir }));
    return bad && stamp === bad.stamp ? 'skipped' : null;
  };

  /**
   * Lê o arquivo de uma pasta se o carimbo mudou. Devolve o que a conferência precisa saber.
   * `stamp`: o carimbo que a conferência já tem (de `stampThreads` ou de um `stampOf`).
   */
  const checkFile = async (
    id: string,
    resolvedDir: boolean,
    stamp: string | null,
  ): Promise<'same' | 'added' | 'changed' | 'skipped'> => {
    const skip = stampSaysSkip(id, resolvedDir, stamp);
    if (skip !== null) return skip;
    const entry = known.get(id)?.[slot(resolvedDir)] ?? null;
    const read = await readThread(storage, id, resolvedDir);
    if (!read.ok) {
      // Sumiu entre a lista e a leitura, ou está ilegível: uma conversa que já conhecemos
      // fica como está (um editor ainda escrevendo); só as desconhecidas viram problema.
      if (!read.missing && !known.has(id)) {
        recordProblem({ id, resolvedDir, errors: read.errors }, stamp, read.text);
      }
      return 'skipped';
    }
    if (entry && read.text === entry.text) {
      setCopy({ ...entry, stamp: read.stamp });
      return 'same';
    }
    setCopy(read);
    return entry ? 'changed' : 'added';
  };

  /** Lê os arquivos de `comments/` que mudaram e diz quais ids são novos e quais mudaram. */
  const scanOpenFiles = async (
    ids: readonly string[],
    scan: MutableScan,
    stamps?: ReadonlyMap<string, string | null>,
  ) => {
    const before = new Set(known.keys());
    for (const id of ids) {
      const stamp = stamps ? (stamps.get(id) ?? null) : await stampOf(id, false);
      const result = await checkFile(id, false, stamp);
      if (result === 'changed' || (result === 'added' && before.has(id)))
        scan.changed.push(id);
      else if (result === 'added') scan.added.push(id);
    }
  };

  /** Conversas cujo arquivo aberto sumiu: apagadas, ou movidas para `resolved/` por fora. */
  const scanVanished = async (present: ReadonlySet<string>, scan: MutableScan) => {
    for (const [id, copies] of [...known]) {
      if (present.has(id) || copies.open === null) continue;
      clearCopy(id, false);
      const moved = await checkFile(id, true, await stampOf(id, true));
      if (!known.has(id)) scan.removed.push(id);
      else if (moved !== 'skipped') scan.changed.push(id);
    }
  };

  const dropProblems = (resolvedDir: boolean, present: ReadonlySet<string>) => {
    for (const [key, item] of [...problemMap]) {
      if (item.problem.resolvedDir === resolvedDir && !present.has(item.problem.id)) {
        problemMap.delete(key);
      }
    }
  };

  const listIds = async (resolved: boolean): Promise<string[] | null> => {
    try {
      return await storage.listThreads(resolved);
    } catch (e) {
      reportError('threads.list', e);
      return null;
    }
  };

  /** Identifica o conjunto de problemas (ids e erros), para publicar só quando ele muda. */
  const problemsKey = () =>
    JSON.stringify([...problemMap.values()].map((p) => [p.problem.id, p.problem.errors]));

  /**
   * Os ids de `comments/` e, quando o armazenamento tem `stampThreads`, o carimbo de cada um (num
   * passo só); sem ele, só os ids (o carimbo sai de um `statThread` por arquivo).
   */
  const listOpen = async (): Promise<{
    ids: string[];
    stamps?: ReadonlyMap<string, string | null>;
  } | null> => {
    if (!storage.stampThreads) {
      const ids = await listIds(false);
      return ids === null ? null : { ids };
    }
    try {
      const stamps = await storage.stampThreads(false);
      return { ids: [...stamps.keys()], stamps };
    } catch (e) {
      reportError('threads.list', e);
      return null;
    }
  };

  const scanNow = async (): Promise<ThreadScan> => {
    const scan: MutableScan = { added: [], changed: [], removed: [] };
    const listed = await listOpen();
    if (listed === null) return scan;
    const { ids, stamps } = listed;
    const problemsBefore = problemsKey();
    const present = new Set(ids);
    await scanOpenFiles(ids, scan, stamps);
    await scanVanished(present, scan);
    dropProblems(false, present);
    if (scan.added.length > 0 || scan.changed.length > 0 || scan.removed.length > 0)
      publish();
    else if (problemsKey() !== problemsBefore) publish();
    return scan;
  };

  const loadResolvedNow = async (): Promise<void> => {
    const ids = await listIds(true);
    if (ids === null) return;
    const present = new Set(ids);
    for (const id of ids) await checkFile(id, true, await stampOf(id, true));
    for (const [id, copies] of [...known]) {
      if (copies.resolved !== null && !present.has(id)) clearCopy(id, true);
    }
    dropProblems(true, present);
    resolvedLoaded.value = true;
    publish();
  };

  return {
    list,
    problems,
    resolvedLoaded,
    get: (id) => {
      const copies = known.get(id);
      return copies ? viewOf(copies) : null;
    },
    mutate: (id, operation) => enqueue(() => mutateNow(id, operation)),
    create: (thread) => enqueue(() => createNow(thread)),
    remove: (id) => enqueue(() => removeNow(id)),
    async removeMany(ids) {
      const removed: string[] = [];
      const failed: string[] = [];
      for (const id of ids) {
        const result = await enqueue(() => removeNow(id));
        (result.ok ? removed : failed).push(id);
      }
      return { removed, failed };
    },
    scan: () => enqueue(scanNow),
    loadResolved: () => enqueue(loadResolvedNow),
    settled: () => enqueue(() => Promise.resolve()),
    async collect() {
      return enqueue(async () => {
        if (!resolvedLoaded.peek()) await loadResolvedNow();
        const files = new Map<string, string>();
        for (const copies of known.values()) {
          for (const item of [copies.open, copies.resolved]) {
            if (item)
              files.set(threadFilePath(item.thread.id, item.resolvedDir), item.text);
          }
        }
        for (const item of problemMap.values()) {
          if (item.text !== null) files.set(problemKey(item.problem), item.text);
        }
        return files;
      });
    },
  };
}

export { loadThreads };
