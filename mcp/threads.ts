import { randomUUID } from 'node:crypto';
import {
  THREAD_MESSAGE_MAX,
  ThreadError,
  appendMessage,
  awaiting,
  backlinks,
  citationTargetKey,
  filterThreads,
  formatAnyRef,
  extractCitations,
  lastMessage,
  layerShortCode,
  matchLayerCode,
  liveCitation,
  liveLabel,
  normalizeId,
  openThread,
  parseAnyRef,
  projectIndex,
  resolveAnchor,
  resolveCitation,
  shortCode,
  shortCodesFor,
  tableRows,
  threadShortCodes,
  threadSubject,
  type Annotation,
  type CitationContext,
  type CitationTarget,
  type Project,
  type Thread,
  type ThreadAnchor,
  type ThreadAuthor,
  type ThreadMessage,
} from '../src/model';
import { ToolError } from './errors';
import { INVALID_REF_HINT, Refs, candidateLocations, type ResolvedItem } from './items';
import type { Roots } from './paths';
import {
  findProject,
  loadProject,
  type LoadedProject,
  type ProjectLocation,
} from './projects';
import { ProposalRefs } from './proposalRefs';
import { listStored, type StoredProposals } from './proposalStore';
import { progressView } from './proposalViews';
import { BARE_ID } from './shared';
import {
  commentsSignature,
  listStoredThreads,
  listThreadIds,
  readStoredThread,
  updateStoredThread,
  writeNewThread,
  type StoredThreads,
} from './threadStore';

// Conversations anchored by the MCP (Comments stage, CM6). The agent reads the inbox, opens
// a conversation where there is ambiguity and replies with the `after` guard; it never resolves, reopens or
// deletes (there is no tool for that) and never signs as a person: the author is always `agent`, with
// `email: null`. This is the server's ONLY author assembly (`tests/tooling/threadAuthors`).

type Json = Record<string, unknown>;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
/** Default and maximum of `wait_for_comment`, in seconds (the spike of decision 37: Claude Code cuts the tool at 60 s). */
export const WAIT_DEFAULT_SECONDS = 45;
export const WAIT_MAX_SECONDS = 50;
const WAIT_POLL_MS = 1000;
const WAIT_PROGRESS_MS = 15_000;

const THREAD_REF_ACCEPTED = [
  'mapping://project/c/3f2a9c1e',
  'c/3f2a9c1e (with the project given separately)',
  'the full id of the conversation (with the project given separately)',
];
const ANCHOR_ACCEPTED = [
  'mapping://project/m/3f2a9c1e (marking or arrow), …/i/… (container), …/a/… (annotation), …/l/… (layer)',
  'mapping://project/a/3f2a9c1e/f/<field> (field), …/a/3f2a9c1e/e/<code> (pair), …/a/3f2a9c1e/f/<field>/r/<code> (row)',
  '{ point: { container: "mapping://project/i/3f2a9c1e" | null, x, y } } (loose point, in container pixels; null = canvas)',
];

// ---------------------------------------------------------------------------
// Text and authorship

/** Checks the text of a message: not empty and up to `THREAD_MESSAGE_MAX` characters. */
export function checkMessageText(text: string): string {
  if (text.trim() === '') {
    throw new ToolError('empty-message', 'the message cannot be empty');
  }
  if (text.length > THREAD_MESSAGE_MAX) {
    throw new ToolError(
      'message-too-long',
      `the message has ${text.length} characters; the maximum is ${THREAD_MESSAGE_MAX}`,
      { max: THREAD_MESSAGE_MAX },
    );
  }
  return text;
}

/** The author of the server's messages: always an agent, without an email (decision 12). */
export function agentAuthor(name: string | undefined, clientName?: string): ThreadAuthor {
  const shown = name?.trim() || clientName?.trim() || 'agente';
  return { kind: 'agent', name: shown, email: null };
}

