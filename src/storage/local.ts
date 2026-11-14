import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { channelDbName } from '../utils/channel';
import type { ReopenableDirectory } from './folder';
import type { ProjectFiles } from './zip';
import { PROPOSAL_ID_RE, proposalDir, proposalFilePath, threadFilePath } from '../model';
import {
  BACKUPS_DIR,
  IMAGES_DIR,
  assertSpecPath,
  assertThreadId,
  backupTimestamp,
  isProposalFilePath,
  proposalIdOfPath,
  threadLocationOfPath,
  type ProjectStorage,
} from './types';
import { reportError } from '../utils/report';

/** The preview uses another database (`-preview`): it never sees the main version's projects. */
// The database name remains the one from before the rename to "Mapping": changing it would make the
// local projects already saved in users' browsers vanish without a migration.
const DB_NAME = channelDbName('mapeador-imagens');
const DB_VERSION = 1;
/** Maximum time to open the database (on `file://` some browsers never answer). */
const OPEN_TIMEOUT_MS = 3000;
/** The copies of `specs/` and the backups live in the same store as the images, with this type. */
const SPEC_TYPE = 'application/json';
/** Backups of the `mapping.json` kept per project (the most recent ones). */
export const MAX_LOCAL_BACKUPS = 3;
const BACKUP_PREFIX = `${BACKUPS_DIR}/`;

/** Most recent first. */
function byNewestBackup(a: string, b: string): number {
  return backupTimestamp(b).localeCompare(backupTimestamp(a)) || b.localeCompare(a);
}

/** Summary of a project saved on this device. */
export interface LocalProjectMeta {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
  /** There are changes since the last export (or the project was never exported). */
  readonly unexported: boolean;
  /** Last opening (ISO 8601), for the recents list; absent if never reopened. */
  readonly openedAt?: string;
}

interface StoredFile {
  readonly projectId: string;
  readonly path: string;
  readonly type: string;
  // ArrayBuffer instead of Blob: Safari has had several problems with Blob in IndexedDB.
  readonly data: ArrayBuffer;
}

interface Schema extends DBSchema {
  projects: { key: string; value: LocalProjectMeta };
  mappings: { key: string; value: string };
  files: {
    key: [string, string];
    value: StoredFile;
    indexes: { byProject: string };
  };
}

type Db = IDBPDatabase<Schema>;

/** Name and date read from the text of the `mapping.json`, for the project list. */
function readInfo(mapping: string): { name?: string; updatedAt?: string } {
  try {
    const raw: unknown = JSON.parse(mapping);
    const project: unknown =
      typeof raw === 'object' && raw !== null ? Reflect.get(raw, 'project') : null;
    if (typeof project !== 'object' || project === null) return {};
    const name: unknown = Reflect.get(project, 'name');
    const updatedAt: unknown = Reflect.get(project, 'updatedAt');
    return {
      ...(typeof name === 'string' ? { name } : {}),
      ...(typeof updatedAt === 'string' ? { updatedAt } : {}),
    };
  } catch {
    // Optional metadata: an unreadable `mapping.json` shows up without a name in the list.
    return {};
  }
}

async function toStoredFile(
  projectId: string,
  path: string,
  data: Blob,
): Promise<StoredFile> {
  return { projectId, path, type: data.type, data: await data.arrayBuffer() };
}

export interface LocalProjectStorage extends ProjectStorage {
  readonly kind: 'local';
  readonly id: string;
}

/** Projects saved in this browser's IndexedDB. */
export interface LocalLibrary {
  /** The projects, unordered: the home screen order is that of `recentProjects` (last use). */
  list(): Promise<LocalProjectMeta[]>;
  get(id: string): Promise<LocalProjectMeta | undefined>;
  /** Creates the project with the given `mapping.json` and images. */
  create(
    id: string,
    files: ProjectFiles,
    options?: { unexported?: boolean },
  ): Promise<void>;
  open(id: string): LocalProjectStorage;
  remove(id: string): Promise<void>;
  setUnexported(id: string, unexported: boolean): Promise<void>;
  /** Records the opening (`openedAt`), for the order of the recents. */
  markOpened(id: string, openedAt: string): Promise<void>;
  /** Names of the project's `mapping.json` backups, from the most recent to the oldest. */
  listBackups(id: string): Promise<string[]>;
  close(): void;
}

