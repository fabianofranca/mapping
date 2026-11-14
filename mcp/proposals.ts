import {
  buildProposal,
  formatCitation,
  changeStatuses,
  compareProposals,
  proposalIndex,
  reviewProgress,
  reviewTree,
  supersedeProposal,
  withdrawProposal,
  packageDirOf,
  type Change,
  type Proposal,
  type ProposalStatus,
} from '../src/model';
import { batchReport, prepareBatch, readMapping, sha256 } from './changes';
import { ToolError } from './errors';
import { reviseOnDisk, type ReviseArgs } from './proposalRevise';
import { storedOperations } from './proposalOperations';
import { Refs } from './items';
import type { Operation } from './operations';
import type { Roots } from './paths';
import { findProject, loadProject, type ProjectLocation } from './projects';
import { ProposalRefs, lookupStored, resolveProposal } from './proposalRefs';
import { Threads } from './threads';
import {
  listStored,
  reservedImages,
  updateStored,
  writeNewProposal,
  type StoredProposal,
  type StoredProposals,
} from './proposalStore';
import {
  ProposalLabels,
  changeView,
  conflictView,
  kindCounts,
  levelsView,
  noteView,
  awaitingView,
  droppedFrom,
  isRevisable,
  progressView,
  proposedProject,
  reviewHint,
  revisionsView,
  stateOf,
  type ChangeState,
} from './proposalViews';

// Change proposals (stage 4.2): the agent never writes the project; `propose_changes` applies
// the batch to a copy (the same `batch.ts` as `plan_changes`), computes the changes with
// `buildProposal` and writes `proposals/<id>/proposal.json`. The review belongs to the app; here the agent only
// reads the result (`get_proposal`, `get_proposal_review`) and withdraws or supersedes the proposal.

type Json = Record<string, unknown>;

/** Changes per page of `get_proposal`. */
const DEFAULT_LIMIT = 200;

export interface ProposeArgs {
  readonly project: string;
  readonly title: string;
  readonly description?: string | undefined;
  readonly origin?: string | undefined;
  readonly author?: string | undefined;
  readonly supersedes?: string | undefined;
  /** Conversation the proposal links to (reference `c/…`): becomes an agent message with `proposal`. */
  readonly thread?: string | undefined;
  readonly operations: readonly Operation[];
}

export type StateFilter = ChangeState | 'conflict';

const OPEN_STATUSES: readonly ProposalStatus[] = ['open', 'superseded'];

export class Proposals {
  constructor(
    private readonly roots: Roots,
    private readonly now: () => number = Date.now,
    private readonly clientName: () => string | undefined = () => undefined,
    private readonly threads: Threads = new Threads(roots, now, clientName),
  ) {}

  // -------------------------------------------------------------------------
  // propose_changes

