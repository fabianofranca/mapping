import type {
  DirectoryHandleLike,
  FileHandleLike,
  WritableLike,
} from '../../src/storage/folder';

const notFound = (name: string) => new DOMException(`${name} not found`, 'NotFoundError');

/** O que as pastas de uma mesma árvore compartilham (a latência vale para a árvore toda). */
interface TreeSettings {
  latencyMs: number;
}

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

  /** Compartilhado com as pastas de dentro: a latência escolhida na raiz vale para todas. */
  private readonly tree: TreeSettings;

  constructor(
    readonly name: string,
    tree?: TreeSettings,
    /** A pasta que a contém (a raiz não tem). */
    private readonly parent?: MemoryDirectory,
  ) {
    this.tree = tree ?? { latencyMs: 0 };
  }

  /**
   * A pasta ainda está na árvore? Removida (por `removeEntry`, `removeAt` ou um `dirs.delete`
   * por fora), um handle antigo dela falha com `NotFoundError`, como na File System Access API,
   * mesmo que outra pasta de mesmo nome tenha sido criada no lugar.
   */
  get attached(): boolean {
    const parent = this.parent;
    return !parent || (parent.dirs.get(this.name) === this && parent.attached);
  }

  /**
   * Latência por chamada (ms, com `setTimeout`), para imitar uma pasta lenta (tablet, nuvem) nos
   * testes de orçamento e de conferência adaptativa. Vale para a árvore inteira; 0 (padrão):
   * nenhuma espera, o comportamento de sempre.
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

  /** Atalho para os testes: remove a pasta por caminho, "por fora" da app, os handles antigos dela passam a falhar. */
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
      next = new MemoryDirectory(first, this.tree, this);
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

export type MemoryPermission = 'granted' | 'prompt' | 'denied';

/**
 * Pasta em memória com a parte de permissão da File System Access API
 * (`queryPermission`/`requestPermission`/`isSameEntry`), para os recentes de pasta.
 */
export class PermissionDirectory extends MemoryDirectory {
  /** O que `queryPermission` devolve. */
  permission: MemoryPermission = 'granted';
  /** O que `requestPermission` devolve (e passa a valer para as próximas consultas). */
  answer: MemoryPermission = 'granted';
  /** Quantas vezes a app pediu a permissão. */
  requests = 0;
  /** Pasta movida ou apagada: todo acesso falha com `NotFoundError`. */
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
 * O IndexedDB guarda o handle de verdade por clonagem estruturada (o navegador sabe
 * serializar um `FileSystemDirectoryHandle`). A pasta em memória não é serializável:
 * este `structuredClone` mantém as pastas por referência e clona o resto como sempre.
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
