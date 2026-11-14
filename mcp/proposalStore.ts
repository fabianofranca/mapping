import { randomBytes } from 'node:crypto';
import {
  link,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  PROPOSALS_DIR,
  PROPOSAL_FILE,
  PROPOSAL_ID_RE,
  parseProposalText,
  proposalDir,
  proposalFilePath,
  proposalImagePath,
  changeImageFile,
  packageDirOf,
  serializeProposal,
  type Proposal,
  type ProposalStatus,
} from '../src/model';
import { ToolError } from './errors';
import { Roots, hasParentSegment, resolveProjectFile, writeFileAtomic } from './paths';
import type { ProjectLocation } from './projects';
import { compareByCreated, failureReason, warnStderr } from './shared';

// Proposals on disk (stage 4.2): `proposals/<id>/proposal.json` and `proposals/<id>/images/…`.
// The server only writes here; the `mapping.json` belongs to the app's session. The proposal file has
// its own `revision`, with the same check as the `mapping.json`: whoever writes checks what
// is on disk immediately before and writes `revision + 1`.

/** A `proposal.json` larger than this is refused, so memory is not exhausted. */
const MAX_PROPOSAL_BYTES = 64 * 1024 * 1024;
/** Attempts of an update when the file changes between the read and the write. */
const MAX_ATTEMPTS = 3;

export interface StoredProposal {
  /** Folder name (equal to `proposal.id`). */
  readonly id: string;
  readonly proposal: Proposal;
  /** Text of the file as it was on disk. */
  readonly text: string;
  /** Warnings from the read (e.g. `inherit` of an old proposal, ignored). */
  readonly warnings?: readonly string[];
}

export interface BrokenProposal {
  readonly id: string;
  readonly error: string;
}

export interface StoredProposals {
  readonly proposals: readonly StoredProposal[];
  readonly broken: readonly BrokenProposal[];
}

async function readProposalText(
  roots: Roots,
  location: ProjectLocation,
  id: string,
): Promise<{ real: string; text: string } | null> {
  const real = await resolveProjectFile(roots, location.dir, proposalFilePath(id));
  if (real === null) return null;
  if ((await stat(real)).size > MAX_PROPOSAL_BYTES) {
    throw new ToolError('file-too-large', `proposal.json too large: ${id}`);
  }
  return { real, text: await readFile(real, 'utf8') };
}

/** The read error of an item, with the code, for the `broken` list. */
function readFailure(error: unknown): string {
  if (error instanceof ToolError) return `${error.code}: ${error.message}`;
  const code = errnoCode(error);
  return code ?? (error instanceof Error ? error.message : String(error));
}

function parseStored(id: string, text: string): StoredProposal | BrokenProposal {
  const parsed = parseProposalText(text);
  if (!parsed.ok) {
    const shown = parsed.errors.slice(0, 5).join('; ');
    const more = parsed.errors.length - 5;
    return { id, error: more > 0 ? `${shown}; …(+${more} error(s))` : shown };
  }
  if (parsed.proposal.id !== id) {
    return {
      id,
      error: `the file's id ("${parsed.proposal.id}") does not match the folder's ("${id}")`,
    };
  }
  return {
    id,
    proposal: parsed.proposal,
    text,
    ...(parsed.warnings.length > 0 ? { warnings: parsed.warnings } : {}),
  };
}

