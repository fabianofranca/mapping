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
import { mapLimit } from '../utils/mapLimit';
import { FOLDER_CONCURRENCY } from './folderConcurrency';
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

// Subset of the File System Access API used by the app. Typed separately so as not to
// depend on the browser's definitions and to allow mocks in tests.

export interface WritableLike {
  write(data: Blob | string): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
}

export interface FileHandleLike {
  readonly kind: 'file';
  readonly name: string;
  /** The real `File` has `lastModified`; test mocks may return just a `Blob`. */
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
 * Handle that can be stored and reopened on another visit (recent folders): the browser
 * asks for permission again on a click, and `isSameEntry` avoids the same folder twice.
 */
export interface ReopenableDirectory extends DirectoryHandleLike {
  queryPermission(descriptor: { mode: 'readwrite' }): Promise<FolderPermission>;
  requestPermission(descriptor: { mode: 'readwrite' }): Promise<FolderPermission>;
  isSameEntry(other: DirectoryHandleLike): Promise<boolean>;
}

/** Does the browser offer what the recent folders need on this handle? */
export function isReopenable(handle: DirectoryHandleLike): handle is ReopenableDirectory {
  return ['queryPermission', 'requestPermission', 'isSameEntry'].every(
    (method) => typeof Reflect.get(handle, method) === 'function',
  );
}

/**
 * Is the folder in the origin's private storage (OPFS, `navigator.storage.getDirectory()`)?
 * The folder picker never returns one (it is invisible to the person); only tests use it
 * in its place. It does not go into the recents: in Chromium, reading an OPFS handle back
 * from IndexedDB crashes the page. Without OPFS (or on `file://`, where it refuses): `false`.
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
 * Read and write on the folder: queries and, if needed, asks for permission. Call it in the
 * click itself, without a long wait before (reading the handle from IndexedDB fits within the
 * gesture activation): `requestPermission` only opens the browser dialog inside a user gesture.
 * `observe`: each answer (query and, when there was one, request), for the Open trace.
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

/** `showDirectoryPicker` exists and the page is not in an iframe (where it is blocked). */
export function isFolderModeSupported(): boolean {
  try {
    return directoryPicker() !== null && window.self === window.top;
  } catch {
    return false;
  }
}

/** Opens the folder picker. `null` if the user cancels. */
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

/** The folder (or the file) no longer exists: moved, renamed or deleted. */
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
 * Handles already open, to avoid walking the path from the root on every call (on a slow
 * folder each `getDirectoryHandle` is expensive). The map holds the folder's PROMISE (key: the
 * path, `proposals/P1`), so two simultaneous calls do not open the same folder twice.
 * Only successfully opened folders stay; a handle that the disk invalidated (folder moved or
 * deleted externally) is discarded and the operation retries once from the root.
 */
interface HandleCache {
  readonly root: DirectoryHandleLike;
  readonly dirs: Map<string, Promise<DirectoryHandleLike>>;
  /** Handle of `mapping.json`, kept on write or read (the stamp makes the path unnecessary). */
  mapping: FileHandleLike | null;
}

function createHandleCache(root: DirectoryHandleLike): HandleCache {
  return { root, dirs: new Map(), mapping: null };
}

/** Removes folder `path` and everything inside it from the map. */
function forgetTree(cache: HandleCache, path: string): void {
  for (const key of [...cache.dirs.keys()]) {
    if (key === path || key.startsWith(`${path}/`)) cache.dirs.delete(key);
  }
}

/** Removes all the folders of the path from the map (and those inside the last one): restarts from the root. */
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
    // A rejected promise does not stay in the map; whoever was waiting for it gets the error.
    if (cache.dirs.get(key) === promise) cache.dirs.delete(key);
  });
  return promise;
}

/** The folder `key`: from the map (`hit`) or opened now from `parent`. */
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
      // The other call's in-progress open failed (maybe without `create`): try ours.
    }
  }
  return { dir: await openDir(cache, key, parent, name, create), hit: false };
}

