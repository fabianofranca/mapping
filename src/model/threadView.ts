import { projectIndex, type ProjectIndex } from './projectIndex';
import {
  compareThreadMessages,
  firstThreadMessage,
  type Thread,
  type ThreadAnchor,
  type ThreadMessage,
} from './thread';
import { normalizeEmail } from './threadUsers';
import type { Annotation, Project } from './types';

// Thread view (Comments stage): where the anchor lives, whose turn it is, subject and "not
// read". Pure functions over `Thread` and `Project`; resolution by id uses `projectIndex`.
// Interface text (i18n) stays outside: only data comes out here (the type of the deleted target, for example).

// ---------------------------------------------------------------------------
// Anchor: host and orphan

/**
 * The item that hosts a thread's pin (decision 24): the marking, the container, the arrow or the
 * loose point itself. The thread of a field, pair, row and annotation lives on the owner's pin.
 */
export type ThreadHost =
  | { readonly kind: 'marking' | 'container' | 'arrow'; readonly id: string }
  | {
      readonly kind: 'point';
      readonly containerId: string | null;
      readonly x: number;
      readonly y: number;
    };

/** What the orphan anchor was looking for and no longer exists (the interface builds the text). */
export type ThreadMissingKind =
  'marking' | 'container' | 'arrow' | 'layer' | 'annotation' | 'entry' | 'row';

export type AnchorResolution =
  | {
      readonly orphan: false;
      readonly anchor: ThreadAnchor;
      /** `null`: the layer (and an annotation without an owner) has no pin. */
      readonly host: ThreadHost | null;
    }
  | {
      readonly orphan: true;
      readonly anchor: ThreadAnchor;
      readonly missing: ThreadMissingKind;
    };

type ItemAnchor = Extract<
  ThreadAnchor,
  { kind: 'marking' | 'container' | 'arrow' | 'layer' | 'annotation' }
>;
type PartAnchor = Exclude<ThreadAnchor, ItemAnchor>;

const found = (anchor: ThreadAnchor, host: ThreadHost | null): AnchorResolution => ({
  orphan: false,
  anchor,
  host,
});
const orphan = (anchor: ThreadAnchor, missing: ThreadMissingKind): AnchorResolution => ({
  orphan: true,
  anchor,
  missing,
});

/** The marking or the arrow that owns an annotation (the two share the id space). */
function ownerHost(idx: ProjectIndex, ownerId: string): ThreadHost | null {
  if (idx.markings.has(ownerId)) return { kind: 'marking', id: ownerId };
  if (idx.arrows.has(ownerId)) return { kind: 'arrow', id: ownerId };
  return null;
}

function resolveItem(idx: ProjectIndex, a: ItemAnchor): AnchorResolution {
  const maps: Record<ItemAnchor['kind'], ReadonlyMap<string, unknown>> = {
    marking: idx.markings,
    container: idx.containers,
    arrow: idx.arrows,
    layer: idx.layers,
    annotation: idx.annotations,
  };
  if (!maps[a.kind].has(a.id)) return orphan(a, a.kind);
  if (a.kind === 'layer') return found(a, null);
  if (a.kind === 'annotation') {
    const annotation = idx.annotations.get(a.id);
    return found(a, annotation ? ownerHost(idx, annotation.markingId) : null);
  }
  return found(a, { kind: a.kind, id: a.id });
}

function hasRow(annotation: Annotation, key: string, rowId: string): boolean {
  const rows = annotation.values?.[key];
  if (!Array.isArray(rows)) return false;
  return rows.some(
    (r) => typeof r === 'object' && r !== null && !Array.isArray(r) && r._id === rowId,
  );
}

