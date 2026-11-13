import {
  COMMENTS_DIR,
  GITIGNORE_FILE,
  PROPOSALS_DIR,
  PROPOSAL_FILE,
  PROPOSAL_ID_RE,
  gitignoreWithBackups,
  proposalDir,
  RESOLVED_DIR,
  proposalFilePath,
  threadFilePath,
} from '../model';
import {
  BACKUPS_DIR,
  IMAGES_DIR,
  MAPPING_FILE,
  assertSpecPath,
  assertThreadId,
  isImageFileName,
  threadIdOfFileName,
  type ProjectStorage,
} from './types';

// Subconjunto da File System Access API usado pela app. Tipado à parte para
// não depender das definições do navegador e para permitir mocks nos testes.

export interface WritableLike {
  write(data: Blob | string): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
}

export interface FileHandleLike {
  readonly kind: 'file';
  readonly name: string;
  /** O `File` real tem `lastModified`; os mocks dos testes podem devolver só um `Blob`. */
  getFile(): Promise<Blob & { readonly lastModified?: number }>;
  createWritable(): Promise<WritableLike>;
}

export interface DirectoryHandleLike {
  readonly kind: 'directory';
  readonly name: string;
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<DirectoryHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  values(): AsyncIterable<FileHandleLike | DirectoryHandleLike>;
}

export type FolderPermission = 'granted' | 'denied' | 'prompt';

/**
 * Handle que pode ser guardado e reaberto noutra visita (recentes de pasta): o navegador
 * pede a permissão de novo com um clique, e `isSameEntry` evita a mesma pasta duas vezes.
 */
export interface ReopenableDirectory extends DirectoryHandleLike {
  queryPermission(descriptor: { mode: 'readwrite' }): Promise<FolderPermission>;
  requestPermission(descriptor: { mode: 'readwrite' }): Promise<FolderPermission>;
  isSameEntry(other: DirectoryHandleLike): Promise<boolean>;
}

/** O navegador oferece o que os recentes de pasta precisam neste handle? */
export function isReopenable(handle: DirectoryHandleLike): handle is ReopenableDirectory {
  return ['queryPermission', 'requestPermission', 'isSameEntry'].every(
    (method) => typeof Reflect.get(handle, method) === 'function',
  );
}

/**
 * A pasta é do armazenamento privado da origem (OPFS, `navigator.storage.getDirectory()`)?
 * O seletor de pastas nunca devolve uma (ela é invisível para a pessoa); só os testes a usam
 * no lugar dele. Não vai para os recentes: no Chromium, ler de volta do IndexedDB um handle
 * do OPFS derruba a página. Sem OPFS (ou em `file://`, onde ele recusa): `false`.
 */
export async function isOriginPrivate(handle: DirectoryHandleLike): Promise<boolean> {
  try {
    const storage: unknown = Reflect.get(globalThis.navigator ?? {}, 'storage');
    const getDirectory: unknown =
      typeof storage === 'object' && storage !== null
        ? Reflect.get(storage, 'getDirectory')
        : undefined;
    if (typeof getDirectory !== 'function') return false;
    const root = (await getDirectory.call(storage)) as FileSystemDirectoryHandle;
    const entry = handle as unknown as FileSystemHandle;
    return (await root.isSameEntry(entry)) || (await root.resolve(entry)) !== null;
  } catch {
    return false;
  }
}

/**
 * Leitura e escrita na pasta: consulta e, se preciso, pede a permissão. Chamar no próprio
 * clique, sem espera longa antes (ler o handle do IndexedDB cabe na ativação do gesto): o
 * `requestPermission` só abre o diálogo do navegador dentro de um gesto da pessoa.
 * `observe`: cada resposta (consulta e, quando houve, pedido), para o rastro do Abrir.
 */
export async function ensurePermission(
  handle: ReopenableDirectory,
  observe?: (step: 'query' | 'request', state: FolderPermission) => void,
): Promise<boolean> {
  const mode = { mode: 'readwrite' } as const;
  const queried = await handle.queryPermission(mode);
  observe?.('query', queried);
  if (queried === 'granted') return true;
  const requested = await handle.requestPermission(mode);
  observe?.('request', requested);
  return requested === 'granted';
}