/** The conversation model's errors become `invalid-thread` (the invalid message or file). */
function translate<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof ThreadError) {
      throw new ToolError('invalid-thread', error.message);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Environment of a call: project, conversations, proposals and references

interface Env {
  readonly location: ProjectLocation;
  readonly refs: Refs;
  readonly project: Project;
  readonly threads: readonly Thread[];
  readonly stored: StoredThreads;
  readonly codes: ReadonlyMap<string, string>;
  readonly proposals: StoredProposals;
  readonly proposalRefs: ProposalRefs;
  readonly ctx: CitationContext;
}

async function buildEnv(roots: Roots, location: ProjectLocation): Promise<Env> {
  const ids = await listThreadIds(location);
  const [loaded, stored, proposals] = await Promise.all([
    loadProject(roots, location),
    listStoredThreads(roots, location, ids),
    listStored(roots, location),
  ]);
  const threads = stored.threads.map((s) => s.thread);
  return {
    location,
    refs: new Refs(loaded),
    project: loaded.project,
    threads,
    stored,
    codes: threadShortCodes(ids),
    proposals,
    proposalRefs: new ProposalRefs(location.name, proposals),
    ctx: {
      project: loaded.project,
      threads,
      proposals: proposals.proposals.map((p) => ({
        id: p.id,
        title: p.proposal.title,
      })),
      subjectOf: (thread) => threadSubject(thread),
    },
  };
}

type Rebuilt = { readonly env: Env } | { readonly env: null; readonly warning: Json };

/** Rebuilds the environment after writing; a failure becomes the `reply-incomplete` warning, not an error. */
async function rebuildEnv(roots: Roots, location: ProjectLocation): Promise<Rebuilt> {
  try {
    return { env: await buildEnv(roots, location) };
  } catch (error) {
    return {
      env: null,
      warning: {
        code: 'reply-incomplete',
        message: `the message was written, but the project could not be reread to build the response (${error instanceof Error ? error.message : String(error)})`,
        hint: 'do not repeat the post_message or the proposal: check with get_thread',
      },
    };
  }
}

function fallbackRef(location: ProjectLocation, id: string): string {
  const code = normalizeId(id).slice(0, 8);
  return formatAnyRef(location.name, { type: 'item', kind: 'c', code });
}

function threadRef(env: Env, id: string): string {
  const code = env.codes.get(id) ?? normalizeId(id).slice(0, 8);
  return formatAnyRef(env.location.name, { type: 'item', kind: 'c', code });
}

function annotationOf(env: Env, id: string): Annotation | undefined {
  return projectIndex(env.project).annotations.get(id);
}

/** The reference (`mapping://…`) of a target that exists in the project. */
function targetRef(env: Env, target: CitationTarget): string {
  const name = env.location.name;
  const project = env.project;
  switch (target.kind) {
    case 'marking':
    case 'arrow':
      return env.refs.ref('m', target.id);
    case 'container':
      return env.refs.ref('i', target.id);
    case 'annotation':
      return env.refs.ref('a', target.id);
    case 'layer': {
      const code = layerShortCode(project, target.id);
      return formatAnyRef(name, { type: 'item', kind: 'l', code });
    }
    case 'thread':
      return threadRef(env, target.id);
    case 'proposal':
      return env.proposalRefs.ref(target.id);
    default:
      return partRef(env, target);
  }
}

export type PartTarget = Extract<CitationTarget, { kind: 'field' | 'entry' | 'row' }>;

function partRef(env: Env, target: PartTarget): string {
  return partRefOf(env.location.name, env.project, target);
}

/** The reference of a field, pair or row (`…/a/<code>/f/<field>`, `/e/<code>`, `/r/<code>`). */
export function partRefOf(name: string, project: Project, target: PartTarget): string {
  const annotation = shortCode(project, 'a', target.annotationId);
  const owner = projectIndex(project).annotations.get(target.annotationId);
  if (target.kind === 'field') {
    return formatAnyRef(name, { type: 'field', annotation, key: target.key });
  }
  if (target.kind === 'entry') {
    const codes = shortCodesFor((owner?.entries ?? []).map((e) => e.id));
    const entry = codes.get(target.entryId) ?? normalizeId(target.entryId).slice(0, 8);
    return formatAnyRef(name, { type: 'entry', annotation, entry });
  }
  const rows = tableRows(owner?.values?.[target.key]).map((r) => r._id);
  const row =
    shortCodesFor(rows).get(target.rowId) ?? normalizeId(target.rowId).slice(0, 8);
  return formatAnyRef(name, { type: 'row', annotation, key: target.key, row });
}

/** The readable part of the target (current name), or `null` without a name. */
function liveName(env: Env, target: CitationTarget): string | null {
  const live = liveLabel(env.ctx, { found: true, target }, '');
  return live.broken ? null : live.label;
}

/** `Container › Marking › Annotation › field`: the readable path of a target that exists. */
function targetPath(env: Env, target: CitationTarget): string {
  const SEP = ' › ';
  switch (target.kind) {
    case 'marking':
    case 'arrow':
      return env.refs.label('m', target.id);
    case 'container':
      return env.refs.label('i', target.id);
    case 'annotation':
      return env.refs.label('a', target.id);
    case 'field':
    case 'entry':
    case 'row': {
      const owner = env.refs.label('a', target.annotationId);
      const own = liveName(env, target);
      return own === null ? owner : `${owner}${SEP}${own}`;
    }
    default:
      return liveName(env, target) ?? '';
  }
}

function partValue(env: Env, target: CitationTarget): unknown {
  const owner =
    'annotationId' in target ? annotationOf(env, target.annotationId) : undefined;
  if (target.kind === 'field') return owner?.values?.[target.key] ?? null;
  if (target.kind === 'entry') {
    return owner?.entries.find((e) => e.id === target.entryId)?.value ?? null;
  }
  return undefined;
}

/** Describes a target that exists: kind, reference, path, name and (field and pair) the value. */
function describeTarget(env: Env, target: CitationTarget): Json {
  const value = partValue(env, target);
  return {
    kind: target.kind,
    ref: targetRef(env, target),
    path: targetPath(env, target),
    label: liveName(env, target),
    ...(value === undefined ? {} : { value }),
    broken: false,
  };
}

function pointOf(env: Env, anchor: Extract<ThreadAnchor, { kind: 'point' }>): Json {
  const container =
    anchor.containerId === null ? null : env.refs.ref('i', anchor.containerId);
  return { container, x: anchor.x, y: anchor.y };
}

/** The anchor of a conversation: the resolved target, the loose point or, if orphaned, what is saved. */
function anchorView(env: Env, anchor: ThreadAnchor): Json {
  const resolved = resolveAnchor(env.project, anchor);
  if (resolved.orphan) {
    return {
      orphan: true,
      kind: anchor.kind,
      path: null,
      missing: resolved.missing,
      anchor,
    };
  }
  if (anchor.kind === 'point') {
    const where =
      anchor.containerId === null ? 'Canvas' : env.refs.imageLabel(anchor.containerId);
    return {
      orphan: false,
      kind: 'point',
      point: pointOf(env, anchor),
      path: `${where} › point (${anchor.x}, ${anchor.y})`,
    };
  }
  const described = describeTarget(env, anchor as CitationTarget);
  return { orphan: false, ...described, name: described.label };
}

/** What the list shows in `anchor`: the reference, the point, or (if orphaned) what is saved. */
function anchorField(view: Json): unknown {
  if (view.orphan === true) return view.anchor;
  return view.ref ?? { point: view.point };
}

// ---------------------------------------------------------------------------
// Citations and messages

function citesOf(env: Env, text: string): Json[] {
  return extractCitations(text).map((citation) => {
    const live = liveCitation(env.ctx, citation);
    if (!live.resolution.found || live.broken) {
      const reason = live.resolution.found ? 'missing' : live.resolution.reason;
      return {
        kind: null,
        ref: null,
        url: citation.url,
        path: null,
        label: citation.label,
        broken: true,
        reason,
      };
    }
    return describeTarget(env, live.resolution.target);
  });
}

function authorView(author: ThreadAuthor): Json {
  return { kind: author.kind, name: author.name, email: author.email };
}

function messageView(env: Env, message: ThreadMessage): Json {
  return {
    id: message.id,
    author: authorView(message.author),
    at: message.at,
    text: message.text,
    proposal: message.proposal === null ? null : env.proposalRefs.ref(message.proposal),
    cites: citesOf(env, message.text),
  };
}

function summaryRow(env: Env, thread: Thread): Json {
  const view = anchorView(env, thread.anchor);
  const last = lastMessage(thread) as ThreadMessage;
  return {
    ref: threadRef(env, thread.id),
    anchor: anchorField(view),
    kind: view.kind,
    path: view.path,
    orphan: view.orphan,
    status: thread.resolved === null ? 'open' : 'resolved',
    awaiting: awaiting(thread),
    messages: thread.messages.length,
    subject: threadSubject(thread),
    last: {
      id: last.id,
      author: authorView(last.author),
      at: last.at,
      text: last.text,
      cites: citesOf(env, last.text),
    },
  };
}

function brokenCites(env: Env, text: string): Json[] {
  return citesOf(env, text)
    .filter((c) => c.broken === true)
    .map((c) => ({
      code: 'broken-cite',
      label: c.label,
      url: c.url,
      message: `the citation "${String(c.label)}" does not resolve in this project; the message was written anyway`,
    }));
}

// ---------------------------------------------------------------------------
// Input references

function invalidRef(refText: string): ToolError {
  return new ToolError('invalid-ref', `invalid conversation reference: ${refText}`, {
    accepted: THREAD_REF_ACCEPTED,
    hint: INVALID_REF_HINT,
  });
}

function parseThreadRef(
  refText: string,
): { project: string | null; code: string } | null {
  const input = refText.trim();
  const parsed = parseAnyRef(input);
  if (parsed) {
    const { ref } = parsed;
    return ref.type === 'item' && ref.kind === 'c'
      ? { project: parsed.project, code: ref.code }
      : null;
  }
  return BARE_ID.test(input) ? { project: null, code: input } : null;
}

function matchIds(ids: readonly string[], code: string): string[] {
  const exactId = ids.filter((id) => id === code);
  if (exactId.length === 1) return exactId;
  const wanted = normalizeId(code);
  if (wanted === '') return [];
  const prefix = ids.filter((id) => normalizeId(id).startsWith(wanted));
  const exact = prefix.filter((id) => normalizeId(id) === wanted);
  return exact.length > 0 ? exact : prefix;
}

interface FoundThread {
  readonly location: ProjectLocation;
  readonly id: string;
}

/** Finds the conversation by the reference, from the file names only (nothing is read). */
export async function findThread(
  roots: Roots,
  refText: string,
  projectArg?: string,
): Promise<FoundThread> {
  const parsed = parseThreadRef(refText);
  if (!parsed) throw invalidRef(refText);
  const locations = await candidateLocations(roots, parsed.project, projectArg);
  const found: FoundThread[] = [];
  for (const location of locations) {
    for (const id of matchIds(await listThreadIds(location), parsed.code)) {
      found.push({ location, id });
    }
  }
  if (found.length === 1) return found[0] as FoundThread;
  if (found.length === 0) {
    throw new ToolError('thread-not-found', `no conversation matches ${refText}`, {
      ref: refText,
      searched: locations.map((l) => l.path),
      hint: 'use list_threads(project) to see the conversations of the project',
    });
  }
  throw new ToolError(
    'ambiguous-ref',
    `${found.length} conversations start with that code: use the full reference of one of them`,
    {
      ref: refText,
      candidates: found.slice(0, 20).map((c) => ({
        ref: formatAnyRef(c.location.name, { type: 'item', kind: 'c', code: c.id }),
        dir: c.location.dir,
      })),
    },
  );
}

// ---------------------------------------------------------------------------
// Input anchor

type AnchorArg = string | Record<string, unknown>;

function invalidAnchor(why: string, given: unknown): ToolError {
  return new ToolError('invalid-anchor', `invalid anchor: ${why}`, {
    anchor: given,
    accepted: ANCHOR_ACCEPTED,
  });
}

function missingAnchor(given: unknown): ToolError {
  return new ToolError('anchor-not-found', 'the anchor does not exist in this project', {
    anchor: given,
    hint: 'check the reference with list_projects, get_marking, get_annotation or resolve',
  });
}

/** Target -> anchor; a conversation and a proposal are not anchors. */
function anchorOfTarget(target: CitationTarget, given: unknown): ThreadAnchor {
  if (target.kind === 'thread' || target.kind === 'proposal') {
    throw invalidAnchor('a conversation or a proposal is not an anchor', given);
  }
  return target;
}

function resolveRefAnchor(env: Env, refText: string, given: unknown): ThreadAnchor {
  const parsed = parseAnyRef(refText);
  if (!parsed) throw invalidAnchor('a reference that does not close the grammar', given);
  if (parsed.project !== null && parsed.project !== env.location.name) {
    throw new ToolError(
      'project-mismatch',
      `the reference is from project "${parsed.project}", not "${env.location.name}"`,
    );
  }
  if (
    parsed.ref.type === 'item' &&
    (parsed.ref.kind === 'p' || parsed.ref.kind === 'c')
  ) {
    throw invalidAnchor('a conversation or a proposal is not an anchor', given);
  }
  const resolution = resolveCitation(env.ctx, parsed.ref);
  if (resolution.found) return anchorOfTarget(resolution.target, given);
  if (resolution.reason === 'ambiguous') {
    throw new ToolError(
      'ambiguous-ref',
      'the short code matches more than one target: use a longer code',
      { ref: refText },
    );
  }
  throw missingAnchor(given);
}

function pointCoordinates(raw: unknown, given: unknown): { x: number; y: number } {
  if (typeof raw !== 'object' || raw === null) {
    throw invalidAnchor('`point` must be { container, x, y }', given);
  }
  const { x, y } = raw as Record<string, unknown>;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw invalidAnchor('`x` and `y` must be numbers', given);
  }
  return { x: x as number, y: y as number };
}

