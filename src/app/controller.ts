// Orchestrates the home screen and the open project: feature detection, opening and creating
// projects (folder, local, zip), export and closing. The recents live in `recents.ts`,
// saving on page exit in `pageLifecycle.ts` and the result types in `appResult.ts`
// (phase 8.4); this module re-exports what `Home` and the tests use from them.
import { signal, type Signal } from '@preact/signals';
import { NOTES_LIBRARY } from '../../libraries/notas';
import { t } from '../i18n';
import {
  DEFAULT_LAYER_COLOR,
  applyBundledLibrary,
  bundledLibraryDiskFiles,
  createProject,
  hasBundledLibrary,
  deserialize,
  migrations,
  serialize,
  SCHEMA_VERSION,
  type DiscardedInherit,
  type DiscardedUrlTemplate,
  type Project,
  type RepairRecord,
} from '../model';
import { importExistingImages } from '../storage/existingImages';
import {
  createFolderStorage,
  ensureGitignore,
  findExistingImages,
  hasMappingFile,
  isFolderModeSupported,
  pickDirectory,
  type DirectoryHandleLike,
  type ExistingImage,
} from '../storage/folder';
import {
  countingDirectory,
  createFolderCalls,
  type FolderCalls,
} from '../storage/folderCalls';
import { createDisplayBitmap, prepareImage, readImageSize } from '../storage/imageImport';
import { loadProject, type InconsistentLoad } from '../storage/loadProject';
import { loadProposals } from '../storage/loadProposals';
import { loadThreads } from '../storage/loadThreads';
import { loadLibraryIssues, type LibraryIssues } from '../storage/specPackage';
import { requestPersistentStorage } from '../storage/local';
import {
  openLocalPerspectives,
  type LocalPerspectiveStore,
} from '../storage/localPerspectives';
import type { ProjectStorage, StorageKind } from '../storage/types';
import { readProjectZip, writeProjectZip, zipFileName } from '../storage/zip';
import { createDisplayImages, type DisplayImages } from '../store/displayImages';
import { openLibraryPreview, type LibraryPreview } from '../store/libraryPreview';
import { openSession, type ProjectSession } from '../store/session';
import {
  pickPackageDirectory,
  readPackageFromDirectory,
  readPackageFromZip,
  type PackageReadResult,
} from '../ui/specPackageImport';
import { reportError } from '../utils/report';
import { err, guarded, inconsistentResult, ok, type AppResult } from './appResult';
import { bindPageLifecycle } from './pageLifecycle';
import * as recents from './recents';
import { localLibrary, touchFolder } from './recents';

export type { AppErrorCode, AppResult, InconsistentProject } from './appResult';
export {
  deleteLocalProject,
  forgetFolder,
  localProjects,
  recentProjects,
  refreshLocalProjects,
  type FolderRelocation,
  type RecentFolderOpen,
  type RecentProject,
} from './recents';

export interface Features {
  /** File System Access API available (Folder mode). */
  readonly folder: boolean;
  /** IndexedDB available (Local + Zip mode). */
  readonly local: boolean;
  /** Page opened as a file: IndexedDB may not be reliable. */
  readonly fileProtocol: boolean;
}

export interface OpenProject {
  readonly kind: StorageKind;
  readonly session: ProjectSession;
  readonly display: DisplayImages<ImageBitmap>;
  /** Id in IndexedDB (local mode). */
  readonly localId: string | null;
  /**
   * Recents entry of the open folder (name and date updated on every save and on
   * close). Absent outside folder mode or with the folder outside the recents.
   */
  readonly folderId?: string;
  /** Local mode: there are changes since the last export. */
  readonly unexported: Signal<boolean>;
  /** Repairs made when opening an inconsistent project (empty or absent in the normal case). */
  readonly repaired?: readonly RepairRecord[];
}

export const features = signal<Features | null>(null);
export const openProject = signal<OpenProject | null>(null);

/**
 * The new project is born with the notes library applied (like any library, removable
 * by the person). The package files go to storage together with the `mapping.json`
 * (`newProjectSpecFiles`).
 */
