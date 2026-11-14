import { signal, type ReadonlySignal } from '@preact/signals';
import { createSerialQueue, newestFirst, stampOr } from './serialQueue';
import {
  canRemoveProposal,
  changeImageFile,
  isRecord,
  packageDirOf,
  proposalImagePath,
  proposalPackageDir,
  serializeProposal,
  type Change,
  type Proposal,
  latestRevisionSummary,
} from '../model';
import {
  NO_PROPOSALS,
  parseProposalFile,
  readProposal,
  type LoadedProposal,
  type LoadedProposals,
  type ProposalProblem,
} from '../storage/loadProposals';
import type { ProjectStorage } from '../storage/types';
import { reportError } from '../utils/report';

// The change proposals of the open project (stage 4): the in-memory list, reading the
// folder and writing. Only this module writes `proposals/<id>/proposal.json`, inside
// the session (`session.proposals`); the interface never writes to the storage.
//
// File check, like that of `mapping.json`: every write rereads the file first and,
// if it differs from what the session last read or wrote (the MCP server withdrew or
// replaced the proposal, an editor touched it), adopts the disk version and REDOES the
// change on top of it, instead of overwriting it. Each change is a pure function of the proposal
// (decide, annotate, apply), so redoing is safe and nothing that came from outside is lost.
// Each write raises the proposal's `revision` by 1.

export type ProposalNoticeKind = 'added' | 'changed' | 'removed' | 'revised';

/** Something that happened to a proposal outside the app (new, changed or deleted). */
export interface ProposalNotice {
  readonly kind: ProposalNoticeKind;
  readonly id: string;
  readonly title: string;
  /** ISO date of when the app noticed. */
  readonly at: string;
  /** Only in `revised`: the summary of the newest revision. */
  readonly revision?: { changed: number; added: number; dropped: number };
}

/** `revised` when `next` has more revisions than `prev` (the agent revised it from outside); otherwise `changed`. */
export function noticeKindFor(prev: Proposal, next: Proposal): 'changed' | 'revised' {
  return (next.revisions?.length ?? 0) > (prev.revisions?.length ?? 0)
    ? 'revised'
    : 'changed';
}

export type ProposalErrorCode =
  /** There is no proposal with that id. */
  | 'unknown-proposal'
  /** The file disappeared from outside. */
  | 'gone'
  /** The file changed from outside and became unreadable. */
  | 'unreadable'
  | 'write-failed';

/** Why `ProposalStore.remove` refused or failed. */
export type RemoveProposalError =
  /** There is no readable proposal with that id in the list. */
  | 'unknown-proposal'
  /** The proposal is (or became again) open: only closed ones can be deleted. */
  | 'not-removable'
  /** The file changed from outside and became unreadable: what was not read is not deleted. */
  | 'unreadable'
  /** The storage could not delete `proposals/<id>/`. */
  | 'remove-failed';

export type RemoveProposalResult =
  | { readonly ok: true; readonly proposal: Proposal }
  | { readonly ok: false; readonly error: RemoveProposalError };

export type MutationOutcome<T, E extends string> =
  | { readonly ok: true; readonly proposal: Proposal; readonly value: T }
  | { readonly ok: false; readonly error: E | ProposalErrorCode };

/** Result of a change function. `proposal` equal to the one received = nothing to write. */
export type MutationPlan<T, E extends string> =
  | {
      readonly ok: true;
      readonly proposal: Proposal;
      readonly value: T;
      /**
       * Runs after computing the change and before writing the proposal (e.g. applying to the
       * project and copying the images). Returns an error code to abort.
       */
      readonly before?: () => Promise<E | null>;
      /** Runs after writing the proposal (e.g. deleting the images that were already moved). */
      readonly after?: () => Promise<void>;
      /**
       * Undoes what `before` did when writing the proposal fails after it (e.g. the already
       * applied `mapping.json` goes back to the earlier one and the image copies are removed). An error
       * from it only goes to Diagnostics; the result stays `write-failed`.
       */
      readonly compensate?: () => Promise<void>;
    }
  | { readonly ok: false; readonly error: E };

/**
 * `p` is the disk version (the one the change starts from); `seen`, the one the session had before
 * rereading the file. When the agent revised the proposal from outside, `p.revisions` has entries
 * that `seen` does not: the decision guard uses the difference (stage #644, decision 8).
 */