  async propose(args: ProposeArgs): Promise<Json> {
    const title = args.title.trim();
    if (title === '') {
      throw new ToolError('invalid-title', 'the proposal needs a title');
    }
    const location = await findProject(this.roots, args.project);
    // The conversation is checked BEFORE any write: if it does not exist or is resolved, the
    // refusal leaves nothing on disk.
    const linked =
      args.thread === undefined
        ? null
        : await this.threads.checkOpen(args.thread, location);
    const all = await listStored(this.roots, location);
    const previous =
      args.supersedes === undefined ? null : lookupStored(all, location, args.supersedes);

    // Files in `images/` that other proposals can still apply: do not reuse the name. The
    // open previous one counts as `superseded` (the state it will have): its accepted ones stay
    // reserved, the pending ones are released. An applied or withdrawn previous one does not change.
    const reserved = new Set<string>();
    for (const stored of all.proposals) {
      const becomesSuperseded =
        stored.id === previous?.id && stored.proposal.status === 'open';
      const status = becomesSuperseded ? 'superseded' : stored.proposal.status;
      for (const file of reservedImages(stored.proposal, status)) reserved.add(file);
    }

    const prepared = await prepareBatch(this.roots, location, args.operations, {
      now: this.now,
      reservedImages: reserved,
    });
    const report = batchReport(prepared);
    if (!prepared.valid) {
      return {
        ...report,
        proposed: false,
        hint: 'nothing was written: fix the operations with errors and call propose_changes again with the whole batch',
      };
    }

    const { loaded, result } = prepared;
    const proposal = buildProposal(loaded.project, result.project, {
      title,
      description: args.description ?? null,
      origin: args.origin ?? null,
      author: args.author ?? this.clientName() ?? null,
      createdAt: new Date(this.now()).toISOString(),
      supersedes: previous?.id ?? null,
      operations: storedOperations(args.operations),
    });
    if (proposal.changes.length === 0) {
      throw new ToolError(
        'no-changes',
        'the operations change nothing in the project: there is nothing to propose (the re-export matches the current project)',
      );
    }

    const images = new Map<string, Uint8Array>();
    for (const file of reservedImages(proposal)) {
      const data = result.imageFiles.get(file);
      if (data === undefined) {
        throw new Error(`proposal image without content: ${file}`);
      }
      images.set(file, data);
    }

    // The calculation holds for the `mapping.json` that was read: if it changed in the meantime, refuse.
    const text = await readMapping(this.roots, location.dir);
    if (text === null || sha256(text) !== prepared.baseHash) {
      throw new ToolError(
        'revision-conflict',
        'the project was changed by another process while the proposal was being computed; reread and send again',
        { baseRevision: loaded.project.revision },
      );
    }
    // The library packages of the specialization changes (only those that stayed in the proposal).
    const packageFiles = new Map<string, Uint8Array>();
    const packaged = new Set(
      proposal.changes
        .filter((c) => c.entity === 'specialization')
        .flatMap((c) => {
          const to = c.to as { file?: unknown } | null;
          const dir = typeof to?.file === 'string' ? packageDirOf(to.file) : null;
          return dir === null ? [] : [dir];
        }),
    );
    for (const [file, data] of result.packageFiles) {
      const dir = packageDirOf(file);
      if (dir !== null && packaged.has(dir)) packageFiles.set(file, data);
    }
    const { written, writtenPackage } = await writeNewProposal(
      this.roots,
      location,
      proposal,
      images,
      packageFiles,
    );

    const warnings: Json[] = [];
    let superseded: Json | undefined;
    if (previous) {
      const outcome = await this.supersede(location, all, previous, proposal);
      superseded = outcome.view;
      if (outcome.warning) warnings.push(outcome.warning);
    }

    const stored: StoredProposal = { id: proposal.id, proposal, text: '' };
    const refs = new ProposalRefs(location.name, {
      proposals: [...all.proposals, stored],
      broken: all.broken,
    });
    const labels = ProposalLabels.ofRefs(prepared.refs, new Refs(loaded));
    const tree = reviewTree(proposal, loaded.project);
    const { warnings: repoWarnings, ...rest } = report;
    let thread: Json | undefined;
    if (linked) {
      try {
        thread = await this.threads.linkProposal(
          linked,
          proposal.id,
          `Proposal: ${formatCitation(title, refs.ref(proposal.id))}`,
          args.author,
        );
      } catch (error) {
        // The proposal is already written: resending it would duplicate it. The warning says what to do.
        warnings.push({
          code: 'thread-not-linked',
          message: `the proposal was written, but the message in the conversation was not: ${error instanceof Error ? error.message : String(error)}`,
          hint: 'tell the conversation with post_message citing the proposal: [title](mapping://<project>/p/<code>)',
        });
      }
    }
    return {
      ...rest,
      proposed: true,
      proposal: {
        ref: refs.ref(proposal.id),
        id: proposal.id,
        title: proposal.title,
        status: proposal.status,
        baseRevision: proposal.baseRevision,
        supersedes: previous ? refs.ref(previous.id) : null,
      },
      reviewChanges: kindCounts(proposal),
      levels: levelsView(proposal, tree, labels),
      files: {
        proposal: `proposals/${proposal.id}/proposal.json`,
        images: written.slice(),
        ...(writtenPackage.length > 0
          ? { packages: packageFolders(proposal.id, writtenPackage) }
          : {}),
      },
      ...(superseded ? { superseded } : {}),
      ...(thread ? { thread } : {}),
      ...(Array.isArray(repoWarnings) || warnings.length > 0
        ? {
            warnings: [...(Array.isArray(repoWarnings) ? repoWarnings : []), ...warnings],
          }
        : {}),
      hint: 'the proposal awaits review by the user in the app (Proposals window); tell them and write nothing more. The `created` references only start to exist after the user accepts and applies. When the review ends (get_proposal: nothing pending or accepted without being applied), read get_proposal_review.',
    };
  }