function newProject(name: string): Project {
  const blank = createProject({
    name,
    now: new Date().toISOString(),
    firstLayer: {
      id: crypto.randomUUID(),
      name: t('layer.defaultName'),
      color: DEFAULT_LAYER_COLOR,
    },
  });
  return applyBundledLibrary(blank, NOTES_LIBRARY).project;
}

/** `specs/` files of a new project (`specs/notas/…`), to be written along with it. */
function newProjectSpecFiles(project: Project): Map<string, string> {
  return bundledLibraryDiskFiles(project, NOTES_LIBRARY);
}

/** Detects the features and loads the recents lists. Call once. */
export async function initApp(): Promise<void> {
  const folder = isFolderModeSupported();
  await recents.initRecents(folder);
  features.value = {
    folder,
    local: localLibrary() !== null,
    fileProtocol: location.protocol === 'file:',
  };
  bindPageLifecycle(() => openProject.value?.session);
}

/** The storage the session uses (with `copyId`) and the folder's recents entry. */
interface Bound {
  readonly storage: ProjectStorage;
  readonly folderId?: string;
}

/**
 * What to open. `storage` is the reading one; `bind` runs after reading and before the session
 * opens, on the normal path and on "Repair and open": it stores the folder in the recents (and
 * gives the `copyId`) or
 * marks the local project as used. Without `bind`, the session uses `storage` itself.
 */
interface OpenTarget {
  readonly storage: ProjectStorage;
  readonly localId: string | null;
  /** The folder call counter, which wraps the `storage` root (folder only). */
  readonly folderCalls?: FolderCalls;
  readonly bind?: (project: Project) => Promise<Bound>;
}

/** The opening, measured in the folder counter (`open`): from `loadProject` to the session ready. */
const measureOpen = <T>(target: OpenTarget, fn: () => Promise<T>): Promise<T> =>
  target.folderCalls ? target.folderCalls.measure('open', fn) : fn();

function openFromStorage(target: OpenTarget): Promise<AppResult> {
  return measureOpen(target, async () => {
    const loaded = await loadProject(target.storage);
    if (loaded.ok) return openLoaded(target, loaded.project, loaded);
    const { inconsistent } = loaded;
    if (!inconsistent) return err(loaded.error);
    return inconsistentResult(inconsistent.issues, inconsistent.repair, () =>
      measureOpen(target, () => openRepaired(target, inconsistent)),
    );
  });
}

let localPerspectives: Promise<LocalPerspectiveStore | null> | null = null;

/** The "Only me" perspectives database, opened once per app (`null` without IndexedDB). */
function localPerspectiveStore(): Promise<LocalPerspectiveStore | null> {
  return (localPerspectives ??= openLocalPerspectives());
}

/**
 * Binds (recents, `copyId`) and opens the session of the project already read. `text`: the
 * `mapping.json`
 * as it was read (`SessionOptions.loadedText`); `migratedFrom`: old schema (or repair), the
 * original goes to `backups/` before the first save.
 */