type DirectoryPicker = (options: { mode: 'readwrite' }) => Promise<DirectoryHandleLike>;

function directoryPicker(): DirectoryPicker | null {
  const picker: unknown = Reflect.get(globalThis, 'showDirectoryPicker');
  return typeof picker === 'function' ? (picker as DirectoryPicker) : null;
}

/** `showDirectoryPicker` existe e a página não está num iframe (onde ele é bloqueado). */
export function isFolderModeSupported(): boolean {
  try {
    return directoryPicker() !== null && window.self === window.top;
  } catch {
    return false;
  }
}

/** Abre o seletor de pasta. `null` se o usuário cancelar. */
export async function pickDirectory(): Promise<DirectoryHandleLike | null> {
  const picker = directoryPicker();
  if (!picker) return null;
  try {
    return await picker.call(globalThis, { mode: 'readwrite' });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
}

/** A pasta (ou o arquivo) não existe mais: movida, renomeada ou apagada. */
export function isNotFound(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === 'NotFoundError' || e.name === 'TypeMismatchError')
  );
}

function splitPath(path: string): { dirs: string[]; name: string } {
  const parts = path.split('/').filter((s) => s !== '' && s !== '.');
  if (parts.some((s) => s === '..')) throw new Error(`invalid path: ${path}`);
  const name = parts.pop();
  if (!name) throw new Error(`invalid path: ${path}`);
  return { dirs: parts, name };
}

type FileBlob = Blob & { readonly lastModified?: number };

/**
 * Handles já abertos, para não percorrer o caminho desde a raiz a cada chamada (numa pasta
 * lenta cada `getDirectoryHandle` custa caro). O mapa guarda a PROMESSA da pasta (chave: o
 * caminho, `proposals/P1`), para duas chamadas simultâneas não abrirem a mesma pasta duas vezes.
 * Só pastas abertas com sucesso ficam; um handle que o disco invalidou (pasta movida ou
 * apagada por fora) é descartado e a operação repete uma vez a partir da raiz.
 */
interface HandleCache {
  readonly root: DirectoryHandleLike;
  readonly dirs: Map<string, Promise<DirectoryHandleLike>>;
  /** Handle do `mapping.json`, guardado ao gravar ou ler (o carimbo dispensa o caminho). */
  mapping: FileHandleLike | null;
}

function createHandleCache(root: DirectoryHandleLike): HandleCache {
  return { root, dirs: new Map(), mapping: null };
}

/** Tira do mapa a pasta `path` e tudo o que há dentro dela. */
function forgetTree(cache: HandleCache, path: string): void {
  for (const key of [...cache.dirs.keys()]) {
    if (key === path || key.startsWith(`${path}/`)) cache.dirs.delete(key);
  }
}

/** Tira do mapa todas as pastas do caminho (e as de dentro da última): recomeça da raiz. */
function forgetChain(cache: HandleCache, dirs: readonly string[]): void {
  for (let i = 1; i < dirs.length; i++) cache.dirs.delete(dirs.slice(0, i).join('/'));
  if (dirs.length > 0) forgetTree(cache, dirs.join('/'));
}

function openDir(
  cache: HandleCache,
  key: string,
  parent: DirectoryHandleLike,
  name: string,
  create: boolean,
): Promise<DirectoryHandleLike> {
  const promise = parent.getDirectoryHandle(name, { create });
  cache.dirs.set(key, promise);
  promise.catch(() => {
    // Promessa rejeitada não fica no mapa; quem a esperava recebe o erro.
    if (cache.dirs.get(key) === promise) cache.dirs.delete(key);
  });
  return promise;
}

/** A pasta `key`: do mapa (`hit`) ou aberta agora a partir de `parent`. */
async function fetchDir(
  cache: HandleCache,
  key: string,
  parent: DirectoryHandleLike,
  name: string,
  create: boolean,
): Promise<{ dir: DirectoryHandleLike; hit: boolean }> {
  const pending = cache.dirs.get(key);
  if (pending) {
    try {
      return { dir: await pending, hit: true };
    } catch {
      // A abertura em curso de outra chamada falhou (talvez sem `create`): tenta a nossa.
    }
  }
  return { dir: await openDir(cache, key, parent, name, create), hit: false };
}

