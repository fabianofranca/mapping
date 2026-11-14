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

// The open project's anchored threads (Comments stage): the in-memory list, reading the
// folder and writing. The only one that writes `comments/<id>.json` and `comments/resolved/<id>.json`
// is this module, inside the session (`session.threads`); the interface never writes to storage.
// None of this touches `mapping.json` nor the undo history (decision 1).
//
// File check, like the proposals': every write re-reads the file (both folders)
// beforehand and, if it differs from what the session last read or wrote (the MCP server appended
// a message, an editor touched it), adopts the disk version and REDOES the operation on it, instead
// of overwriting it. The operations are pure functions of the thread (append, resolve,
// reopen) and each one returns `revision + 1`, so redoing is safe and nothing from outside is lost. An
// unreadable file is never overwritten. The `resolved` field is the truth; the folder is just the
// index: the write leaves the file in the right folder and only then deletes the other copy.

export type ThreadStoreError =
  /** There is no thread with that id. */
  | 'unknown-thread'
  /** The file vanished from outside. */
  | 'gone'
  /** The file changed outside and became unreadable: what was not read is not overwritten. */
  | 'unreadable'
  /** A thread with that id already exists (`create`). */
  | 'exists'
  /** The message would repeat the id of one that is already in the thread. */
  | 'duplicate-message'
  /** The thread the operation returned fails the format validation. */
  | 'invalid'
  | 'write-failed';

export type ThreadOutcome =
  | { readonly ok: true; readonly thread: Thread }
  | { readonly ok: false; readonly error: ThreadStoreError };

/** What the `comments/` folder check found (ids). */
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

/** What the session knows about each thread file: the open one and the resolved one. */
interface Copies {
  readonly open: LoadedThread | null;
  readonly resolved: LoadedThread | null;
}

export interface ThreadStore {
  /** Readable threads (open and already-read resolved ones), newest first. */
  readonly list: ReadonlySignal<readonly Thread[]>;
  /** Thread files that could not be read (the thread does not appear in the list). */
  readonly problems: ReadonlySignal<readonly ThreadProblem[]>;
  /** `comments/resolved/` has been read (on opening or by `loadResolved`). */
  readonly resolvedLoaded: ReadonlySignal<boolean>;
  get(id: string): Thread | null;
  /**
   * Changes a thread: re-reads the files, adopts the disk version if it changed outside, applies the
   * operation (pure, from `src/model/threadOps.ts`) and writes with `revision + 1` to the folder the
   * `resolved` field dictates. Calls run in a queue.
   */
  mutate(id: string, operation: (thread: Thread) => Thread): Promise<ThreadOutcome>;
  /** Writes a new thread to `comments/`. Refuses an id that already exists (never overwrites). */
  create(thread: Thread): Promise<ThreadOutcome>;
  /** Deletes the thread (both copies) from storage and from the list. */
  remove(id: string): Promise<{ readonly ok: true } | (ThreadOutcome & { ok: false })>;
  /** Deletes several, one at a time, in the queue. */
  removeMany(ids: readonly string[]): Promise<RemoveManyResult>;
  /** Checks `comments/` (without `resolved/`): threads added, changed and deleted from outside. */
  scan(): Promise<ThreadScan>;
  /** Reads `comments/resolved/` (on opening the session already read it; on request, again). */
  loadResolved(): Promise<void>;
  /** Waits for the writes in progress (when closing the project). */
  settled(): Promise<void>;
  /**
   * Files to export (path → text): the threads as they are on disk, the resolved ones
   * included (reads `resolved/` if not read yet) and the exact text of the invalid files.
   */
  collect(): Promise<Map<string, string>>;
}

export interface ThreadStoreOptions {
  readonly storage: ProjectStorage;
  readonly initial?: LoadedThreads;
  /**
   * `initial` already brought `comments/resolved/` (default `true`, what `loadThreads` does). `false`
   * when the session opened reading only `comments/`.
   */
  readonly resolvedLoaded?: boolean;
  /** After each successful write or removal (the "Changes not exported" indicator). */
  readonly onChanged?: () => void;
}

const slot = (resolvedDir: boolean): 'open' | 'resolved' =>
  resolvedDir ? 'resolved' : 'open';

/** Runs the pure operation; its errors become the store's code. */
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

/** The file exists but failed validation. */
const unreadable = (raw: string | null, copy: LoadedThread | null): boolean =>
  raw !== null && copy === null;

/** The thread of the copies read (the merge, if there are two). */
const mergedOf = (open: LoadedThread | null, resolved: LoadedThread | null): Thread =>
  mergeThreadCopies(open?.thread ?? null, resolved?.thread ?? null).thread;

/** The operation changed nothing, but there were two copies: the write that joins them bumps `revision`. */
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
    // Once per file: the check that finds it again, unchanged, does not repeat the warning.
    if (!previous || previous.text !== text) reportThreadProblem(problem);
  };

  for (const item of (options.initial ?? NO_THREADS).threads) setCopy(item);
  for (const problem of (options.initial ?? NO_THREADS).problems) {
    const text = options.initial?.problemTexts?.get(problemKey(problem)) ?? null;
    recordProblem(problem, null, text);
  }
  publish();

  // Single queue: writes and checks never run in parallel.
  const enqueue = createSerialQueue();

  const stampOf = (id: string, resolved: boolean): Promise<string | null> =>
    stampOr(storage.statThread ? () => storage.statThread!(id, resolved) : null);

  /** Raw text of a copy, `undefined` if reading failed. */
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

  /** A copy read from disk: the one the session already knows, if the text is the same, else the new one. */
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

  /** Reads both copies from disk and updates what the session knows about them. */
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
    // The file exists but fails validation: what was not read is not overwritten.
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
    // The two copies joined without any change still need a write that unites them.
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
      // Wrote to the destination; the source goes away now. If this fails, both copies stay and
      // the next read merges them (decision 7): nothing is lost.
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

  /** Does the stamp already say nothing changed (or that the known problem is the same)? */
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
   * Reads a folder's file if the stamp changed. Returns what the check needs to know.
   * `stamp`: the stamp the check already has (from `stampThreads` or from a `stampOf`).
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
      // Vanished between the list and the read, or is unreadable: a thread we already know
      // stays as it is (an editor still writing); only the unknown ones become a problem.
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

  /** Reads the `comments/` files that changed and says which ids are new and which changed. */
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

  /** Threads whose open file vanished: deleted, or moved to `resolved/` from outside. */
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

  /** Identifies the set of problems (ids and errors), to publish only when it changes. */
  const problemsKey = () =>
    JSON.stringify([...problemMap.values()].map((p) => [p.problem.id, p.problem.errors]));

  /**
   * The `comments/` ids and, when the storage has `stampThreads`, the stamp of each one (in a
   * single pass); without it, only the ids (the stamp comes from one `statThread` per file).
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
