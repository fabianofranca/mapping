import { z } from 'zod';
import { normalizeIsoDate } from './schema';
import { PROPOSAL_ID_RE } from './proposal';
import { formatSpecPath, type SpecIssue } from './spec';

// Format of the anchored thread (Comments stage): one file per thread, open at
// `comments/<id>.json` or resolved at `comments/resolved/<id>.json`. The zod schema here is the
// source of truth; reading returns the errors with the exact path (`messages[2].author.email: …`).
// Pure: no DOM or Node. Whoever writes (the app session, the MCP server) stays outside the model.

export const THREAD_FORMAT = 'mapping-thread';
export const THREAD_FORMAT_VERSION = 1;
/** Folder of the open threads, relative to the project root. */
export const COMMENTS_DIR = 'comments';
/** Folder of the resolved threads. */
export const RESOLVED_DIR = 'comments/resolved';
/** Maximum length of a message's text (in `String.length` units). */
export const THREAD_MESSAGE_MAX = 10000;

/** Thread id: it becomes a file name, so the same rule as the proposal id. */
export const THREAD_ID_RE = PROPOSAL_ID_RE;

export type ThreadAuthorKind = 'human' | 'agent';

/** `email` is required for a person and `null` for an agent. */
export interface ThreadAuthor {
  readonly kind: ThreadAuthorKind;
  readonly name: string;
  readonly email: string | null;
}

export interface ThreadMessage {
  readonly id: string;
  readonly author: ThreadAuthor;
  /** ISO 8601 em UTC. */
  readonly at: string;
  /** Markdown, non-empty, up to `THREAD_MESSAGE_MAX`. */
  readonly text: string;
  /** Id of the proposal linked to the message (only the MCP server fills it) or `null`. */
  readonly proposal: string | null;
}

/** Who resolved it and when. */
export interface ThreadResolver {
  readonly name: string;
  readonly email: string;
}

export interface ThreadResolved {
  readonly by: ThreadResolver;
  readonly at: string;
}

/** Anchor by id: follows the item that moves or changes parent (decision 4). */
export type ThreadAnchor =
  | {
      readonly kind: 'marking' | 'container' | 'annotation' | 'arrow' | 'layer';
      readonly id: string;
    }
  | { readonly kind: 'field'; readonly annotationId: string; readonly key: string }
  | { readonly kind: 'entry'; readonly annotationId: string; readonly entryId: string }
  | {
      readonly kind: 'row';
      readonly annotationId: string;
      readonly key: string;
      readonly rowId: string;
    }
  | {
      readonly kind: 'point';
      /** `null`: the point is in canvas units. */
      readonly containerId: string | null;
      readonly x: number;
      readonly y: number;
    };

export type ThreadAnchorKind = ThreadAnchor['kind'];

export const THREAD_ANCHOR_KINDS: readonly ThreadAnchorKind[] = [
  'marking',
  'container',
  'annotation',
  'arrow',
  'layer',
  'field',
  'entry',
  'row',
  'point',
];

export interface Thread {
  readonly format: typeof THREAD_FORMAT;
  readonly formatVersion: typeof THREAD_FORMAT_VERSION;
  readonly id: string;
  readonly anchor: ThreadAnchor;
  readonly createdAt: string;
  /** Write counter of the file (same check as `mapping.json`). */
  readonly revision: number;
  readonly resolved: ThreadResolved | null;
  /** Sorted by `at` and, on a tie, by `id`. */
  readonly messages: readonly ThreadMessage[];
}

/** `comments/<id>.json` or, when resolved, `comments/resolved/<id>.json`. */
export function threadFilePath(threadId: string, resolved: boolean): string {
  return `${resolved ? RESOLVED_DIR : COMMENTS_DIR}/${threadId}.json`;
}

/** Canonical order of the messages: by instant (`at`) and, on a tie, by `id`. */
export function compareThreadMessages(a: ThreadMessage, b: ThreadMessage): number {
  const byTime = Date.parse(a.at) - Date.parse(b.at);
  if (byTime !== 0) return byTime;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** The first message in canonical order, without sorting all (`undefined` in an empty thread). */
export function firstThreadMessage(thread: Thread): ThreadMessage | undefined {
  let first: ThreadMessage | undefined;
  for (const m of thread.messages) {
    if (first === undefined || compareThreadMessages(m, first) < 0) first = m;
  }
  return first;
}

/** Sorted copy (the input does not change). */
export function sortThreadMessages(
  messages: readonly ThreadMessage[],
): readonly ThreadMessage[] {
  return [...messages].sort(compareThreadMessages);
}

// ---------------------------------------------------------------------------
// Validation (zod)

const id = z.string().min(1, 'cannot be empty');
const isoDate = z.iso
  .datetime({ offset: true, error: 'invalid date; use ISO 8601 (UTC)' })
  .transform(normalizeIsoDate);
const nonEmptyName = z.string().trim().min(1, 'cannot be empty');

const threadId = z
  .string()
  .regex(THREAD_ID_RE, 'invalid id; use [A-Za-z0-9._-], not starting with a dot');

export const threadAuthorSchema = z
  .object({
    kind: z.enum(['human', 'agent'], { error: 'must be "human" or "agent"' }),
    name: nonEmptyName,
    email: z.string().nullable(),
  })
  .superRefine((a, ctx) => {
    if (a.kind === 'human' && (a.email === null || a.email.trim() === '')) {
      ctx.addIssue({
        code: 'custom',
        path: ['email'],
        message: 'required for a person',
      });
    }
    if (a.kind === 'agent' && a.email !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['email'],
        message: 'must be null for an agent',
      });
    }
  });