async function openLoaded(
  target: OpenTarget,
  loadedProject: Project,
  loaded: {
    readonly readOnly: boolean;
    readonly text: string;
    readonly migratedFrom: number | null;
    /** `urlTemplate` that the migration to schema 11 discarded; they go to Diagnostics. */
    readonly discardedUrlTemplates?: readonly DiscardedUrlTemplate[];
    /** Annotations that lost inheritance in the migration to schema 13; they go to Diagnostics. */
    readonly discardedInherit?: readonly DiscardedInherit[];
    readonly repaired?: readonly RepairRecord[];
    /** Library package problems (Diagnostics); without the field, the session starts without any. */
    readonly libraryIssues?: LibraryIssues;
  },
): Promise<AppResult> {
  const { localId, folderCalls } = target;
  const notes = withDefaultNotes(loadedProject, loaded);
  const project = notes.project;
  reportDiscardedUrlTemplates(loaded.discardedUrlTemplates ?? []);
  reportDiscardedInherit(loaded.discardedInherit ?? []);
  const meta = localId ? await localLibrary()?.get(localId) : undefined;
  const { storage, folderId } = target.bind
    ? await target.bind(project)
    : { storage: target.storage, folderId: undefined };
  const unexported = signal(meta?.unexported ?? false);
  // The "Only me" perspectives stay in this browser, by `project.id` (stage #659).
  const localStore = await localPerspectiveStore();
  const localInitial = localStore ? await localStore.load(project.project.id) : [];
  const session = openSession({
    storage,
    project,
    readOnly: loaded.readOnly,
    loadedText: loaded.text,
    ...(notes.staged.length === 0 ? {} : { stagedPackages: notes.staged }),
    ...(loaded.migratedFrom === null
      ? {}
      : { migratedFrom: { version: loaded.migratedFrom, text: loaded.text } }),
    ...(loaded.libraryIssues === undefined
      ? {}
      : { libraryIssues: loaded.libraryIssues }),
    folderCalls: folderCalls ?? null,
    localPerspectives: { store: localStore, initial: localInitial },
    proposals: await loadProposals(storage),
    threads: await loadThreads(storage),
    prepareImage,
    // Wrote the `mapping.json` (with content that has not yet left in a zip), a `proposal.json` or a
    // thread (`comments/`):
    // there is work to export. `markExported` clears it; IndexedDB keeps the same flag. In a folder,
    // the recents row follows the name and the last use, like the local project's (R2).
    onChanged: () => {
      unexported.value = true;
      const name = session.store.project.peek()?.project.name;
      if (folderId !== undefined && name !== undefined) void touchFolder(folderId, name);
    },
    // Files changed from outside: the stored bitmap is of the old content.
    onImagesChanged: (paths) => {
      for (const path of paths) display.invalidate(path);
    },
  });
  const display = createDisplayImages(async (path) => {
    const blob = await session.readImage(path);
    if (!blob) return null;
    const image = session.store.project.peek()?.containers.find((i) => i.file === path);
    return createDisplayBitmap(
      blob,
      image && { width: image.width, height: image.height },
    );
  });
  openProject.value = {
    kind: storage.kind,
    session,
    display,
    localId,
    ...(folderId === undefined ? {} : { folderId }),
    unexported,
    repaired: loaded.repaired ?? [],
  };
  return ok(undefined);
}

/** The schema version from which the notes library exists (v13). */
const NOTES_SINCE_SCHEMA = 13;

/**
 * A project opened from a schema older than 13 gets the notes library on opening, before
 * entering the store (no undo entry): the package goes to the session cache and the first
 * save writes `specs/notas/` along with the `mapping.json` and the migration backup. A project already
 * at v13 (without the library because the person removed it, or created without it) stays as it is;
 * so does a read-only one.
 */
function withDefaultNotes(
  project: Project,
  loaded: { readonly readOnly: boolean; readonly migratedFrom: number | null },
): {
  readonly project: Project;
  readonly staged: readonly {
    readonly spec: { readonly id: string; readonly version: number };
    readonly files: ReadonlyMap<string, string>;
  }[];
} {
  const eligible =
    !loaded.readOnly &&
    loaded.migratedFrom !== null &&
    loaded.migratedFrom < NOTES_SINCE_SCHEMA &&
    !hasBundledLibrary(project, NOTES_LIBRARY);
  if (!eligible) return { project, staged: [] };
  try {
    const applied = applyBundledLibrary(project, NOTES_LIBRARY);
    return {
      project: applied.project,
      staged: [{ spec: applied.spec, files: applied.packageFiles }],
    };
  } catch (e) {
    // The notes library cannot prevent the project from opening.
    reportError('open.notes', e);
    return { project, staged: [] };
  }
}

/**
 * Records in Diagnostics what the migration to schema 11 discarded: the address of the
 * files left the project and became the specialization's (`platforms[].repo`). A
 * single entry, with the discarded platforms and models.
 */