/**
 * Resolve as pastas do caminho usando o mapa. `trace.stored` diz se o último handle obtido
 * (ou, se a resolução falhar, o pai do passo que falhou) veio do mapa: só então um
 * "não existe" pode ser handle velho. Pasta inexistente sem `create`: `null`, sem guardar nada.
 */
async function resolveCached(
  cache: HandleCache,
  dirs: readonly string[],
  create: boolean,
  trace: { stored: boolean },
): Promise<DirectoryHandleLike | null> {
  let dir = cache.root;
  for (let i = 0; i < dirs.length; i++) {
    const key = dirs.slice(0, i + 1).join('/');
    try {
      const step = await fetchDir(cache, key, dir, dirs[i] as string, create);
      dir = step.dir;
      trace.stored = step.hit;
    } catch (e) {
      if (!create && isNotFound(e)) return null;
      throw e;
    }
  }
  return dir;
}

/**
 * Roda `op` com a pasta do caminho. Se o handle guardado estava velho (a resolução ou `op`
 * falham com "não existe" e o handle veio do mapa), esquece o caminho e repete UMA vez desde a
 * raiz. Um "não existe" legítimo numa pasta recém-aberta não repete. `op` deixa o
 * `NotFoundError` subir: quem trata o "arquivo não existe" é o chamador, depois daqui.
 */
async function withDir<T>(
  cache: HandleCache,
  dirs: readonly string[],
  create: boolean,
  op: (dir: DirectoryHandleLike | null) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const trace = { stored: false };
    const mayRetry = (): boolean => attempt === 0 && trace.stored;
    try {
      const dir = await resolveCached(cache, dirs, create, trace);
      if (dir === null && mayRetry()) {
        forgetChain(cache, dirs);
        continue;
      }
      return await op(dir);
    } catch (e) {
      if (!(mayRetry() && isNotFound(e))) throw e;
      forgetChain(cache, dirs);
    }
  }
}

/** Roda `fn` e devolve `null` se o que ele procurava não existe. */
async function orNull<T>(fn: () => Promise<T | null>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

async function readFile(cache: HandleCache, path: string): Promise<FileBlob | null> {
  const { dirs, name } = splitPath(path);
  return orNull(() =>
    withDir(cache, dirs, false, async (dir) =>
      dir ? (await dir.getFileHandle(name)).getFile() : null,
    ),
  );
}

/** Grava `data` em `path` (criando as pastas) e devolve o handle do arquivo gravado. */
async function writeFile(
  cache: HandleCache,
  path: string,
  data: Blob | string,
): Promise<FileHandleLike> {
  const { dirs, name } = splitPath(path);
  return withDir(cache, dirs, true, async (dir) => {
    if (!dir) throw new Error(`cannot create ${path}`);
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(data);
      await writable.close();
    } catch (e) {
      // Descarta a escrita pela metade: o arquivo continua com o conteúdo anterior.
      try {
        await writable.abort(e);
      } catch {
        // O gravável já pode estar fechado ou com erro; o que importa é a falha original.
      }
      throw e;
    }
    return handle;
  });
}

async function removeFile(cache: HandleCache, path: string): Promise<void> {
  const { dirs, name } = splitPath(path);
  await orNull(() =>
    withDir(cache, dirs, false, async (dir) => {
      await dir?.removeEntry(name);
      return null;
    }),
  );
}

/** Remove a pasta e tudo o que há nela. Não falha se ela (ou o pai) já não existe. */
async function removeDirectory(cache: HandleCache, path: string): Promise<void> {
  const { dirs, name } = splitPath(path);
  forgetTree(cache, [...dirs, name].join('/'));
  await orNull(() =>
    withDir(cache, dirs, false, async (parent) => {
      await parent?.removeEntry(name, { recursive: true });
      return null;
    }),
  );
}

/** Caminhos de todos os arquivos sob `dir` (recursivo), relativos à raiz, em ordem alfabética. */
async function listFiles(cache: HandleCache, dir: string): Promise<string[]> {
  const { dirs, name } = splitPath(dir);
  const all = [...dirs, name];
  const found = await withDir(cache, all, false, async (start) => {
    if (!start) return null;
    const files: string[] = [];
    const walk = async (handle: DirectoryHandleLike, prefix: string): Promise<void> => {
      for await (const entry of handle.values()) {
        if (entry.kind === 'file') files.push(`${prefix}${entry.name}`);
        else await walk(entry, `${prefix}${entry.name}/`);
      }
    };
    await walk(start, `${all.join('/')}/`);
    return files;
  });
  return found ? found.sort() : [];
}