  /**
   * Marks the previous proposal as superseded and warns if its review had not finished.
   * An already applied previous one stays as it is, and the response explains.
   */
  private async supersede(
    location: ProjectLocation,
    all: StoredProposals,
    previous: StoredProposal,
    next: Proposal,
  ): Promise<{ view: Json; warning?: Json }> {
    const refs = new ProposalRefs(location.name, all);
    let fresh: Proposal | null = null;
    try {
      const updated = await updateStored(this.roots, location, previous.id, (p) => {
        fresh = p;
        return supersedeProposal(p);
      });
      const before = fresh as Proposal | null;
      const view = {
        ref: refs.ref(previous.id),
        status: updated.status,
        revision: updated.revision,
        // The applied one is history: it does not become `superseded` (the new one's `supersedes` is the link).
        ...(updated.status === 'applied'
          ? {
              note: `the previous proposal was already applied and stays \`applied\` (it is history and does not change status); the app shows on it "Applied · superseded by ${next.title}", with the link Open the new one`,
            }
          : {}),
      };
      if (!before || !OPEN_STATUSES.includes(before.status)) return { view };
      const progress = reviewProgress(before);
      if (progress.complete) return { view };
      const comparison = compareProposals(before, next);
      const counts = { same: 0, different: 0, missing: 0 };
      for (const c of before.changes) {
        if (Object.hasOwn(before.applied, c.id)) continue;
        if (before.decisions[c.id]?.state === 'rejected') continue;
        counts[comparison.get(c.id) ?? 'missing']++;
      }
      return {
        view,
        warning: {
          code: 'superseded-incomplete',
          proposal: refs.ref(previous.id),
          undecided: progress.undecided,
          acceptedNotApplied: progress.acceptedPending,
          inNewProposal: counts,
          message:
            'the superseded proposal still had changes without a decision or accepted without being applied; the pending ones can no longer be applied. Next time, wait for the review to finish (get_proposal) before superseding',
        },
      };
    } catch (error) {
      // The new proposal is already written: any failure here (disk included) is only a warning.
      // An `internal-error` would lead the agent to resend and duplicate the proposal. The unexpected
      // leaves the stack on stderr, like `failure` (tools.ts).
      if (!(error instanceof ToolError)) {
        process.stderr.write(
          `mapping-mcp: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
        );
      }
      const reason = error instanceof Error ? error.message : String(error);
      return {
        view: { ref: refs.ref(previous.id), status: previous.proposal.status },
        warning: {
          code: 'supersede-failed',
          proposal: refs.ref(previous.id),
          message: `the new proposal was written, but the previous one could not be marked as superseded (${reason})`,
        },
      };
    }
  }

  // -------------------------------------------------------------------------
  // list_proposals

  async list(projectQuery: string, status?: ProposalStatus): Promise<Json> {
    const location = await findProject(this.roots, projectQuery);
    const all = await listStored(this.roots, location);
    const loaded = await loadProject(this.roots, location);
    const refs = new ProposalRefs(location.name, all);
    const supersededBy = new Map<string, string[]>();
    for (const s of all.proposals) {
      const target = s.proposal.supersedes;
      if (target === null) continue;
      const list = supersededBy.get(target) ?? [];
      list.push(refs.ref(s.id));
      supersededBy.set(target, list);
    }
    const rows = all.proposals
      .filter((s) => status === undefined || s.proposal.status === status)
      .map((s) => {
        const p = s.proposal;
        const statuses = changeStatuses(p, loaded.project);
        const conflicts = p.changes.filter(
          (c) =>
            statuses.get(c.id)?.conflict === true &&
            (stateOf(p, c.id) === 'pending' || stateOf(p, c.id) === 'accepted'),
        ).length;
        const supersedes = p.supersedes === null ? null : refTo(all, refs, p.supersedes);
        return {
          ref: refs.ref(s.id),
          id: s.id,
          title: p.title,
          origin: p.origin,
          author: p.author,
          createdAt: p.createdAt,
          status: p.status,
          baseRevision: p.baseRevision,
          supersedes,
          ...(supersededBy.has(s.id) ? { supersededBy: supersededBy.get(s.id) } : {}),
          progress: progressView(p),
          conflicts,
          ...lastRevisedView(p),
        };
      });
    return {
      project: {
        name: location.name,
        path: location.path,
        revision: loaded.project.revision,
      },
      total: rows.length,
      proposals: rows,
      ...(all.broken.length > 0 ? { broken: all.broken } : {}),
    };
  }

  // -------------------------------------------------------------------------
  // get_proposal

  async get(
    refText: string,
    projectArg: string | undefined,
    options: {
      state?: StateFilter | undefined;
      limit?: number | undefined;
      offset?: number | undefined;
    },
  ): Promise<Json> {
    const { location, stored, all, refs } = await resolveProposal(
      this.roots,
      refText,
      projectArg,
    );
    const p = stored.proposal;
    const loaded = await loadProject(this.roots, location);
    const labels = ProposalLabels.of(loaded, proposedProject(loaded.project, p));
    const statuses = changeStatuses(p, loaded.project);
    const tree = reviewTree(p, loaded.project);

    const matching = p.changes.filter((c) => {
      if (options.state === undefined) return true;
      if (options.state === 'conflict') return statuses.get(c.id)?.conflict === true;
      return stateOf(p, c.id) === options.state;
    });
    const limit = options.limit ?? DEFAULT_LIMIT;
    const offset = options.offset ?? 0;
    const page = matching.slice(offset, offset + limit);
    const next = offset + page.length;
    const conflicts = p.changes.filter(
      (c) => statuses.get(c.id)?.conflict === true && stateOf(p, c.id) !== 'applied',
    ).length;
    return {
      proposal: {
        ref: refs.ref(stored.id),
        id: p.id,
        title: p.title,
        description: p.description,
        origin: p.origin,
        author: p.author,
        createdAt: p.createdAt,
        status: p.status,
        revision: p.revision,
        baseRevision: p.baseRevision,
        supersedes: p.supersedes === null ? null : refTo(all, refs, p.supersedes),
        operations: p.operations.length,
        ...revisionsView(p),
      },
      project: {
        name: location.name,
        path: location.path,
        revision: loaded.project.revision,
        changedSinceProposal: loaded.project.revision !== p.baseRevision,
      },
      progress: progressView(p),
      conflicts,
      levels: levelsView(p, tree, labels),
      total: matching.length,
      returned: page.length,
      ...(next < matching.length ? { truncated: true, nextOffset: next } : {}),
      changes: page.map((c) => changeView(p, c, statuses.get(c.id)!, labels)),
      notes: p.notes.map((n) => noteView(p, n, labels)),
    };
  }

  // -------------------------------------------------------------------------
  // get_proposal_review

  async review(refText: string, projectArg: string | undefined): Promise<Json> {
    const { location, stored, all, refs } = await resolveProposal(
      this.roots,
      refText,
      projectArg,
    );
    const p = stored.proposal;
    const loaded = await loadProject(this.roots, location);
    const labels = ProposalLabels.of(loaded, proposedProject(loaded.project, p));
    const statuses = changeStatuses(p, loaded.project);
    const index = proposalIndex(p);
    const progress = reviewProgress(p);

    const notesOfChange = (id: string) =>
      p.notes
        .filter((n) => n.target.level === 'change' && n.target.id === id)
        .map((n) => ({ text: n.text, at: n.at }));
    const rejected = p.changes
      .filter((c) => p.decisions[c.id]?.state === 'rejected')
      .map((c: Change) => {
        // Rejected together with the creation it depends on ("rejecting the creation rejects what
        // depends on it"): `via` points to the creation, so the agent does not treat it as its own decision.
        const via = (index.requires.get(c.id) ?? []).find(
          (id) =>
            p.decisions[id]?.state === 'rejected' &&
            index.changes.get(id)?.kind === 'create',
        );
        const notes = notesOfChange(c.id);
        const status = statuses.get(c.id)!;
        return {
          ...changeView(p, c, status, labels),
          ...(via ? { via } : {}),
          ...(notes.length > 0 ? { notes } : {}),
        };
      });
    const conflicts = p.changes
      .filter((c) => {
        const state = stateOf(p, c.id);
        return (
          statuses.get(c.id)?.conflict === true &&
          (state === 'pending' || state === 'accepted')
        );
      })
      .map((c) => ({
        change: c.id,
        target: labels.target(c),
        ...(c.field !== null ? { field: c.field } : {}),
        state: stateOf(p, c.id),
        from: c.from,
        to: c.to,
        ...(conflictView(statuses.get(c.id)!) ?? {}),
      }));
    // General notes: everything that is not on a change (the change's own go with the rejection).
    const notes = p.notes
      .filter((n) => n.target.level !== 'change')
      .map((n) => ({ ...noteView(p, n, labels), ...droppedFrom(p, n.id, labels) }));
    // Notes of changes that are not rejected (e.g. the user commented on an accepted one).
    const otherChangeNotes = p.notes
      .filter(
        (n) =>
          n.target.level === 'change' &&
          n.target.id !== null &&
          p.decisions[n.target.id]?.state !== 'rejected',
      )
      .map((n) => noteView(p, n, labels));

    const { complete } = progress;
    return {
      proposal: {
        ref: refs.ref(stored.id),
        id: p.id,
        title: p.title,
        status: p.status,
        supersedes: p.supersedes === null ? null : refTo(all, refs, p.supersedes),
        baseRevision: p.baseRevision,
      },
      project: {
        name: location.name,
        path: location.path,
        revision: loaded.project.revision,
        changedSinceProposal: loaded.project.revision !== p.baseRevision,
      },
      progress: progressView(p),
      ...(stored.warnings === undefined
        ? {}
        : {
            warnings: stored.warnings.map((message) => ({
              code: 'proposal-field-ignored',
              message,
            })),
          }),
      ready: complete,
      revisable: isRevisable(p),
      rejected,
      awaitingUser: awaitingView(p, labels),
      notes: [...notes, ...otherChangeNotes],
      conflicts,
      hint: reviewHint(p, progress, rejected.length + conflicts.length),
    };
  }

  // -------------------------------------------------------------------------
  // revise_proposal (stage #644): see `proposalRevise.ts`

  async revise(refText: string, projectArg: string | undefined, args: ReviseArgs) {
    const resolved = await resolveProposal(this.roots, refText, projectArg);
    return reviseOnDisk(this.roots, this.now, resolved, args);
  }

  // -------------------------------------------------------------------------
  // withdraw_proposal

  async withdraw(refText: string, projectArg: string | undefined): Promise<Json> {
    const { location, stored, refs } = await resolveProposal(
      this.roots,
      refText,
      projectArg,
    );
    let fresh: Proposal | null = null;
    const updated = await updateStored(this.roots, location, stored.id, (p) => {
      fresh = p;
      return withdrawProposal(p);
    });
    const before = fresh as Proposal | null;
    if (before === null || updated.status !== 'withdrawn' || before.status !== 'open') {
      throw new ToolError(
        'not-open',
        `only an open proposal can be withdrawn (current state: ${(before ?? stored.proposal).status})`,
        { proposal: refs.ref(stored.id), status: (before ?? stored.proposal).status },
      );
    }
    const progress = reviewProgress(before);
    return {
      withdrawn: true,
      proposal: {
        ref: refs.ref(stored.id),
        id: stored.id,
        title: updated.title,
        status: updated.status,
        revision: updated.revision,
      },
      discarded: {
        undecided: progress.undecided,
        acceptedNotApplied: progress.acceptedPending,
        applied: progress.applied,
      },
      hint: 'the proposal was withdrawn: nothing more of it will be applied (what was already applied stays in the project). The files in proposals/ stay for the history.',
    };
  }
}

/** `lastRevisedAt` of `list_proposals`: the date of the agent's last revision (absent if never). */
function lastRevisedView(p: Proposal): Json {
  const at = p.revisions?.[p.revisions.length - 1]?.at;
  return at === undefined ? {} : { lastRevisedAt: at };
}

/** Package folders written in the proposal, with the file count of each one. */
function packageFolders(
  proposalId: string,
  written: readonly string[],
): { dir: string; files: number }[] {
  const prefix = `proposals/${proposalId}/`;
  const counts = new Map<string, number>();
  for (const path of written) {
    const dir = packageDirOf(path.slice(prefix.length));
    if (dir !== null) counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  return [...counts].map(([dir, files]) => ({ dir: `${prefix}${dir}`, files }));
}

/** Reference of a proposal cited by another (the folder may no longer exist). */
function refTo(all: StoredProposals, refs: ProposalRefs, id: string): string {
  return all.proposals.some((s) => s.id === id) ? refs.ref(id) : id;
}
