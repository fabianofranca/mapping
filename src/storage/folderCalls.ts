import type { DirectoryHandleLike, FileHandleLike, WritableLike } from './folder';

/** The kinds of File System Access API call that the counter distinguishes. */
export type FolderCallKind =
  | 'getDirectoryHandle'
  | 'getFileHandle'
  | 'getFile'
  | 'values'
  | 'createWritable'
  | 'write'
  | 'close'
  | 'abort'
  | 'removeEntry';

/**
 * The folder project operations that are measured, in the order Diagnostics lists them:
 * open, save, save with a library package, save a proposal decision or note,
 * apply the accepted ones and one cycle of the external-changes check.
 */
export const FOLDER_OPS = ['open', 'save', 'library', 'decide', 'apply', 'sync'] as const;
export type FolderOp = (typeof FOLDER_OPS)[number];

/** The last measurement of an operation: folder calls and milliseconds. */
export interface FolderMeasure {
  readonly op: FolderOp;
  readonly calls: number;
  readonly ms: number;
}

export interface FolderCalls {
  /** All the calls counted so far. */
  readonly total: number;
  /** The calls counted so far, by kind. */
  readonly byKind: Readonly<Record<FolderCallKind, number>>;
  /** Counts a call (used by `countingDirectory`). */
  count(kind: FolderCallKind): void;
  /**
   * Measures `fn`: the folder calls and the milliseconds between its start and end, stored
   * as the last measurement of `op`. `op` may be decided at the end (`save` or `library`).
   * Concurrent operations add up in both measurements (it is diagnostics, not a budget). A `fn` that
   * throws also records the measurement and rethrows the error.
   */
  measure<T>(op: FolderOp | (() => FolderOp), fn: () => Promise<T>): Promise<T>;
  /** The latest measurements, in `FOLDER_OPS` order, only for operations already measured. */
  snapshot(): readonly FolderMeasure[];
}

const KINDS: readonly FolderCallKind[] = [
  'getDirectoryHandle',
  'getFileHandle',
  'getFile',
  'values',
  'createWritable',
  'write',
  'close',
  'abort',
  'removeEntry',
];

export function createFolderCalls(): FolderCalls {
  const byKind = Object.fromEntries(KINDS.map((kind) => [kind, 0])) as Record<
    FolderCallKind,
    number
  >;
  let total = 0;
  const last = new Map<FolderOp, FolderMeasure>();
  return {
    get total() {
      return total;
    },
    byKind,
    count(kind) {
      byKind[kind]++;
      total++;
    },
    async measure(op, fn) {
      const callsBefore = total;
      const startedAt = performance.now();
      try {
        return await fn();
      } finally {
        const resolved = typeof op === 'function' ? op() : op;
        last.set(resolved, {
          op: resolved,
          calls: total - callsBefore,
          ms: performance.now() - startedAt,
        });
      }
    },
    snapshot() {
      return FOLDER_OPS.flatMap((op) => {
        const measure = last.get(op);
        return measure ? [measure] : [];
      });
    },
  };
}

function countingWritable(inner: WritableLike, calls: FolderCalls): WritableLike {
  return {
    write(data) {
      calls.count('write');
      return inner.write(data);
    },
    close() {
      calls.count('close');
      return inner.close();
    },
    abort(reason) {
      calls.count('abort');
      return inner.abort(reason);
    },
  };
}

function countingFile(inner: FileHandleLike, calls: FolderCalls): FileHandleLike {
  return {
    kind: 'file',
    name: inner.name,
    getFile() {
      calls.count('getFile');
      return inner.getFile();
    },
    async createWritable() {
      calls.count('createWritable');
      return countingWritable(await inner.createWritable(), calls);
    },
  };
}

function countingEntry(
  entry: FileHandleLike | DirectoryHandleLike,
  calls: FolderCalls,
): FileHandleLike | DirectoryHandleLike {
  return entry.kind === 'directory'
    ? countingDirectory(entry, calls)
    : countingFile(entry, calls);
}

/**
 * Wraps the folder (and, recursively, the handles it returns) counting each
 * `getDirectoryHandle`, `getFileHandle`, `getFile`, `values()` entry, `createWritable`,
 * `write`/`close`/`abort` and `removeEntry`, without changing the result or error of any call.
 * A call that fails also counts: it was made.
 */
export function countingDirectory(
  root: DirectoryHandleLike,
  calls: FolderCalls,
): DirectoryHandleLike {
  return {
    kind: 'directory',
    name: root.name,
    async getDirectoryHandle(name, options) {
      calls.count('getDirectoryHandle');
      return countingDirectory(await root.getDirectoryHandle(name, options), calls);
    },
    async getFileHandle(name, options) {
      calls.count('getFileHandle');
      return countingFile(await root.getFileHandle(name, options), calls);
    },
    removeEntry(name, options) {
      calls.count('removeEntry');
      return root.removeEntry(name, options);
    },
    async *values() {
      for await (const entry of root.values()) {
        calls.count('values');
        yield countingEntry(entry, calls);
      }
    },
  };
}
