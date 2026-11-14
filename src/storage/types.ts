/** Folder of the copies of the applied specializations (`specs/<id>.json`). */
export const SPECS_DIR = 'specs';
import {
  COMMENTS_DIR,
  PROPOSALS_DIR,
  PROPOSAL_FILE,
  PROPOSAL_ID_RE,
  RESOLVED_DIR,
  THREAD_ID_RE,
} from '../model';
// Project folder names: defined in the model, shared with the MCP server.
export {
  BACKUPS_DIR,
  IMAGES_DIR,
  MAPPING_FILE,
  backupFileName,
  backupTimestamp,
} from '../model';

export type StorageKind = 'folder' | 'local';

/**
 * Where the project lives: a folder on disk (File System Access API) or the
 * browser's IndexedDB. Paths are relative to the project root
 * (`mapping.json`, `images/photo.jpg`).
 */
export interface ProjectStorage {
  readonly kind: StorageKind;
  /**
   * Name of the project folder on disk (the `<project>` of the `mapping://` references).
   * It only exists in folder mode: it is what the MCP reaches.
   */
  readonly folderName?: string;
  /**
   * The copy of the project that the per-device state (resuming the review) belongs to. Local: the
   * project id in IndexedDB. Folder: the id of the recents entry (per physical folder; it
   * survives "Locate folder…"); with no recents, one id per tab (`app/recents.ts`).
   * Set when the storage is created, never empty and immutable. Every storage handed to a
   * session by the controller has `copyId`; only the read-only ones (open, check the folder) do
   * not.
   */
  readonly copyId?: string;
  /** Text of the `mapping.json`, or `null` if it does not exist. */
  loadMapping(): Promise<string | null>;
  /**
   * The text of the `mapping.json` and the `lastModified` (ms) of the SAME `File`, with a single
   * `getFile` (the session no longer reads the file and stamps it in two calls). `null` if the file
   * does not exist; `lastModified` 0 if the `File` has none. Only the folder implements it, like
   * `statMapping`.
   */
  loadMappingStamped?(): Promise<{ text: string; lastModified: number } | null>;
  saveMapping(text: string): Promise<void>;
  /**
   * `lastModified` of the `mapping.json` (ms), or `null` if it does not exist. Only the
   * storages that can change from outside (the folder) implement it; it is what the app
   * checks every few seconds to notice an external change.
   */
  statMapping?(): Promise<number | null>;
  /** Content of the image, or `null` if the file does not exist. */
  readImage(path: string): Promise<Blob | null>;
  writeImage(path: string, data: Blob): Promise<void>;
  /**
   * Stamp of the image file (size and `lastModified`), or `null` if it does not exist.
   * Changed between two reads = the file was swapped from outside. Optional, like `statMapping`.
   */
  statImage?(path: string): Promise<string | null>;
  /**
   * Paths (`images/photo.jpg`) of all the files in `images/`, cited by the project or not,
   * in alphabetical order: it is what choosing a free name needs to know.
   * `[]` if the folder does not exist.
   */
  listImages(): Promise<string[]>;
  /** Removes the image. Does not fail if it no longer exists. */
  removeImage(path: string): Promise<void>;
  /**
   * Text of the copy of a specialization (`specs/sdui.json`, or its file inside the package
   * folder, `specs/material3/material3.spec.json`), or `null` if it does not exist.
   */
  readSpec(path: string): Promise<string | null>;
  writeSpec(path: string, text: string): Promise<void>;
  /** Removes the copy of the specialization. Does not fail if it no longer exists. */
  removeSpec(path: string): Promise<void>;
  /**
   * Paths (relative to the project root) of all the files in `dir` (`specs/material3`),
   * recursive, in alphabetical order. `[]` if the folder does not exist.
   */
  listSpecDir(dir: string): Promise<string[]>;
  /** Content of a package file (`specs/material3/fonts/Roboto.ttf`), or `null`. */
  readSpecFile(path: string): Promise<Blob | null>;
  /** Writes a package file, creating the folders. In the local project it marks "not exported". */
  writeSpecFile(path: string, data: Blob | string): Promise<void>;
  /**
   * Removes a package file (`specs/material3/docs/old.md`; any extension). Does not fail
   * if it no longer exists. In the local project it marks "not exported".
   */
  removeSpecFile(path: string): Promise<void>;
  /**
   * Removes the whole package folder (recursive). Does not fail if it does not exist. In the
   * local project it marks "not exported".
   */
  removeSpecDir(dir: string): Promise<void>;
  /**
   * Ids of the proposals (`proposals/<id>/proposal.json`, stage 4), in alphabetical order.
   * The content of a proposal's images uses `readImage`/`writeImage`/`removeImage`
   * with the full path (`proposals/<id>/images/screen.webp`).
   */
  listProposals(): Promise<string[]>;
  /** Text of the `proposal.json`, or `null` if it does not exist. */
  readProposal(id: string): Promise<string | null>;
  writeProposal(id: string, text: string): Promise<void>;
  /**
   * Deletes the whole proposal: `proposals/<id>/` with the `proposal.json` and the images that
   * await acceptance (recursive). Does not fail if it no longer exists. In the local project
   * it marks "not exported", like `writeProposal`.
   */
  removeProposal(id: string): Promise<void>;
  /**
   * Paths (relative to the project root) of all the files under `proposals/<id>/`
   * (the `proposal.json`, the images and the library packages in `specs/<folder>/…`),
   * recursive, in alphabetical order. `[]` if the proposal does not exist. The content of each
   * one is read with `readImage(path)`, which accepts any project path.
   */
  listProposalFiles(id: string): Promise<string[]>;
  /**
   * Stamp (size and `lastModified`) of the `proposal.json`, or `null` if it does not exist.
   * Only the folder implements it, like `statMapping`: it is how the app notices proposals that are
   * new or changed from outside.
   */
  statProposal?(id: string): Promise<string | null>;
  /**
   * `statProposal` of all the proposals in a single pass (the check's sweep): walks
   * `proposals/` once and, for each folder with a valid id, stamps the `proposal.json` through the
   * handle of the entry itself. A folder without `proposal.json` is left out, as in
   * `listProposals`; a proposal whose file could not be read (in use, no permission) comes back
   * with `null`, so the sweep rereads it instead of taking it for deleted. The ids in `skip` are
   * not checked and also come back with `null` (the cycle check skips the final proposals already
   * read). In alphabetical order. Only the folder implements it.
   */
  stampProposals?(skip?: ReadonlySet<string>): Promise<Map<string, string | null>>;
  /**
   * Ids of the threads (`comments/<id>.json`; with `resolved`, `comments/resolved/<id>.json`),
   * in alphabetical order. It only lists the file names (the ~3 s check depends on it being
   * cheap). `[]` if the folder does not exist; names outside the `THREAD_ID_RE` are left out.
   */
  listThreads(resolved: boolean): Promise<string[]>;
  /** Text of the thread file, or `null` if it does not exist. Refuses an invalid id. */
  readThread(id: string, resolved: boolean): Promise<string | null>;
  /**
   * Writes the thread file, creating the folders. In the local project it marks "not exported".
   * Moving between `comments/` and `comments/resolved/` is writing to the destination and only then
   * deleting the origin (the session does the moving).
   */
  writeThread(id: string, resolved: boolean, text: string): Promise<void>;
  /** Deletes the thread file. Does not fail if it no longer exists. */
  removeThread(id: string, resolved: boolean): Promise<void>;
  /**
   * Stamp (size and `lastModified`) of the thread file, or `null` if it does not exist.
   * Only the folder implements it, like `statProposal`: the local project is not watched.
   */
  statThread?(id: string, resolved: boolean): Promise<string | null>;
  /**
   * `listThreads` + `statThread` of all the threads of a folder in a single pass (the check's
   * sweep): walks `comments/` (or `comments/resolved/`) once and stamps each file
   * through the handle of the entry itself. Id → stamp, in alphabetical order; a file that could
   * not be read (in use, no permission) comes back with `null`, present but without a stamp, so the
   * sweep rereads it instead of taking it for deleted. Only the folder implements it.
   */
  stampThreads?(resolved: boolean): Promise<Map<string, string | null>>;
  /**
   * Keeps a copy of the original `mapping.json` (before migrating the schema).
   * `name` is the file name (see `backupFileName`), without the folder.
   */
  writeBackup(name: string, text: string): Promise<void>;
}

