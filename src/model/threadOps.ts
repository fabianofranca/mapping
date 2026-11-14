import {
  THREAD_FORMAT,
  THREAD_FORMAT_VERSION,
  compareThreadMessages,
  parseThread,
  sortThreadMessages,
  threadMessageSchema,
  threadResolvedSchema,
  type Thread,
  type ThreadAnchor,
  type ThreadAuthor,
  type ThreadMessage,
  type ThreadResolved,
  type ThreadResolver,
} from './thread';

// Pure, immutable operations on a thread (they never change the input). Whoever writes
// (the app session and the MCP server) rereads the file, redoes the operation on the disk version and
// writes the result (decision 6).
//
// `revision` convention: every operation that CHANGES the thread returns `revision + 1`, like the
// project's `bumpRevision`; one that does not change it (resolving a resolved one, reopening an open one) returns
// the same thread, without touching `revision`. The merge of the copies (`mergeThreadCopies`) returns the
// larger `revision` of the two, without adding: whoever writes the result is the one that adds.

/**
 * Error codes of the operations. They belong to the module (not to `ModelErrorCode`): the UI and the MCP
 * translate them. `thread-resolved` (the MCP's message on a resolved thread) is the caller's
 * rule and is not thrown here.
 */
export type ThreadErrorCode = 'thread-message-duplicate' | 'invalid-thread';

export class ThreadError extends Error {
  constructor(
    readonly code: ThreadErrorCode,
    message?: string,
  ) {
    super(message ? `${code}: ${message}` : code);
    this.name = 'ThreadError';
  }
}

function failThread(code: ThreadErrorCode, message?: string): never {
  throw new ThreadError(code, message);
}

export interface OpenThreadArgs {
  readonly id: string;
  readonly anchor: ThreadAnchor;
  readonly author: ThreadAuthor;
  readonly text: string;
  readonly at: string;
  /** Id of the first message. */
  readonly messageId: string;
  readonly proposal?: string | null;
}

/** Validates `data` with the format and returns the thread read; `invalid-thread` with the errors. */
function validated(data: unknown): Thread {
  const result = parseThread(data);
  if (!result.ok) failThread('invalid-thread', result.errors.join('; '));
  return result.thread;
}

/** Opens the thread with the first message: `revision` 0, not resolved. */
export function openThread(args: OpenThreadArgs): Thread {
  return validated({
    format: THREAD_FORMAT,
    formatVersion: THREAD_FORMAT_VERSION,
    id: args.id,
    anchor: args.anchor,
    createdAt: args.at,
    revision: 0,
    resolved: null,
    messages: [
      {
        id: args.messageId,
        author: args.author,
        at: args.at,
        text: args.text,
        proposal: args.proposal ?? null,
      },
    ],
  });
}

/**
 * Appends the message (the order by `at` and `id` is kept) and returns `revision + 1`.
 * `thread-message-duplicate` if the id already exists; `invalid-thread` if the message is invalid. It does not
 * look at the state: on a resolved thread the refusal is the caller's (the MCP).
 */