function createLibrary(db: Db): LocalLibrary {
  return {
    list: () => db.getAll('projects'),

    get: (id) => db.get('projects', id),

    async create(id, files, options = {}) {
      // Convert before opening the transaction: it closes if it waits for anything else.
      const stored = await Promise.all([
        ...[...files.images].map(([path, blob]) => toStoredFile(id, path, blob)),
        // The package files first: the same path in `specs` (text) prevails.
        ...[...(files.specAssets ?? [])].map(([path, blob]) =>
          toStoredFile(id, path, blob),
        ),
        ...[...files.specs, ...files.proposals, ...(files.threads ?? [])].map(
          ([path, text]) => toStoredFile(id, path, new Blob([text], { type: SPEC_TYPE })),
        ),
        ...[...files.proposalImages].map(([path, blob]) => toStoredFile(id, path, blob)),
      ]);
      const info = readInfo(files.mapping);
      const tx = db.transaction(['projects', 'mappings', 'files'], 'readwrite');
      await Promise.all([
        tx.objectStore('projects').put({
          id,
          name: info.name ?? '',
          updatedAt: info.updatedAt ?? new Date().toISOString(),
          unexported: options.unexported ?? true,
          // Creating or importing a zip counts as use: the project goes to the top of the recents,
          // and `updatedAt` remains the date from inside the zip (G2, stage 7).
          openedAt: new Date().toISOString(),
        }),
        tx.objectStore('mappings').put(files.mapping, id),
        ...stored.map((f) => tx.objectStore('files').put(f)),
        tx.done,
      ]);
    },

    open(id) {
      return {
        kind: 'local',
        id,
        // The local project's copy is itself (`ProjectStorage.copyId`).
        copyId: id,
        async loadMapping() {
          return (await db.get('mappings', id)) ?? null;
        },
        async saveMapping(text) {
          const tx = db.transaction(['projects', 'mappings'], 'readwrite');
          const meta = await tx.objectStore('projects').get(id);
          if (!meta) throw new Error(`local project not found: ${id}`);
          await Promise.all([
            tx
              .objectStore('projects')
              .put({ ...meta, ...readInfo(text), unexported: true }),
            tx.objectStore('mappings').put(text, id),
            tx.done,
          ]);
        },
        async readImage(path) {
          const file = await db.get('files', [id, path]);
          return file ? new Blob([file.data], { type: file.type }) : null;
        },
        async writeImage(path, data) {
          await db.put('files', await toStoredFile(id, path, data));
        },
        async listImages() {
          const prefix = `${IMAGES_DIR}/`;
          const keys = await db.getAllKeys('files', prefixRange(id, prefix));
          return keys
            .map(([, path]) => path)
            .filter((path) => !path.includes('/', prefix.length))
            .sort();
        },
        async removeImage(path) {
          await db.delete('files', [id, path]);
        },
        async readSpec(path) {
          assertSpecPath(path, 'file');
          const file = await db.get('files', [id, path]);
          return file ? new Blob([file.data]).text() : null;
        },
        async writeSpec(path, text) {
          assertSpecPath(path, 'file');
          const blob = new Blob([text], { type: SPEC_TYPE });
          await db.put('files', await toStoredFile(id, path, blob));
        },
        async removeSpec(path) {
          assertSpecPath(path, 'file');
          await db.delete('files', [id, path]);
        },
        async listSpecDir(dir) {
          assertSpecPath(dir, 'dir');
          const prefix = `${dir}/`;
          const keys = await db.getAllKeys('files', prefixRange(id, prefix));
          return keys.map(([, path]) => path).sort();
        },
        async readSpecFile(path) {
          assertSpecPath(path, 'package');
          const file = await db.get('files', [id, path]);
          return file ? new Blob([file.data], { type: file.type }) : null;
        },
        async writeSpecFile(path, data) {
          assertSpecPath(path, 'package');
          const blob =
            typeof data === 'string' ? new Blob([data], { type: SPEC_TYPE }) : data;
          const stored = await toStoredFile(id, path, blob);
          const tx = db.transaction(['projects', 'files'], 'readwrite');
          const meta = await tx.objectStore('projects').get(id);
          if (!meta) throw new Error(`local project not found: ${id}`);
          await Promise.all([
            tx.objectStore('projects').put({ ...meta, unexported: true }),
            tx.objectStore('files').put(stored),
            tx.done,
          ]);
        },
        async removeSpecFile(path) {
          assertSpecPath(path, 'package');
          const tx = db.transaction(['projects', 'files'], 'readwrite');
          const meta = await tx.objectStore('projects').get(id);
          if (!meta) throw new Error(`local project not found: ${id}`);
          const files = tx.objectStore('files');
          const exists = (await files.getKey([id, path])) !== undefined;
          await Promise.all([
            ...(exists
              ? [
                  tx.objectStore('projects').put({ ...meta, unexported: true }),
                  files.delete([id, path]),
                ]
              : []),
            tx.done,
          ]);
        },
        async removeSpecDir(dir) {
          assertSpecPath(dir, 'dir');
          const prefix = `${dir}/`;
          const tx = db.transaction(['projects', 'files'], 'readwrite');
          const meta = await tx.objectStore('projects').get(id);
          if (!meta) throw new Error(`local project not found: ${id}`);
          const files = tx.objectStore('files');
          const doomed = await files.getAllKeys(prefixRange(id, prefix));
          await Promise.all([
            ...(doomed.length > 0
              ? [tx.objectStore('projects').put({ ...meta, unexported: true })]
              : []),
            ...doomed.map((key) => files.delete(key)),
            tx.done,
          ]);
        },
        async listProposals() {
          const keys = await db.getAllKeysFromIndex('files', 'byProject', id);
          const ids: string[] = [];
          for (const [, path] of keys) {
            const proposalId = isProposalFilePath(path) ? proposalIdOfPath(path) : null;
            if (proposalId !== null) ids.push(proposalId);
          }
          return ids.sort();
        },
        async readProposal(proposalId) {
          const file = await db.get('files', [id, proposalFilePath(proposalId)]);
          return file ? new Blob([file.data]).text() : null;
        },
        async writeProposal(proposalId, text) {
          const blob = new Blob([text], { type: SPEC_TYPE });
          const stored = await toStoredFile(id, proposalFilePath(proposalId), blob);
          // Deciding on a proposal is work to export, like saving the `mapping.json`.
          const tx = db.transaction(['projects', 'files'], 'readwrite');
          const meta = await tx.objectStore('projects').get(id);
          if (!meta) throw new Error(`local project not found: ${id}`);
          await Promise.all([
            tx.objectStore('projects').put({ ...meta, unexported: true }),
            tx.objectStore('files').put(stored),
            tx.done,
          ]);
        },
        async removeProposal(proposalId) {
          if (!PROPOSAL_ID_RE.test(proposalId)) {
            throw new Error(`invalid proposal id: ${proposalId}`);
          }
          const prefix = `${proposalDir(proposalId)}/`;
          // All in the same transaction: `proposals/<id>/…` (the `proposal.json` and the images).
          const tx = db.transaction(['projects', 'files'], 'readwrite');
          const meta = await tx.objectStore('projects').get(id);
          if (!meta) throw new Error(`local project not found: ${id}`);
          const files = tx.objectStore('files');
          const keys = await files.getAllKeys(prefixRange(id, prefix));
          await Promise.all([
            tx.objectStore('projects').put({ ...meta, unexported: true }),
            ...keys.map((key) => files.delete(key)),
            tx.done,
          ]);
        },
        async listProposalFiles(proposalId) {
          if (!PROPOSAL_ID_RE.test(proposalId)) {
            throw new Error(`invalid proposal id: ${proposalId}`);
          }
          const prefix = `${proposalDir(proposalId)}/`;
          const keys = await db.getAllKeys('files', prefixRange(id, prefix));
          return keys.map(([, path]) => path).sort();
        },
        async listThreads(resolved) {
          const keys = await db.getAllKeysFromIndex('files', 'byProject', id);
          const ids: string[] = [];
          for (const [, path] of keys) {
            const found = threadLocationOfPath(path);
            if (found !== null && found.resolved === resolved) ids.push(found.id);
          }
          return ids.sort();
        },
        async readThread(threadId, resolved) {
          assertThreadId(threadId);
          const file = await db.get('files', [id, threadFilePath(threadId, resolved)]);
          return file ? new Blob([file.data]).text() : null;
        },
        async writeThread(threadId, resolved, text) {
          assertThreadId(threadId);
          const blob = new Blob([text], { type: SPEC_TYPE });
          const stored = await toStoredFile(id, threadFilePath(threadId, resolved), blob);
          // Talking is work to export, like deciding on a proposal.
          const tx = db.transaction(['projects', 'files'], 'readwrite');
          const meta = await tx.objectStore('projects').get(id);
          if (!meta) throw new Error(`local project not found: ${id}`);
          await Promise.all([
            tx.objectStore('projects').put({ ...meta, unexported: true }),
            tx.objectStore('files').put(stored),
            tx.done,
          ]);
        },
        async removeThread(threadId, resolved) {
          assertThreadId(threadId);
          const key: [string, string] = [id, threadFilePath(threadId, resolved)];
          const tx = db.transaction(['projects', 'files'], 'readwrite');
          const meta = await tx.objectStore('projects').get(id);
          if (!meta) throw new Error(`local project not found: ${id}`);
          const files = tx.objectStore('files');
          const exists = (await files.getKey(key)) !== undefined;
          await Promise.all([
            ...(exists
              ? [
                  tx.objectStore('projects').put({ ...meta, unexported: true }),
                  files.delete(key),
                ]
              : []),
            tx.done,
          ]);
        },
        async writeBackup(name, text) {
          const blob = new Blob([text], { type: SPEC_TYPE });
          const stored = await toStoredFile(id, `${BACKUP_PREFIX}${name}`, blob);
          const tx = db.transaction('files', 'readwrite');
          await tx.store.put(stored);
          const keys = await tx.store.getAllKeys(prefixRange(id, BACKUP_PREFIX));
          const old = keys
            .map(([, path]) => path)
            .sort(byNewestBackup)
            .slice(MAX_LOCAL_BACKUPS);
          await Promise.all([...old.map((path) => tx.store.delete([id, path])), tx.done]);
        },
      };
    },

    async remove(id) {
      const tx = db.transaction(['projects', 'mappings', 'files'], 'readwrite');
      const files = tx.objectStore('files');
      const keys = await files.index('byProject').getAllKeys(id);
      await Promise.all([
        tx.objectStore('projects').delete(id),
        tx.objectStore('mappings').delete(id),
        ...keys.map((key) => files.delete(key)),
        tx.done,
      ]);
    },

    async setUnexported(id, unexported) {
      const tx = db.transaction('projects', 'readwrite');
      const meta = await tx.store.get(id);
      if (meta) await tx.store.put({ ...meta, unexported });
      await tx.done;
    },

    async markOpened(id, openedAt) {
      const tx = db.transaction('projects', 'readwrite');
      const meta = await tx.store.get(id);
      if (meta) await tx.store.put({ ...meta, openedAt });
      await tx.done;
    },

    async listBackups(id) {
      const keys = await db.getAllKeys('files', prefixRange(id, BACKUP_PREFIX));
      return keys
        .map(([, path]) => path.slice(BACKUP_PREFIX.length))
        .sort(byNewestBackup);
    },

    close: () => db.close(),
  };
}