/**
 * Resolves the path's folders using the map. `trace.stored` says whether the last handle obtained
 * (or, if resolution fails, the parent of the step that failed) came from the map: only then can a
 * "does not exist" be a stale handle. Nonexistent folder without `create`: `null`, storing nothing.
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
 * Runs `op` with the path's folder. If the stored handle was stale (the resolution or `op`
 * fail with "does not exist" and the handle came from the map), forgets the path and retries ONCE
 * from the root. A legitimate "does not exist" on a freshly opened folder does not retry. `op` lets
 * the `NotFoundError` bubble up: the caller handles the "file does not exist", after this.
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

/**
 * Runs `fn` and returns `null` if what it was looking for does not exist, or `undefined` if the
 * call failed for another reason (file in use, permission): the caller decides between treating
 * it as absent and trying again later, instead of the error taking down a whole batch.
 */
async function orUndefined<T>(
  fn: () => Promise<T | null>,
): Promise<T | null | undefined> {
  try {
    return await fn();
  } catch (e) {
    return isNotFound(e) ? null : undefined;
  }
}

/** Runs `fn` and returns `null` if what it was looking for does not exist. */
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

/** Writes `data` to `path` (creating the folders) and returns the handle of the written file. */
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
      // Discards the half-done write: the file keeps its previous content.
      try {
        await writable.abort(e);
      } catch {
        // The writable may already be closed or errored; what matters is the original failure.
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

/** Removes the folder and everything in it. Does not fail if it (or the parent) no longer exists. */
async function removeDirectory(cache: HandleCache, path: string): Promise<void> {
  const { dirs, name } = splitPath(path);
  const tree = [...dirs, name].join('/');
  forgetTree(cache, tree);
  try {
    await orNull(() =>
      withDir(cache, dirs, false, async (parent) => {
        await parent?.removeEntry(name, { recursive: true });
        return null;
      }),
    );
  } finally {
    // A concurrent operation may have reopened and stored the folder during the removal.
    forgetTree(cache, tree);
  }
}

/** Paths of all the files under `dir` (recursive), relative to the root, in alphabetical order. */
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
  // An id outside the pattern would point to another folder (or to the whole `proposals/`).
  if (!PROPOSAL_ID_RE.test(id)) throw new Error(`invalid proposal id: ${id}`);
  await removeDirectory(cache, proposalDir(id));
}

/** Reads `mapping.json` through the stored handle (without resolving the path); without it, from the root. */
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

/**
 * Walks a folder once (`values()`) and returns what `pick` finds in each entry (the ones that
 * return `null` are left out), with up to `concurrency` checks at the same time. Folder that
 * does not exist: `[]`. The order is that of the `mapLimit` result (the listing's).
 */
async function mapDirEntries<T>(
  cache: HandleCache,
  dirName: string[],
  pick: (entry: FileHandleLike | DirectoryHandleLike) => Promise<T | null>,
  concurrency = 1,
): Promise<T[]> {
  const found = await withDir(cache, dirName, false, async (dir) => {
    if (!dir) return null;
    const entries: (FileHandleLike | DirectoryHandleLike)[] = [];
    for await (const entry of dir.values()) entries.push(entry);
    const picked = await mapLimit(entries, concurrency, (entry) => pick(entry));
    const kept: T[] = [];
    for (const item of picked) if (item !== null) kept.push(item);
    return kept;
  });
  return found ?? [];
}

async function listDirNames(
  cache: HandleCache,
  dirName: string[],
  pick: (entry: FileHandleLike | DirectoryHandleLike) => Promise<string | null>,
  /** How many `pick` checks run at the same time. */
  concurrency = 1,
): Promise<string[]> {
  return (await mapDirEntries(cache, dirName, pick, concurrency)).sort();
}

/** The stamp of a file (size and `lastModified`), the same that `statProposal` returns. */
const stampOfFile = (file: FileBlob): string => `${file.size}:${file.lastModified ?? 0}`;