function reportDiscardedUrlTemplates(discarded: readonly DiscardedUrlTemplate[]): void {
  if (discarded.length === 0) return;
  reportError(
    'open.migration',
    t('migration.v11.discardedUrlTemplate', {
      platforms: discarded.map((d) => d.platform).join(', '),
      templates: discarded.map((d) => d.urlTemplate).join(', '),
    }),
  );
}

/**
 * Records in Diagnostics what the migration to schema 13 stopped inheriting: the annotation no
 * longer applies to descendant markings. A single entry, with the count and the markings.
 */
function reportDiscardedInherit(discarded: readonly DiscardedInherit[]): void {
  if (discarded.length === 0) return;
  const markings = [...new Set(discarded.map((d) => d.markingName ?? d.markingId))].join(
    ', ',
  );
  reportError(
    'open.migration',
    t('migration.v13.discardedInherit', { count: discarded.length, markings }),
  );
}

/** One line per repair, for Diagnostics (e.g. `made-root marking MN "Name" (missing-parent)`). */
function describeRepairs(records: readonly RepairRecord[]): string {
  return records
    .map(
      (r) =>
        `${r.action} ${r.entity} ${r.id}${r.name === undefined ? '' : ` "${r.name}"`} (${r.code})`,
    )
    .join('; ');
}

/**
 * Opens the repaired project. Nothing is written now: the session keeps the original in `backups/`
 * (same mechanism as the migration) and writes the repaired one on the first save.
 */
async function openRepaired(target: OpenTarget, { repair, text }: InconsistentLoad) {
  reportError(
    'open.repair',
    `${repair.repaired.length} reparo(s): ${describeRepairs(repair.repaired)}`,
  );
  return openLoaded(target, repair.project, {
    readOnly: repair.readOnly,
    text,
    migratedFrom: repair.migratedFrom ?? SCHEMA_VERSION,
    discardedUrlTemplates: repair.discardedUrlTemplates,
    discardedInherit: repair.discardedInherit,
    repaired: repair.repaired,
    libraryIssues: await loadLibraryIssues(target.storage, repair.project),
  });
}

// ---- Local mode (IndexedDB) ----

export function createLocalProject(name: string): Promise<AppResult> {
  return guarded(async () => {
    const library = localLibrary();
    if (!library) return err('storage-failed');
    const id = crypto.randomUUID();
    const project = newProject(name.trim() || t('project.untitled'));
    await library.create(id, {
      mapping: serialize(project),
      images: new Map(),
      specs: newProjectSpecFiles(project),
      proposals: new Map(),
      proposalImages: new Map(),
      threads: new Map(),
    });
    void requestPersistentStorage();
    return openFromStorage({ storage: library.open(id), localId: id });
  });
}

export function openLocalProject(id: string): Promise<AppResult> {
  return guarded(async () => {
    const library = localLibrary();
    if (!library) return err('storage-failed');
    void requestPersistentStorage();
    const storage = library.open(id);
    // Opening counts as use, for the recents order (also "Repair and open", R4).
    return openFromStorage({
      storage,
      localId: id,
      bind: async () => {
        await recents.markLocalOpened(id);
        return { storage };
      },
    });
  });
}

/** Imports a zip into IndexedDB as a new local project and opens it. */
export function importZip(file: Blob): Promise<AppResult> {
  return guarded(async () => {
    const target = localLibrary();
    if (!target) return err('storage-failed');
    const read = await readProjectZip(file);
    if (!read.ok) return err(read.error);
    const parsed = deserialize(read.files.mapping, migrations, read.files.specs);
    const create = async () => {
      const id = crypto.randomUUID();
      await target.create(id, read.files, { unexported: false });
      void requestPersistentStorage();
      return openFromStorage({ storage: target.open(id), localId: id });
    };
    if (!parsed.ok) {
      const { error, repair } = parsed;
      if (error.code !== 'invariant-violation' || !repair) return err(error.code);
      // The local project is only created if the repair is accepted; refusing leaves no trace.
      return inconsistentResult(error.issues, repair, async () => {
        const opened = await create();
        return opened.ok || !opened.inconsistent?.repair
          ? opened
          : opened.inconsistent.repair();
      });
    }
    return create();
  });
}