/** All proposals in the project folder, in creation order; the unreadable ones come in `broken`. */
export async function listStored(
  roots: Roots,
  location: ProjectLocation,
): Promise<StoredProposals> {
  let names: string[];
  try {
    const entries = await readdir(join(location.dir, PROPOSALS_DIR), {
      withFileTypes: true,
    });
    // `isDirectory()` is false for symbolic links: they are never followed.
    names = entries
      .filter((entry) => entry.isDirectory() && PROPOSAL_ID_RE.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return { proposals: [], broken: [] };
  }
  const proposals: StoredProposal[] = [];
  const broken: BrokenProposal[] = [];
  for (const id of names) {
    let read;
    try {
      read = await readProposalText(roots, location, id);
    } catch (error) {
      broken.push({ id, error: readFailure(error) });
      continue;
    }
    if (read === null) {
      broken.push({ id, error: `no ${PROPOSAL_FILE}` });
      continue;
    }
    const stored = parseStored(id, read.text);
    if ('proposal' in stored) proposals.push(stored);
    else broken.push(stored);
  }
  proposals.sort((a, b) =>
    compareByCreated(
      { createdAt: a.proposal.createdAt, id: a.id },
      { createdAt: b.proposal.createdAt, id: b.id },
    ),
  );
  return { proposals, broken };
}

/**
 * Files in `images/` that the proposal still reserves: those of the image changes (creating or
 * replacing the file, `changeImageFile`) that can still be applied. On an `open` one, those not
 * applied and not rejected; on a `superseded` one, only those accepted and not applied (the pending ones
 * can no longer be decided or applied: PROPOSAL-FORMAT.md, "States"); on the others,
 * none. `status` is the state to consider: `propose` passes `superseded` for the previous one of
 * a `supersedes`, which is still open on disk but stops being so in this call.
 */
export function reservedImages(p: Proposal, status: ProposalStatus = p.status): string[] {
  if (status !== 'open' && status !== 'superseded') return [];
  const files: string[] = [];
  for (const c of p.changes) {
    if (Object.hasOwn(p.applied, c.id)) continue;
    const state = p.decisions[c.id]?.state;
    if (status === 'open' ? state === 'rejected' : state !== 'accepted') continue;
    const file = changeImageFile(c);
    if (file !== null) files.push(file);
  }
  return files;
}

/**
 * Codes with which `link` fails on a file system without hard links (exFAT on a USB stick or
 * external drive, some network shares and synced folders).
 */
const NO_HARD_LINK: ReadonlySet<string> = new Set([
  'EPERM',
  'ENOTSUP',
  'EOPNOTSUPP',
  'ENOSYS',
  'EXDEV',
]);

export const errnoCode = (error: unknown): string | undefined =>
  (error as NodeJS.ErrnoException | null)?.code;

/**
 * Deletes the temporary file on a best-effort basis: on a mounted folder or with antivirus (Windows), the
 * system may refuse (`EPERM`, `EBUSY`) after the file has been written. The cleanup never
 * decides the result: the error becomes a warning on stderr and the temporary file stays (nobody reads it; it can
 * be deleted by hand). Without this, the agent received `internal-error` with the proposal already written and
 * resent it, duplicating it (gate return, 0.3.4).
 */
async function removeTemp(temp: string): Promise<void> {
  try {
    await rm(temp, { force: true });
  } catch (error) {
    warnStderr(
      `could not delete the temporary file ${temp} (${failureReason(error)}); it can be deleted by hand`,
    );
  }
}

/**
 * Writes a new file without ever overwriting: temporary file + `link` (fails with `EEXIST` if the
 * destination already exists). Without hard links, writes directly with `wx`, which also fails if the destination
 * exists; it loses only atomicity, and the proposal folder is removed whole if anything fails. On both
 * paths, the temporary file is deleted at the end, best effort (`removeTemp`).
 */
export async function writeNewFile(
  path: string,
  data: Uint8Array | string,
): Promise<void> {
  const temp = join(
    dirname(path),
    `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`,
  );
  try {
    await writeFile(temp, data, { flag: 'wx' });
    try {
      await link(temp, path);
    } catch (error) {
      if (!NO_HARD_LINK.has(errnoCode(error) ?? '')) throw error;
      await writeFile(path, data, { flag: 'wx' });
    }
  } finally {
    await removeTemp(temp);
  }
}

/**
 * Path of a library package file in the proposal folder: the final path
 * (`specs/<folder>/<relative>`) under `proposals/<id>/`. Refuses what is not from a package folder
 * or tries to leave it.
 */
function packageFilePath(proposalId: string, file: string): string {
  if (
    packageDirOf(file) === null ||
    file.includes('\0') ||
    file.includes('\\') ||
    hasParentSegment(file)
  ) {
    throw new Error(`package file with an invalid path: ${file}`);
  }
  return `${proposalDir(proposalId)}/${file}`;
}

/**
 * Writes a new proposal: the `proposals/<id>/` folder, the new or replaced images in
 * `proposals/<id>/images/`, the library package files in
 * `proposals/<id>/specs/<folder>/…` (the same rule as images: the final path under the
 * proposal folder) and, last, the `proposal.json` (a folder without it never looks like a
 * ready proposal). No file is overwritten. If something fails, the created folder is removed.
 */
export async function writeNewProposal(
  roots: Roots,
  location: ProjectLocation,
  proposal: Proposal,
  images: ReadonlyMap<string, Uint8Array>,
  packageFiles: ReadonlyMap<string, Uint8Array> = new Map(),
): Promise<{ written: string[]; writtenPackage: string[] }> {
  const parent = join(location.dir, PROPOSALS_DIR);
  await mkdir(parent, { recursive: true });
  await roots.assertInside(await realpath(parent), PROPOSALS_DIR);
  const dir = join(location.dir, proposalDir(proposal.id));
  // Without `recursive`: fails if the folder already exists (the id is new).
  await mkdir(dir);
  const written: string[] = [];
  const writtenPackage: string[] = [];
  const put = async (relative: string, data: Uint8Array, into: string[]) => {
    await mkdir(dirname(join(location.dir, relative)), { recursive: true });
    try {
      await writeNewFile(join(location.dir, relative), data);
    } catch (error) {
      if (errnoCode(error) !== 'EEXIST') throw error;
      throw new ToolError('image-exists', `a file already exists at ${relative}`, {
        file: relative,
      });
    }
    into.push(relative);
  };
  try {
    await roots.assertInside(await realpath(dir), proposalDir(proposal.id));
    for (const [file, data] of images) {
      await put(proposalImagePath(proposal.id, file), data, written);
    }
    for (const [file, data] of packageFiles) {
      await put(packageFilePath(proposal.id, file), data, writtenPackage);
    }
    await writeNewFile(join(dir, PROPOSAL_FILE), serializeProposal(proposal));
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  return { written, writtenPackage };
}

/**
 * Updates an existing proposal (state, decisions…): reads the file, applies `transform` and
 * writes with `revision + 1`, after checking that the file is still as it was read (the app
 * or another person may be deciding at the same time). If it changed, rereads and tries again; with no
 * success in `MAX_ATTEMPTS`, refuses with `revision-conflict`. A `transform` that returns the same
 * proposal writes nothing.
 */
export async function updateStored(
  roots: Roots,
  location: ProjectLocation,
  id: string,
  transform: (p: Proposal) => Proposal,
): Promise<Proposal> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const read = await readProposalText(roots, location, id);
    if (read === null) {
      throw new ToolError('proposal-not-found', `proposal not found: ${id}`);
    }
    const stored = parseStored(id, read.text);
    if (!('proposal' in stored)) {
      throw new ToolError('invalid-proposal', `unreadable proposal: ${stored.error}`, {
        proposal: id,
      });
    }
    const next = transform(stored.proposal);
    if (next === stored.proposal) return next;
    const updated: Proposal = { ...next, revision: stored.proposal.revision + 1 };
    // Checks again immediately before writing.
    const again = await readProposalText(roots, location, id);
    if (again === null || again.text !== read.text) continue;
    await writeFileAtomic(read.real, serializeProposal(updated));
    return updated;
  }
  throw new ToolError(
    'revision-conflict',
    'the proposal was changed by another process while it was being updated; reread and try again',
    { proposal: id },
  );
}