function cleanSegments(path: string): string[] | null {
  const parts = path.split('/');
  return parts.some((p) => p === '' || p === '.' || p === '..' || p.includes('\\'))
    ? null
    : parts;
}

/**
 * `true` for `specs/<name>.json` (single copy, v1 to v3) or `specs/<folder>/…/<name>.json`
 * (the specialization file inside the package), without `..`, `.` or empty segments.
 */
export function isSpecPath(path: string): boolean {
  const parts = cleanSegments(path);
  return (
    parts !== null &&
    parts.length >= 2 &&
    parts[0] === SPECS_DIR &&
    path.toLowerCase().endsWith('.json')
  );
}

/** `true` for a package file: `specs/<folder>/…` (any extension), without `..`. */
export function isSpecPackagePath(path: string): boolean {
  const parts = cleanSegments(path);
  return parts !== null && parts.length >= 3 && parts[0] === SPECS_DIR;
}

/** `true` for a package folder: `specs/<folder>` or deeper, without `..`. */
export function isSpecDirPath(path: string): boolean {
  const parts = cleanSegments(path);
  return parts !== null && parts.length >= 2 && parts[0] === SPECS_DIR;
}

/** Refuses (throws) a path that is not under `specs/`; used by all the implementations. */
export function assertSpecPath(path: string, kind: 'file' | 'dir' | 'package'): void {
  const ok =
    kind === 'dir'
      ? isSpecDirPath(path)
      : kind === 'package'
        ? isSpecPackagePath(path)
        : isSpecPath(path);
  if (!ok) throw new Error(`invalid specs path: ${path}`);
}