// ---- Folder mode (File System Access API) ----

export type FolderInspection =
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'opened' }
  | {
      readonly kind: 'needs-setup';
      readonly handle: DirectoryHandleLike;
      readonly images: readonly ExistingImage[];
    };

/** Picks a folder: opens its project or asks to create one (without `mapping.json`). */
export function openFolder(): Promise<AppResult<FolderInspection>> {
  return guarded<FolderInspection>(async () => {
    const handle = await pickDirectory();
    if (!handle) return ok({ kind: 'cancelled' });
    if (!(await hasMappingFile(handle))) {
      return ok({
        kind: 'needs-setup',
        handle,
        images: await findExistingImages(handle),
      });
    }
    const opened = await openFolderHandle(handle);
    return opened.ok ? ok({ kind: 'opened' }) : opened;
  });
}

/**
 * The folder as the opening target: read without `copyId`; before the session opens (also in
 * "Repair and open"), it is stored in the recents and the session receives the storage with the copy.
 * `replaceId`: the recents entry that now points to this folder ("Locate").
 */
const folderTarget = (handle: DirectoryHandleLike, replaceId?: string): OpenTarget => {
  // The counter wraps the root once: the reading storage, the session's and its measurements
  // use the same one.
  const folderCalls = createFolderCalls();
  const root = countingDirectory(handle, folderCalls);
  return {
    storage: createFolderStorage(root),
    localId: null,
    folderCalls,
    bind: async (project) => {
      const { folderId, copyId } = await recents.rememberFolder(
        handle,
        project.project.name,
        replaceId,
      );
      return {
        storage: createFolderStorage(root, { copyId }),
        ...(folderId === null ? {} : { folderId }),
      };
    },
  };
};

const openFolderHandle = (handle: DirectoryHandleLike, replaceId?: string) =>
  openFromStorage(folderTarget(handle, replaceId));

/** Reopens a folder from the recents. Call straight from the click (see `recents.openRecentFolder`). */
export const openRecentFolder = (id: string, trace?: recents.ReopenSteps) =>
  recents.openRecentFolder(id, openFolderHandle, trace);

/** "Locate folder…" (see `recents.relocateFolder`). */
export const relocateFolder = (id: string) =>
  recents.relocateFolder(id, openFolderHandle);

/**
 * Creates the project in the folder, importing the images that were already in it. If a `mapping.json`
 * appeared after the dialog (before importing or before saving), it creates nothing: it opens the
 * project that is already there and returns `existing: true` for the screen to notify.
 */
export function createFolderProject(
  handle: DirectoryHandleLike,
  name: string,
  images: readonly ExistingImage[],
): Promise<AppResult<{ skipped: readonly string[]; existing?: true }>> {
  return guarded(async () => {
    const openExisting = async () => {
      const opened = await openFolderHandle(handle);
      return opened.ok ? ok({ skipped: [], existing: true as const }) : opened;
    };
    if (await hasMappingFile(handle)) return openExisting();
    // The same target (and counter) as the session that opens at the end: creation already counts on it.
    const target = folderTarget(handle);
    const { storage } = target;
    const imported = await importExistingImages(
      storage,
      newProject(name.trim() || handle.name),
      images,
      { readSize: readImageSize, newId: () => crypto.randomUUID() },
    );
    const mappingText = serialize(imported.project);
    // The dialog and import window: recheck before writing anything.
    if (await hasMappingFile(handle)) return openExisting();
    // The notes library package before the `mapping.json` that cites it.
    for (const [path, text] of newProjectSpecFiles(imported.project)) {
      await storage.writeSpecFile(path, text);
    }
    await storage.saveMapping(mappingText);
    // For whoever versions the folder with git: migration backups do not enter the repository.
    await ensureGitignore(handle).catch((e: unknown) =>
      reportError('folder.gitignore', e),
    );
    // The folder may already have proposals (e.g. restored from git without the mapping.json): opening
    // reads them, as in any folder.
    await measureOpen(target, () =>
      openLoaded(target, imported.project, {
        readOnly: false,
        text: mappingText,
        migratedFrom: null,
      }),
    );
    return ok({ skipped: imported.skipped });
  });
}