/** The container id of a loose point (`null`: the canvas). */
function pointContainer(env: Env, raw: unknown, given: unknown): string | null {
  const { container } = raw as Record<string, unknown>;
  if (container === null || container === undefined) return null;
  const parsed = typeof container === 'string' ? parseAnyRef(container) : null;
  if (!parsed || parsed.ref.type !== 'item' || parsed.ref.kind !== 'i') {
    throw invalidAnchor(
      '`container` must be the reference of a container (`…/i/…`) or null',
      given,
    );
  }
  return (resolveRefAnchor(env, container as string, given) as { id: string }).id;
}

function resolvePointAnchor(env: Env, raw: unknown, given: unknown): ThreadAnchor {
  const { x, y } = pointCoordinates(raw, given);
  return { kind: 'point', containerId: pointContainer(env, raw, given), x, y };
}

/** The anchor of the arguments of `open_thread` and of the `anchor` filter of `list_threads`. */
function resolveAnchorArg(env: Env, anchor: AnchorArg): ThreadAnchor {
  if (typeof anchor === 'string') return resolveRefAnchor(env, anchor, anchor);
  if (typeof anchor === 'object' && anchor !== null && 'point' in anchor) {
    return resolvePointAnchor(env, anchor.point, anchor);
  }
  throw invalidAnchor('use a reference or { point: { container, x, y } }', anchor);
}

