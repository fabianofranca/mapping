import { openDB, type DBSchema } from 'idb';
import { channelDbName } from '../utils/channel';
import { reportError } from '../utils/report';
import type { FolderPermission } from './folder';
import { withTimeout } from './local';

// Folders of the document repositories (`docRepos` of the specialization, schema v14): the `doc` of
// a type can point to a `.md` that lives in an external repository. The app reads that file from the
// clone folder that the person connects once per machine (`showDirectoryPicker`); the handle
// stays in IndexedDB, in a database of its own, with the repository's normalized `url` as the key. It
// never goes to `mapping.json`. The in-memory `Map` keeps everything too: without IndexedDB (or
// if it does not open), the folder lasts until the tab closes.

const DB_NAME = channelDbName('mapping-doc-folders');
const DB_VERSION = 1;

/** Subset of `FileSystemDirectoryHandle` that document reading uses. */
export interface DocDirectoryHandle {
  getDirectoryHandle(name: string): Promise<DocDirectoryHandle>;
  getFileHandle(
    name: string,
  ): Promise<{ getFile(): Promise<{ text(): Promise<string> }> }>;
  /** Absent on handles the browser cannot query: the read is attempted anyway. */
  queryPermission?(descriptor: { mode: 'read' }): Promise<FolderPermission>;
  requestPermission?(descriptor: { mode: 'read' }): Promise<FolderPermission>;
}

export type DocReadResult =
  | { status: 'found'; text: string }
  | { status: 'no-folder' }
  /** `queryPermission` != `granted` (prompt or denied): the person must allow again. */
  | { status: 'permission' }
  /** Nonexistent file or subfolder, or one that could not be read. */
  | { status: 'missing' };

export interface DocFolderAccess {
  /** `showDirectoryPicker` exists in this browser. */
  supported(): boolean;
  read(repoUrl: string, path: string): Promise<DocReadResult>;
  /** Opens the picker (can only be called from a click) and keeps the folder; `false` if cancelled or failed. */
  pick(repoUrl: string): Promise<boolean>;
  /** `requestPermission({ mode: 'read' })` (also only from a click); `true` if granted. */
  request(repoUrl: string): Promise<boolean>;
}

/** The folders' database, behind a small interface for the tests. */
export interface DocFolderStore {
  get(key: string): Promise<DocDirectoryHandle | undefined>;
  put(key: string, handle: DocDirectoryHandle): Promise<void>;
}

export interface DocFolderDeps {
  readonly picker?: () => Promise<DocDirectoryHandle>;
  /** Opens the database; `null` if there is none. Called once, on first need. */
  readonly openStore?: () => Promise<DocFolderStore | null>;
}

/**
 * Key of a repository: the `url` without spaces at the ends, without trailing `/` and without the `.git`
 * suffix (`https://x.com/a/b.git/` → `https://x.com/a/b`).
 */
export function normalizeRepoUrl(url: string): string {
  const trimSlashes = (s: string) => s.replace(/\/+$/, '');
  return trimSlashes(trimSlashes(url.trim()).replace(/\.git$/, ''));
}

interface DocFoldersSchema extends DBSchema {
  folders: { key: string; value: DocDirectoryHandle };
}

async function openIdbStore(): Promise<DocFolderStore | null> {
  // Without IndexedDB `openDB` throws: `getStore` logs it and goes on with memory only.
  const db = await withTimeout(
    openDB<DocFoldersSchema>(DB_NAME, DB_VERSION, {
      upgrade(upgrading) {
        upgrading.createObjectStore('folders');
      },
    }),
  );
  if (!db) return null;
  return {
    get: (key) => db.get('folders', key),
    put: async (key, handle) => {
      await db.put('folders', handle, key);
    },
  };
}

function defaultPicker(): (() => Promise<DocDirectoryHandle>) | null {
  const picker: unknown = Reflect.get(globalThis, 'showDirectoryPicker');
  if (typeof picker !== 'function') return null;
  return () => picker.call(globalThis) as Promise<DocDirectoryHandle>;
}

/** Each segment of the path; `null` if empty, with `..` or without a file name. */
function pathSegments(path: string): string[] | null {
  const parts = path.split('/').filter((s) => s !== '' && s !== '.');
  if (parts.length === 0 || parts.includes('..')) return null;
  return parts;
}

async function readText(root: DocDirectoryHandle, path: string): Promise<DocReadResult> {
  const parts = pathSegments(path);
  if (parts === null) return { status: 'missing' };
  try {
    const name = parts.pop() ?? '';
    let dir = root;
    for (const part of parts) dir = await dir.getDirectoryHandle(part);
    const file = await (await dir.getFileHandle(name)).getFile();
    return { status: 'found', text: await file.text() };
  } catch {
    // Nonexistent (NotFoundError, TypeMismatchError) or unreadable: the document does not appear.
    return { status: 'missing' };
  }
}

async function isGranted(handle: DocDirectoryHandle): Promise<boolean> {
  if (typeof handle.queryPermission !== 'function') return true;
  try {
    return (await handle.queryPermission({ mode: 'read' })) === 'granted';
  } catch {
    return false;
  }
}

/** Creates the access to the document repositories' folders; `deps` swaps the picker and the database (tests). */
export function createDocFolderAccess(deps: DocFolderDeps = {}): DocFolderAccess {
  const memory = new Map<string, DocDirectoryHandle>();
  const picker = deps.picker ?? defaultPicker();
  let store: Promise<DocFolderStore | null> | null = null;

  const getStore = (): Promise<DocFolderStore | null> => {
    store ??= (deps.openStore ?? openIdbStore)().catch((e: unknown) => {
      reportError('docFolders.open', e);
      return null;
    });
    return store;
  };

  const handleOf = async (key: string): Promise<DocDirectoryHandle | null> => {
    const known = memory.get(key);
    if (known) return known;
    try {
      const stored = await (await getStore())?.get(key);
      if (stored) memory.set(key, stored);
      return stored ?? null;
    } catch (e) {
      reportError('docFolders.get', e);
      return null;
    }
  };

  const remember = async (key: string, handle: DocDirectoryHandle): Promise<void> => {
    memory.set(key, handle);
    try {
      await (await getStore())?.put(key, handle);
    } catch (e) {
      // Without writing, the folder lasts until the tab closes.
      reportError('docFolders.put', e);
    }
  };

  return {
    supported: () => picker !== null,

    async read(repoUrl, path) {
      const handle = await handleOf(normalizeRepoUrl(repoUrl));
      if (!handle) return { status: 'no-folder' };
      if (!(await isGranted(handle))) return { status: 'permission' };
      return readText(handle, path);
    },

    async pick(repoUrl) {
      if (!picker) return false;
      try {
        await remember(normalizeRepoUrl(repoUrl), await picker());
        return true;
      } catch {
        // Cancelled (AbortError) or the browser refused: nothing changed.
        return false;
      }
    },

    async request(repoUrl) {
      const handle = await handleOf(normalizeRepoUrl(repoUrl));
      if (typeof handle?.requestPermission !== 'function') return false;
      try {
        return (await handle.requestPermission({ mode: 'read' })) === 'granted';
      } catch {
        return false;
      }
    },
  };
}

/** The app instance. */
export const docFolderAccess: DocFolderAccess = createDocFolderAccess();
