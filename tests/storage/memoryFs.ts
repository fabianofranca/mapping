import type {
  DirectoryHandleLike,
  FileHandleLike,
  WritableLike,
} from '../../src/storage/folder';

const notFound = (name: string) => new DOMException(`${name} not found`, 'NotFoundError');

/** What the folders of one tree share (the latency applies to the whole tree). */
interface TreeSettings {
  latencyMs: number;
}

/** Clock of the in-memory files: each write (or `touch`) advances one tick. */
let clock = 1_700_000_000_000;

/** In-memory folder that imitates the File System Access API. */
export class MemoryDirectory implements DirectoryHandleLike {
  readonly kind = 'directory';
  readonly files = new Map<string, Blob>();
  /** `lastModified` of each file (name -> ms), like the `File` one of the File System Access API. */
  readonly modified = new Map<string, number>();
  readonly dirs = new Map<string, MemoryDirectory>();
  /** If set, every write fails with this error. */
  failWrites: Error | null = null;
  /** How many writes were discarded with `abort()` in this folder. */
  abortedWrites = 0;

  /** Shared with the inner folders: the latency chosen at the root applies to all of them. */
  private readonly tree: TreeSettings;

  constructor(
    readonly name: string,
    tree?: TreeSettings,
    /** The folder that contains it (the root has none). */
    private readonly parent?: MemoryDirectory,
  ) {
    this.tree = tree ?? { latencyMs: 0 };
  }

  /**
   * Is the folder still in the tree? Once removed (by `removeEntry`, `removeAt` or an outside
   * `dirs.delete`), an old handle to it fails with `NotFoundError`, as in the File System Access API,
   * even if another folder with the same name was created in its place.
   */
  get attached(): boolean {
    const parent = this.parent;
    return !parent || (parent.dirs.get(this.name) === this && parent.attached);
  }

  /**
   * Latency per call (ms, with `setTimeout`), to imitate a slow folder (tablet, cloud) in the
   * budget and adaptive-check tests. Applies to the whole tree; 0 (default):
   * no waiting, the usual behavior.
   */
  get latencyMs(): number {
    return this.tree.latencyMs;
  }

  set latencyMs(ms: number) {
    this.tree.latencyMs = ms;
  }