const PROPOSAL_PATH_RE = new RegExp(`^${PROPOSALS_DIR}/([^/]+)/(.+)$`);

/** Id of the proposal of a `proposals/<id>/…` path; `null` if it is not one. */
export function proposalIdOfPath(path: string): string | null {
  const id = PROPOSAL_PATH_RE.exec(path)?.[1];
  return id !== undefined && PROPOSAL_ID_RE.test(id) ? id : null;
}

/** `true` for `proposals/<id>/proposal.json`. */
export function isProposalFilePath(path: string): boolean {
  const match = PROPOSAL_PATH_RE.exec(path);
  return (
    match !== null && match[2] === PROPOSAL_FILE && PROPOSAL_ID_RE.test(match[1] ?? '')
  );
}

/**
 * `true` for a proposal image (`proposals/<id>/images/screen.webp`): an image
 * inside the proposal folder, without `..`.
 */
export function isProposalImagePath(path: string): boolean {
  const match = PROPOSAL_PATH_RE.exec(path);
  if (!match || !PROPOSAL_ID_RE.test(match[1] ?? '')) return false;
  const rest = match[2] ?? '';
  return (
    isImageFileName(rest) && !rest.split('/').some((part) => part === '..' || part === '')
  );
}

/**
 * `true` for a library package file waiting in a proposal
 * (`proposals/<id>/specs/<folder>/…`, any extension): at least folder and file, without
 * `..`, `.`, empty segments or `\`.
 */
export function isProposalPackagePath(path: string): boolean {
  const match = PROPOSAL_PATH_RE.exec(path);
  if (!match || !PROPOSAL_ID_RE.test(match[1] ?? '')) return false;
  return isSpecPackagePath(match[2] ?? '');
}

const THREAD_PATH_RE = new RegExp(
  `^(${COMMENTS_DIR}/resolved|${COMMENTS_DIR})/([^/]+)\\.json$`,
);

/** Refuses (throws) a thread id that would not become just a file name in `comments/`. */
export function assertThreadId(id: string): void {
  if (!THREAD_ID_RE.test(id)) throw new Error(`invalid thread id: ${id}`);
}

/** `true` for a file name `<id>.json` with a valid id (returns the id), else `null`. */
export function threadIdOfFileName(name: string): string | null {
  if (!name.endsWith('.json')) return null;
  const id = name.slice(0, -'.json'.length);
  return THREAD_ID_RE.test(id) ? id : null;
}

/**
 * Id and folder of `comments/<id>.json` or `comments/resolved/<id>.json`; `null` if it is not one.
 */
export function threadLocationOfPath(
  path: string,
): { readonly id: string; readonly resolved: boolean } | null {
  const match = THREAD_PATH_RE.exec(path);
  const id = match?.[2];
  if (id === undefined || !THREAD_ID_RE.test(id)) return null;
  return { id, resolved: match?.[1] === RESOLVED_DIR };
}

/** `true` for `comments/<id>.json` and `comments/resolved/<id>.json`, with a valid id. */
export function isThreadFilePath(path: string): boolean {
  return threadLocationOfPath(path) !== null;
}

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'];

/** `true` if the file name has a known image extension. */
export function isImageFileName(name: string): boolean {
  const dot = name.lastIndexOf('.');
  return dot > 0 && IMAGE_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase());
}

/** MIME type from the extension (for files read without a type, such as the zip's). */
export function imageMimeType(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (IMAGE_EXTENSIONS.includes(ext)) return `image/${ext}`;
  return 'application/octet-stream';
}