export type Mutation<T, E extends string> = (
  p: Proposal,
  seen: Proposal,
) => MutationPlan<T, E>;

/** What the folder check found (ids). */
export interface ProposalScan {
  readonly added: readonly string[];
  readonly changed: readonly string[];
  readonly removed: readonly string[];
}

export interface ProposalScanOptions {
  /** `false`: cycle check (skips the final ones already read). Default: `true`, the full one. */
  readonly full?: boolean;
}

interface MutableScan {
  readonly added: string[];
  readonly changed: string[];
  readonly removed: string[];
}

const NOTICE_LIMIT = 20;

interface Known {
  readonly proposal: Proposal;
  readonly text: string;
  readonly stamp: string | null;
}

export interface ProposalStore {
  /** Readable proposals, the newest first. Each proposal keeps its object while it does not change. */
  readonly list: ReadonlySignal<readonly Proposal[]>;
  /** `proposal.json` files that could not be read (the proposal does not appear in the list). */
  readonly problems: ReadonlySignal<readonly ProposalProblem[]>;
  /** News from outside since opening or since `clearNotices` (the most recent last). */
  readonly notices: ReadonlySignal<readonly ProposalNotice[]>;
  get(id: string): Proposal | null;
  /**
   * Changes a proposal: rereads the file, adopts the disk version if it changed from outside, applies
   * `mutation` to it and writes with `revision + 1`. Calls run in a queue.
   */
  mutate<T, E extends string>(
    id: string,
    mutation: Mutation<T, E>,
  ): Promise<MutationOutcome<T, E>>;
  /**
   * Deletes the proposal from the storage (the whole `proposals/<id>/`) and from the list, in the same queue:
   * rereads the file first and refuses if it became open again (the agent may have reopened
   * the proposal) or unreadable. Does not raise the "deleted from outside" notice: the person deleted it.
   * `onRemoved` runs synchronously right after the storage deletes (the session removes
   * the history link with no window for an undo in between).
   */
  remove(id: string, onRemoved?: () => void): Promise<RemoveProposalResult>;
  /**
   * Checks the folder: proposals new, changed and deleted from outside. The full check
   * (default: focus, return to the page and "Check the folder now") looks at all the proposals; the
   * cycle one (`full: false`) does not reread the final ones (`applied` and `withdrawn`) already read with a known
   * stamp, but a new folder in `proposals/` is still seen on every cycle.
   */
  scan(options?: ProposalScanOptions): Promise<ProposalScan>;
  /**
   * There is a decision, note, apply or removal of a proposal waiting in the queue or being
   * written. The cycle check waits for it (`session.busy`).
   */
  writing(): boolean;
  /** Waits for the writes in progress (when closing the project). */
  settled(): Promise<void>;
  clearNotices(): void;
  /**
   * Removes a proposal's notices from the queue (of the given type, or all). Opening the proposal in
   * the review removes its `added`: the "New proposal · Review" does not come back after it is reviewed.
   */
  dismissNotice(id: string, kind?: ProposalNoticeKind): void;
  /**
   * Files to export: the proposals as they are on disk and the files awaiting
   * acceptance (images and library packages from `proposals/<id>/specs/`).
   */
  collect(): Promise<{
    readonly proposals: Map<string, string>;
    readonly images: Map<string, Blob>;
  }>;
}

export interface ProposalStoreOptions {
  readonly storage: ProjectStorage;
  readonly initial?: LoadedProposals;
  readonly now: () => string;
  /**
   * Called after each successful write of a `proposal.json` (decide, annotate,
   * apply, undo or redo the apply): the session passes it on as "something in this project
   * changed in the storage" ("Unexported changes" indicator).
   */
  readonly onChanged?: () => void;
}

/** `specs/<folder>` of the specialization that the change creates or updates, if it is a package. */
function specPackageDir(change: Change): string | null {
  if (change.entity !== 'specialization' || change.kind === 'remove') return null;
  const file = isRecord(change.to) ? change.to.file : undefined;
  return typeof file === 'string' ? packageDirOf(file) : null;
}