// ---------------------------------------------------------------------------
// List filters

export type ThreadStatusArg = 'open' | 'resolved' | 'all';
export type ThreadAwaitingArg = 'agent' | 'human' | 'any';

export interface ListThreadsArgs {
  readonly project: string;
  readonly status?: ThreadStatusArg | undefined;
  readonly awaiting?: ThreadAwaitingArg | undefined;
  readonly anchor?: AnchorArg | undefined;
  readonly text?: string | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

/**
 * With no filter at all (neither `text` nor `anchor`): the open ones awaiting the agent (the
 * inbox). With any filter, what is missing defaults to `status: open` and `awaiting: any`.
 */
function effectiveFilters(args: ListThreadsArgs): {
  status: ThreadStatusArg;
  awaiting: ThreadAwaitingArg;
} {
  const unfiltered =
    args.status === undefined &&
    args.awaiting === undefined &&
    args.text === undefined &&
    args.anchor === undefined;
  if (unfiltered) return { status: 'open', awaiting: 'agent' };
  return { status: args.status ?? 'open', awaiting: args.awaiting ?? 'any' };
}

/** The conversation is anchored at the target or at a part of it. */
function samePoint(a: ThreadAnchor, b: ThreadAnchor): boolean {
  return (
    a.kind === 'point' &&
    b.kind === 'point' &&
    a.containerId === b.containerId &&
    a.x === b.x &&
    a.y === b.y
  );
}

function anchoredAt(env: Env, thread: Thread, anchor: ThreadAnchor): boolean {
  const own = thread.anchor;
  if (anchor.kind === 'point' || own.kind === 'point') return samePoint(anchor, own);
  if (
    anchor.kind === 'marking' ||
    anchor.kind === 'container' ||
    anchor.kind === 'arrow'
  ) {
    const selection = { itemId: anchor.id, cites: new Map() };
    return (
      filterThreads([thread], env.project, { status: 'all', selection }).length === 1
    );
  }
  if (citationTargetKey(anchor) === citationTargetKey(own)) return true;
  return (
    anchor.kind === 'annotation' &&
    'annotationId' in own &&
    own.annotationId === anchor.id
  );
}

function selectThreads(env: Env, args: ListThreadsArgs): readonly Thread[] {
  const { status, awaiting: wanted } = effectiveFilters(args);
  const filter = {
    status,
    ...(args.text === undefined ? {} : { text: args.text }),
  };
  let threads = filterThreads(env.threads, env.project, filter);
  if (wanted !== 'any') threads = threads.filter((t) => awaiting(t) === wanted);
  if (args.anchor !== undefined) {
    const anchor = resolveAnchorArg(env, args.anchor);
    threads = threads.filter((t) => anchoredAt(env, t, anchor));
  }
  return threads;
}

// ---------------------------------------------------------------------------
// The service

export interface PostArgs {
  readonly ref: string;
  readonly text: string;
  readonly after: string;
  readonly project?: string | undefined;
  readonly author?: string | undefined;
}

export interface OpenArgs {
  readonly project: string;
  readonly anchor: AnchorArg;
  readonly text: string;
  readonly author?: string | undefined;
}

export interface WaitArgs {
  readonly project: string;
  readonly timeoutSeconds?: number | undefined;
}

export interface WaitHooks {
  readonly signal?: AbortSignal | undefined;
  /** Called every ~15 s of waiting (the client that sent `progressToken` receives the progress). */
  readonly progress?: ((seconds: number) => Promise<void>) | undefined;
}

export class Threads {
  constructor(
    private readonly roots: Roots,
    private readonly now: () => number = Date.now,
    private readonly clientName: () => string | undefined = () => undefined,
  ) {}

