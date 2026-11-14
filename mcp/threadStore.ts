import { mkdir, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  COMMENTS_DIR,
  RESOLVED_DIR,
  THREAD_ID_RE,
  ThreadError,
  mergeThreadCopies,
  parseThreadText,
  serializeThread,
  threadFilePath,
  type MergedThread,
  type Thread,
} from '../src/model';
import { ToolError } from './errors';
import { Roots, resolveProjectFile, writeFileAtomic } from './paths';
import type { ProjectLocation } from './projects';
import { writeNewFile } from './proposalStore';
import { compareByCreated } from './shared';

// Conversations on disk (Comments stage, CM6): `comments/<id>.json` (open) and
// `comments/resolved/<id>.json` (resolved). The server reads both folders and merges the copies of the
// same conversation (decision 7); it writes only the new file of `open_thread` and the addition of a
// message in `comments/<id>.json`, with `revision + 1`. It NEVER writes in `comments/resolved/` nor
// resolves, reopens or deletes: that belongs to the person, in the app. Like the proposal, the write checks the
// file's text immediately before and, if the app changed the file in the meantime, rereads and redoes it.

/** A conversation file larger than this is refused, so memory is not exhausted. */
const MAX_THREAD_BYTES = 16 * 1024 * 1024;
/** Attempts of an addition when the file changes between the read and the write. */
const MAX_ATTEMPTS = 3;

export interface StoredThread {
  readonly id: string;
  /** The conversation with the two copies already merged (`mergeThreadCopies`). */
  readonly thread: Thread;
}

export interface BrokenThread {
  readonly id: string;
  readonly error: string;
}

export interface StoredThreads {
  readonly threads: readonly StoredThread[];
  readonly broken: readonly BrokenThread[];
}

interface Copy {
  readonly real: string;
  readonly text: string;
}

interface Copies {
  readonly open: Copy | null;
  readonly resolved: Copy | null;
}

/** Ids (names of the `<id>.json` files) of one of the two folders. */
async function idsIn(location: ProjectLocation, folder: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(join(location.dir, folder), { withFileTypes: true });
  } catch {
    return [];
  }
  return (
    entries
      // `isFile()` is false for symbolic links: they are never followed.
      .filter((e) => e.isFile() && e.name.endsWith('.json') && !e.name.startsWith('.'))
      .map((e) => e.name.slice(0, -'.json'.length))
      .filter((id) => THREAD_ID_RE.test(id))
  );
}

/** Ids of all the project's conversations (open and resolved), in alphabetical order, without reading the files. */
export async function listThreadIds(location: ProjectLocation): Promise<string[]> {
  const [open, resolved] = await Promise.all([
    idsIn(location, COMMENTS_DIR),
    idsIn(location, RESOLVED_DIR),
  ]);
  return [...new Set([...open, ...resolved])].sort();
}

async function readCopy(
  roots: Roots,
  location: ProjectLocation,
  id: string,
  resolved: boolean,
): Promise<Copy | null> {
  const real = await resolveProjectFile(
    roots,
    location.dir,
    threadFilePath(id, resolved),
  );
  if (real === null) return null;
  if ((await stat(real)).size > MAX_THREAD_BYTES) {
    throw new ToolError('file-too-large', `conversation too large: ${id}`);
  }
  return { real, text: await readFile(real, 'utf8') };
}

async function readCopies(
  roots: Roots,
  location: ProjectLocation,
  id: string,
): Promise<Copies> {
  const open = await readCopy(roots, location, id, false);
  const resolved = await readCopy(roots, location, id, true);
  return { open, resolved };
}

type Parsed = Thread | { readonly error: string };

function parseCopy(id: string, copy: Copy | null): Parsed | null {
  if (copy === null) return null;
  const parsed = parseThreadText(copy.text);
  if (!parsed.ok) {
    const shown = parsed.errors.slice(0, 5).join('; ');
    const more = parsed.errors.length - 5;
    return { error: more > 0 ? `${shown}; …(+${more} error(s))` : shown };
  }
  if (parsed.thread.id !== id) {
    return {
      error: `the file's id ("${parsed.thread.id}") does not match the name's ("${id}")`,
    };
  }
  return parsed.thread;
}

const isThread = (parsed: Parsed | null): parsed is Thread =>
  parsed !== null && !('error' in parsed);

/** Merges the copies; if one exists and is not readable, its error (the conversation is not rewritten). */
function mergeCopies(id: string, copies: Copies): MergedThread | { error: string } {
  const open = parseCopy(id, copies.open);
  const resolved = parseCopy(id, copies.resolved);
  for (const parsed of [open, resolved]) {
    if (parsed !== null && !isThread(parsed)) return parsed;
  }
  try {
    return mergeThreadCopies(
      isThread(open) ? open : null,
      isThread(resolved) ? resolved : null,
    );
  } catch (error) {
    if (error instanceof ThreadError) return { error: error.message };
    throw error;
  }
}

