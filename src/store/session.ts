import { batch, effect, signal, type ReadonlySignal } from '@preact/signals';
import {
  canReplaceImage,
  imageFileNames,
  isSameAspect,
  isTextPackageFile,
  packageDirOf,
  packageSpecNameOf,
  readRevision,
  serialize,
  specFiles,
  toLibraryFiles,
  uniqueImageFile,
  type Perspective,
  type Project,
} from '../model';
import {
  AUTOSAVE_DELAY_MS,
  createAutoSaver,
  type FlushResult,
  type SaveStatus,
} from '../storage/autosave';
import type { PreparedImage } from '../storage/imageImport';
import type { LocalPerspectiveStore } from '../storage/localPerspectives';
import { type FolderCalls, type FolderOp } from '../storage/folderCalls';
import { loadProject, type LoadProjectResult } from '../storage/loadProject';
import { FOLDER_CONCURRENCY } from '../storage/folderConcurrency';
import {
  libraryIssuesOf,
  loadLibraryIssues,
  packageEntriesOf,
  readSpecPackage,
  type AppLibraryIssue,
  type LibraryIssues,
} from '../storage/specPackage';
import type { LoadedProposals } from '../storage/loadProposals';
import type { LoadedThreads } from '../storage/loadThreads';
import { backupFileName, imageMimeType, type ProjectStorage } from '../storage/types';
import type { ProjectFiles } from '../storage/zip';
import { mapLimit } from '../utils/mapLimit';
import { reportError } from '../utils/report';
import { createComponentLibrary, type ComponentLibrary } from './componentLibrary';
import { libraryInputFiles } from './packageValidation';
import { createProjectCatalogs, type ProjectCatalogs } from './projectCatalogs';
import { createProjectStore, type ActionResult, type ProjectStore } from './history';
import {
  attachLocalSync,
  carryLocalPerspectives,
  mergeLocalPerspectives,
} from './localPerspectiveSync';
import { createPerspectiveActions, type PerspectiveActions } from './perspectiveActions';
import {
  createPerspectiveState,
  fileProject,
  type PerspectiveState,
} from './perspectives';
import {
  createProjectActions,
  type ProjectActions,
  type SpecPackageFiles,
} from './project';
import { createProposalActions, type ProposalActions } from './proposalActions';
import { createProposalStore, type ProposalStore } from './proposals';
import { identity } from './identity';
import { createThreadActions, type ThreadActions } from './threadActions';
import { createThreadStore, type ThreadStore } from './threads';

// The session is the only writer of the `mapping.json` of an open project and the only place that reads it
// once open (ESLint rule in `eslint.config.js`; design in `docs/ARCHITECTURE.md`,
// "Session and saving"). Saving, the check for external changes, reload and the conflict decision
// are jobs of ONE queue (the `AutoSaver`'s): they never cross.

/**
 * An empty `mapping.json` at the moment of saving means someone is writing (an editor that truncates and
 * then writes): the save waits `EMPTY_RETRY_DELAY_MS` and rereads, up to `EMPTY_RETRY_ATTEMPTS`
 * times, before giving up with `EmptyMappingError`. The tests use these constants with a
 * fake clock.
 */
export const EMPTY_RETRY_ATTEMPTS = 4;
export const EMPTY_RETRY_DELAY_MS = AUTOSAVE_DELAY_MS;

export interface SessionOptions {
  readonly storage: ProjectStorage;
  readonly project: Project;
  readonly readOnly?: boolean;
  /** Reads and normalizes an image chosen by the user (see `storage/imageImport`). */
  readonly prepareImage: (file: File) => Promise<PreparedImage>;
  /**
   * Something in this project changed in this session's storage: it wrote the `mapping.json` with
   * content that has not yet left in a downloaded zip (`noteExported`), or wrote a `proposal.json`.
   */
  readonly onChanged?: () => void;
  /**
   * The project was migrated from an old schema: `text` is the original `mapping.json`,
   * kept with `writeBackup` before the first save (which overwrites it).
   */
  readonly migratedFrom?: { readonly version: number; readonly text: string };
  /**
   * The `mapping.json` as it was read from storage. With it, any difference between the
   * file and what the session knows counts as an external change, even without changing `revision`
   * (someone edited the JSON by hand). Without it, only the `revision` is checked.
   */
  readonly loadedText?: string;
  /**
   * Library packages applied to the project **in memory** on open (the notes library of the
   * migrated projects, ME3): `options.project` already cites them, but the disk does not have them yet. They go
   * into the session cache and the first save writes `specs/<id>/` together with the `mapping.json`
   * (and with the migration backup). The files come without the specialization's, which lives in the project.
   */
  readonly stagedPackages?: readonly {
    readonly spec: { readonly id: string; readonly version: number };
    readonly files: ReadonlyMap<string, string | Blob>;
  }[];
  /** The change proposals read from storage on open (see `loadProposals`). */
  readonly proposals?: LoadedProposals;
  /** The conversations read from storage on open (see `loadThreads`). */
  readonly threads?: LoadedThreads;
  /**
   * `threads` already includes `comments/resolved/` (default: yes, `loadThreads` reads both folders). Whoever
   * opens reading only `comments/` passes `false`: the resolved ones come on request (`threads.loadResolved`).
   */
  readonly threadsResolvedLoaded?: boolean;
  /**
   * The "Only me" perspectives (stage #659): `store` is this browser's IndexedDB (`null` without it:
   * the option is unavailable) and `initial` is what it had for this `project.id`. They go into the
   * in-memory project on open, reconciled; the `mapping.json` never carries them.
   */
  readonly localPerspectives?: {
    readonly store: LocalPerspectiveStore | null;
    readonly initial: readonly Perspective[];
  };
  /** Library issues read on open (see `loadProject`); without them, none. */
  readonly libraryIssues?: LibraryIssues;
  /**
   * The folder's call counter (`storage/folderCalls`), the same one that wraps the root of
   * `storage`: the session measures saving, deciding, applying and checking with it. Without it
   * (local project, zip, tests), nothing is measured.
   */
  readonly folderCalls?: FolderCalls | null;
  /**
   * Image files replaced or added from outside (when reloading the project or when
   * checking the files): whoever holds the bitmaps discards them to load again.
   */
  readonly onImagesChanged?: (paths: readonly string[]) => void;
  readonly autosaveDelay?: number;
  readonly now?: () => string;
  readonly newId?: () => string;
}

export interface AddImagesResult {
  readonly added: readonly string[];
  /** Names of the files that could not be read or written. */
  readonly failed: readonly string[];
}

export interface AspectChange {
  readonly from: { readonly width: number; readonly height: number };
  readonly to: { readonly width: number; readonly height: number };
}

/** `locked`: the image (or a marking of it) is locked and the new file would change the geometry. */
export type ReplaceImageResult = 'replaced' | 'cancelled' | 'failed' | 'locked';

export interface AddImagesOptions {
  /** Canvas point where the center of each image should end up (nearest free space). */
  readonly center?: { readonly x: number; readonly y: number };
}

/**
 * The save was refused because the `mapping.json` changed from outside (another process, such as the
 * MCP server, or a text editor) since the session read or wrote it.
 */
export class ExternalChangeError extends Error {
  constructor() {
    super('mapping.json changed outside the app');
    this.name = 'ExternalChangeError';
  }
}

/**
 * The `mapping.json` stayed empty through all the save attempts: someone truncated it and
 * did not finish writing (a tool that died midway, a synchronizer). The save gives up;
 * the person resolves it by exporting, deleting the file from outside, or through the conflict dialog that the
 * check opens ("Keep mine" writes over it).
 */
export class EmptyMappingError extends Error {
  constructor() {
    super('mapping.json is empty on disk');
    this.name = 'EmptyMappingError';
  }
}