  private author(name: string | undefined): ThreadAuthor {
    return agentAuthor(name, this.clientName());
  }

  // -------------------------------------------------------------------------
  // list_threads

  async list(args: ListThreadsArgs): Promise<Json> {
    const env = await buildEnv(this.roots, await findProject(this.roots, args.project));
    const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(args.offset ?? 0, 0);
    const selected = selectThreads(env, args);
    const page = selected.slice(offset, offset + limit);
    return {
      project: { name: env.location.name, path: env.location.path },
      total: selected.length,
      offset,
      limit,
      threads: page.map((t) => summaryRow(env, t)),
      ...(env.stored.broken.length > 0 ? { broken: env.stored.broken } : {}),
    };
  }

  // -------------------------------------------------------------------------
  // get_thread

  async get(refText: string, projectArg: string | undefined): Promise<Json> {
    const { location, id } = await findThread(this.roots, refText, projectArg);
    const env = await buildEnv(this.roots, location);
    const thread = env.threads.find((t) => t.id === id);
    if (!thread) {
      // The conversation exists but the file is unreadable: `readStoredThread` explains.
      await readStoredThread(this.roots, location, id);
      throw new ToolError('thread-not-found', `conversation not found: ${refText}`);
    }
    return this.threadView(env, thread);
  }

