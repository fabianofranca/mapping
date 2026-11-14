import {
  mergeThreadCopies,
  parseThreadText,
  threadFilePath,
  type MergedThread,
  type Thread,
} from '../model';
import { mapLimit } from '../utils/mapLimit';
import { reportError } from '../utils/report';
import { FOLDER_CONCURRENCY } from './folderConcurrency';
import type { ProjectStorage } from './types';

// Reading the threads (`comments/<id>.json` and `comments/resolved/<id>.json`, Comments stage):
// on opening the project, on each check (`comments/` only) and on request (`resolved/`). An
// invalid file does not bring anything down: it becomes a problem listed separately (the thread vanishes from the list, the rest
// goes on), and its text is kept to come back identical in the zip.

/** A thread copy read: the thread, the exact text, the stamp (folder only) and the folder. */
export interface LoadedThread {
  readonly thread: Thread;
  readonly text: string;
  readonly stamp: string | null;
  /** Which folder the file came from: `comments/resolved/` (`true`) or `comments/`. */
  readonly resolvedDir: boolean;
}

/** A thread file that could not be read: the file id, the folder and the errors. */
export interface ThreadProblem {
  readonly id: string;
  readonly resolvedDir: boolean;
  readonly errors: readonly string[];
}

export interface LoadedThreads {
  readonly threads: readonly LoadedThread[];
  readonly problems: readonly ThreadProblem[];
  /** Text of the invalid files (path → text), kept to export without loss. */
  readonly problemTexts?: ReadonlyMap<string, string>;
}

export const NO_THREADS: LoadedThreads = { threads: [], problems: [] };

export type ReadThreadResult =
  | ({ readonly ok: true } & LoadedThread)
  | {
      readonly ok: false;
      /** The file does not exist (any more). */
      readonly missing: boolean;
      readonly errors: readonly string[];
      /** The text read, when the file exists but is invalid. */
      readonly text: string | null;
    };

/** Reads and validates a thread copy. The file's `id` must be the one in the name. */
export async function readThread(
  storage: ProjectStorage,
  id: string,
  resolvedDir: boolean,
): Promise<ReadThreadResult> {
  let text: string | null;
  let stamp: string | null;
  try {
    stamp = storage.statThread ? await storage.statThread(id, resolvedDir) : null;
    text = await storage.readThread(id, resolvedDir);
  } catch (e) {
    reportError('threads.read', e);
    return {
      ok: false,
      missing: false,
      errors: [e instanceof Error ? e.message : String(e)],
      text: null,
    };
  }
  if (text === null) return { ok: false, missing: true, errors: [], text: null };
  return parseThreadFile(id, text, stamp, resolvedDir);
}

export function parseThreadFile(
  id: string,
  text: string,
  stamp: string | null,
  resolvedDir: boolean,
): ReadThreadResult {
  const parsed = parseThreadText(text);
  if (!parsed.ok) return { ok: false, missing: false, errors: parsed.errors, text };
  if (parsed.thread.id !== id) {
    return {
      ok: false,
      missing: false,
      errors: [`id: must be "${id}" (the file name), but is "${parsed.thread.id}"`],
      text,
    };
  }
  for (const warning of parsed.warnings) reportError('threads.read', `${id}: ${warning}`);
  return { ok: true, thread: parsed.thread, text, stamp, resolvedDir };
}

/** Path of the thread file, the key of the invalid texts. */
export const threadProblemPath = threadFilePath;

/** Records a read problem in the Diagnostics (one line per file). */
export function reportThreadProblem(problem: ThreadProblem): void {
  reportError(
    'threads.invalid',
    `${threadFilePath(problem.id, problem.resolvedDir)}: ${problem.errors.join('; ')}`,
  );
}

/** Merges the two copies of the same thread, when there are any. `null` if none is readable. */
export function mergeLoaded(
  open: LoadedThread | null,
  resolved: LoadedThread | null,
): MergedThread | null {
  if (open === null && resolved === null) return null;
  return mergeThreadCopies(open?.thread ?? null, resolved?.thread ?? null);
}

export interface LoadThreadsOptions {
  /** Also read `comments/resolved/` (default). `false` reads only `comments/`. */
  readonly resolved?: boolean;
}

/** Reads the threads from storage (open ones and, by default, resolved ones). */
export async function loadThreads(
  storage: ProjectStorage,
  options: LoadThreadsOptions = {},
): Promise<LoadedThreads> {
  const dirs = options.resolved === false ? [false] : [false, true];
  const threads: LoadedThread[] = [];
  const problems: ThreadProblem[] = [];
  const problemTexts = new Map<string, string>();
  for (const resolvedDir of dirs) {
    let ids: string[];
    try {
      ids = await storage.listThreads(resolvedDir);
    } catch (e) {
      reportError('threads.list', e);
      continue;
    }
    const reads = await mapLimit(ids, FOLDER_CONCURRENCY, (id) =>
      readThread(storage, id, resolvedDir),
    );
    ids.forEach((id, i) => {
      const read = reads[i] as ReadThreadResult;
      if (read.ok) {
        threads.push(read);
      } else if (!read.missing) {
        problems.push({ id, resolvedDir, errors: read.errors });
        if (read.text !== null)
          problemTexts.set(threadFilePath(id, resolvedDir), read.text);
      }
    });
  }
  return { threads, problems, problemTexts };
}