  private async delay(): Promise<void> {
    const ms = this.tree.latencyMs;
    if (ms > 0) await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  private assertAttached(): void {
    if (!this.attached) throw notFound(this.name);
  }

  async getDirectoryHandle(name: string, options: { create?: boolean } = {}) {
    await this.delay();
    this.assertAttached();
    let dir = this.dirs.get(name);
    if (!dir) {
      if (!options.create) throw notFound(name);
      dir = new MemoryDirectory(name, this.tree, this);
      dir.failWrites = this.failWrites;
      this.dirs.set(name, dir);
    }
    return dir;
  }

  async getFileHandle(name: string, options: { create?: boolean } = {}) {
    await this.delay();
    this.assertAttached();
    if (!this.files.has(name)) {
      if (!options.create) throw notFound(name);
      this.files.set(name, new Blob([]));
      this.modified.set(name, ++clock);
    }
    return this.fileHandle(name);
  }

  async removeEntry(name: string) {
    await this.delay();
    this.assertAttached();
    if (this.files.delete(name)) return;
    if (!this.dirs.delete(name)) throw notFound(name);
  }

  /** Test shortcut: removes the folder by path, "from outside" the app; its old handles start failing. */
  removeAt(path: string): void {
    const parts = path.split('/');
    const name = parts.pop() ?? '';
    this.dirAt(parts, false)?.dirs.delete(name);
  }

  async *values(): AsyncIterable<FileHandleLike | DirectoryHandleLike> {
    this.assertAttached();
    for (const name of [...this.files.keys()]) {
      await this.delay();
      yield this.fileHandle(name);
    }
    for (const dir of [...this.dirs.values()]) {
      await this.delay();
      yield dir;
    }
  }

  private fileHandle(name: string): FileHandleLike {
    const files = this.files;
    const modified = this.modified;
    const failWrites = () => this.failWrites;
    const onAbort = () => this.abortedWrites++;
    const delay = () => this.delay();
    const assertAttached = () => this.assertAttached();
    return {
      kind: 'file',
      name,
      getFile: async () => {
        await delay();
        assertAttached();
        const blob = files.get(name);
        if (!blob) throw notFound(name);
        return new File([blob], name, { lastModified: modified.get(name) ?? 0 });
      },
      createWritable: async (): Promise<WritableLike> => {
        await delay();
        assertAttached();
        const parts: (Blob | string)[] = [];
        let done = false;
        return {
          write: async (data) => {
            await delay();
            const error = failWrites();
            if (error) throw error;
            parts.push(data);
          },
          close: async () => {
            await delay();
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

  /** Test shortcut: reads a file by path (`images/a.jpg`). */
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
      next = new MemoryDirectory(first, this.tree, this);
      this.dirs.set(first, next);
    }
    return next?.dirAt(rest, create);
  }

  /** Test shortcut: writes a file by path, creating the folders. */
  put(path: string, content: string): void {
    const parts = path.split('/');
    const fileName = parts.pop() ?? '';
    const dir = this.dirAt(parts, true);
    dir?.files.set(fileName, new Blob([content]));
    dir?.modified.set(fileName, ++clock);
  }

  /** Test shortcut: changes only the file's `lastModified` (a `touch`). */
  touch(path: string): void {
    const parts = path.split('/');
    const fileName = parts.pop() ?? '';
    this.dirAt(parts, false)?.modified.set(fileName, ++clock);
  }
}

export type MemoryPermission = 'granted' | 'prompt' | 'denied';

/**
 * In-memory folder with the permission part of the File System Access API
 * (`queryPermission`/`requestPermission`/`isSameEntry`), for the recent folders.
 */
export class PermissionDirectory extends MemoryDirectory {
  /** What `queryPermission` returns. */
  permission: MemoryPermission = 'granted';
  /** What `requestPermission` returns (and applies to the next queries). */
  answer: MemoryPermission = 'granted';
  /** How many times the app asked for the permission. */
  requests = 0;
  /** Moved or deleted folder: every access fails with `NotFoundError`. */
  gone = false;

  async queryPermission(): Promise<MemoryPermission> {
    return this.permission;
  }

  async requestPermission(): Promise<MemoryPermission> {
    this.requests++;
    this.permission = this.answer;
    return this.answer;
  }

  async isSameEntry(other: unknown): Promise<boolean> {
    return other === this;
  }

  override async getFileHandle(name: string, options: { create?: boolean } = {}) {
    if (this.gone) throw notFound(this.name);
    return super.getFileHandle(name, options);
  }

  override async getDirectoryHandle(name: string, options: { create?: boolean } = {}) {
    if (this.gone) throw notFound(this.name);
    return super.getDirectoryHandle(name, options);
  }
}

/**
 * IndexedDB stores the real handle by structured cloning (the browser knows how to
 * serialize a `FileSystemDirectoryHandle`). The in-memory folder is not serializable:
 * this `structuredClone` keeps the folders by reference and clones the rest as usual.
 * Uso: `vi.stubGlobal('structuredClone', keepDirectoriesInClone())`.
 */
export function keepDirectoriesInClone(): typeof structuredClone {
  const original = globalThis.structuredClone;
  const clone = (value: unknown): unknown => {
    if (value instanceof MemoryDirectory) return value;
    if (Array.isArray(value)) return value.map(clone);
    if (
      typeof value === 'object' &&
      value !== null &&
      Object.getPrototypeOf(value) === Object.prototype
    ) {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
    }
    return original(value);
  };
  return ((value: unknown) => clone(value)) as typeof structuredClone;
}