export function appendMessage(thread: Thread, message: ThreadMessage): Thread {
  const parsed = threadMessageSchema.safeParse(message);
  if (!parsed.success) {
    failThread(
      'invalid-thread',
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  const next = parsed.data as ThreadMessage;
  if (thread.messages.some((m) => m.id === next.id)) {
    failThread('thread-message-duplicate', `id "${next.id}" repeated`);
  }
  return {
    ...thread,
    revision: thread.revision + 1,
    messages: sortThreadMessages([...thread.messages, next]),
  };
}

/**
 * Resolves the thread (`revision + 1`). Already resolved: returns the same one, untouched (redoing the
 * operation on the disk version, which someone else already resolved, changes nothing).
 */
export function resolveThread(thread: Thread, by: ThreadResolver, at: string): Thread {
  if (thread.resolved !== null) return thread;
  const parsed = threadResolvedSchema.safeParse({ by, at });
  if (!parsed.success) {
    failThread(
      'invalid-thread',
      parsed.error.issues
        .map((i) => `resolved.${i.path.join('.')}: ${i.message}`)
        .join('; '),
    );
  }
  return { ...thread, revision: thread.revision + 1, resolved: parsed.data };
}

/** Reopens the thread (`revision + 1`). Already open: returns the same one, untouched. */
export function reopenThread(thread: Thread): Thread {
  if (thread.resolved === null) return thread;
  return { ...thread, revision: thread.revision + 1, resolved: null };
}

/** Where the thread's file should be: the `resolved` field is the truth; the folder is the index. */
export type ThreadLocation = 'open' | 'resolved';

export function threadLocation(thread: Thread): ThreadLocation {
  return thread.resolved === null ? 'open' : 'resolved';
}

export interface MergedThread {
  readonly thread: Thread;
  /** `thread.resolved !== null`, for whoever only wants the boolean. */
  readonly resolved: boolean;
  /** The folder where the next write should leave the file (and from where to delete the other copy). */
  readonly location: ThreadLocation;
}

function mergedMessages(a: Thread, b: Thread): readonly ThreadMessage[] {
  const byId = new Map<string, ThreadMessage>();
  for (const m of [...a.messages, ...b.messages]) {
    if (!byId.has(m.id)) byId.set(m.id, m);
  }
  return [...byId.values()].sort(compareThreadMessages);
}

/** The most recent resolution between the two copies, or `null`. */
function latestResolved(a: Thread, b: Thread): ThreadResolved | null {
  const options = [a.resolved, b.resolved].filter((r): r is ThreadResolved => r !== null);
  if (options.length === 0) return null;
  return options.reduce((x, y) => (Date.parse(y.at) > Date.parse(x.at) ? y : x));
}

/**
 * The resolution that holds in the merge, or `null` (open). With the same messages in both copies and
 * a different `revision`, the copy with the larger `revision` (`base`) decides; otherwise the most
 * recent resolution holds only if it is later than the last message of the union.
 */
function joinedResolution(
  open: Thread,
  resolved: Thread,
  base: Thread,
  messages: readonly ThreadMessage[],
): ThreadResolved | null {
  const sameMessages =
    open.revision !== resolved.revision &&
    open.messages.length === messages.length &&
    resolved.messages.length === messages.length;
  if (sameMessages) return base.resolved;
  const candidate = latestResolved(open, resolved);
  const last = messages[messages.length - 1] as ThreadMessage;
  return candidate !== null && Date.parse(candidate.at) > Date.parse(last.at)
    ? candidate
    : null;
}

/**
 * Merges the two copies of the same thread (one in `comments/`, the other in `comments/resolved/`),
 * as it is left after a git merge or a folder change that stopped halfway
 * (decision 7):
 * - only one copy: it holds, and the `resolved` field says the place;
 * - two: the messages are the union by `id` (the open copy wins a repeated id, which is the
 *   same message) and the `revision` is the larger. With the same messages in both and a different
 *   `revision`, the copy with the larger `revision` decides whether it is resolved (the interrupted
 *   reopening is not lost). Otherwise the thread is resolved only if `resolved.at` is later than the last
 *   message of the union; a new message after the resolution reopens it, with `resolved` `null`.
 * The anchor and `createdAt` come from the copy with the larger `revision` (the open one, on a tie).
 * `invalid-thread` if there is no copy or if the ids differ.
 */
export function mergeThreadCopies(
  open: Thread | null,
  resolved: Thread | null,
): MergedThread {
  if (open === null && resolved === null) failThread('invalid-thread', 'no copy');
  if (open === null || resolved === null) {
    const only = (open ?? resolved) as Thread;
    return {
      thread: only,
      resolved: only.resolved !== null,
      location: threadLocation(only),
    };
  }
  if (open.id !== resolved.id) {
    failThread('invalid-thread', `different ids: "${open.id}" and "${resolved.id}"`);
  }
  const base = resolved.revision > open.revision ? resolved : open;
  const messages = mergedMessages(open, resolved);
  const candidate = joinedResolution(open, resolved, base, messages);
  const thread: Thread = {
    ...base,
    revision: Math.max(open.revision, resolved.revision),
    resolved: candidate,
    messages,
  };
  return { thread, resolved: candidate !== null, location: threadLocation(thread) };
}