  private threadView(env: Env, thread: Thread): Json {
    const cited = backlinks(env.threads).get(thread.id) ?? [];
    const byId = new Map(env.threads.map((t) => [t.id, t]));
    const linked = new Map(env.proposals.proposals.map((p) => [p.id, p.proposal]));
    const proposalIds = [
      ...new Set(
        thread.messages.flatMap((m) => (m.proposal === null ? [] : [m.proposal])),
      ),
    ];
    return {
      ref: threadRef(env, thread.id),
      id: thread.id,
      project: { name: env.location.name, path: env.location.path },
      status: thread.resolved === null ? 'open' : 'resolved',
      awaiting: awaiting(thread),
      resolved:
        thread.resolved === null
          ? null
          : {
              by: { name: thread.resolved.by.name, email: thread.resolved.by.email },
              at: thread.resolved.at,
            },
      createdAt: thread.createdAt,
      revision: thread.revision,
      subject: threadSubject(thread),
      anchor: anchorView(env, thread.anchor),
      messages: thread.messages.map((m) => messageView(env, m)),
      citedIn: cited.map((id) => {
        const other = byId.get(id) as Thread;
        return {
          ref: threadRef(env, id),
          subject: threadSubject(other),
          status: other.resolved === null ? 'open' : 'resolved',
        };
      }),
      proposals: proposalIds.map((pid) => {
        const proposal = linked.get(pid);
        return {
          ref: env.proposalRefs.ref(pid),
          title: proposal?.title ?? null,
          status: proposal?.status ?? 'missing',
          ...(proposal ? { progress: progressView(proposal) } : {}),
        };
      }),
    };
  }

  // -------------------------------------------------------------------------
  // open_thread