/** There is an external change waiting for the user's decision ("Project changed outside the app" dialog). */
export interface ExternalConflict {
  /** "Reload" failed (file gone or unreadable): the decision stays pending. */
  readonly reloadFailed: boolean;
}

/**
 * `unchanged`: nothing changed from outside (or the file is unreadable for a moment). `reloaded`: the
 * project was reloaded from disk. `conflict`: it changed from outside with the save in error (there is a
 * pending change that does not reach the disk on its own): it opened the `conflict`. `busy`: there is a gesture in
 * progress, or a save scheduled (debounce) or queued and not yet started
 * (`saveStatus === 'saving'` when the check runs): it checks the file itself before
 * saving. A check requested during a save in progress is a job behind it: it runs
 * afterwards and answers with what it finds (`unchanged` if the file is what the session wrote).
 */
export type SyncResult = 'unchanged' | 'reloaded' | 'conflict' | 'busy';

export interface CollectedFiles extends ProjectFiles {
  /** Images of the project whose file is not in storage (they stay out of the zip). */
  readonly missingImages: readonly string[];
  /**
   * What goes in the zip is also in storage. `false` with the save in error: the zip carries
   * the committed project (it is the rescue), but the disk does not have it yet.
   */
  readonly saved: boolean;
  /**
   * The committed project that went into the zip. Whoever delivers the file (the download or the
   * share that succeeded) passes it to `noteExported`; generating the zip is not exporting.
   */
  readonly snapshot: Project;
}

/** An open project: store with undo/redo tied to storage. */
export interface ProjectSession {
  readonly storage: ProjectStorage;
  /** Calls and time of the last operation of each kind in the folder; `null` outside a folder. */
  readonly folderCalls: FolderCalls | null;
  readonly store: ProjectStore;
  readonly actions: ProjectActions;
  /** The project's change proposals (stage 4): list, issues, notices and folder check. */
  readonly proposals: ProposalStore;
  /** Decide, annotate and apply the accepted ones: the only actions that change a proposal. */
  readonly proposalActions: ProposalActions;
  /**
   * Anchored conversations of the project (Comments stage): list, issues and check of
   * `comments/`. They live outside the `mapping.json`: they do not enter undo.
   */
  readonly threads: ThreadStore;
  /** Open, append, resolve, reopen and delete: the only actions that change a conversation. */
  readonly threadActions: ThreadActions;
  /**
   * The open perspective and the rest of the perspectives state (stage #659): UI state, kept
   * in this browser by `project.id`; switching perspective does not enter undo.
   */
  readonly perspective: PerspectiveState;
  /** Create, rename, duplicate, delete, send roots, hidden layers and Who sees. */
  readonly perspectiveActions: PerspectiveActions;
  readonly saveStatus: ReadonlySignal<SaveStatus>;
  /**
   * Issues (levels 1 and 2 of the validator) of the package of each specialization applied in a folder,
   * by id. UI state, not project state: read on open, on reload and after a
   * save touches `specs/<id>/`; it never blocks opening nor changes `pendingSave`.
   */
  readonly libraryIssues: ReadonlySignal<LibraryIssues>;
  /**
   * Components and fonts of the applied specializations (Library stage, B3): in-memory state
   * of the session, never of the project. Reads `specs/<id>/` and the package copies not yet written.
   */
  readonly components: ComponentLibrary;
  /**
   * Catalogs (component pages) of the applied packages, built on demand by the
   * Catalog window (Library stage, B5). In-memory state, never of the project.
   */
  readonly catalogs: ProjectCatalogs;
  /** Source version, after the backup of the pre-migration original was written. */
  readonly backupSaved: ReadonlySignal<number | null>;
  /** External change that prevented a save; `null` when there is no pending decision. */
  readonly conflict: ReadonlySignal<ExternalConflict | null>;
  /** How many times the project was reloaded from disk (the interface adjusts the selection). */
  readonly reloads: ReadonlySignal<number>;
  /** Storage allows noticing external changes (today, only the folder). */
  readonly watchable: boolean;
  /**
   * Checks the `mapping.json` (and, with `images`, the image files), the `proposals/` folder
   * (proposals new, changed or deleted from outside: `proposals.notices`) and `comments/`
   * (conversations new, changed or deleted from outside; `resolved/` not, only on request). Without pending
   * local changes, reloads the project from disk if it changed from outside. With the save in
   * error (the pending change does not reach the disk), it does not reload: it opens the `conflict`. With a gesture in
   * progress, or a save scheduled or queued and not yet started, it returns `busy`. The
   * check is a job of the session queue (requested during a save, it runs after it);
   * concurrent calls are merged (one in progress and at most one waiting, with `images`
   * accumulated).
   */
  sync(options?: { readonly images?: boolean }): Promise<SyncResult>;
  /**
   * There is work in progress that the cycle check must not disturb: a save scheduled or
   * in progress, a gesture in progress, or a proposal decision, note or application queued or being
   * written. `useExternalChanges` postpones the cycle (not the focus) while this is true. With the save
   * in error it does not count (the check needs to open the conflict dialog).
   */
  busy(): boolean;
  /**
   * Decides the conflict: `reload` discards the local changes not yet written and loads the
   * file; `keep` writes mine over it, with the new revision. It never rejects: a read
   * failure becomes `conflict.reloadFailed` (on `reload`) or `saveStatus === 'error'` (on `keep`).
   */
  resolveConflict(choice: 'reload' | 'keep'): Promise<void>;
  /** Imports the images: writes each file and adds it to the project (one undo entry each). */
  addImages(files: readonly File[], options?: AddImagesOptions): Promise<AddImagesResult>;
  /**
   * Replaces the image's file (or repoints a missing image) keeping the
   * markings. With a different aspect ratio, it asks first via `confirmAspectChange`.
   */
  replaceImage(
    containerId: string,
    file: File,
    confirmAspectChange: (change: AspectChange) => Promise<boolean>,
  ): Promise<ReplaceImageResult>;
  readImage(path: string): Promise<Blob | null>;
  /**
   * Writes now whatever is pending (also serves as "try again") and says whether it wrote.
   * It joins the queue (waits for the save, check or reload in progress) and never rejects.
   * `ok: true` ⇔ the committed project as of the call is on disk; `ok: false` ⇔ the
   * pending change remains (`saveStatus === 'error'`), with the cause in `error` (`ExternalChangeError`
   * ⇔ `conflict` open). Whoever undoes a change after an `ok` (the compensation of applying
   * accepted ones) makes the session schedule the save of the restored project on its own.
   */
  flush(): Promise<FlushResult>;
  /**
   * The committed `mapping.json` (never a gesture's preview), the existing images, the copies
   * of `specs/`, the proposals (with the images awaiting acceptance) and the conversations
   * (open and resolved), for exporting.
   */
  collectFiles(): Promise<CollectedFiles>;
  /**
   * The zip with `snapshot` (from `collectFiles`) actually went out: writing that same content later
   * (the save in error that finally goes through) is not a change to export and does not call `onChanged`.
   * Without this call (the person cancelled the "Save as"), the save counts as a change.
   */
  noteExported(snapshot: Project): void;
  close(): Promise<void>;
}

/** The committed project: during a gesture, the one from its start (the preview is not written). */
function committedProject(store: ProjectStore): Project {
  const p = store.committed.peek();
  if (!p) throw new Error('session closed');
  return p;
}

function currentProject(store: ProjectStore): Project {
  const p = store.project.value;
  if (!p) throw new Error('session closed');
  return p;
}

/** File name without folder separators. */
function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/]/g, '-').trim();
  return cleaned === '' ? 'imagem.jpg' : cleaned;
}

const reportCleanupFailure = (e: unknown) => reportError('session.cleanup', e);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Is the file exactly the serialization of the in-memory project? Only then does the project count as
 * "what the disk has" (`written`): a project that was migrated, repaired on open or written by another
 * program in a non-canonical format differs from the disk, and the first change needs to save.
 */