// ---- Open project ----

export interface ExportedProject {
  readonly file: File;
  /** Project images that were not in storage and were left out of the zip. */
  readonly missingImages: readonly string[];
  /** `false` with the save in error: the zip carries what storage does not have yet. */
  readonly saved: boolean;
}

// Last zip generated: only counts as exported in `markExported`, when the file left (8.7).
let pendingExport: { session: ProjectSession; snapshot: Project } | null = null;

/** Generates the zip of the open project. */
export function buildExport(): Promise<AppResult<ExportedProject>> {
  return guarded(async () => {
    const current = openProject.value;
    const project = current?.session.store.project.value;
    if (!current || !project) return err('not-found');
    const files = await current.session.collectFiles();
    pendingExport = { session: current.session, snapshot: files.snapshot };
    const blob = await writeProjectZip(files);
    return ok({
      file: new File(
        [blob],
        zipFileName(project.project.name, t('export.defaultZipName')),
        {
          type: 'application/zip',
        },
      ),
      missingImages: files.missingImages,
      saved: files.saved,
    });
  });
}

/** The zip generated by `buildExport` left (saved or shared). */
export async function markExported(): Promise<void> {
  const current = openProject.value;
  if (!current) return;
  if (pendingExport?.session === current.session) {
    current.session.noteExported(pendingExport.snapshot);
    pendingExport = null;
  }
  if (!current.localId) return;
  current.unexported.value = false;
  try {
    await localLibrary()?.setUnexported(current.localId, false);
  } catch (e) {
    // The indicator reappears on the next opening; nothing is lost.
    reportError('local.setUnexported', e);
  }
}

export async function closeProject(): Promise<void> {
  const current = openProject.value;
  if (!current) return;
  const name = current.session.store.project.peek()?.project.name;
  openProject.value = null;
  pendingExport = null;
  current.display.dispose();
  try {
    await current.session.close();
  } finally {
    if (current.folderId !== undefined && name !== undefined) {
      await touchFolder(current.folderId, name);
    }
    await Promise.all([recents.refreshLocalProjects(), recents.refreshRecentFolders()]);
  }
}

// ---- Library Catalog, without a project (Library stage, B5) ----

/** The library open on the Catalog screen; `null` when there is none. Nothing of it is written. */
export const openLibrary = signal<LibraryPreview | null>(null);

export type LibrarySource =
  { readonly kind: 'folder' } | { readonly kind: 'zip'; readonly file: Blob };

export type LibraryOpenResult =
  | { readonly kind: 'opened' }
  /** The user cancelled the folder picker. */
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly reason: 'too-big' | 'empty' | 'unreadable' };

/**
 * Reads the package (folder or zip) into memory and opens the Catalog. A package with
 * validation errors opens anyway (the problems appear at the top of the screen); only what
 * cannot be read (too large, empty, invalid zip) fails.
 */
export async function openLibraryPackage(
  source: LibrarySource,
): Promise<LibraryOpenResult> {
  let read: PackageReadResult;
  try {
    if (source.kind === 'folder') {
      const handle = await pickPackageDirectory();
      if (!handle) return { kind: 'cancelled' };
      read = await readPackageFromDirectory(handle);
    } else {
      read = await readPackageFromZip(source.file);
    }
  } catch (e) {
    reportError('library.read', e);
    return { kind: 'failed', reason: 'unreadable' };
  }
  if (!read.ok) return { kind: 'failed', reason: read.reason };
  try {
    const preview = openLibraryPreview(read.files);
    openLibrary.value?.dispose();
    openLibrary.value = preview;
    return { kind: 'opened' };
  } catch (e) {
    reportError('library.open', e);
    return { kind: 'failed', reason: 'unreadable' };
  }
}

/** Closes the library Catalog and removes the package fonts from the document. */
export function closeLibrary(): void {
  openLibrary.value?.dispose();
  openLibrary.value = null;
}
