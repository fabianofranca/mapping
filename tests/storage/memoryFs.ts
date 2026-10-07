import type {
  DirectoryHandleLike,
  FileHandleLike,
  WritableLike,
} from '../../src/storage/folder';

const notFound = (name: string) => new DOMException(`${name} not found`, 'NotFoundError');

/** Relógio dos arquivos em memória: cada gravação (ou `touch`) avança um tique. */
let clock = 1_700_000_000_000;

/** Pasta em memória que imita a File System Access API. */
export class MemoryDirectory implements DirectoryHandleLike {
  readonly kind = 'directory';
  readonly files = new Map<string, Blob>();
  /** `lastModified` de cada arquivo (nome → ms), como o do `File` da File System Access API. */
  readonly modified = new Map<string, number>();
  readonly dirs = new Map<string, MemoryDirectory>();
  /** Se definido, toda escrita falha com este erro. */
  failWrites: Error | null = null;
  /** Quantas escritas foram descartadas com `abort()` nesta pasta. */
  abortedWrites = 0;

  constructor(readonly name: string) {}

  async getDirectoryHandle(name: string, options: { create?: boolean } = {}) {
    let dir = this.dirs.get(name);
    if (!dir) {
      if (!options.create) throw notFound(name);
      dir = new MemoryDirectory(name);
      dir.failWrites = this.failWrites;
      this.dirs.set(name, dir);
    }
    return dir;
  }

  async getFileHandle(name: string, options: { create?: boolean } = {}) {
    if (!this.files.has(name)) {
      if (!options.create) throw notFound(name);
      this.files.set(name, new Blob([]));
      this.modified.set(name, ++clock);
    }
    return this.fileHandle(name);
  }

  async removeEntry(name: string) {
    if (!this.files.delete(name) && !this.dirs.delete(name)) throw notFound(name);
  }

  async *values(): AsyncIterable<FileHandleLike | DirectoryHandleLike> {
    for (const name of this.files.keys()) yield this.fileHandle(name);
    for (const dir of this.dirs.values()) yield dir;
  }

  private fileHandle(name: string): FileHandleLike {
    const files = this.files;
    const modified = this.modified;
    const failWrites = () => this.failWrites;
    const onAbort = () => this.abortedWrites++;
    return {
      kind: 'file',
      name,
      getFile: async () => {
        const blob = files.get(name);
        if (!blob) throw notFound(name);
        return new File([blob], name, { lastModified: modified.get(name) ?? 0 });
      },
      createWritable: async (): Promise<WritableLike> => {
        const parts: (Blob | string)[] = [];
        let done = false;
        return {
          write: async (data) => {
            const error = failWrites();
            if (error) throw error;
            parts.push(data);
          },
          close: async () => {
            if (done) throw new TypeError('closed');
            done = true;
            files.set(name, new Blob(parts));
            modified.set(name, ++clock);
          },
          abort: async () => {
            if (done) throw new TypeError('closed');
            done = true;
            onAbort();
          },
        };
      },
    };
  }

  /** Atalho para os testes: lê um arquivo por caminho (`images/a.jpg`). */
  async read(path: string): Promise<string | null> {
    const parts = path.split('/');
    const fileName = parts.pop() ?? '';
    let dirs = this.dirs;
    let files = this.files;
    for (const part of parts) {
      const next = dirs.get(part);
      if (!next) return null;
      dirs = next.dirs;
      files = next.files;
    }
    const blob = files.get(fileName);
    return blob ? blob.text() : null;
  }

  private dirAt(parts: readonly string[], create: boolean): MemoryDirectory | undefined {
    const [first, ...rest] = parts;
    if (first === undefined) return this;
    let next = this.dirs.get(first);
    if (!next && create) {
      next = new MemoryDirectory(first);
      this.dirs.set(first, next);
    }
    return next?.dirAt(rest, create);
  }

  /** Atalho para os testes: grava um arquivo por caminho, criando as pastas. */
  put(path: string, content: string): void {
    const parts = path.split('/');
    const fileName = parts.pop() ?? '';
    const dir = this.dirAt(parts, true);
    dir?.files.set(fileName, new Blob([content]));
    dir?.modified.set(fileName, ++clock);
  }

  /** Atalho para os testes: muda só o `lastModified` do arquivo (um `touch`). */
  touch(path: string): void {
    const parts = path.split('/');
    const fileName = parts.pop() ?? '';
    this.dirAt(parts, false)?.modified.set(fileName, ++clock);
  }
}