/** `[id, stamp]` pairs in alphabetical order of the id, as a `Map`. */
function sortedStamps<V>(pairs: readonly (readonly [string, V])[]): Map<string, V> {
  return new Map([...pairs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/**
 * Does the folder have `mapping.json`? To check whether it is a project (open, Find) without going
 * through the `loadMapping` of a `ProjectStorage`, which only the session uses. A vanished folder counts
 * as without a project; other errors bubble up.
 */
export async function hasMappingFile(root: DirectoryHandleLike): Promise<boolean> {
  return (await readFile(createHandleCache(root), MAPPING_FILE)) !== null;
}

/**
 * Project in a folder on disk. Each write goes straight to the file. `copyId`: the project's
 * copy (see `ProjectStorage.copyId`), given by the controller before the session opens.
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
    return file ? stampOfFile(file) : null;
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
      listDirNames(
        cache,
        [PROPOSALS_DIR],
        async (entry) => {
          if (entry.kind !== 'directory' || !PROPOSAL_ID_RE.test(entry.name)) return null;
          return (await orNull(() => entry.getFileHandle(PROPOSAL_FILE)))
            ? entry.name
            : null;
        },
        FOLDER_CONCURRENCY,
      ),
    readProposal: (id) => readText(proposalFilePath(id)),
    writeProposal: (id, text) => write(proposalFilePath(id), text),
    removeProposal: (id) => removeProposalDir(cache, id),
    async listProposalFiles(id) {
      if (!PROPOSAL_ID_RE.test(id)) throw new Error(`invalid proposal id: ${id}`);
      return listFiles(cache, proposalDir(id));
    },
    statProposal: (id) => stamp(proposalFilePath(id)),
    async stampProposals(skip) {
      const pairs = await mapDirEntries<readonly [string, string | null]>(
        cache,
        [PROPOSALS_DIR],
        async (entry) => {
          if (entry.kind !== 'directory' || !PROPOSAL_ID_RE.test(entry.name)) return null;
          if (skip?.has(entry.name)) return [entry.name, null];
          // Through the entry's own handle: no resolving `proposals/<id>/` again.
          const handle = await orNull(() => entry.getFileHandle(PROPOSAL_FILE));
          // Without `proposal.json`: left out, as in `listProposals`. Unreadable for another
          // reason (a cloud client holding the file): present, without a stamp — the
          // scan rereads it, instead of the whole batch failing.
          if (!handle) return null;
          const file = await orUndefined(() => handle.getFile());
          if (file === null) return null;
          return [entry.name, file === undefined ? null : stampOfFile(file)];
        },
        FOLDER_CONCURRENCY,
      );
      return sortedStamps(pairs);
    },
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
    async stampThreads(resolved) {
      const pairs = await mapDirEntries<readonly [string, string | null]>(
        cache,
        resolved ? RESOLVED_DIR.split('/') : [COMMENTS_DIR],
        async (entry) => {
          const id = entry.kind === 'file' ? threadIdOfFileName(entry.name) : null;
          if (entry.kind !== 'file' || id === null) return null;
          // Through the entry's own handle. A file that vanished midway is left out; the
          // one unreadable for another reason comes back present, without a stamp (the scan rereads it), so
          // a locked thread does not look deleted nor take down the batch.
          const file = await orUndefined(() => entry.getFile());
          if (file === null) return null;
          return [id, file === undefined ? null : stampOfFile(file)];
        },
        FOLDER_CONCURRENCY,
      );
      return sortedStamps(pairs);
    },
    writeBackup: (name, text) => write(`${BACKUPS_DIR}/${name}`, text),
  };
}

/**
 * Ensures `backups/` is in the root `.gitignore`, for those who version the project with git: creates the
 * file, or appends the line to the existing one (never overwrites or duplicates; the text comes
 * from `gitignoreWithBackups`, the same as the MCP's `create_project`). Returns `true` if it wrote.
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
  /** Current path, relative to the root (`photo.jpg` or `images/photo.jpg`). */
  readonly path: string;
  readonly name: string;
}

/** Images already present in `images/` and at the folder root, in alphabetical order. */
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