function sameAsDisk(project: Project, text: string | null | undefined): boolean {
  if (text === null || text === undefined) return false;
  return (
    serialize({ ...project, revision: readRevision(text) ?? project.revision }) === text
  );
}

/** What the session knows about the `mapping.json` on disk (see `openSession`). */
interface DiskState {
  readonly revision: number;
  /** Text last read or written; `null` if the session does not know it. */
  readonly text: string | null;
  readonly lastModified: number | null;
}

/** What the session knows about a written `specs/<id>/` folder: the version and the specialization file. */
interface WrittenPackage {
  readonly key: string;
  /** The specialization file, relative to the folder (written by `specFiles`, not by the package). */
  readonly specRel: string;
}

/** A deferred write of a file, which records what it wrote when it finishes. */
type Job = () => Promise<void>;

/** A package that the save will write into `specs/<folder>/`. */
interface PlannedPackage {
  readonly spec: { readonly id: string; readonly file: string };
  readonly dir: string;
  readonly key: string;
  readonly have: WrittenPackage | undefined;
  readonly files: ReadonlyMap<string, string | Blob>;
}

const packageKey = (s: { readonly id: string; readonly version: number }): string =>
  `${s.id}@${s.version}`;

export function openSession(options: SessionOptions): ProjectSession {
  const { storage, prepareImage } = options;
  const store = createProjectStore({ now: options.now });
  // The components are read further below (they need the package cache); the actions only ask for
  // the catalog at the time of use.
  const baseActions = createProjectActions(store, {
    newId: options.newId,
    components: () => components.catalog.peek(),
    perspective: () => perspective.openId(),
    onArrival: (infos) => {
      // Accumulates: the notice of the first root in the queue stays after the second one is created.
      const roots = new Set(infos.map((info) => info.root));
      perspective.arrivals.value = [
        ...perspective.arrivals.peek().filter((info) => !roots.has(info.root)),
        ...infos,
      ];
    },
  });
  // The "Only me" ones live in memory together with the "For everyone" ones (`localIds` tells them apart); the
  // `mapping.json` is always `fileOf(project)`, without them.
  const localOption = options.localPerspectives;
  const localStore = localOption?.store ?? null;
  const joined = mergeLocalPerspectives(
    options.project,
    localOption?.initial ?? [],
    options.project,
  );
  store.load(joined.project, { readOnly: options.readOnly });
  const perspective = createPerspectiveState({
    store,
    projectId: options.project.project.id,
    localAvailable: localStore !== null,
    localIds: joined.ids,
  });
  const localSync = attachLocalSync({
    store,
    state: perspective,
    localStore,
    projectId: options.project.project.id,
    initial: localOption?.initial ?? [],
  });
  const fileOf = (p: Project): Project => fileProject(p, perspective.localIds.peek());
  const now = options.now ?? (() => new Date().toISOString());
  const proposals = createProposalStore({
    storage,
    initial: options.proposals,
    now,
    onChanged: () => options.onChanged?.(),
  });
  const threads = createThreadStore({
    storage,
    ...(options.threads === undefined ? {} : { initial: options.threads }),
    resolvedLoaded: options.threadsResolvedLoaded ?? options.threads !== undefined,
    onChanged: () => options.onChanged?.(),
  });

  // Image files that the session knows are written and referenced.
  const stored = new Set(imageFileNames(options.project.containers));
  // Image files that the session wrote and that no written `mapping.json` cites yet: if
  // the project is reloaded from disk before a save cites them, they are orphans and go away.
  const pendingFiles = new Set<string>();
  // Paths already chosen for an image that is being imported or replaced and has not yet
  // been written: reserved in the same synchronous step as the choice, so two concurrent
  // imports never get the same name.
  const reservedFiles = new Set<string>();
  // Content of the images removed from storage, for undo to restore.
  // It only keeps files that some history snapshot still references.
  const trash = new Map<string, Blob>();
  // Copies of `specs/` written (path → text). The content lives in the project, so
  // undoing apply/remove specialization only needs to rewrite or delete.
  const writtenSpecs = specFiles(options.project);
  // Library packages (`specs/<id>/`): the written folder (folder → version) and, by
  // `id@version`, the in-memory content (without the specialization file, which lives in the project),
  // so that undo/redo of apply, update and remove can rewrite what `cleanUp` deleted.
  // Only the session keeps bytes; the base store never does.
  const writtenPackages = new Map<string, WrittenPackage>();
  const packageCache = new Map<string, Map<string, string | Blob>>();
  const libraryIssues = signal<LibraryIssues>(options.libraryIssues ?? new Map());
  const components = createComponentLibrary({
    project: store.committed,
    readText: async (path) => (await storage.readSpecFile(path))?.text() ?? null,
    readBytes: async (path) => (await storage.readSpecFile(path))?.arrayBuffer() ?? null,
    cached: (id, version) => packageCache.get(packageKey({ id, version })),
  });
  const catalogs = createProjectCatalogs({
    project: store.committed,
    // The session's in-memory copy (apply or update not yet written) takes precedence over the disk.
    read: async (owner) => {
      const dir = packageDirOf(owner.file);
      if (dir === null) return null;
      const cached = packageCache.get(packageKey(owner));
      if (cached) {
        const files = new Map(cached);
        const specText = specFiles(store.committed.peek() ?? options.project).get(
          owner.file,
        );
        if (specText !== undefined) files.set(owner.file.slice(dir.length + 1), specText);
        return libraryInputFiles(files);
      }
      const pkg = await readSpecPackage(storage, dir);
      return pkg === null ? null : toLibraryFiles(dir, pkg.entries);
    },
  });
  let packagesTouched = false;
  // Specializations whose package was written and not yet validated again: the validation runs
  // after the `mapping.json` and, if the save fails before, the request carries over to the next one.
  const libraryDirty = new Set<string>();
  const folderCalls = options.folderCalls ?? null;
  /** Measures `fn` on the folder's counter; without a counter, just runs it. */
  const measure = <T>(
    op: FolderOp | (() => FolderOp),
    fn: () => Promise<T>,
  ): Promise<T> => (folderCalls ? folderCalls.measure(op, fn) : fn());
  /** The save in progress wrote a library package (`library` instead of `save`). */
  let wrotePackage = false;
  // Package folders rewritten over an old version: they may have files that only the
  // old version had. They go away after the `mapping.json` is written (`sweepPackages`); the folder stays
  // here until the sweep succeeds, and each sweep recomputes what is left from the listing.
  const staleDirs = new Set<string>();
  const trackPackages = (p: Project) => {
    writtenPackages.clear();
    for (const s of p.specializations) {
      const dir = packageDirOf(s.file);
      if (dir !== null && s.spec) {
        writtenPackages.set(dir, {
          key: packageKey(s),
          specRel: s.file.slice(dir.length + 1),
        });
      }
    }
  };
  trackPackages(options.project);
  /** Keeps the package in the cache under `id@version`, without the specialization file. */
  const cachePackage = (
    spec: { readonly id: string; readonly version: number },
    files: SpecPackageFiles,
  ) => {
    const specName = packageSpecNameOf(files, spec.id);
    const copy = new Map<string, string | Blob>();
    for (const [path, data] of files) if (path !== specName) copy.set(path, data);
    packageCache.set(packageKey(spec), copy);
  };
  // Packages that only exist in memory: in the cache and outside `writtenPackages`, so the first
  // save writes them (the `trackPackages` above would take them as written).
  for (const staged of options.stagedPackages ?? []) {
    cachePackage(staged.spec, staged.files);
    for (const s of options.project.specializations) {
      const dir = packageDirOf(s.file);
      if (s.id !== staged.spec.id) continue;
      writtenSpecs.delete(s.file);
      if (dir !== null) writtenPackages.delete(dir);
    }
  }
  /** Reads the folder from disk into the cache (once per `id@version`), before it is rewritten or deleted. */
  const snapshotPackage = async (dir: string, written: WrittenPackage) => {
    if (packageCache.has(written.key)) return;
    const files = new Map<string, string | Blob>();
    const paths = (await storage.listSpecDir(dir)).filter(
      (path) => path.slice(dir.length + 1) !== written.specRel,
    );
    // Reads in parallel with a limit; the map follows the order of the listing.
    const read = await mapLimit(paths, FOLDER_CONCURRENCY, async (path) => {
      const blob = await storage.readSpecFile(path);
      if (!blob) return null;
      const rel = path.slice(dir.length + 1);
      // In-memory copy: in a folder, the `File` read stops being readable when it is removed.
      const data = isTextPackageFile(rel)
        ? await blob.text()
        : new Blob([await blob.arrayBuffer()], { type: blob.type });
      return [rel, data] as const;
    });
    for (const item of read) if (item) files.set(item[0], item[1]);
    packageCache.set(written.key, files);
  };
  const forgetSpecsUnder = (dir: string) => {
    for (const file of [...writtenSpecs.keys()]) {
      if (file.startsWith(`${dir}/`)) writtenSpecs.delete(file);
    }
  };
  // Pre-migration original not yet kept: the first save writes it first.
  let pendingBackup = options.migratedFrom ?? null;
  const backupSaved = signal<number | null>(null);

  // What the session knows about the `mapping.json` on disk: the revision and the text it read (or wrote
  // last) and the `lastModified` seen. The revision lives here, not in the store's project: each save
  // increments it without creating an undo entry or rendering the interface.
  let disk: DiskState = {
    revision: options.project.revision,
    text: options.loadedText ?? null,
    lastModified: null,
  };
  // The committed snapshot that the disk has (by identity): decides whether there is anything to save. It starts out
  // equal to the open project only when the file is exactly its serialization.
  let written: Project | null = sameAsDisk(options.project, options.loadedText)
    ? store.committed.peek()
    : null;
  // The committed snapshot of the last zip that went out (`noteExported`, at the download point):
  // writing it later is not a "change". Generating the zip without downloading does not count (8.7).
  let exported: Project | null = null;
  const conflict = signal<ExternalConflict | null>(null);
  const reloads = signal(0);
  const watchable = typeof storage.statMapping === 'function';
  // Stamp (size + date) of each image file as the session knows it.
  const imageStamps = new Map<string, string | null>();
  const stampOf = (path: string): Promise<string | null> =>
    storage.statImage ? storage.statImage(path).catch(() => null) : Promise.resolve(null);
  const stampImages = async (paths: readonly string[]) => {
    // In parallel (one `stat` per image, no dependency among them); writes in order.
    const stamps = await Promise.all(paths.map(stampOf));
    paths.forEach((path, i) => imageStamps.set(path, stamps[i] ?? null));
  };
  const initialStamps = watchable
    ? stampImages(imageFileNames(options.project.containers)).catch(reportCleanupFailure)
    : Promise.resolve();
  const putImage = async (path: string, data: Blob) => {
    await storage.writeImage(path, data);
    pendingFiles.add(path);
    if (watchable) imageStamps.set(path, await stampOf(path));
  };
  /** Files in `images/` in storage; unreadable = empty list (the choice goes on with what the session knows). */
  const listStoredImages = async (): Promise<string[]> => {
    try {
      return await storage.listImages();
    } catch (e) {
      reportError('session.listImages', e);
      return [];
    }
  };
  /** Everything that occupies a name in `images/` and the session knows without reading the folder. */
  const sessionImageFiles = (): string[] => [
    ...store.referencedImageFiles(),
    ...stored,
    ...pendingFiles,
    ...trash.keys(),
    ...reservedFiles,
  ];
  /**
   * Chooses and reserves the path of a new image: free among the containers, the undo
   * history, the trash, the saves in progress and the files already in the folder (cited or
   * not), case-insensitively. The reservation happens before any other
   * `await`; the caller releases it (`reservedFiles.delete`) when done.
   */
  const reserveImageFile = async (name: string): Promise<string> => {
    const listed = await listStoredImages();
    const path = uniqueImageFile(
      currentProject(store),
      safeFileName(name),
      new Set([...listed, ...sessionImageFiles()]),
    );
    reservedFiles.add(path);
    return path;
  };
  const statMapping = (): Promise<number | null> =>
    storage.statMapping ? storage.statMapping().catch(() => null) : Promise.resolve(null);
  /**
   * The only point where the session reads the `mapping.json` after it is open (ESLint rule). In a folder,
   * a single read (`getFile`) brings the text and the date; without `loadMappingStamped`, the date is `null`.
   */
  const readMapping = async (): Promise<{
    readonly text: string;
    readonly lastModified: number | null;
  } | null> => {
    if (!storage.loadMappingStamped) {
      const text = await storage.loadMapping();
      return text === null ? null : { text, lastModified: null };
    }
    return storage.loadMappingStamped();
  };
  const readMappingText = async () => (await readMapping())?.text ?? null;

  /**
   * Does the disk differ from what the session read or wrote? With the text known, any difference
   * counts (the `revision` is part of it, so a hand edit, which does not change it, is also
   * noticed); without the text, only the `revision` can tell.
   */
  const changedExternally = (text: string): boolean =>
    disk.text !== null ? text !== disk.text : readRevision(text) !== disk.revision;

  // The file's date as it was on open, so the first check does not need to read it.
  // The `stat` comes after the read that opened the project, so it only holds if the file is still the
  // known one (read here once); if it already changed, the first check treats it as usual.
  const initialStat = watchable
    ? (async () => {
        if (disk.lastModified !== null) return;
        // A single read: the text and the date come together (without the date, it falls back to the earlier `stat`).
        const read = await readMapping().catch(() => null);
        if (read === null || changedExternally(read.text) || disk.lastModified !== null)
          return;
        const modified = read.lastModified ?? (await statMapping());
        if (modified !== null) disk = { ...disk, lastModified: modified };
      })()
    : Promise.resolve();

  /**
   * Can it write? With no file (deleted from outside) or with the file equal to the known one, yes. Empty
   * and different means someone is writing: wait and reread, up to `EMPTY_RETRY_ATTEMPTS` times, and then
   * give up (`EmptyMappingError`). Truly different: open the conflict and refuse
   * (`ExternalChangeError`). Without the known text (`loadedText` absent; the app always passes it)
   * the session only compares revisions, and an empty file has no revision: there is no way to tell whether it is
   * someone's, so it writes, as before.
   */
  const assertWritable = async () => {
    for (let attempt = 1; ; attempt++) {
      const text = await readMappingText();
      if (text === null || !changedExternally(text)) return;
      if (text.trim() === '' && disk.text === null) return;
      if (text.trim() !== '') {
        conflict.value = { reloadFailed: false };
        throw new ExternalChangeError();
      }
      if (attempt >= EMPTY_RETRY_ATTEMPTS) throw new EmptyMappingError();
      await sleep(EMPTY_RETRY_DELAY_MS);
    }
  };

  /**
   * Updates the library issues after a save: only the specializations whose package
   * was written (`libraryDirty`) are validated again, from the in-memory files (one without an in-memory
   * copy, or without a previous result, is read from disk, just that one); the others stay as
   * they were and those the project no longer has go away. The result is that of `loadLibraryIssues`.
   */
  const refreshLibraryIssues = async (p: Project) => {
    const previous = libraryIssues.value;
    // Snapshot: whatever becomes dirty during the `await` below is left for the next refresh.
    const pending = [...libraryDirty];
    const dirty = new Set(pending);
    const specs = specFiles(p);
    const known = new Map<string, readonly AppLibraryIssue[]>();
    const unknown: Project['specializations'][number][] = [];
    for (const s of p.specializations) {
      if (packageDirOf(s.file) === null) continue;
      const issues = dirty.has(s.id)
        ? memoryLibraryIssues(s, specs.get(s.file))
        : previous.get(s.id);
      if (issues) known.set(s.id, issues);
      else unknown.push(s);
    }
    const fromDisk = await loadLibraryIssues(storage, { specializations: unknown });
    const next = new Map<string, readonly AppLibraryIssue[]>();
    for (const s of p.specializations) {
      const issues = known.get(s.id) ?? fromDisk.get(s.id);
      if (issues) next.set(s.id, issues);
    }
    for (const id of pending) libraryDirty.delete(id);
    libraryIssues.value = next;
  };

  /** Valida a especialização pelo pacote em memória (mais o texto dela); `undefined` sem a cópia. */
  const memoryLibraryIssues = (
    s: { readonly id: string; readonly version: number; readonly file: string },
    specText: string | undefined,
  ): readonly AppLibraryIssue[] | undefined => {
    const dir = packageDirOf(s.file);
    const cached = packageCache.get(packageKey(s));
    if (dir === null || !cached || specText === undefined) return undefined;
    const files = new Map(cached).set(s.file.slice(dir.length + 1), specText);
    return libraryIssuesOf(s, dir, packageEntriesOf(dir, files));
  };

  /**
   * Os pacotes da biblioteca que o projeto traz e a pasta ainda não tem (a versão nova, ou a que
   * voltou pelo desfazer): guarda a versão antiga em memória (em paralelo com limite) e devolve
   * uma gravação por arquivo. Cada pacote só entra em `writtenPackages` quando o último arquivo
   * dele gravou; a versão antiga só é guardada, nada é apagado agora.
   */
  const planPackageWrites = async (p: Project): Promise<Job[]> => {
    const planned: PlannedPackage[] = [];
    for (const s of p.specializations) {
      const dir = packageDirOf(s.file);
      if (dir === null || !s.spec) continue;
      const key = packageKey(s);
      const have = writtenPackages.get(dir);
      if (have?.key === key) continue;
      const files = packageCache.get(key);
      if (!files) {
        reportError('session.package', `pacote ${key} fora da memória: ${dir}`);
        continue;
      }
      planned.push({ spec: s, dir, key, have, files });
    }
    await mapLimit(
      planned.filter((pkg) => pkg.have),
      FOLDER_CONCURRENCY,
      (pkg) => snapshotPackage(pkg.dir, pkg.have as WrittenPackage),
    );
    const jobs: Job[] = [];
    for (const pkg of planned) {
      // O arquivo da especialização precisa ser regravado com a versão nova.
      forgetSpecsUnder(pkg.dir);
      staleDirs.add(pkg.dir);
      let remaining = pkg.files.size;
      const done = () => {
        writtenPackages.set(pkg.dir, {
          key: pkg.key,
          specRel: pkg.spec.file.slice(pkg.dir.length + 1),
        });
        libraryDirty.add(pkg.spec.id);
        packagesTouched = true;
        wrotePackage = true;
      };
      if (remaining === 0) done();
      for (const [rel, data] of pkg.files) {
        jobs.push(async () => {
          await storage.writeSpecFile(`${pkg.dir}/${rel}`, data);
          if (--remaining === 0) done();
        });
      }
    }
    return jobs;
  };

  /** Uma gravação por cópia de `specs/` nova ou alterada; registra o texto depois de gravada. */
  const planSpecWrites = (specs: ReadonlyMap<string, string>): Job[] =>
    [...specs]
      .filter(([file, text]) => writtenSpecs.get(file) !== text)
      .map(([file, text]) => async () => {
        await storage.writeSpec(file, text);
        writtenSpecs.set(file, text);
      });

  /**
   * Grava o projeto: restaura imagens que voltaram (undo) e grava as cópias de
   * `specs/` novas ou alteradas, grava o `mapping.json` e só então remove as
   * imagens, cópias e arquivos de pacote que deixaram de ser usados. Assim o `mapping.json`
   * em disco nunca aponta para um arquivo já apagado: nada é apagado antes do `mapping.json`
   * novo (a pasta de um pacote cuja versão muda é regravada por cima, não apagada). Grava o
   * projeto confirmado: um gesto em andamento só chega ao disco quando confirmado
   * (`commitGesture` sobe a revisão e agenda).
   * Gravado o `mapping.json`, a gravação conta como feita: uma falha na limpeza vai para o
   * Diagnóstico (`session.cleanup`) e a próxima gravação tenta de novo.
   */
  const writeProject = async (p: Project) => {
    wrotePackage = false;
    await assertWritable();
    let wrote = false;
    if (pendingBackup) {
      // Se o backup falhar, o salvamento falha junto: o original não é sobrescrito.
      const date = options.now ? new Date(options.now()) : new Date();
      await storage.writeBackup(
        backupFileName(pendingBackup.version, date),
        pendingBackup.text,
      );
      backupSaved.value = pendingBackup.version;
      pendingBackup = null;
    }
    const referenced = new Set(imageFileNames(p.containers));
    for (const file of referenced) {
      const blob = trash.get(file);
      if (stored.has(file) || !blob) continue;
      await putImage(file, blob);
      stored.add(file);
      trash.delete(file);
      wrote = true;
    }
    // Pacotes da biblioteca: a versão nova (ou a que voltou pelo desfazer) entra antes do
    // `mapping.json`, regravada POR CIMA da pasta: a versão antiga é só guardada em memória
    // (para o desfazer) e nada é apagado agora, nem o arquivo da especialização, que o laço de
    // `specFiles` abaixo regrava. Os arquivos que só a versão antiga tinha ficam até o
    // `mapping.json` gravado (`sweepPackages`). Janela que sobra: durante a regravação a pasta
    // pode ter arquivos da versão nova enquanto o `mapping.json` ainda cita a antiga; nada some.
    const specs = specFiles(p);
    // Todos os arquivos (do pacote e as cópias de `specs/`) gravam antes do `mapping.json`, em
    // paralelo com limite; cada um só registra o que gravou depois de gravado, e a falha de
    // qualquer um aborta a gravação aqui.
    const jobs = [...(await planPackageWrites(p)), ...planSpecWrites(specs)];
    await mapLimit(jobs, FOLDER_CONCURRENCY, (job) => job());
    if (jobs.length > 0 || wrotePackage) wrote = true;
    // As gravações acima levam tempo: confere de novo antes de sobrescrever o arquivo.
    if (wrote) await assertWritable();
    const revision = disk.revision + 1;
    const text = serialize({ ...fileOf(p), revision });
    await storage.saveMapping(text);
    disk = { revision, text, lastModified: await statMapping() };
    written = p;
    // Só o que este `mapping.json` cita deixa de ser pendente: uma imagem posta durante esta
    // gravação (não citada por `p`) continua pendente até a gravação que a citar.
    for (const file of referenced) pendingFiles.delete(file);
    if (p !== exported) options.onChanged?.();
    await cleanUp(referenced, specs).catch(reportCleanupFailure);
    if (packagesTouched) {
      packagesTouched = false;
      await refreshLibraryIssues(p);
    }
  };

  /**
   * O disco já tem `p`? Pela identidade (o atalho) ou pelo conteúdo a menos do `updatedAt`
   * do projeto: o desfazer carimba um `updatedAt` novo no snapshot restaurado, e voltar ao que
   * o disco tem não é mudança a gravar (S5). Só vale com `written` conhecido (ver `sameAsDisk`).
   */
  const onDisk = (p: Project): boolean => {
    if (p === written) return true;
    if (written === null || disk.text === null) return false;
    return (
      serialize({
        ...fileOf(p),
        revision: disk.revision,
        project: { ...p.project, updatedAt: written.project.updatedAt },
      }) === disk.text
    );
  };

  /** A gravação do autosave (o `save()` da fila): nada a fazer se o disco já tem o confirmado. */
  const persist = async () => {
    const p = store.committed.peek();
    if (!p || onDisk(p)) return;
    try {
      await measure(
        () => (wrotePackage ? 'library' : 'save'),
        () => writeProject(p),
      );
    } catch (e) {
      if (e instanceof EmptyMappingError) reportError('session.emptyMapping', e);
      throw e;
    }
  };

  /** Remove as imagens e cópias de `specs/` que o `mapping.json` gravado deixou de usar. */
  const cleanUp = async (
    referenced: ReadonlySet<string>,
    specs: ReadonlyMap<string, string>,
  ) => {
    const inHistory = store.referencedImageFiles();
    for (const file of [...stored]) {
      if (referenced.has(file)) continue;
      if (inHistory.has(file)) {
        const blob = await storage.readImage(file);
        // Cópia em memória: numa pasta, o `File` lido deixa de ser legível quando o arquivo
        // é removido logo abaixo, e o "refazer" precisa regravar a imagem.
        if (blob)
          trash.set(
            file,
            new Blob([await blob.arrayBuffer()], {
              type: blob.type || imageMimeType(file),
            }),
          );
      }
      await storage.removeImage(file);
      imageStamps.delete(file);
      stored.delete(file);
    }
    // O histórico encolhe (limite de 100, novo gesto descarta o "refazer"): solta
    // o conteúdo dos arquivos que nenhum snapshot restauraria mais.
    const stillInHistory = store.referencedImageFiles();
    for (const file of [...trash.keys()]) {
      if (!stillInHistory.has(file)) trash.delete(file);
    }
    // Pastas de pacote que o `mapping.json` gravado deixou de usar: guarda o conteúdo em memória
    // (o desfazer pode trazê-la de volta) e remove a pasta inteira.
    const usedDirs = new Set([...specs.keys()].map((file) => packageDirOf(file)));
    for (const [dir, written] of [...writtenPackages]) {
      if (usedDirs.has(dir)) continue;
      await snapshotPackage(dir, written);
      await storage.removeSpecDir(dir);
      forgetSpecsUnder(dir);
      writtenPackages.delete(dir);
      staleDirs.delete(dir);
      packagesTouched = true;
    }
    for (const file of [...writtenSpecs.keys()]) {
      if (specs.has(file)) continue;
      await storage.removeSpec(file);
      writtenSpecs.delete(file);
    }
    await sweepPackages();
  };

  /**
   * Remove das pastas de pacote regravadas os arquivos que a versão gravada não tem (os da versão
   * antiga) e que não são o arquivo da especialização. Recalcula pela listagem da pasta, então uma
   * falha no meio (ou na listagem) não perde nada: a pasta continua em `staleDirs` e a próxima
   * gravação tenta de novo.
   */
  const sweepPackages = async () => {
    for (const dir of [...staleDirs]) {
      const have = writtenPackages.get(dir);
      const files = have ? packageCache.get(have.key) : undefined;
      if (!have || !files) {
        // Pasta que saiu do projeto (o `cleanUp` já a removeu) ou versão sem conteúdo conhecido.
        staleDirs.delete(dir);
        continue;
      }
      for (const path of await storage.listSpecDir(dir)) {
        const rel = path.slice(dir.length + 1);
        if (rel === have.specRel || files.has(rel)) continue;
        await storage.removeSpecFile(path);
      }
      staleDirs.delete(dir);
    }
  };

  const saver = createAutoSaver(persist, options.autosaveDelay);
  /**
   * Operações caras (imagens e especializações) gravam sem esperar o debounce: o trabalho
   * de refazê-las é grande demais para ficar só em memória até o fim do debounce. A gravação entra na
   * mesma fila do autosave, então duas seguidas não correm em paralelo.
   */
  const saveNow = <R extends { readonly ok: boolean }>(result: R): R => {
    if (result.ok) void saver.flush();
    return result;
  };
  const actions: ProjectActions = {
    ...baseActions,
    removeContainer: (containerId) => saveNow(baseActions.removeContainer(containerId)),
    // O pacote entra no cache em memória antes da gravação (que começa no `saveNow`).
    applySpecialization: (spec, packageFiles) => {
      const result = baseActions.applySpecialization(spec, packageFiles);
      if (result.ok && packageFiles) cachePackage(spec, packageFiles);
      return saveNow(result);
    },
    updateSpecialization: (spec, texts, packageFiles) => {
      const result = baseActions.updateSpecialization(spec, texts, packageFiles);
      if (result.ok && packageFiles) cachePackage(spec, packageFiles);
      return saveNow(result);
    },
    removeSpecialization: (specId, mode, texts) =>
      saveNow(baseActions.removeSpecialization(specId, mode, texts)),
  };
  const threadActions = createThreadActions({
    store,
    threads,
    identity,
    now,
    newId: options.newId ?? (() => crypto.randomUUID()),
    ...(storage.copyId === undefined ? {} : { copyId: storage.copyId }),
  });
  const proposalActions = createProposalActions({
    store,
    proposals,
    storage,
    now,
    newId: options.newId ?? (() => crypto.randomUUID()),
    // A imagem aceita entra no projeto como as da importação: a sessão passa a geri-la
    // (e o desfazer a remove e restaura pelo mesmo caminho das demais imagens).
    takenImageFiles: async () =>
      new Set([...(await listStoredImages()), ...sessionImageFiles()]),
    putProjectImage: async (path, data) => {
      await putImage(path, data);
      stored.add(path);
    },
    dropProjectImage: async (path) => {
      if (stored.delete(path)) await storage.removeImage(path);
      pendingFiles.delete(path);
      imageStamps.delete(path);
    },
    stagePackage: cachePackage,
    flush: () => saver.flush(),
    ...(folderCalls ? { measure } : {}),
  });

  /** O Quem vê não muda com o projeto travado, em revisão ou com um gesto em andamento. */
  const localChangeBlocked = (): ActionResult | null => {
    if (store.readOnly.peek()) return { ok: false, error: 'read-only' };
    if (store.reviewing.peek()) return { ok: false, error: 'reviewing' };
    if (store.gestureActive.peek()) return { ok: false, error: 'gesture-active' };
    return null;
  };
  /** O arquivo muda sem o projeto mudar (a perspectiva trocou de lugar): força a regravação. */
  const rewriteFile = () => {
    written = null;
    saver.schedule();
  };
  /** Só eu: grava no navegador primeiro; o arquivo é regravado depois, sem ela. */
  const makeLocal = async (id: string): Promise<ActionResult> => {
    if (!perspective.localAvailable) return { ok: false, error: 'local-unavailable' };
    if (!(await localSync.persistIncluding(id))) {
      return { ok: false, error: 'local-unavailable' };
    }
    perspective.setLocal(id, true);
    rewriteFile();
    return { ok: true, value: undefined };
  };
  /** Para todos: o arquivo grava com ela e só então o navegador a esquece. */
  const makeShared = async (id: string): Promise<ActionResult> => {
    localSync.hold(id);
    perspective.setLocal(id, false);
    rewriteFile();
    const saved = await saver.flush();
    if (!saved.ok) perspective.setLocal(id, true);
    localSync.release(id);
    return saved.ok
      ? { ok: true, value: undefined }
      : { ok: false, error: 'save-failed' };
  };
  const setPerspectiveLocal = async (
    id: string,
    local: boolean,
  ): Promise<ActionResult> => {
    const blocked = localChangeBlocked();
    if (blocked) return blocked;
    const current = store.committed.peek();
    if (!current) return { ok: false, error: 'no-project' };
    if (!current.perspectives.some((x) => x.id === id)) {
      return { ok: false, error: 'not-found' };
    }
    if (perspective.localIds.peek().has(id) === local)
      return { ok: true, value: undefined };
    return local ? makeLocal(id) : makeShared(id);
  };
  const perspectiveActions = createPerspectiveActions({
    store,
    state: perspective,
    newId: options.newId ?? (() => crypto.randomUUID()),
    setPerspectiveLocal,
  });

  let lastRevision = store.revision.peek();
  const stopWatching = effect(() => {
    const revision = store.revision.value;
    if (revision === lastRevision) return;
    lastRevision = revision;
    // Pela identidade (barato, a cada edição); a gravação confere o conteúdo (`onDisk`) e,
    // se o desfazer voltou ao que o disco tem, só acerta o status, sem ler nem gravar.
    if (store.committed.peek() !== written) {
      saver.schedule();
    } else if (saver.status.peek() !== 'saved') {
      void saver.flush();
    }
  });

  /**
   * Troca o projeto em memória pelo que veio do disco, descartando histórico e pendências. Só
   * de dentro de um trabalho da fila, logo depois da guarda (`idle()`), sem `await` antes de
   * trocar o projeto. Apaga os arquivos de imagem que a sessão gravou e nenhum `mapping.json`
   * gravado cita (`pendingFiles`): sem isso ficariam órfãos na pasta para sempre.
   */
  const adopt = async (
    loaded: Extract<LoadProjectResult, { ok: true }>,
    modified: number | null,
  ) => {
    const { project } = loaded;
    // As "Só eu" da memória seguem com o projeto do disco, reconciliadas com a mudança.
    const carried = carryLocalPerspectives(
      store.committed.peek(),
      project,
      perspective.localIds.peek(),
    );
    batch(() => {
      perspective.setLocalIds(carried.ids);
      perspective.arrivals.value = [];
      store.load(carried.project, { readOnly: loaded.readOnly });
    });
    // O `load` zera o contador de revisão do store, o que agendaria uma gravação: descarta.
    lastRevision = store.revision.peek();
    saver.reset();
    const referenced = new Set(imageFileNames(project.containers));
    const orphans = [...pendingFiles].filter((file) => !referenced.has(file));
    pendingFiles.clear();
    stored.clear();
    for (const file of referenced) stored.add(file);
    trash.clear();
    writtenSpecs.clear();
    for (const [file, text] of specFiles(project)) writtenSpecs.set(file, text);
    packageCache.clear();
    libraryDirty.clear();
    staleDirs.clear();
    trackPackages(project);
    // Os arquivos do pacote podem ter mudado por fora sem mudar a versão: lê de novo.
    components.invalidate();
    catalogs.invalidate();
    libraryIssues.value = loaded.libraryIssues;
    // Arquivo que já está no schema atual não precisa de backup: zera o que sobrou da abertura.
    pendingBackup =
      loaded.migratedFrom === null
        ? null
        : { version: loaded.migratedFrom, text: loaded.text };
    disk = {
      revision: readRevision(loaded.text) ?? 0,
      text: loaded.text,
      lastModified: modified,
    };
    written = sameAsDisk(project, loaded.text) ? store.committed.peek() : null;
    reloads.value++;
    for (const file of orphans) {
      await storage.removeImage(file).catch(reportCleanupFailure);
      imageStamps.delete(file);
    }
  };

  /**
   * Compara os arquivos de imagem com o que a sessão conhece e avisa os trocados ou
   * novos (`all`: depois de recarregar o projeto, em que as imagens novas também contam).
   */
  const checkImages = async (all: boolean) => {
    const project = store.project.peek();
    if (!project || !storage.statImage) return;
    await initialStamps;
    const changed: string[] = [];
    const current = new Set<string>();
    // Os carimbos são independentes: lidos juntos, comparados na ordem dos containers.
    const stamped = await Promise.all(
      imageFileNames(project.containers).map(
        async (file) => [file, await stampOf(file)] as const,
      ),
    );
    for (const [file, stamp] of stamped) {
      current.add(file);
      const known = imageStamps.has(file);
      if (known ? imageStamps.get(file) !== stamp : all) changed.push(file);
      imageStamps.set(file, stamp);
    }
    for (const path of [...imageStamps.keys()]) {
      if (!current.has(path)) imageStamps.delete(path);
    }
    if (changed.length > 0) options.onImagesChanged?.(changed);
  };

  let closed = false;
  /** Sem nada local a perder: nenhuma gravação pendente e nenhum gesto em andamento. */
  const idle = () => saver.status.peek() === 'saved' && !store.gestureActive.peek();

  /**
   * O trabalho de conferência (na fila: nenhuma gravação corre junto). Edições do usuário
   * continuam acontecendo entre os `await` (são síncronas), por isso a guarda `idle()` é relida
   * logo antes de trocar o projeto.
   */
  const syncProject = async (images: boolean): Promise<SyncResult> => {
    if (closed || !store.project.peek() || conflict.peek()) return 'unchanged';
    if (store.gestureActive.peek()) return 'busy';
    // Gravação agendada ou na fila: ela mesma confere o arquivo antes de gravar.
    if (saver.status.peek() === 'saving') return 'busy';
    await initialStat;
    const modified = await statMapping();
    let result: SyncResult = 'unchanged';
    if (modified !== null && modified !== disk.lastModified) {
      const text = await readMappingText();
      if (text !== null && changedExternally(text)) {
        const erroring = saver.status.peek() === 'error';
        if (text.trim() === '' && !erroring) {
          // Um editor ainda escrevendo; sem pendência, nada a proteger: tenta no próximo ciclo.
        } else if (erroring) {
          // A pendência não chega ao disco sozinha: a pessoa decide (um arquivo que ficou vazio
          // de vez também cai aqui, e "Manter as minhas" é a saída).
          conflict.value = { reloadFailed: false };
          result = 'conflict';
        } else {
          const loaded = await loadProject(storage);
          // Ilegível (um editor ainda escrevendo): tenta de novo no próximo ciclo.
          if (loaded.ok) {
            if (closed) return 'unchanged';
            // Uma edição entrou durante as leituras: a gravação dela decide.
            if (!idle()) return 'busy';
            await adopt(loaded, modified);
            result = 'reloaded';
          }
        }
      } else if (text !== null) {
        // Só a data mudou (um `touch`, a sincronização de uma nuvem): o conteúdo é o mesmo.
        disk = { ...disk, lastModified: modified };
      }
    }
    if (result === 'reloaded' || images) await checkImages(result === 'reloaded');
    return result;
  };

  // A conferência enfileirada e ainda não iniciada: chamadas concorrentes acumulam `images`
  // nela e recebem a mesma promessa (uma em curso e no máximo uma esperando).
  let pendingSync: { promise: Promise<SyncResult>; images: boolean } | null = null;
  const sync = (syncOptions: { readonly images?: boolean } = {}): Promise<SyncResult> => {
    if (!watchable || closed || !store.project.peek())
      return Promise.resolve('unchanged');
    if (pendingSync) {
      pendingSync.images ||= syncOptions.images === true;
      return pendingSync.promise;
    }
    const entry = {
      images: syncOptions.images === true,
      promise: Promise.resolve<SyncResult>('unchanged'),
    };
    // O ciclo inteiro (o arquivo do projeto e as varreduras de propostas e conversas) é uma
    // medida só.
    entry.promise = measure('sync', async () => {
      const result = await saver.enqueue(() => {
        pendingSync = null;
        return syncProject(entry.images);
      });
      // As propostas não esperam o projeto: decisões e notas são gravadas na hora e
      // refeitas sobre a versão do disco, então não há "alteração local pendente" a proteger.
      // Fora da fila da sessão: a fila das propostas pode esperar por ela (`flush`), nunca o
      // contrário.
      // As conversas também: só `comments/`, pelo carimbo, lendo só o arquivo que mudou.
      // As duas varreduras não compartilham arquivo, fila nem estado (`proposals/` e
      // `comments/`, cada uma com a sua fila): rodam juntas.
      // A conferência completa (foco, volta à página: `images`) olha também as propostas finais;
      // a de ciclo as pula, já lidas (etapa #1777, decisão 8).
      await Promise.all([
        !closed && storage.statProposal
          ? proposals
              .scan({ full: entry.images })
              .catch((e: unknown) => reportError('proposals.scan', e))
          : undefined,
        !closed && storage.statThread
          ? threads.scan().catch((e: unknown) => reportError('threads.scan', e))
          : undefined,
      ]);
      return result;
    });
    pendingSync = entry;
    return entry.promise;
  };

  const resolveConflict = async (choice: 'reload' | 'keep') => {
    if (!conflict.peek()) return;
    if (choice === 'keep') {
      await saver.enqueue(async () => {
        if (!conflict.peek()) return;
        let text: string | null = null;
        try {
          text = await readMappingText();
        } catch (e) {
          // Ilegível (permissão revogada): segue como se o arquivo tivesse sumido; se a
          // gravação também falhar, o status diz.
          reportError('session.keep', e);
        }
        disk = {
          revision: (text === null ? null : readRevision(text)) ?? disk.revision,
          text,
          lastModified: await statMapping(),
        };
        // O disco passou a ter o arquivo de fora: as minhas vão por cima, mesmo que a pendência
        // tenha sido desfeita no meio.
        written = null;
        conflict.value = null;
        saver.schedule();
      });
      await saver.flush();
      return;
    }
    await saver.enqueue(async () => {
      if (!conflict.peek()) return;
      const modified = await statMapping();
      let loaded: LoadProjectResult;
      try {
        loaded = await loadProject(storage);
      } catch (e) {
        reportError('session.reload', e);
        conflict.value = { reloadFailed: true };
        return;
      }
      if (!loaded.ok) {
        reportError('session.reload', new Error(loaded.error));
        conflict.value = { reloadFailed: true };
        return;
      }
      await adopt(loaded, modified);
      conflict.value = null;
      await checkImages(true);
    });
  };

  return {
    storage,
    folderCalls,
    store,
    actions,
    proposals,
    proposalActions,
    threads,
    threadActions,
    perspective,
    perspectiveActions,
    libraryIssues,
    components,
    catalogs,
    saveStatus: saver.status,
    backupSaved,
    conflict,
    reloads,
    watchable,
    sync,
    busy: () =>
      !closed &&
      (saver.status.peek() === 'saving' ||
        store.gestureActive.peek() ||
        proposals.writing()),
    resolveConflict,

    async addImages(files, addOptions = {}) {
      const added: string[] = [];
      const failed: string[] = [];
      if (store.readOnly.value || store.reviewing.value || !store.project.value) {
        return { added, failed: files.map((f) => f.name) };
      }
      // Uma por vez: fotos grandes decodificadas em paralelo estouram a memória.
      for (const file of files) {
        let path: string | null = null;
        try {
          const prepared = await prepareImage(file);
          path = await reserveImageFile(prepared.name);
          await putImage(path, prepared.data);
          stored.add(path);
          const result = actions.addContainer(
            { file: path, width: prepared.width, height: prepared.height },
            addOptions.center,
          );
          if (!result.ok) throw new Error(result.error);
          added.push(path);
        } catch (e) {
          reportError('session.addImage', e);
          failed.push(file.name);
          if (path && stored.delete(path)) {
            pendingFiles.delete(path);
            await storage.removeImage(path).catch(reportCleanupFailure);
          }
        } finally {
          if (path) reservedFiles.delete(path);
        }
      }
      // Operação cara: grava sem esperar o debounce (ver `saveNow`).
      if (added.length > 0) await saver.flush();
      return { added, failed };
    },

    async replaceImage(containerId, file, confirmAspectChange) {
      if (store.readOnly.value || store.reviewing.value || !store.project.value) {
        return 'failed';
      }
      // Container sem arquivo não tem arquivo para trocar.
      if (
        currentProject(store).containers.some(
          (i) => i.id === containerId && i.file === null,
        )
      ) {
        return 'failed';
      }
      let path: string | null = null;
      try {
        const prepared = await prepareImage(file);
        const image = currentProject(store).containers.find((i) => i.id === containerId);
        if (!image) return 'failed';
        const next = { width: prepared.width, height: prepared.height };
        if (!canReplaceImage(currentProject(store), containerId, next)) return 'locked';
        const sameAspect = isSameAspect(image, next);
        if (!sameAspect) {
          const from = { width: image.width, height: image.height };
          if (!(await confirmAspectChange({ from, to: next }))) return 'cancelled';
        }
        path = await reserveImageFile(prepared.name);
        await putImage(path, prepared.data);
        stored.add(path);
        const result = actions.replaceContainer(
          containerId,
          { file: path, ...next },
          { confirmAspectChange: !sameAspect },
        );
        if (!result.ok) throw new Error(result.error);
        await saver.flush();
        return 'replaced';
      } catch (e) {
        reportError('session.replaceImage', e);
        if (path && stored.delete(path)) {
          pendingFiles.delete(path);
          await storage.removeImage(path).catch(reportCleanupFailure);
        }
        return 'failed';
      } finally {
        if (path) reservedFiles.delete(path);
      }
    },

    async readImage(path) {
      return trash.get(path) ?? storage.readImage(path);
    },

    flush: () => saver.flush(),

    async collectFiles() {
      const saved = (await saver.flush()).ok;
      const p = committedProject(store);
      const images = new Map<string, Blob>();
      const missingImages: string[] = [];
      for (const file of imageFileNames(p.containers)) {
        const blob = await storage.readImage(file);
        if (blob) images.set(file, blob);
        else missingImages.push(file);
      }
      // Os demais arquivos dos pacotes da biblioteca (o da especialização vai em `specs`).
      const specAssets = new Map<string, Blob>();
      for (const s of p.specializations) {
        const dir = packageDirOf(s.file);
        if (dir === null) continue;
        for (const path of await storage.listSpecDir(dir)) {
          if (path === s.file) continue;
          const blob = await storage.readSpecFile(path);
          if (blob) specAssets.set(path, blob);
        }
      }
      // A cópia citada que a app não lê (`spec: null`: inválida, `formatVersion` maior ou `id`
      // diferente) não está em `specFiles`: vai no zip como está no armazenamento (texto cru,
      // sem alteração). Cópia que não existe lá continua fora.
      const specs = specFiles(p);
      for (const s of p.specializations) {
        if (s.spec || specs.has(s.file)) continue;
        const raw = await storage.readSpec(s.file).catch((e: unknown) => {
          reportError('session.readSpec', e);
          return null;
        });
        if (raw !== null) specs.set(s.file, raw);
      }
      const withProposals = await proposals.collect();
      const withThreads = await threads.collect();
      return {
        mapping: serialize({ ...fileOf(p), revision: disk.revision }),
        images,
        specs,
        ...(specAssets.size > 0 ? { specAssets } : {}),
        proposals: withProposals.proposals,
        proposalImages: withProposals.images,
        threads: withThreads,
        missingImages,
        saved,
        snapshot: p,
      };
    },

    noteExported(snapshot) {
      exported = snapshot;
    },

    async close() {
      closed = true;
      stopWatching();
      await proposals.settled();
      await threads.settled();
      // Na fila: espera a conferência ou a recarga em curso e grava o pendente.
      await saver.flush();
      saver.dispose();
      await localSync.dispose();
      perspective.dispose();
      components.dispose();
      catalogs.dispose();
      store.close();
    },
  };
}