  async openConversation(args: OpenArgs): Promise<Json> {
    const text = checkMessageText(args.text);
    const location = await findProject(this.roots, args.project);
    const env = await buildEnv(this.roots, location);
    const anchor = resolveAnchorArg(env, args.anchor);
    const thread = translate(() =>
      openThread({
        id: randomUUID(),
        anchor,
        author: this.author(args.author),
        text,
        at: new Date(this.now()).toISOString(),
        messageId: randomUUID(),
      }),
    );
    const file = await writeNewThread(this.roots, location, thread);
    const after: Env = {
      ...env,
      threads: [...env.threads, thread],
      codes: threadShortCodes([...env.codes.keys(), thread.id]),
    };
    const warnings = brokenCites(after, text);
    return {
      opened: true,
      ref: threadRef(after, thread.id),
      id: thread.id,
      status: 'open',
      awaiting: 'human',
      anchor: anchorView(after, anchor),
      file,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  // -------------------------------------------------------------------------
  // post_message

  async post(args: PostArgs): Promise<Json> {
    const text = checkMessageText(args.text);
    const { location, id } = await findThread(this.roots, args.ref, args.project);
    const author = this.author(args.author);
    let posted: ThreadMessage | null = null;
    const next = await updateStoredThread(this.roots, location, id, (thread) => {
      if (thread.resolved !== null) throw resolvedError(args.ref);
      guardAfter(thread, args.after);
      posted = newMessage(thread, author, text, this.now());
      return translate(() => appendMessage(thread, posted as ThreadMessage));
    });
    // The message is already written: if the project cannot be reread, the response says so (success
    // with a warning), instead of an error that would lead the agent to repeat the `post_message`.
    const rebuilt = await rebuildEnv(this.roots, location);
    const warnings = rebuilt.env ? brokenCites(rebuilt.env, text) : [rebuilt.warning];
    return {
      posted: true,
      ref: rebuilt.env ? threadRef(rebuilt.env, id) : fallbackRef(location, id),
      message: {
        id: (posted as ThreadMessage | null)?.id,
        at: (posted as ThreadMessage | null)?.at,
      },
      awaiting: awaiting(next),
      revision: next.revision,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  // -------------------------------------------------------------------------
  // propose_changes com `thread`

  /** Checks that the conversation of `propose_changes` exists and is open; nothing is written. */
  async checkOpen(refText: string, location: ProjectLocation): Promise<FoundThread> {
    const found = await findThread(this.roots, refText, location.path);
    const thread = await readStoredThread(this.roots, found.location, found.id);
    if (thread.resolved !== null) throw resolvedError(refText);
    return found;
  }

  /** Appends the agent's message with `proposal` (after the proposal is written). */
  async linkProposal(
    found: FoundThread,
    proposalId: string,
    text: string,
    authorName: string | undefined,
  ): Promise<Json> {
    const author = this.author(authorName);
    let posted: ThreadMessage | null = null;
    const next = await updateStoredThread(
      this.roots,
      found.location,
      found.id,
      (thread) => {
        if (thread.resolved !== null) throw resolvedError(found.id);
        posted = {
          ...newMessage(thread, author, text, this.now()),
          proposal: proposalId,
        };
        return translate(() => appendMessage(thread, posted as ThreadMessage));
      },
    );
    const rebuilt = await rebuildEnv(this.roots, found.location);
    return {
      ref: rebuilt.env
        ? threadRef(rebuilt.env, found.id)
        : fallbackRef(found.location, found.id),
      message: { id: (posted as ThreadMessage | null)?.id },
      revision: next.revision,
      ...(rebuilt.env ? {} : { warnings: [rebuilt.warning] }),
    };
  }

  // -------------------------------------------------------------------------
  // wait_for_comment

  async wait(args: WaitArgs, hooks: WaitHooks = {}): Promise<Json> {
    const location = await findProject(this.roots, args.project);
    const seconds = Math.min(
      Math.max(args.timeoutSeconds ?? WAIT_DEFAULT_SECONDS, 1),
      WAIT_MAX_SECONDS,
    );
    // The signature comes before the baseline: a message written after the baseline changes the
    // signature relative to this one and is returned in the same wait.
    let signature = await commentsSignature(location);
    const baseline = awaitingMap((await listStoredThreads(this.roots, location)).threads);
    const started = this.now();
    let nextProgress = started + WAIT_PROGRESS_MS;
    while (this.now() - started < seconds * 1000) {
      await sleep(WAIT_POLL_MS, hooks.signal);
      const current = await commentsSignature(location);
      if (current !== signature) {
        signature = current;
        const hit = await this.firstNew(location, baseline);
        if (hit !== null) return hit;
      }
      if (hooks.progress && this.now() >= nextProgress) {
        nextProgress += WAIT_PROGRESS_MS;
        await hooks.progress(Math.round((this.now() - started) / 1000));
      }
    }
    return { changed: false, waitedSeconds: Math.round((this.now() - started) / 1000) };
  }

  private async firstNew(
    location: ProjectLocation,
    baseline: ReadonlyMap<string, string>,
  ): Promise<Json | null> {
    const env = await buildEnv(this.roots, location);
    const fresh = env.threads.filter((t) => {
      const last = lastMessage(t);
      return awaiting(t) === 'agent' && last !== null && baseline.get(t.id) !== last.id;
    });
    if (fresh.length === 0) return null;
    const first = fresh[0] as Thread;
    return {
      changed: true,
      thread: summaryRow(env, first),
      alsoAwaiting: fresh.length - 1,
      hint: 'read with get_thread, reply with post_message (after = id of the last message read) and call wait_for_comment again',
    };
  }
}

function awaitingMap(threads: readonly { thread: Thread }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const { thread } of threads) {
    const last = lastMessage(thread);
    if (awaiting(thread) === 'agent' && last !== null) map.set(thread.id, last.id);
  }
  return map;
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  const cancelled = () => new ToolError('cancelled', 'the wait was cancelled');
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(cancelled());
    const onAbort = () => {
      clearTimeout(timer);
      reject(cancelled());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function resolvedError(refText: string): ToolError {
  return new ToolError(
    'thread-resolved',
    'the conversation is resolved: no one adds more messages to it',
    {
      ref: refText,
      hint: 'open another conversation with open_thread and cite this one in it: [subject](mapping://<project>/c/<code>)',
    },
  );
}

/** The `after` guard: only writes if the last message read is still the last of the conversation. */
function guardAfter(thread: Thread, after: string): void {
  const messages = thread.messages;
  const last = messages[messages.length - 1] as ThreadMessage;
  if (last.id === after) return;
  const index = messages.findIndex((m) => m.id === after);
  const newer = index === -1 ? messages : messages.slice(index + 1);
  throw new ToolError(
    'stale-thread',
    index === -1
      ? '`after` is not the id of any message of this conversation: read the conversation again'
      : 'messages came in after the last one you read; nothing was written',
    {
      last: last.id,
      newMessages: newer.map((m) => ({
        id: m.id,
        author: authorView(m.author),
        at: m.at,
        text: m.text,
      })),
      hint: 'read the new messages, adjust the reply if needed and call post_message again with `after` = the id of the last one',
    },
  );
}

/** The new message: never before the last of the conversation (the order is by `at` and `id`). */
function newMessage(
  thread: Thread,
  author: ThreadAuthor,
  text: string,
  nowMs: number,
): ThreadMessage {
  const last = lastMessage(thread) as ThreadMessage;
  const at = Math.max(nowMs, Date.parse(last.at) + 1);
  return {
    id: randomUUID(),
    author,
    at: new Date(at).toISOString(),
    text,
    proposal: null,
  };
}

// ---------------------------------------------------------------------------
// `resolve` with the new grammar

type SubBase = {
  id: string;
  annotation: string;
  project: { name: string; path: string };
};

function entryView(item: ResolvedItem, annotation: Annotation, base: SubBase): Json {
  const sub = item.sub as Extract<NonNullable<ResolvedItem['sub']>, { type: 'entry' }>;
  const { refs } = item;
  const code = normalizeId(sub.entry);
  const entry = annotation.entries.find((e) => normalizeId(e.id).startsWith(code));
  const target: PartTarget = {
    kind: 'entry',
    annotationId: annotation.id,
    entryId: entry?.id ?? '',
  };
  return {
    kind: 'entry',
    ref: partRefOf(refs.projectName, refs.project, target),
    ...base,
    entryId: entry?.id,
    key: entry?.key,
    value: entry?.value ?? null,
  };
}

function fieldView(item: ResolvedItem, annotation: Annotation, base: SubBase): Json {
  const sub = item.sub as Extract<NonNullable<ResolvedItem['sub']>, { type: 'field' }>;
  const target: PartTarget = { kind: 'field', annotationId: annotation.id, key: sub.key };
  return {
    kind: 'field',
    ref: partRefOf(item.refs.projectName, item.refs.project, target),
    ...base,
    key: sub.key,
    value: annotation.values?.[sub.key] ?? null,
  };
}

function rowView(item: ResolvedItem, annotation: Annotation, base: SubBase): Json {
  const sub = item.sub as Extract<NonNullable<ResolvedItem['sub']>, { type: 'row' }>;
  const code = normalizeId(sub.row);
  const rows = tableRows(annotation.values?.[sub.key]);
  const index = rows.findIndex((r) => normalizeId(r._id).startsWith(code));
  const row = rows[index];
  const target: PartTarget = {
    kind: 'row',
    annotationId: annotation.id,
    key: sub.key,
    rowId: row?._id ?? '',
  };
  return {
    kind: 'row',
    ref: partRefOf(item.refs.projectName, item.refs.project, target),
    ...base,
    key: sub.key,
    rowId: row?._id,
    index,
    value: row ?? null,
  };
}

/** `resolve` of a field, pair or row: the kind, the part's reference and that of the annotation that contains it. */
export function resolveSubView(item: ResolvedItem): Json {
  const sub = item.sub as NonNullable<ResolvedItem['sub']>;
  const { refs } = item;
  const annotation = projectIndex(refs.project).annotations.get(item.id) as Annotation;
  const base: SubBase = {
    id: item.id,
    annotation: refs.ref('a', item.id),
    project: { name: refs.projectName, path: item.loaded.location.path },
  };
  if (sub.type === 'entry') return entryView(item, annotation, base);
  return sub.type === 'field'
    ? fieldView(item, annotation, base)
    : rowView(item, annotation, base);
}

/** `resolve` of a layer (`l`) or conversation (`c`). */
export async function resolveLayerOrThread(
  roots: Roots,
  refText: string,
  projectArg: string | undefined,
): Promise<Json | null> {
  const parsed = parseAnyRef(refText);
  if (!parsed || parsed.ref.type !== 'item') return null;
  if (parsed.ref.kind === 'c') return resolveThreadView(roots, refText, projectArg);
  if (parsed.ref.kind !== 'l') return null;
  const code = parsed.ref.code;
  const locations = await candidateLocations(roots, parsed.project, projectArg);
  const found: { loaded: LoadedProject; id: string }[] = [];
  for (const location of locations) {
    const loaded = await loadProject(roots, location);
    for (const id of matchLayerCode(loaded.project, code)) found.push({ loaded, id });
  }
  if (found.length === 0) {
    throw new ToolError('not-found', `no layer matches ${refText}`, {
      ref: refText,
      searched: locations.map((l) => l.path),
    });
  }
  if (found.length > 1) {
    throw new ToolError(
      'ambiguous-ref',
      `${found.length} layers start with that code: use the full reference of one of them`,
      {
        ref: refText,
        candidates: found.slice(0, 20).map((c) => ({
          ref: formatAnyRef(c.loaded.location.name, {
            type: 'item',
            kind: 'l',
            code: layerShortCode(c.loaded.project, c.id),
          }),
          dir: c.loaded.location.dir,
        })),
      },
    );
  }
  const [only] = found as [{ loaded: LoadedProject; id: string }];
  const layer = projectIndex(only.loaded.project).layers.get(only.id)!;
  return {
    kind: 'layer',
    ref: formatAnyRef(only.loaded.location.name, {
      type: 'item',
      kind: 'l',
      code: layerShortCode(only.loaded.project, only.id),
    }),
    id: layer.id,
    name: layer.name,
    color: layer.color,
    project: { name: only.loaded.location.name, path: only.loaded.location.path },
  };
}

async function resolveThreadView(
  roots: Roots,
  refText: string,
  projectArg: string | undefined,
): Promise<Json> {
  const { location, id } = await findThread(roots, refText, projectArg);
  const thread = await readStoredThread(roots, location, id);
  const codes = threadShortCodes(await listThreadIds(location));
  return {
    kind: 'thread',
    ref: formatAnyRef(location.name, {
      type: 'item',
      kind: 'c',
      code: codes.get(id) ?? normalizeId(id).slice(0, 8),
    }),
    id,
    project: { name: location.name, path: location.path },
    status: thread.resolved === null ? 'open' : 'resolved',
    awaiting: awaiting(thread),
    messages: thread.messages.length,
    subject: threadSubject(thread),
  };
}

/** `resolve` of everything that is not a marking, container or annotation: layer, conversation, field, pair, row. */
export async function resolveExtended(
  roots: Roots,
  refText: string,
  projectArg: string | undefined,
  resolveItemFn: (roots: Roots, ref: string, project?: string) => Promise<ResolvedItem>,
): Promise<Json | null> {
  const layerOrThread = await resolveLayerOrThread(roots, refText, projectArg);
  if (layerOrThread) return layerOrThread;
  const parsed = parseAnyRef(refText);
  if (!parsed || parsed.ref.type === 'item') return null;
  return resolveSubView(await resolveItemFn(roots, refText, projectArg));
}
