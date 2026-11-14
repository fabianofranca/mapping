// The home screen's recents (phase 8.4: moved out of the controller): the two databases (this
// device's projects and folders), the single list, remembering the open folder, reopening, Locate and Remove.
// The folder is remembered BEFORE the session opens (the controller calls `rememberFolder` between
// reading and opening): the entry id is the project's copy (`ProjectStorage.copyId`) and goes in the
// `OpenProject`, with no module state that a close in the middle would leave behind.
import { computed, signal } from '@preact/signals';
import {
  ensurePermission,
  hasMappingFile,
  isNotFound,
  isOriginPrivate,
  isReopenable,
  pickDirectory,
  type DirectoryHandleLike,
  type ReopenableDirectory,
} from '../storage/folder';
import {
  openFolderLibrary,
  openLocalLibrary,
  requestPersistentStorage,
  type FolderLibrary,
  type LocalLibrary,
  type LocalProjectMeta,
  type StoredFolder,
} from '../storage/local';
import { reportError } from '../utils/report';
import { readSessionSetting, writeSessionSetting } from '../utils/safeStorage';
import { err, guarded, ok, type AppResult } from './appResult';

/** A row of the home screen's list: a project on this device or a folder. */
export type RecentProject =
  | {
      readonly kind: 'local';
      readonly id: string;
      readonly name: string;
      /** Last use: the last change or the last opening, whichever is more recent. */
      readonly usedAt: string;
      readonly unexported: boolean;
    }
  | {
      readonly kind: 'folder';
      readonly id: string;
      readonly name: string;
      readonly folderName: string;
      /**
       * Show the folder name below the project name: it is different, or another folder in the
       * list has the same project name (without it, the two rows would look the same).
       */
      readonly showFolderName: boolean;
      readonly usedAt: string;
    };

let library: LocalLibrary | null = null;
let folderLibrary: FolderLibrary | null = null;
/**
 * Handles already in memory in this visit (folders opened now or already reopened), by entry
 * id: the click on Open goes straight to the permission request, without reading IndexedDB.
 */
const knownHandles = new Map<string, ReopenableDirectory>();

export const localProjects = signal<readonly LocalProjectMeta[]>([]);
/** Recently opened folders (only the list data; the handle is read on click). */
export const recentFolders = signal<readonly StoredFolder[]>([]);

const latest = (a: string, b: string | undefined): string =>
  b !== undefined && Date.parse(b) > Date.parse(a) ? b : a;

/** The single list, from most recent to oldest use (pure function of `recentProjects`). */
export function toRecentProjects(
  locals: readonly LocalProjectMeta[],
  folders: readonly StoredFolder[],
): RecentProject[] {
  const names = new Map<string, number>();
  for (const f of folders) names.set(f.name, (names.get(f.name) ?? 0) + 1);
  const rows: RecentProject[] = [
    ...folders.map((f): RecentProject => ({
      kind: 'folder',
      id: f.id,
      name: f.name,
      folderName: f.folderName,
      showFolderName: f.folderName !== f.name || (names.get(f.name) ?? 0) > 1,
      usedAt: f.usedAt,
    })),
    ...locals.map((p): RecentProject => ({
      kind: 'local',
      id: p.id,
      name: p.name,
      usedAt: latest(p.updatedAt, p.openedAt),
      unexported: p.unexported,
    })),
  ];
  const time = (p: RecentProject) => Date.parse(p.usedAt) || 0;
  return rows.sort((a, b) => time(b) - time(a));
}

/**
 * The home screen's single list. Without folder mode (browser without `showDirectoryPicker`, page
 * in an iframe) the folders database does not even open: only this device's projects.
 */
export const recentProjects = computed<readonly RecentProject[]>(() =>
  toRecentProjects(localProjects.value, recentFolders.value),
);

/** Opens the databases and loads the lists. `folderMode`: folder mode exists in this browser. */
export async function initRecents(folderMode: boolean): Promise<void> {
  [library, folderLibrary] = await Promise.all([
    openLocalLibrary(),
    folderMode ? openFolderLibrary() : null,
  ]);
  await Promise.all([refreshLocalProjects(), refreshRecentFolders()]);
}

/** The database of this device's projects (`null` without IndexedDB). */
export const localLibrary = (): LocalLibrary | null => library;