async function removeProposalDir(cache: HandleCache, id: string): Promise<void> {
  // Um id fora do padrão apontaria para outra pasta (ou para `proposals/` inteira).
  if (!PROPOSAL_ID_RE.test(id)) throw new Error(`invalid proposal id: ${id}`);
  await removeDirectory(cache, proposalDir(id));
}

/** Lê o `mapping.json` pelo handle guardado (sem resolver o caminho); sem ele, pela raiz. */
async function readMapping(cache: HandleCache): Promise<FileBlob | null> {
  const stored = cache.mapping;
  if (stored) {
    try {
      return await stored.getFile();
    } catch (e) {
      cache.mapping = null;
      if (!isNotFound(e)) throw e;
    }
  }
  const handle = await orNull(async () => {
    const { dirs, name } = splitPath(MAPPING_FILE);
    return withDir(cache, dirs, false, (dir) => (dir ?? cache.root).getFileHandle(name));
  });
  if (!handle) return null;
  const file = await orNull(() => handle.getFile());
  if (file) cache.mapping = handle;
  return file;
}

async function listDirNames(
  cache: HandleCache,
  dirName: string[],
  pick: (entry: FileHandleLike | DirectoryHandleLike) => Promise<string | null>,
): Promise<string[]> {
  const ids = await withDir(cache, dirName, false, async (dir) => {
    if (!dir) return null;
    const names: string[] = [];
    for await (const entry of dir.values()) {
      const name = await pick(entry);
      if (name !== null) names.push(name);
    }
    return names;
  });
  return ids ? ids.sort() : [];
}

/**
 * A pasta tem `mapping.json`? Para conferir se ela é um projeto (abrir, Localizar) sem passar
 * pelo `loadMapping` de um `ProjectStorage`, que só a sessão usa. A pasta sumida conta como
 * sem projeto; outros erros sobem.
 */
export async function hasMappingFile(root: DirectoryHandleLike): Promise<boolean> {
  return (await readFile(createHandleCache(root), MAPPING_FILE)) !== null;
}

/**
 * Projeto numa pasta do disco. Cada gravação vai direto para o arquivo. `copyId`: a cópia do
 * projeto (ver `ProjectStorage.copyId`), dada pelo controller antes de a sessão abrir.
 */