function resolvePart(idx: ProjectIndex, a: PartAnchor): AnchorResolution {
  if (a.kind === 'point') {
    const lost = a.containerId !== null && !idx.containers.has(a.containerId);
    if (lost) return orphan(a, 'container');
    return found(a, { kind: 'point', containerId: a.containerId, x: a.x, y: a.y });
  }
  const annotation = idx.annotations.get(a.annotationId);
  if (!annotation) return orphan(a, 'annotation');
  if (a.kind === 'entry' && !idx.entries.get(annotation.id)?.has(a.entryId)) {
    return orphan(a, 'entry');
  }
  if (a.kind === 'row' && !hasRow(annotation, a.key, a.rowId)) return orphan(a, 'row');
  return found(a, ownerHost(idx, annotation.markingId));
}

/**
 * Where the anchor is in the project: the pin's host (`host`) or the orphan, with the type of what
 * disappeared. Field: the annotation only has to exist; pair and row must also exist (orphan if not).
 */
export function resolveAnchor(project: Project, anchor: ThreadAnchor): AnchorResolution {
  const idx = projectIndex(project);
  switch (anchor.kind) {
    case 'marking':
    case 'container':
    case 'arrow':
    case 'layer':
    case 'annotation':
      return resolveItem(idx, anchor);
    default:
      return resolvePart(idx, anchor);
  }
}

/** The anchor no longer exists in the project (deleted item, or deleted container of the point). */
export function isOrphan(project: Project, anchor: ThreadAnchor): boolean {
  return resolveAnchor(project, anchor).orphan;
}

/** The pin's host; `null` for the layer, the orphan and an annotation without an owner. */
export function hostOf(project: Project, anchor: ThreadAnchor): ThreadHost | null {
  const r = resolveAnchor(project, anchor);
  return r.orphan ? null : r.host;
}

/** Stable key of the host (groups the pins): `marking:<id>`, `point:<container>:<x>:<y>`… */
export function hostKey(host: ThreadHost): string {
  return host.kind === 'point'
    ? `point:${host.containerId ?? ''}:${host.x}:${host.y}`
    : `${host.kind}:${host.id}`;
}

// ---------------------------------------------------------------------------
// State: whose turn it is

/** The last message in canonical order (`at`, `id`); `null` in a thread with no messages. */
export function lastMessage(thread: Thread): ThreadMessage | null {
  let last: ThreadMessage | null = null;
  for (const m of thread.messages) {
    if (last === null || compareThreadMessages(m, last) > 0) last = m;
  }
  return last;
}

/** Who the thread is waiting for: `agent` or `human`; `null` when resolved (decision 14). */
export type ThreadAwaiting = 'agent' | 'human';

export function awaiting(thread: Thread): ThreadAwaiting | null {
  if (thread.resolved !== null) return null;
  const last = lastMessage(thread);
  if (last === null) return null;
  return last.author.kind === 'human' ? 'agent' : 'human';
}

// ---------------------------------------------------------------------------
// Subject (decision 17)

/** Maximum length of the subject, ellipsis included. */
export const SUBJECT_MAX = 80;

/** Replaces the label of a markdown link (the live chip belongs to the citations phase). */
export type SubjectLabelResolver = (label: string, url: string) => string;