/**
 * Opens the local database. Returns `null` if IndexedDB is not available
 * or does not respond (old private mode, `file://` in some browsers).
 */
export async function openLocalLibrary(): Promise<LocalLibrary | null> {
  try {
    if (typeof indexedDB === 'undefined') return null;
    const db = await withTimeout(
      openDB<Schema>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          db.createObjectStore('projects', { keyPath: 'id' });
          db.createObjectStore('mappings');
          const files = db.createObjectStore('files', { keyPath: ['projectId', 'path'] });
          files.createIndex('byProject', 'projectId');
        },
      }),
    );
    return db && createLibrary(db);
  } catch (e) {
    // Without IndexedDB the local mode is unavailable; the reason goes to the Diagnostics.
    reportError('local.open', e);
    return null;
  }
}

/**
 * Does the browser have IndexedDB? (Access to the global stays in this file: lint rule of phase
 * 8.4.)
 */
export function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * Primary key range (`[project, path]`) with all the project's paths that start
 * with `prefix`: IndexedDB hands over only those keys, without loading those of all the images.
 */
function prefixRange(projectId: string, prefix: string): IDBKeyRange {
  return IDBKeyRange.bound([projectId, prefix], [projectId, `${prefix}\uffff`]);
}

/** The database opening, or `null` if it takes longer than `OPEN_TIMEOUT_MS`. */
export async function withTimeout<T extends { close(): void }>(
  open: Promise<T>,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), OPEN_TIMEOUT_MS);
  });
  const db = await Promise.race([open, timeout]);
  clearTimeout(timer);
  if (!db) {
    // The opening took too long: if it finishes later, it just closes the connection.
    void open.then((late) => late.close()).catch(() => undefined);
  }
  return db;
}