export async function refreshLocalProjects(): Promise<void> {
  try {
    localProjects.value = library ? await library.list() : [];
  } catch (e) {
    reportError('local.list', e);
    localProjects.value = [];
  }
}

export async function refreshRecentFolders(): Promise<void> {
  try {
    recentFolders.value = folderLibrary ? await folderLibrary.list() : [];
  } catch (e) {
    reportError('folders.list', e);
    recentFolders.value = [];
  }
}

export function deleteLocalProject(id: string): Promise<AppResult> {
  return guarded(async () => {
    if (!library) return err('storage-failed');
    await library.remove(id);
    await refreshLocalProjects();
    return ok(undefined);
  });
}

/** Opening counts as use, for the recents order (also after "Repair and open"). */
export async function markLocalOpened(id: string): Promise<void> {
  await library
    ?.markOpened(id, new Date().toISOString())
    .catch((e: unknown) => reportError('local.markOpened', e));
}

// ---- Pastas ----

/** The folder of the project about to open: the recents entry (or none) and the copy. */
export interface FolderCopy {
  /** Id of the recents entry; `null` if the folder was not remembered. */
  readonly folderId: string | null;
  /** `ProjectStorage.copyId`: the entry's id or, without one, this tab's id. */
  readonly copyId: string;
}

const sessionCopies = new Map<string, string>();

/**
 * The copy of a folder that did not enter the recents: one id per folder name, in this tab (
 * `sessionStorage` survives reloading the page; another tab or another day starts from zero,
 * and the state of an old folder with the same name does not apply to the new one). Without
 * `sessionStorage`, only in memory.
 */
export function sessionCopyId(folderName: string): string {
  const key = `mapping.folderCopy:${folderName}`;
  const known = sessionCopies.get(key) ?? readSessionSetting(key);
  const id = known || crypto.randomUUID();
  sessionCopies.set(key, id);
  if (!known) writeSessionSetting(key, id);
  return id;
}

/**
 * Remembers the folder of the project about to open in the recents (or updates the entry of the
 * same folder; with `replaceId`, "Locate folder…", the entry now points to it) and returns the
 * copy. Without the browser feature (`queryPermission`, `isSameEntry`) or without IndexedDB, it
 * does not remember; a failure does not stop the project from opening (it goes to Diagnostics). A
 * folder in the origin's private storage (OPFS) is never remembered: the folder picker does not
 * return it, and Chromium crashes the page when reading an OPFS handle back from IndexedDB.
 */
export async function rememberFolder(
  handle: DirectoryHandleLike,
  name: string,
  replaceId?: string,
): Promise<FolderCopy> {
  const unlisted = (): FolderCopy => ({
    folderId: null,
    copyId: sessionCopyId(handle.name),
  });
  if (!folderLibrary || !isReopenable(handle) || (await isOriginPrivate(handle))) {
    return unlisted();
  }
  let copy: FolderCopy;
  try {
    const id = await folderLibrary.remember(
      handle,
      { name, usedAt: new Date().toISOString() },
      replaceId,
    );
    knownHandles.set(id, handle);
    // Those who only use folders do not want to lose the list under storage pressure either.
    void requestPersistentStorage();
    copy = { folderId: id, copyId: id };
  } catch (e) {
    reportError('folders.remember', e);
    copy = unlisted();
  }
  await refreshRecentFolders();
  return copy;
}

/** Name of the project (it may have been renamed) and last use of an entry. */
export async function touchFolder(id: string, name: string): Promise<void> {
  try {
    await folderLibrary?.touch(id, { name, usedAt: new Date().toISOString() });
  } catch (e) {
    reportError('folders.touch', e);
  }
}

/** An entry's handle: the one in memory or, in a new visit, the one from IndexedDB. */
async function handleOf(id: string): Promise<ReopenableDirectory | null> {
  try {
    const handle = (await folderLibrary?.handle(id)) ?? null;
    if (handle) knownHandles.set(id, handle);
    return handle;
  } catch (e) {
    // A handle the browser cannot rebuild: the folder becomes unavailable.
    reportError('folders.handle', e);
    return null;
  }
}

/** Opens a folder's project; `replaceId`: the entry that now points to it. */
export type OpenFolder = (
  handle: DirectoryHandleLike,
  replaceId?: string,
) => Promise<AppResult>;