/** The read error of an item, with the code, for the `broken` list. */
function readFailure(error: unknown): string {
  if (error instanceof ToolError) return `${error.code}: ${error.message}`;
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string'
    ? code
    : error instanceof Error
      ? error.message
      : String(error);
}

/** All the project's conversations; the unreadable ones come in `broken`. Creation order. */
export async function listStoredThreads(
  roots: Roots,
  location: ProjectLocation,
  ids?: readonly string[],
): Promise<StoredThreads> {
  const threads: StoredThread[] = [];
  const broken: BrokenThread[] = [];
  for (const id of ids ?? (await listThreadIds(location))) {
    let copies: Copies;
    try {
      copies = await readCopies(roots, location, id);
    } catch (error) {
      broken.push({ id, error: readFailure(error) });
      continue;
    }
    const merged = mergeCopies(id, copies);
    if ('error' in merged) broken.push({ id, error: merged.error });
    else threads.push({ id, thread: merged.thread });
  }
  threads.sort((a, b) =>
    compareByCreated(
      { createdAt: a.thread.createdAt, id: a.id },
      { createdAt: b.thread.createdAt, id: b.id },
    ),
  );
  return { threads, broken };
}

/** A conversation, with the copies merged; `thread-not-found` or `invalid-thread`. */
export async function readStoredThread(
  roots: Roots,
  location: ProjectLocation,
  id: string,
): Promise<Thread> {
  const copies = await readCopies(roots, location, id);
  return mergedOrThrow(id, copies);
}

function mergedOrThrow(id: string, copies: Copies): Thread {
  if (copies.open === null && copies.resolved === null) {
    throw new ToolError('thread-not-found', `conversation not found: ${id}`);
  }
  const merged = mergeCopies(id, copies);
  if ('error' in merged) {
    throw new ToolError('invalid-thread', `unreadable conversation: ${merged.error}`, {
      thread: id,
    });
  }
  return merged.thread;
}

/**
 * Writes the new conversation in `comments/<id>.json`: a temporary file + `link`, which never
 * overwrites (fails with `EEXIST` if the destination already exists).
 */
export async function writeNewThread(
  roots: Roots,
  location: ProjectLocation,
  thread: Thread,
): Promise<string> {
  const parent = join(location.dir, COMMENTS_DIR);
  await mkdir(parent, { recursive: true });
  await roots.assertInside(await realpath(parent), COMMENTS_DIR);
  const relative = threadFilePath(thread.id, false);
  await writeNewFile(join(location.dir, relative), serializeThread(thread));
  return relative;
}

const sameText = (a: Copy | null, b: Copy | null): boolean => a?.text === b?.text;

/**
 * Appends to the conversation: reads the two copies, lets `transform` compute the new conversation on the
 * disk version (it may refuse with a `ToolError`) and, immediately before writing, checks that
 * the files are still as they were read. If the app (or another person) changed something in the meantime, rereads and
 * redoes it; with no success in `MAX_ATTEMPTS`, `revision-conflict`. The write is always in
 * `comments/<id>.json` (the app moves the file between folders and deletes the other copy on its next
 * write). A `transform` that returns the same conversation writes nothing.
 */
export async function updateStoredThread(
  roots: Roots,
  location: ProjectLocation,
  id: string,
  transform: (thread: Thread) => Thread,
): Promise<Thread> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const copies = await readCopies(roots, location, id);
    const current = mergedOrThrow(id, copies);
    const next = transform(current);
    if (next === current) return next;
    const again = await readCopies(roots, location, id);
    if (
      !sameText(again.open, copies.open) ||
      !sameText(again.resolved, copies.resolved)
    ) {
      continue;
    }
    await mkdir(join(location.dir, COMMENTS_DIR), { recursive: true });
    await roots.assertInside(
      await realpath(join(location.dir, COMMENTS_DIR)),
      COMMENTS_DIR,
    );
    await writeFileAtomic(
      join(location.dir, threadFilePath(id, false)),
      serializeThread(next),
    );
    return next;
  }
  throw new ToolError(
    'revision-conflict',
    'the conversation was changed by another process while it was being updated; reread and try again',
    { thread: id },
  );
}

/**
 * Cheap signature of the two folders (name, size and date of the files), so
 * `wait_for_comment` only rereads the conversations when something changed.
 */
export async function commentsSignature(location: ProjectLocation): Promise<string> {
  const parts: string[] = [];
  for (const folder of [COMMENTS_DIR, RESOLVED_DIR]) {
    for (const id of await idsIn(location, folder)) {
      try {
        const info = await stat(join(location.dir, `${folder}/${id}.json`));
        parts.push(`${folder}/${id}:${info.size}:${info.mtimeMs}`);
      } catch {
        // The file vanished between the listing and the stat: the next signature no longer carries it.
      }
    }
  }
  return parts.sort().join('|');
}
