import type {
  DirectoryHandleLike,
  FileHandleLike,
  WritableLike,
} from '../../src/storage/folder';

const notFound = (name: string) => new DOMException(`${name} not found`, 'NotFoundError');

/** Pasta em memória que imita a File System Access API. */
export class MemoryDirectory implements DirectoryHandleLike {
  readonly kind = 'directory';
  readonly files = new Map<string, Blob>();
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
    const failWrites = () => this.failWrites;
    const onAbort = () => this.abortedWrites++;
    return {
      kind: 'file',
      name,
      getFile: async () => {
        const blob = files.get(name);
        if (!blob) throw notFound(name);
        return blob;
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

  /** Atalho para os testes: grava um arquivo por caminho, criando as pastas. */
  put(path: string, content: string): void {
    const parts = path.split('/');
    const fileName = parts.pop() ?? '';
    let dirs = this.dirs;
    let files = this.files;
    for (const part of parts) {
      let next = dirs.get(part);
      if (!next) {
        next = new MemoryDirectory(part);
        dirs.set(part, next);
      }
      dirs = next.dirs;
      files = next.files;
    }
    files.set(fileName, new Blob([content]));
  }
}