export type RecentFolderOpen =
  | { readonly kind: 'opened' }
  /** Permission denied (or failed), or the folder (or its `mapping.json`) is no longer there. */
  | { readonly kind: 'unavailable'; readonly reason: 'denied' | 'missing' };

/**
 * Where Open writes the path it took (`reopenTrace.ts`, `folders.reopen` context of
 * Diagnostics): `handle=…`, `query=…`, `request=…` and lastly `branch=…`.
 */
export interface ReopenSteps {
  step(label: string): void;
}

const noSteps: ReopenSteps = { step: () => undefined };

/** The error name (`DOMException` is not always `instanceof Error`: jsdom, another realm). */
function errorName(e: unknown): string {
  const name: unknown = typeof e === 'object' && e !== null ? Reflect.get(e, 'name') : e;
  return typeof name === 'string' ? name : typeof e;
}

/**
 * Reopens a folder from the recents. Call it straight from the click: the browser only shows the
 * permission request inside the gesture. With the handle already in memory, the query starts on the
 * click itself; in a new visit, the only wait before it is reading the handle from IndexedDB
 * (milliseconds, within the gesture's activation, which lasts a few seconds). The list itself does
 * not read handles. `trace`: receives the path (return of the 8.4 gate); it only writes to memory.
 */
export function openRecentFolder(
  id: string,
  open: OpenFolder,
  trace: ReopenSteps = noSteps,
): Promise<AppResult<RecentFolderOpen>> {
  const entry = recentFolders.value.find((f) => f.id === id);
  const known = knownHandles.get(id);
  const branch = <R>(label: string, result: R): R => {
    trace.step(`branch=${label}`);
    return result;
  };
  return guarded<RecentFolderOpen>(async () => {
    if (!entry) return branch('no-entry', err('not-found'));
    const unavailable = (label: string, reason: 'denied' | 'missing') =>
      branch(label, ok<RecentFolderOpen>({ kind: 'unavailable', reason }));
    try {
      const handle = known ?? (await handleOf(id));
      trace.step(`handle=${known ? 'memory' : handle ? 'idb' : 'none'}`);
      if (!handle || !isReopenable(handle)) return unavailable('no-handle', 'missing');
      try {
        const granted = await ensurePermission(handle, (step, state) =>
          trace.step(`${step}=${state}`),
        );
        if (!granted) return unavailable('denied', 'denied');
      } catch (e) {
        if (isNotFound(e)) return unavailable('permission-missing', 'missing');
        // Expired activation (`SecurityError`), unmounted volume: the notice offers Locate and
        // Remove from the list, instead of just "Could not access the files" (R5).
        reportError('folders.permission', e);
        return unavailable(`permission-error:${errorName(e)}`, 'denied');
      }
      if (!(await hasMappingFile(handle))) return unavailable('no-mapping', 'missing');
      const opened = await open(handle, id);
      return opened.ok
        ? branch('opened', ok({ kind: 'opened' }))
        : branch(`open-failed:${opened.error}`, opened);
    } catch (e) {
      // O `guarded` registra e devolve `storage-failed`; o rastro guarda o nome.
      throw branch(`exception:${errorName(e)}`, e);
    }
  });
}

export type FolderRelocation =
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'opened' }
  /** The chosen folder has no `mapping.json`: the entry stays as it was. */
  | { readonly kind: 'no-project' };

/** "Locate folder…": picks the folder again; it replaces the entry and the project opens. */
export function relocateFolder(
  id: string,
  open: OpenFolder,
): Promise<AppResult<FolderRelocation>> {
  return guarded<FolderRelocation>(async () => {
    const handle = await pickDirectory();
    if (!handle) return ok({ kind: 'cancelled' });
    if (!(await hasMappingFile(handle))) return ok({ kind: 'no-project' });
    const opened = await open(handle, id);
    return opened.ok ? ok({ kind: 'opened' }) : opened;
  });
}

/** "Remove from the list": forgets the folder. Nothing on disk changes. */
export function forgetFolder(id: string): Promise<AppResult> {
  return guarded(async () => {
    if (!folderLibrary) return err('storage-failed');
    knownHandles.delete(id);
    await folderLibrary.remove(id);
    await refreshRecentFolders();
    return ok(undefined);
  });
}
