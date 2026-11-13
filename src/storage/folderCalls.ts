import type { DirectoryHandleLike, FileHandleLike, WritableLike } from './folder';

/** Os tipos de chamada à File System Access API que o contador distingue. */
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
 * As operações de projeto em pasta que se medem, na ordem em que o Diagnóstico as lista:
 * abrir, gravar, gravar com pacote de biblioteca, gravar uma decisão ou nota de proposta,
 * aplicar as aceitas e um ciclo da conferência de alterações externas.
 */
export const FOLDER_OPS = ['open', 'save', 'library', 'decide', 'apply', 'sync'] as const;
export type FolderOp = (typeof FOLDER_OPS)[number];

/** A última medida de uma operação: chamadas à pasta e milissegundos. */
export interface FolderMeasure {
  readonly op: FolderOp;
  readonly calls: number;
  readonly ms: number;
}

export interface FolderCalls {
  /** Todas as chamadas contadas até agora. */
  readonly total: number;
  /** As chamadas contadas até agora, por tipo. */
  readonly byKind: Readonly<Record<FolderCallKind, number>>;
  /** Conta uma chamada (usado pelo `countingDirectory`). */
  count(kind: FolderCallKind): void;
  /**
   * Mede `fn`: as chamadas à pasta e os milissegundos entre o início e o fim dela, guardados
   * como a última medida de `op`. `op` pode ser decidida no fim (`save` ou `library`).
   * Operações concorrentes somam nas duas medidas (é diagnóstico, não orçamento). Uma `fn` que
   * lança também registra a medida e repassa o erro.
   */
  measure<T>(op: FolderOp | (() => FolderOp), fn: () => Promise<T>): Promise<T>;
  /** As últimas medidas, na ordem de `FOLDER_OPS`, só das operações já medidas. */
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
 * Embrulha a pasta (e, recursivamente, os handles que ela devolve) contando cada
 * `getDirectoryHandle`, `getFileHandle`, `getFile`, entrada de `values()`, `createWritable`,
 * `write`/`close`/`abort` e `removeEntry`, sem mudar o resultado nem o erro de nenhuma chamada.
 * A chamada que falha também conta: ela foi feita.
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