export function createFolderStorage(
  root: DirectoryHandleLike,
  options: { readonly copyId?: string } = {},
): ProjectStorage {
  const cache = createHandleCache(root);
  const read = (path: string) => readFile(cache, path);
  const readText = async (path: string) => (await read(path))?.text() ?? null;
  const stamp = async (path: string) => {
    const file = await read(path);
    return file ? `${file.size}:${file.lastModified ?? 0}` : null;
  };
  const write = async (path: string, data: Blob | string) => {
    await writeFile(cache, path, data);
  };
  return {
    kind: 'folder',
    folderName: root.name,
    ...(options.copyId === undefined ? {} : { copyId: options.copyId }),
    async loadMapping() {
      return (await readMapping(cache))?.text() ?? null;
    },
    async loadMappingStamped() {
      const file = await readMapping(cache);
      return file
        ? { text: await file.text(), lastModified: file.lastModified ?? 0 }
        : null;
    },
    async saveMapping(text) {
      cache.mapping = await writeFile(cache, MAPPING_FILE, text);
    },
    async statMapping() {
      const file = await readMapping(cache);
      return file ? (file.lastModified ?? 0) : null;
    },
    readImage: read,
    statImage: stamp,
    writeImage: write,
    listImages: () =>
      listDirNames(cache, [IMAGES_DIR], async (entry) =>
        entry.kind === 'file' ? `${IMAGES_DIR}/${entry.name}` : null,
      ),
    removeImage: (path) => removeFile(cache, path),
    async readSpec(path) {
      assertSpecPath(path, 'file');
      return readText(path);
    },
    async writeSpec(path, text) {
      assertSpecPath(path, 'file');
      await write(path, text);
    },
    async removeSpec(path) {
      assertSpecPath(path, 'file');
      await removeFile(cache, path);
    },
    async listSpecDir(dir) {
      assertSpecPath(dir, 'dir');
      return listFiles(cache, dir);
    },
    async readSpecFile(path) {
      assertSpecPath(path, 'package');
      return read(path);
    },
    async writeSpecFile(path, data) {
      assertSpecPath(path, 'package');
      await write(path, data);
    },
    async removeSpecFile(path) {
      assertSpecPath(path, 'package');
      await removeFile(cache, path);
    },
    async removeSpecDir(dir) {
      assertSpecPath(dir, 'dir');
      await removeDirectory(cache, dir);
    },
    listProposals: () =>
      listDirNames(cache, [PROPOSALS_DIR], async (entry) => {
        if (entry.kind !== 'directory' || !PROPOSAL_ID_RE.test(entry.name)) return null;
        return (await orNull(() => entry.getFileHandle(PROPOSAL_FILE)))
          ? entry.name
          : null;
      }),
    readProposal: (id) => readText(proposalFilePath(id)),
    writeProposal: (id, text) => write(proposalFilePath(id), text),
    removeProposal: (id) => removeProposalDir(cache, id),
    async listProposalFiles(id) {
      if (!PROPOSAL_ID_RE.test(id)) throw new Error(`invalid proposal id: ${id}`);
      return listFiles(cache, proposalDir(id));
    },
    statProposal: (id) => stamp(proposalFilePath(id)),
    listThreads: (resolved) =>
      listDirNames(
        cache,
        resolved ? RESOLVED_DIR.split('/') : [COMMENTS_DIR],
        async (entry) => (entry.kind === 'file' ? threadIdOfFileName(entry.name) : null),
      ),
    async readThread(id, resolved) {
      assertThreadId(id);
      return readText(threadFilePath(id, resolved));
    },
    async writeThread(id, resolved, text) {
      assertThreadId(id);
      await write(threadFilePath(id, resolved), text);
    },
    async removeThread(id, resolved) {
      assertThreadId(id);
      await removeFile(cache, threadFilePath(id, resolved));
    },
    async statThread(id, resolved) {
      assertThreadId(id);
      return stamp(threadFilePath(id, resolved));
    },
    writeBackup: (name, text) => write(`${BACKUPS_DIR}/${name}`, text),
  };
}

/**
 * Garante `backups/` no `.gitignore` da raiz, para quem versiona o projeto com git: cria o
 * arquivo, ou acrescenta a linha ao que já existe (nunca sobrescreve nem duplica; o texto vem
 * de `gitignoreWithBackups`, o mesmo do `create_project` do MCP). Devolve `true` se gravou.
 */
export async function ensureGitignore(root: DirectoryHandleLike): Promise<boolean> {
  const cache = createHandleCache(root);
  const current = await readFile(cache, GITIGNORE_FILE);
  const next = gitignoreWithBackups(current ? await current.text() : '');
  if (next === null) return false;
  await writeFile(cache, GITIGNORE_FILE, next);
  return true;
}

export interface ExistingImage {
  /** Caminho atual, relativo à raiz (`foto.jpg` ou `images/foto.jpg`). */
  readonly path: string;
  readonly name: string;
}

/** Imagens já presentes em `images/` e na raiz da pasta, em ordem alfabética. */
export async function findExistingImages(
  root: DirectoryHandleLike,
): Promise<ExistingImage[]> {
  const list = async (dir: DirectoryHandleLike, prefix: string) => {
    const found: ExistingImage[] = [];
    for await (const entry of dir.values()) {
      if (entry.kind === 'file' && isImageFileName(entry.name)) {
        found.push({ path: `${prefix}${entry.name}`, name: entry.name });
      }
    }
    return found.sort((a, b) => a.name.localeCompare(b.name));
  };
  const imagesDir = await resolveCached(createHandleCache(root), [IMAGES_DIR], false, {
    stored: false,
  });
  const inImages = imagesDir ? await list(imagesDir, `${IMAGES_DIR}/`) : [];
  return [...inImages, ...(await list(root, ''))];
}