// ---------------------------------------------------------------------------
// Agent revision (stage #644): replace, withdraw and add in the open proposal

/** What `compute` returns to be written: the revised proposal and the images the batch created. */
export interface RevisionPlan<R> {
  readonly proposal: Proposal;
  /** Content of the batch's new images, by file (`images/…`); only the cited ones are written. */
  readonly images: ReadonlyMap<string, Uint8Array>;
  /** Checks, immediately before writing, that the calculation still holds (e.g. `mapping.json`). */
  readonly check: () => Promise<void>;
  readonly result: R;
}

/** End without writing (e.g. batch with an error): the result is returned as is. */
export interface RevisionStop<R> {
  readonly stop: R;
}

/**
 * Checks that the proposal's subfolder (`images`, `specs`), if it exists, resolves inside a
 * root: a symbolic link to outside is refused (`outside-roots`) before listing, deleting or writing.
 */
async function assertSubfolderInside(
  roots: Roots,
  location: ProjectLocation,
  relative: string,
): Promise<void> {
  let real: string;
  try {
    real = await realpath(join(location.dir, relative));
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') return;
    throw error;
  }
  await roots.assertInside(real, relative);
}

async function listFilesUnder(root: string, relative: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(join(root, relative), { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const path = `${relative}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await listFilesUnder(root, path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

/** Files in `images/` and in the package folders that the proposal keeps, relative to the project. */
export async function proposalFiles(
  roots: Roots,
  location: ProjectLocation,
  proposalId: string,
): Promise<string[]> {
  const base = proposalDir(proposalId);
  const subfolders = ['images', 'specs'];
  for (const sub of subfolders) {
    await assertSubfolderInside(roots, location, `${base}/${sub}`);
  }
  const lists = await Promise.all(
    subfolders.map((sub) => listFilesUnder(location.dir, `${base}/${sub}`)),
  );
  return lists.flat();
}

/** The files the proposal's changes still cite: images and package folders. */
function citedFiles(p: Proposal): { files: Set<string>; packageDirs: string[] } {
  const files = new Set<string>();
  const packageDirs: string[] = [];
  for (const c of p.changes) {
    const image = changeImageFile(c);
    if (image !== null) files.add(proposalImagePath(p.id, image));
    if (c.entity === 'specialization' && c.kind !== 'remove') {
      const file = (c.to as { file?: unknown } | null)?.file;
      const dir = typeof file === 'string' ? packageDirOf(file) : null;
      if (dir !== null) packageDirs.push(`${proposalDir(p.id)}/${dir}/`);
    }
  }
  return { files, packageDirs };
}

/** Deletes, best effort, what no change cites any more; a failure becomes a warning on stderr. */
async function removeUncited(
  roots: Roots,
  location: ProjectLocation,
  next: Proposal,
): Promise<void> {
  const { files, packageDirs } = citedFiles(next);
  for (const file of await proposalFiles(roots, location, next.id)) {
    if (files.has(file) || packageDirs.some((dir) => file.startsWith(dir))) continue;
    try {
      await rm(join(location.dir, file), { force: true });
    } catch (error) {
      warnStderr(
        `could not delete ${file} (${failureReason(error)}); it can be deleted by hand`,
      );
    }
  }
}

async function writeRevisionImages(
  roots: Roots,
  location: ProjectLocation,
  next: Proposal,
  images: ReadonlyMap<string, Uint8Array>,
): Promise<string[]> {
  const written: string[] = [];
  const wanted = new Set(
    next.changes.map(changeImageFile).filter((f): f is string => f !== null),
  );
  try {
    for (const [file, data] of images) {
      if (!wanted.has(file)) continue;
      const relative = proposalImagePath(next.id, file);
      await mkdir(dirname(join(location.dir, relative)), { recursive: true });
      await assertSubfolderInside(roots, location, `${proposalDir(next.id)}/images`);
      try {
        await writeNewFile(join(location.dir, relative), data);
      } catch (error) {
        if (errnoCode(error) !== 'EEXIST') throw error;
        throw new ToolError('image-exists', `a file already exists at ${relative}`, {
          file: relative,
        });
      }
      written.push(relative);
    }
  } catch (error) {
    for (const relative of written)
      await rm(join(location.dir, relative), { force: true });
    throw error;
  }
  return written;
}

/**
 * Revision of an existing proposal: rereads the file, lets `compute` calculate the revised
 * proposal on it and, immediately before writing, checks `plan.check()` and that the file
 * is still as it was read. If the app (or another process) changed the file in the meantime, it **recalculates
 * everything** on the new version (a decision never holds for content the person did not see); with no
 * success in `MAX_ATTEMPTS`, `revision-conflict`. Writes the new images before the
 * `proposal.json` (without overwriting), with `revision + 1`, and then deletes what no change
 * cites any more. Without `write`, it only calculates (`dryRun`): the returned proposal already carries the `revision`
 * that would be written.
 */
export async function reviseStored<R>(
  roots: Roots,
  location: ProjectLocation,
  id: string,
  write: boolean,
  compute: (p: Proposal) => Promise<RevisionPlan<R> | RevisionStop<R>>,
): Promise<{ proposal: Proposal | null; result: R }> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const read = await readProposalText(roots, location, id);
    if (read === null) {
      throw new ToolError('proposal-not-found', `proposal not found: ${id}`);
    }
    const stored = parseStored(id, read.text);
    if (!('proposal' in stored)) {
      throw new ToolError('invalid-proposal', `unreadable proposal: ${stored.error}`, {
        proposal: id,
      });
    }
    const plan = await compute(stored.proposal);
    if ('stop' in plan) return { proposal: null, result: plan.stop };
    const next: Proposal = { ...plan.proposal, revision: stored.proposal.revision + 1 };
    if (!write) return { proposal: next, result: plan.result };
    await plan.check();
    const again = await readProposalText(roots, location, id);
    if (again === null || again.text !== read.text) continue;
    const written = await writeRevisionImages(roots, location, next, plan.images);
    try {
      await writeFileAtomic(read.real, serializeProposal(next));
    } catch (error) {
      for (const relative of written)
        await rm(join(location.dir, relative), { force: true });
      throw error;
    }
    await removeUncited(roots, location, next);
    return { proposal: next, result: plan.result };
  }
  throw new ToolError(
    'revision-conflict',
    'the proposal was changed by another process while it was being revised; reread and try again',
    { proposal: id },
  );
}