const LINK_RE = /(!?)\[((?:\\.|[^\]\\])*)\]\(([^)\s]*)\)/g;
const UNESCAPE_RE = /\\([\\`*_{}[\]()#+\-.!>~|])/g;
const LINE_PREFIX_RE = /^(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)+/;
const STRONG_RE = /(\*\*|~~)(?=\S)(.+?)(?<=\S)\1/g;
const EM_STAR_RE = /\*(?=\S)(.+?)(?<=\S)\*/g;
const EM_UNDERSCORE_RE = /(^|[^\p{L}\p{N}_])(__?)(?=\S)(.+?)(?<=\S)\2(?![\p{L}\p{N}_])/gu;
const CODE_RE = /(`+)([^`]+)\1/g;
const FENCE_RE = /^\s*(?:`{3,}|~{3,})/;

/** Markers (private-use area) that hold a link's live label until the end of the cleanup. */
const LIVE_OPEN = '\uE000';
const LIVE_CLOSE = '\uE001';
const LIVE_RE = /\uE000(\d+)\uE001/g;
/** An escaped character (`\*`) becomes one from the private-use area (`ESCAPED_BASE` + code): emphasis does not read it. */
const ESCAPED_BASE = 0xe100;
const ESCAPED_RE = /[\uE100-\uE1FF]/g;

/**
 * Link → label. The live label (from `resolveLabel`) is already final text: it goes in as a marker and only
 * comes back at the end, so emphasis and escapes do not read it again (`__init__` stays `__init__`).
 */
function stripLinks(
  line: string,
  resolveLabel: SubjectLabelResolver | undefined,
  live: string[],
): string {
  return line.replace(LINK_RE, (_all, bang: string, label: string, url: string) => {
    if (bang !== '' || !resolveLabel) return label;
    live.push(resolveLabel(label.replace(UNESCAPE_RE, '$1'), url));
    return `${LIVE_OPEN}${live.length - 1}${LIVE_CLOSE}`;
  });
}

function stripEmphasis(line: string): string {
  return line
    .replace(CODE_RE, '$2')
    .replace(STRONG_RE, '$2')
    .replace(EM_STAR_RE, '$1')
    .replace(EM_UNDERSCORE_RE, '$1$3');
}

function plainLine(line: string, resolveLabel?: SubjectLabelResolver): string {
  if (FENCE_RE.test(line)) return '';
  const body = line.trim().replace(LINE_PREFIX_RE, '');
  const live: string[] = [];
  const protectedText = stripLinks(body, resolveLabel, live).replace(
    UNESCAPE_RE,
    (_all, ch: string) => String.fromCharCode(ESCAPED_BASE + ch.charCodeAt(0)),
  );
  return stripEmphasis(protectedText)
    .replace(ESCAPED_RE, (ch) => String.fromCharCode(ch.charCodeAt(0) - ESCAPED_BASE))
    .replace(LIVE_RE, (_all, index: string) => live[Number(index)] ?? '')
    .trim();
}

/**
 * The thread's subject: the first line with text of the first message, without the markdown
 * markup (heading, list, quote, emphasis, code, link → label), with up to `SUBJECT_MAX`
 * characters (the ellipsis `…` counts toward the total). `resolveLabel` replaces the links' label.
 */
export function threadSubject(
  thread: Thread,
  resolveLabel?: SubjectLabelResolver,
): string {
  const first = firstThreadMessage(thread);
  if (!first) return '';
  for (const line of first.text.split(/\r?\n/)) {
    const plain = plainLine(line, resolveLabel);
    if (plain !== '') return clip(plain);
  }
  return '';
}

function clip(text: string, max: number = SUBJECT_MAX): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars
    .slice(0, max - 1)
    .join('')
    .trimEnd()}…`;
}

/** Maximum length of the plain text of the "Last message" column. */
export const MESSAGE_PLAIN_MAX = 200;

/**
 * The message text on one line, without the markdown markup (like the subject, decision 17):
 * lines with text are joined by a space, and the link becomes the label.
 */
export function messagePlainText(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => plainLine(line))
    .filter((line) => line !== '');
  return clip(lines.join(' '), MESSAGE_PLAIN_MAX);
}

// ---------------------------------------------------------------------------
// Unread (decision 16)

/** The person on this device (the identity from Settings). */
export interface ThreadViewer {
  readonly email: string;
}

function isOwn(message: ThreadMessage, myEmail: string): boolean {
  return (
    message.author.kind === 'human' &&
    myEmail !== '' &&
    normalizeEmail(message.author.email) === myEmail
  );
}

/**
 * The thread has a message from another person (another email) or from an agent after `lastReadAt`
 * (strictly after; `null` = everything is later). The message's own author never counts.
 */
export function isUnread(
  thread: Thread,
  lastReadAt: string | null,
  me: ThreadViewer | null,
): boolean {
  const parsed = lastReadAt === null ? Number.NaN : Date.parse(lastReadAt);
  const since = Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
  const myEmail = normalizeEmail(me?.email);
  return thread.messages.some((m) => Date.parse(m.at) > since && !isOwn(m, myEmail));
}