// ---- Folder recents ----

/**
 * A separate database for the folder handles: creating a store in the local projects database
 * would ask for a new version, and an old open tab would block the update (the local mode
 * would vanish until it closed). Version 2: the handles left the list records for a store of
 * their own (version 1 only existed in preview; the update discards it).
 */
const FOLDERS_DB_NAME = channelDbName('mapping-folders');
const FOLDERS_DB_VERSION = 2;

/** Recently opened folder (the list row). The handle stays apart, in `handles`. */
export interface StoredFolder {
  readonly id: string;
  /** Name of the project the last time it was opened. */
  readonly name: string;
  /** Folder name (`handle.name`). */
  readonly folderName: string;
  /** Last use (ISO 8601). */
  readonly usedAt: string;
}

interface FoldersSchema extends DBSchema {
  folders: { key: string; value: StoredFolder };
  /** entry id → handle. Only the handle: the browser does not let you know the path. */
  handles: { key: string; value: ReopenableDirectory };
}

/** The open folders, in this browser's IndexedDB. */
export interface FolderLibrary {
  /**
   * From the most recent use to the oldest. Only the list data: no handle is read (a
   * handle the browser cannot reconstruct does not get in the way of the home screen).
   */
  list(): Promise<StoredFolder[]>;
  /** The handle of an entry (`null` if there is none). */
  handle(id: string): Promise<ReopenableDirectory | null>;
  /**
   * Saves the folder (or updates the entry of the same folder, by `isSameEntry`) and returns the
   * id.
   * With `replaceId` ("Locate folder…"), the `replaceId` entry comes to point to it.
   */
  remember(
    handle: ReopenableDirectory,
    info: { readonly name: string; readonly usedAt: string },
    replaceId?: string,
  ): Promise<string>;
  /** Updates the project name and the last use of an entry that still exists. */
  touch(
    id: string,
    info: { readonly name: string; readonly usedAt: string },
  ): Promise<void>;
  /** Removes from the list. Nothing on disk changes. */
  remove(id: string): Promise<void>;
  close(): void;
}