const messageText = z.string().superRefine((text, ctx) => {
  if (text.trim() === '') {
    ctx.addIssue({ code: 'custom', message: 'cannot be empty' });
  } else if (text.length > THREAD_MESSAGE_MAX) {
    ctx.addIssue({
      code: 'custom',
      message: `at most ${THREAD_MESSAGE_MAX} characters`,
    });
  }
});

export const threadMessageSchema = z.object({
  id,
  author: threadAuthorSchema,
  at: isoDate,
  text: messageText,
  proposal: id.nullable(),
});

const kindError = `must be ${THREAD_ANCHOR_KINDS.map((k) => `"${k}"`).join(', ')}`;

export const threadAnchorSchema = z.discriminatedUnion(
  'kind',
  [
    z.object({ kind: z.literal('marking'), id }),
    z.object({ kind: z.literal('container'), id }),
    z.object({ kind: z.literal('annotation'), id }),
    z.object({ kind: z.literal('arrow'), id }),
    z.object({ kind: z.literal('layer'), id }),
    z.object({ kind: z.literal('field'), annotationId: id, key: id }),
    z.object({ kind: z.literal('entry'), annotationId: id, entryId: id }),
    z.object({ kind: z.literal('row'), annotationId: id, key: id, rowId: id }),
    z.object({
      kind: z.literal('point'),
      containerId: id.nullable(),
      x: z.number(),
      y: z.number(),
    }),
  ],
  { error: kindError },
);

export const threadResolverSchema = z.object({
  name: nonEmptyName,
  email: z.string().trim().min(1, 'cannot be empty'),
});

export const threadResolvedSchema = z.object({ by: threadResolverSchema, at: isoDate });

export const threadSchema = z
  .object({
    format: z.literal(THREAD_FORMAT, { error: `must be "${THREAD_FORMAT}"` }),
    formatVersion: z.literal(THREAD_FORMAT_VERSION, {
      error: `must be ${THREAD_FORMAT_VERSION}`,
    }),
    id: threadId,
    anchor: threadAnchorSchema,
    createdAt: isoDate,
    revision: z.number().int().min(0),
    resolved: threadResolvedSchema.nullable(),
    messages: z.array(threadMessageSchema).min(1, 'must have at least one message'),
  })
  .superRefine((t, ctx) => {
    const seen = new Set<string>();
    t.messages.forEach((m, i) => {
      if (seen.has(m.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['messages', i, 'id'],
          message: `duplicate id "${m.id}"`,
        });
      }
      seen.add(m.id);
    });
  })
  .transform((t) => ({ ...t, messages: sortThreadMessages(t.messages) }));

export type ThreadParseResult =
  | {
      readonly ok: true;
      readonly thread: Thread;
      /** Warnings from reading (none in formatVersion 1; the field exists for the next ones). */
      readonly warnings: readonly string[];
    }
  | { readonly ok: false; readonly issues: SpecIssue[]; readonly errors: string[] };

/** Validates an already parsed JSON; errors in the format `path: message`. */
export function parseThread(data: unknown): ThreadParseResult {
  const result = threadSchema.safeParse(data);
  if (result.success) {
    return { ok: true, thread: result.data as Thread, warnings: [] };
  }
  const issues = result.error.issues.map((i) => ({
    path: formatSpecPath(i.path),
    message: i.message,
  }));
  return {
    ok: false,
    issues,
    errors: issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)),
  };
}

/** Reads the text of a thread file. */
export function parseThreadText(text: string): ThreadParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    const message = `invalid JSON: ${e instanceof Error ? e.message : String(e)}`;
    return { ok: false, issues: [{ path: '', message }], errors: [message] };
  }
  return parseThread(data);
}

function serializeAnchor(a: ThreadAnchor) {
  switch (a.kind) {
    case 'field':
      return { kind: a.kind, annotationId: a.annotationId, key: a.key };
    case 'entry':
      return { kind: a.kind, annotationId: a.annotationId, entryId: a.entryId };
    case 'row':
      return { kind: a.kind, annotationId: a.annotationId, key: a.key, rowId: a.rowId };
    case 'point':
      return { kind: a.kind, containerId: a.containerId, x: a.x, y: a.y };
    default:
      return { kind: a.kind, id: a.id };
  }
}

function serializeMessage(m: ThreadMessage) {
  return {
    id: m.id,
    author: { kind: m.author.kind, name: m.author.name, email: m.author.email },
    at: m.at,
    text: m.text,
    proposal: m.proposal,
  };
}

/**
 * Text of the thread file: keys always in the same order, messages in canonical order
 * (`at`, `id`), 2-space indentation and a line break at the end.
 */
export function serializeThread(t: Thread): string {
  const canonical = {
    format: t.format,
    formatVersion: t.formatVersion,
    id: t.id,
    anchor: serializeAnchor(t.anchor),
    createdAt: t.createdAt,
    revision: t.revision,
    resolved: t.resolved
      ? {
          by: { name: t.resolved.by.name, email: t.resolved.by.email },
          at: t.resolved.at,
        }
      : null,
    messages: sortThreadMessages(t.messages).map(serializeMessage),
  };
  return `${JSON.stringify(canonical, null, 2)}\n`;
}