export function createProposalStore(options: ProposalStoreOptions): ProposalStore {
  const { storage, now } = options;
  const known = new Map<string, Known>();
  const problemMap = new Map<
    string,
    { problem: ProposalProblem; stamp: string | null; text: string | null }
  >();
  const list = signal<readonly Proposal[]>([]);
  const problems = signal<readonly ProposalProblem[]>([]);
  const notices = signal<readonly ProposalNotice[]>([]);

  const publish = () => {
    list.value = [...known.values()].map((k) => k.proposal).sort(newestFirst);
    problems.value = [...problemMap.values()].map((p) => p.problem);
  };

  /** Identifies the set of problems (ids and errors): changes when one is fixed and another breaks. */
  const problemsKey = () =>
    JSON.stringify([...problemMap.values()].map((p) => [p.problem.id, p.problem.errors]));

  const notify = (kind: ProposalNoticeKind, id: string, title: string) => {
    notices.value = [...notices.value, { kind, id, title, at: now() }].slice(
      -NOTICE_LIMIT,
    );
  };

  /** A known proposal changed from outside: `revised` (with the summary) or `changed`. */
  const notifyChanged = (prev: Proposal, next: Proposal) => {
    const kind = noticeKindFor(prev, next);
    const summary = kind === 'revised' ? latestRevisionSummary(next) : null;
    const revision = summary
      ? { changed: summary.changed, added: summary.added, dropped: summary.dropped }
      : undefined;
    notices.value = [
      ...notices.value,
      {
        kind,
        id: next.id,
        title: next.title,
        at: now(),
        ...(revision ? { revision } : {}),
      },
    ].slice(-NOTICE_LIMIT);
  };

  const load = (initial: LoadedProposals = NO_PROPOSALS) => {
    for (const item of initial.proposals) known.set(item.proposal.id, item);
    for (const problem of initial.problems) {
      problemMap.set(problem.id, {
        problem,
        stamp: null,
        text: initial.problemTexts?.get(problem.id) ?? null,
      });
    }
    publish();
  };
  load(options.initial);

  // Single queue: writes and checks never run in parallel.
  const enqueue = createSerialQueue();
  // Writes (decide, annotate, apply, delete) queued or in progress: the cycle check waits for them.
  let writes = 0;
  const enqueueWrite = <T>(job: () => Promise<T>): Promise<T> => {
    writes++;
    const run = enqueue(job);
    // A separate branch: the `run` returned to the caller does not gain any extra step.
    const done = () => {
      writes--;
    };
    run.then(done, done);
    return run;
  };

  const stampOf = (id: string): Promise<string | null> =>
    stampOr(storage.statProposal ? () => storage.statProposal!(id) : null);

  const adopt = (item: LoadedProposal) => {
    known.set(item.proposal.id, item);
    problemMap.delete(item.proposal.id);
  };

  const runMutation = async <T, E extends string>(
    id: string,
    mutation: Mutation<T, E>,
  ): Promise<MutationOutcome<T, E>> => {
    let entry = known.get(id);
    if (!entry) return { ok: false, error: 'unknown-proposal' };
    // Checks the file: if it changed from outside, starts from the disk version.
    let text: string | null;
    try {
      text = await storage.readProposal(id);
    } catch (e) {
      reportError('proposals.read', e);
      return { ok: false, error: 'unreadable' };
    }
    if (text === null) {
      known.delete(id);
      publish();
      notify('removed', id, entry.proposal.title);
      return { ok: false, error: 'gone' };
    }
    const seen = entry.proposal;
    if (text !== entry.text) {
      const parsed = parseProposalFile(id, text, await stampOf(id));
      if (!parsed.ok) return { ok: false, error: 'unreadable' };
      entry = { proposal: parsed.proposal, text: parsed.text, stamp: parsed.stamp };
      adopt(entry);
      publish();
      notifyChanged(seen, parsed.proposal);
    }
    const plan = mutation(entry.proposal, seen);
    if (!plan.ok) return { ok: false, error: plan.error };
    if (plan.before) {
      const error = await plan.before();
      if (error !== null) return { ok: false, error };
    }
    if (plan.proposal === entry.proposal)
      return { ok: true, proposal: entry.proposal, value: plan.value };
    const next: Proposal = { ...plan.proposal, revision: entry.proposal.revision + 1 };
    const nextText = serializeProposal(next);
    try {
      await storage.writeProposal(id, nextText);
    } catch (e) {
      reportError('proposals.write', e);
      if (plan.compensate) {
        try {
          await plan.compensate();
        } catch (compensation) {
          reportError('proposals.compensate', compensation);
        }
      }
      return { ok: false, error: 'write-failed' };
    }
    known.set(id, { proposal: next, text: nextText, stamp: await stampOf(id) });
    publish();
    options.onChanged?.();
    if (plan.after) {
      try {
        await plan.after();
      } catch (e) {
        reportError('proposals.after', e);
      }
    }
    return { ok: true, proposal: next, value: plan.value };
  };

  const removeNow = async (
    id: string,
    onRemoved?: () => void,
  ): Promise<RemoveProposalResult> => {
    let entry = known.get(id);
    if (!entry) return { ok: false, error: 'unknown-proposal' };
    // Checks the file: if it changed from outside, decides on the disk version.
    let text: string | null;
    try {
      text = await storage.readProposal(id);
    } catch (e) {
      reportError('proposals.read', e);
      return { ok: false, error: 'unreadable' };
    }
    if (text !== null && text !== entry.text) {
      const parsed = parseProposalFile(id, text, await stampOf(id));
      if (!parsed.ok) return { ok: false, error: 'unreadable' };
      entry = { proposal: parsed.proposal, text: parsed.text, stamp: parsed.stamp };
      adopt(entry);
      publish();
      notify('changed', id, parsed.proposal.title);
    }
    // No file (deleted from outside in the meantime): only what is left of the folder remains to clean.
    if (text !== null && !canRemoveProposal(entry.proposal)) {
      return { ok: false, error: 'not-removable' };
    }
    try {
      await storage.removeProposal(id);
    } catch (e) {
      reportError('proposals.remove', e);
      return { ok: false, error: 'remove-failed' };
    }
    known.delete(id);
    problemMap.delete(id);
    notices.value = notices.value.filter((n) => n.id !== id);
    publish();
    options.onChanged?.();
    try {
      onRemoved?.();
    } catch (e) {
      reportError('proposals.removed', e);
    }
    return { ok: true, proposal: entry.proposal };
  };

  /**
   * The final proposals (`applied` and `withdrawn`) already read with a known stamp: the cycle
   * check does not reread them (the MCP does not rewrite an applied proposal). `open` and `superseded` (which still
   * has accepted ones to apply) are left out.
   */
  const settledIds = (): Set<string> => {
    const skip = new Set<string>();
    for (const [id, entry] of known) {
      const { status } = entry.proposal;
      if (entry.stamp !== null && (status === 'applied' || status === 'withdrawn'))
        skip.add(id);
    }
    return skip;
  };

  /**
   * What is in `proposals/` (`present`) and the stamp of each proposal to check. Those in `skip`
   * count as present, without a stamp. In one step when the storage has `stampProposals`;
   * otherwise, the listing and one `statProposal` per proposal. `null`: the folder could not be read.
   */
  const proposalStamps = async (
    skip: ReadonlySet<string>,
  ): Promise<{ present: Set<string>; stamps: Map<string, string | null> } | null> => {
    try {
      const present = new Set<string>();
      const stamps = new Map<string, string | null>();
      if (storage.stampProposals) {
        // Every proposal in the map is in `proposals/` (folders without `proposal.json` are left
        // out); stamp `null` means "to check" (skipped for being final, or unreadable now).
        for (const [id, stamp] of await storage.stampProposals(skip)) {
          present.add(id);
          if (!skip.has(id)) stamps.set(id, stamp);
        }
      } else {
        for (const id of await storage.listProposals()) {
          present.add(id);
          if (!skip.has(id)) stamps.set(id, await stampOf(id));
        }
      }
      return { present, stamps };
    } catch (e) {
      reportError('proposals.list', e);
      return null;
    }
  };

  /** Does the stamp say nothing changed (or that the already known problem is the same)? */
  const stampSaysSame = (id: string, stamp: string | null): boolean => {
    if (stamp === null) return false;
    const entry = known.get(id);
    if (entry) return stamp === entry.stamp;
    const bad = problemMap.get(id);
    return bad !== undefined && stamp === bad.stamp;
  };

  /** Adopts what reading a proposal with a new stamp brought and counts it in the result. */
  const takeRead = (
    id: string,
    stamp: string | null,
    read: Awaited<ReturnType<typeof readProposal>>,
    scan: MutableScan,
  ) => {
    const entry = known.get(id);
    if (!read.ok) {
      // Disappeared between the list and the read, or is unreadable: a proposal we already know
      // stays as it is (an editor still writing); only the unknown ones become a problem.
      if (!read.missing && !entry) {
        problemMap.set(id, {
          problem: { id, errors: read.errors },
          stamp,
          text: read.text,
        });
      }
      return;
    }
    if (!entry) {
      adopt(read);
      scan.added.push(id);
      notify('added', id, read.proposal.title);
    } else if (read.text !== entry.text) {
      adopt(read);
      scan.changed.push(id);
      notifyChanged(entry.proposal, read.proposal);
    } else {
      known.set(id, { ...entry, stamp: read.stamp });
    }
  };

  /** What disappeared from the folder: the known proposals ("deleted" notice) and the problems. */
  const dropAbsent = (present: ReadonlySet<string>, removed: string[]) => {
    for (const [id, entry] of [...known]) {
      if (present.has(id)) continue;
      known.delete(id);
      removed.push(id);
      notify('removed', id, entry.proposal.title);
    }
    for (const id of [...problemMap.keys()]) {
      if (!present.has(id)) problemMap.delete(id);
    }
  };

  const scanNow = async (full: boolean): Promise<ProposalScan> => {
    const scan: MutableScan = { added: [], changed: [], removed: [] };
    const found = await proposalStamps(full ? new Set() : settledIds());
    if (found === null) return scan;
    const problemsBefore = problemsKey();
    for (const [id, stamp] of found.stamps) {
      if (stampSaysSame(id, stamp)) continue;
      takeRead(id, stamp, await readProposal(storage, id), scan);
    }
    dropAbsent(found.present, scan.removed);
    const changed = scan.added.length + scan.changed.length + scan.removed.length > 0;
    if (changed || problemsKey() !== problemsBefore) publish();
    return scan;
  };

  return {
    list,
    problems,
    notices,
    get: (id) => known.get(id)?.proposal ?? null,
    mutate: (id, mutation) => enqueueWrite(() => runMutation(id, mutation)),
    remove: (id, onRemoved) => enqueueWrite(() => removeNow(id, onRemoved)),
    scan: (scanOptions) => enqueue(() => scanNow(scanOptions?.full !== false)),
    writing: () => writes > 0,
    settled: () => enqueue(() => Promise.resolve()),
    clearNotices() {
      notices.value = [];
    },
    dismissNotice(id, kind) {
      const rest = notices.value.filter(
        (n) => n.id !== id || (kind !== undefined && n.kind !== kind),
      );
      if (rest.length !== notices.value.length) notices.value = rest;
    },
    async collect() {
      return enqueue(async () => {
        const proposals = new Map<string, string>();
        const images = new Map<string, Blob>();
        const read = async (path: string) => {
          if (images.has(path)) return;
          const blob = await storage.readImage(path).catch((e: unknown) => {
            reportError('proposals.readImage', e);
            return null;
          });
          if (blob) images.set(path, blob);
        };
        for (const [id, entry] of known) {
          proposals.set(`proposals/${id}/proposal.json`, entry.text);
          await readPending(storage, id, entry.proposal, read);
        }
        for (const [id, item] of problemMap) {
          if (item.text !== null)
            proposals.set(`proposals/${id}/proposal.json`, item.text);
        }
        return { proposals, images };
      });
    },
  };
}

/** Reads (through `read`) the images and package files of the changes not yet applied. */
async function readPending(
  storage: ProjectStorage,
  id: string,
  proposal: Proposal,
  read: (path: string) => Promise<void>,
): Promise<void> {
  let listed: readonly string[] | undefined;
  for (const change of proposal.changes) {
    if (Object.hasOwn(proposal.applied, change.id)) continue;
    const file = changeImageFile(change);
    if (file !== null) await read(proposalImagePath(id, file));
    const dir = specPackageDir(change);
    if (dir === null) continue;
    const from = `${proposalPackageDir(id, dir)}/`;
    // One listing per proposal, not per change.
    listed ??= await storage.listProposalFiles(id).catch((e: unknown) => {
      reportError('proposals.listFiles', e);
      return [];
    });
    for (const path of listed) if (path.startsWith(from)) await read(path);
  }
}