function createFolderLibrary(db: IDBPDatabase<FoldersSchema>): FolderLibrary {
  /** Does the saved entry point to the same folder? A handle that fails counts as no. */
  const sameFolder = async (id: string, handle: ReopenableDirectory) => {
    try {
      const stored = await db.get('handles', id);
      return stored ? await stored.isSameEntry(handle) : false;
    } catch {
      return false;
    }
  };

  return {
    async list() {
      const all = await db.getAll('folders');
      return all.sort((a, b) => b.usedAt.localeCompare(a.usedAt));
    },

    async handle(id) {
      return (await db.get('handles', id)) ?? null;
    },

    async remember(handle, info, replaceId) {
      // `isSameEntry` is asynchronous and does not fit in a transaction: compare before writing.
      // Only the entries with the same folder name can be the same: only their handles are read.
      const candidates = (await db.getAll('folders')).filter(
        (f) => f.folderName === handle.name,
      );
      let same: StoredFolder | undefined;
      for (const stored of candidates) {
        if (await sameFolder(stored.id, handle)) {
          same = stored;
          break;
        }
      }
      const id = same?.id ?? replaceId ?? crypto.randomUUID();
      const tx = db.transaction(['folders', 'handles'], 'readwrite');
      // The located folder was already in the list: the two entries become one.
      const merged = replaceId !== undefined && replaceId !== id ? replaceId : null;
      await Promise.all([
        tx
          .objectStore('folders')
          .put({ id, name: info.name, folderName: handle.name, usedAt: info.usedAt }),
        tx.objectStore('handles').put(handle, id),
        ...(merged === null
          ? []
          : [
              tx.objectStore('folders').delete(merged),
              tx.objectStore('handles').delete(merged),
            ]),
        tx.done,
      ]);
      return id;
    },

    async touch(id, info) {
      const tx = db.transaction('folders', 'readwrite');
      const stored = await tx.store.get(id);
      if (stored) await tx.store.put({ ...stored, ...info });
      await tx.done;
    },

    async remove(id) {
      const tx = db.transaction(['folders', 'handles'], 'readwrite');
      await Promise.all([
        tx.objectStore('folders').delete(id),
        tx.objectStore('handles').delete(id),
        tx.done,
      ]);
    },

    close: () => db.close(),
  };
}

/**
 * Opens the list of recent folders. `null` without IndexedDB (or if it does not respond): the home
 * screen has only this device's projects.
 */
export async function openFolderLibrary(): Promise<FolderLibrary | null> {
  try {
    if (typeof indexedDB === 'undefined') return null;
    const db = await withTimeout(
      openDB<FoldersSchema>(FOLDERS_DB_NAME, FOLDERS_DB_VERSION, {
        upgrade(db) {
          // From version 1 (handles inside the list records) nothing is reused: the
          // store is deleted without reading the records.
          for (const name of [...db.objectStoreNames]) db.deleteObjectStore(name);
          db.createObjectStore('folders', { keyPath: 'id' });
          db.createObjectStore('handles');
        },
      }),
    );
    return db && createFolderLibrary(db);
  } catch (e) {
    reportError('folders.open', e);
    return null;
  }
}

/** Asks the browser not to erase local data under storage pressure. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Without support or denied: the data is still there, just without the guarantee.
  }
}
