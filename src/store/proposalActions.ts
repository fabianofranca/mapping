import {
  addNote as addProposalNote,
  applyAccepted,
  decide,
  editNote as editProposalNote,
  isTextPackageFile,
  packageWithinLimits,
  proposalIndex,
  removeNote as removeProposalNote,
  reviewKey,
  reviewTree,
  serializeSpec,
  type Project,
  type Proposal,
  type ProposalPackage,
  type ProposalDecisions,
  type ProposalIssue,
  type ProposalStatus,
  type ReviewTarget,
  droppedEntryOf,
  fileNameKey,
  unseenRevisedIds,
  withDroppedNote,
} from '../model';
import type { FlushResult } from '../storage/autosave';
import type { FolderOp } from '../storage/folderCalls';
import { FOLDER_CONCURRENCY } from '../storage/folderConcurrency';
import { imageMimeType, type ProjectStorage } from '../storage/types';
import { mapLimit } from '../utils/mapLimit';
import { reportError } from '../utils/report';
import type { HistoryLink, LinkResult, ProjectStore } from './history';
import { validatePackage } from './packageValidation';
import type { SpecPackageFiles } from './project';
import type { ProposalErrorCode, ProposalStore, RemoveProposalError } from './proposals';

// Review actions on proposals (stage 4): decide, annotate and apply the accepted ones.
// They are the only ones that change a proposal; writing is done by `ProposalStore.mutate`. Each
// action is a pure function of the proposal (from `src/model/`), so, if the file changed
// outside, it is redone over the new version from disk.

export type DecisionError =
  /** The agent revised this change while the person was looking at the old version (decision 8). */
  'revised' | 'not-open' | 'unknown-target' | 'no-project' | ProposalErrorCode;

/** What a decision changed, to explain ("4 changes rejected along with it") and for the batches' "Undo". */
export interface DecisionOutcome {
  readonly proposal: Proposal;
  /** Decisions before and after (the "Undo" rewrites `previous` in a single write). */
  readonly previous: ProposalDecisions;
  readonly decisions: ProposalDecisions;
  /** Requested changes whose state changed. */
  readonly changed: readonly string[];
  /** Changes outside the request that changed through dependencies. */
  readonly cascaded: readonly string[];
}

export type DecisionResult =
  | ({ readonly ok: true } & DecisionOutcome)
  | { readonly ok: false; readonly error: DecisionError };

export type NoteError =
  'unknown-target' | 'empty-note' | 'unknown-note' | ProposalErrorCode;

export type NoteResult =
  | { readonly ok: true; readonly proposal: Proposal; readonly noteId: string | null }
  | { readonly ok: false; readonly error: NoteError };

export type RestoreError = 'not-open' | 'stale' | ProposalErrorCode;

export type ApplyError =
  | 'no-project'
  | 'read-only'
  /** The accepted set would leave the project invalid (`issues`) or does not fit in it. */
  | 'blocked'
  /** The project changed during the application (reloaded from outside). */
  | 'stale'
  /** The new image is not in `proposals/<id>/…` (`path`). */
  | 'image-missing'
  /** The destination file already belongs to another image of the project (`path`). */
  | 'image-exists'
  /** Nenhum arquivo do pacote de biblioteca em `proposals/<id>/specs/<pasta>/` (`path`). */
  | 'package-missing'
  /** The proposal's package fails the library validation (or exceeds the limits) (`path`). */
  | 'package-invalid'
  /**
   * `mapping.json` was not written (external change, quota, permission): the changes were
   * undone and the proposal stays as it was (an external change opens the conflict dialog).
   */
  | 'save-failed'
  | 'failed'
  | ProposalErrorCode;

export type ApplyResult =
  | {
      readonly ok: true;
      readonly proposal: Proposal;
      /** Changes made effective now. */
      readonly applied: number;
      /** Imagens movidas para `images/`. */
      readonly files: number;
    }
  | {
      readonly ok: false;
      readonly error: ApplyError;
      readonly issues?: readonly ProposalIssue[];
      readonly path?: string;
    };

export type RemoveError =
  /** Projeto somente leitura: nada do armazenamento muda. */
  | 'read-only'
  /** A proposal is under review: deleting belongs to the list, outside the review. */
  | 'reviewing'
  | RemoveProposalError;

export type RemoveResult =
  | { readonly ok: true; readonly proposal: Proposal }
  | { readonly ok: false; readonly error: RemoveError };

/** All the reasons the review actions refuse (for the message to the user). */
export type ProposalActionError =
  DecisionError | NoteError | RestoreError | ApplyError | RemoveError;

export interface ProposalActions {
  /** Decides a level (accepts, rejects or clears) resolving the dependencies. */
  decide(
    proposalId: string,
    target: ReviewTarget,
    state: 'accepted' | 'rejected' | null,
  ): Promise<DecisionResult>;
  /**
   * Decides several targets in a single write (the batches: "Accept 12 visible" with filters).
   * At least one existing target.
   */
  decideMany(
    proposalId: string,
    targets: readonly ReviewTarget[],
    state: 'accepted' | 'rejected' | null,
  ): Promise<DecisionResult>;
  /**
   * Rewrites `previous` as the decisions, in a single write (the batch's "Undo"). Only valid
   * while the decisions are still `expected` (nobody decided anything afterwards).
   */
  restoreDecisions(
    proposalId: string,
    previous: ProposalDecisions,
    expected: ProposalDecisions,
  ): Promise<
    | { readonly ok: true; readonly proposal: Proposal }
    | { readonly ok: false; readonly error: RestoreError }
  >;
  addNote(proposalId: string, target: ReviewTarget, text: string): Promise<NoteResult>;
  /** Texto vazio remove a nota. */
  editNote(proposalId: string, noteId: string, text: string): Promise<NoteResult>;
  removeNote(proposalId: string, noteId: string): Promise<NoteResult>;
  /**
   * "Apply accepted": makes the accepted, not yet applied changes effective in a single undo
   * entry of the project, moves the images from `proposals/<id>/` to `images/`, copies the
   * library packages from `proposals/<id>/specs/` to `specs/` (through the session; the files
   * stay in the proposal) and writes `applied` (and `status`, if everything was decided) to the
   * proposal. Undoing and redoing that entry also undo and redo the `applied` and the position of
   * the images.
   */
  applyAccepted(proposalId: string): Promise<ApplyResult>;
  /**
   * Deletes a closed proposal (withdrawn, superseded or applied) from storage, with the
   * images that were waiting for acceptance. No undo. Its "Apply accepted" entry in the
   * history loses the link (`detachLinks`): the project's undo and redo remain
   * valid, without touching any proposal. The images the application copied to
   * `images/` belong to the project and follow the session's normal cleanup.
   */
  removeProposal(proposalId: string): Promise<RemoveResult>;
}

export interface ProposalActionsDeps {
  readonly store: ProjectStore;
  readonly proposals: ProposalStore;
  readonly storage: ProjectStorage;
  readonly now: () => string;
  readonly newId: () => string;
  /** Writes the image to the project and registers it as written by the session (`stored`). */
  readonly putProjectImage: (path: string, data: Blob) => Promise<void>;
  /**
   * Everything that occupies a name in `images/` now: the files in the folder (cited or not) and
   * what the session keeps (undo history, trash, writes in progress). Compared by
   * `fileNameKey`, case-insensitively.
   */
  readonly takenImageFiles: () => Promise<ReadonlySet<string>>;
  /** Undoes `putProjectImage` (the application failed midway). */
  readonly dropProjectImage: (path: string) => Promise<void>;
  /**
   * Hands the session the specialization package (already validated) that the application will put
   * in the project: writing `specs/<folder>/` and undo/redo come from its cache.
   */
  readonly stagePackage: (
    spec: { readonly id: string; readonly version: number },
    files: SpecPackageFiles,
  ) => void;
  /** Grava agora o que o projeto tem pendente (o `mapping.json` antes da proposta) e diz se gravou. */
  readonly flush: () => Promise<FlushResult>;
  /**
   * Measures on the folder's call counter (`decide`: writing a decision or note; `apply`:
   * applying the accepted ones, up to the `mapping.json` written). Without it, it only runs.
   */
  readonly measure?: <T>(op: FolderOp, fn: () => Promise<T>) => Promise<T>;
}

/** Is any of the changes about to change state one the agent revised without the person seeing? */
function touchesUnseen(
  unseen: ReadonlySet<string>,
  changed: readonly string[],
  cascaded: readonly string[],
): boolean {
  return [...changed, ...cascaded].some((changeId) => unseen.has(changeId));
}

function sameDecisions(a: ProposalDecisions, b: ProposalDecisions): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((id) => {
    const other = b[id];
    return other !== undefined && other.state === a[id]?.state && other.at === a[id]?.at;
  });
}

/** Image copied to `images/`: where it was, where it is and the content (to undo). */
interface MovedImage {
  readonly from: string;
  readonly to: string;
  readonly blob: Blob;
}

/** Why a proposal's package could not be read. */
type PackageReadError = 'package-missing' | 'package-invalid';

/**
 * Reads into memory the package waiting in `proposals/<id>/specs/<folder>/` (text of the `.json`
 * and `.md`, `Blob` copied for the others, like the session's `snapshotPackage`) and validates it
 * through the three levels, with the applied version as the previous one (version contract). The
 * specialization file comes from `to.spec`, the source of truth: if the folder has its own, it is
 * replaced.
 */
async function readProposalPackage(
  storage: ProjectStorage,
  pkg: ProposalPackage,
  base: Project,
  proposalId: string,
): Promise<SpecPackageFiles | PackageReadError> {
  const prefix = `${pkg.from}/`;
  const paths = (await storage.listProposalFiles(proposalId)).filter((path) =>
    path.startsWith(prefix),
  );
  if (paths.length === 0) return 'package-missing';
  // Reads in parallel with a limit; the check and the map follow the order of the files.
  const read = await mapLimit(paths, FOLDER_CONCURRENCY, async (path) => {
    const blob = await storage.readImage(path);
    if (!blob) return null;
    const rel = path.slice(prefix.length);
    const data = isTextPackageFile(rel)
      ? await blob.text()
      : new Blob([await blob.arrayBuffer()], { type: blob.type });
    return { rel, data, size: blob.size };
  });
  const files = new Map<string, string | Blob>();
  let bytes = 0;
  for (const item of read) {
    if (!item) return 'package-missing';
    bytes += item.size;
    files.set(item.rel, item.data);
  }
  if (!packageWithinLimits(files.size, bytes) || pkg.spec === null) {
    return 'package-invalid';
  }
  files.set(pkg.file.slice(pkg.dir.length + 1), serializeSpec(pkg.spec));
  const previous = base.specializations.find((s) => s.id === pkg.specId)?.spec;
  const report = validatePackage(files, previous ?? undefined);
  return report.ok ? files : 'package-invalid';
}

/**
 * Reads a proposal's source images in parallel with a limit, in the order of `moves`: `null`
 * where the file does not exist. In-memory copy: reading again after deleting the source, on
 * undo, cannot fail.
 */
async function readImageSources(
  storage: ProjectStorage,
  moves: readonly { readonly from: string; readonly to: string }[],
): Promise<(Blob | null)[]> {
  return mapLimit(moves, FOLDER_CONCURRENCY, async (move) => {
    const source = await storage.readImage(move.from);
    if (!source) return null;
    return new Blob([await source.arrayBuffer()], {
      type: source.type || imageMimeType(move.to),
    });
  });
}

export function createProposalActions(deps: ProposalActionsDeps): ProposalActions {
  const { store, proposals, storage, now } = deps;
  const measure = <T>(op: FolderOp, fn: () => Promise<T>): Promise<T> =>
    deps.measure ? deps.measure(op, fn) : fn();

  const decideMany: ProposalActions['decideMany'] = async (id, targets, state) => {
    const result = await measure('decide', () =>
      proposals.mutate<DecisionOutcome, DecisionError>(id, (p, seen) => {
        const project = store.committed.peek();
        if (!project) return { ok: false, error: 'no-project' };
        if (p.status !== 'open') return { ok: false, error: 'not-open' };
        const tree = reviewTree(p, project);
        const at = now();
        const requested = new Set<string>();
        let current = p;
        for (const target of targets) {
          const decided = decide(current, tree, target, state, at);
          if (!decided.ok) {
            // A target that vanished in a batch is ignored; alone, it is an error.
            if (targets.length === 1) return { ok: false, error: decided.reason };
            continue;
          }
          for (const changeId of tree.changeIdsOf(target)) requested.add(changeId);
          current = { ...current, decisions: decided.decisions };
        }
        const changed: string[] = [];
        const cascaded: string[] = [];
        for (const c of p.changes) {
          if (p.decisions[c.id]?.state === current.decisions[c.id]?.state) continue;
          (requested.has(c.id) ? changed : cascaded).push(c.id);
        }
        if (touchesUnseen(unseenRevisedIds(seen, p), changed, cascaded)) {
          return { ok: false, error: 'revised' };
        }
        const outcome: DecisionOutcome = {
          proposal: current,
          previous: p.decisions,
          decisions: current.decisions,
          changed,
          cascaded,
        };
        return {
          ok: true,
          proposal: changed.length + cascaded.length === 0 ? p : current,
          value: outcome,
        };
      }),
    );
    if (!result.ok) return result;
    // Deciding is like editing: the "redo" of an undone application would no longer be valid.
    if (result.value.changed.length + result.value.cascaded.length > 0) {
      store.discardRedoOf(id);
    }
    return { ok: true, ...result.value, proposal: result.proposal };
  };

  const noteMutation = (
    id: string,
    mutation: (p: Proposal) => Proposal | NoteError,
    noteIdOf: (before: Proposal, after: Proposal) => string | null,
  ): Promise<NoteResult> =>
    measure('decide', () =>
      proposals.mutate<string | null, NoteError>(id, (p) => {
        const next = mutation(p);
        if (typeof next === 'string') return { ok: false, error: next };
        return { ok: true, proposal: next, value: noteIdOf(p, next) };
      }),
    ).then((result) =>
      result.ok
        ? { ok: true, proposal: result.proposal, noteId: result.value }
        : { ok: false, error: result.error },
    );

  /** The target exists in the proposal (so the note does not point to nothing). */
  const targetExists = (p: Proposal, target: ReviewTarget): boolean => {
    if (target.level === 'proposal' || target.level === 'project') return true;
    if (target.id === null) return false;
    if (target.level === 'change') return proposalIndex(p).changes.has(target.id);
    const project = store.committed.peek();
    return project ? reviewTree(p, project).nodes.has(reviewKey(target)) : false;
  };

  /**
   * Puts the note on the target. A change the agent withdrew in a revision no longer exists: the
   * note goes up to the proposal level and the withdrawn change claims it (decision 6).
   */
  const addNoteTo = (
    p: Proposal,
    target: ReviewTarget,
    text: string,
  ): Proposal | NoteError => {
    const noteId = deps.newId();
    if (targetExists(p, target)) return addProposalNote(p, target, text, now(), noteId);
    const where =
      target.level === 'change' && target.id ? droppedEntryOf(p, target.id) : null;
    if (where === null) return 'unknown-target';
    const asProposal: ReviewTarget = { level: 'proposal', id: null };
    return withDroppedNote(
      addProposalNote(p, asProposal, text, now(), noteId),
      where,
      noteId,
    );
  };

  const applyAcceptedChanges: ProposalActions['applyAccepted'] = async (id) => {
    let issues: readonly ProposalIssue[] | undefined;
    let failedPath: string | undefined;
    const outcome = await measure('apply', () =>
      proposals.mutate<{ applied: number; files: number }, ApplyError>(id, (p) => {
        const base = store.project.peek();
        if (!base) return { ok: false, error: 'no-project' };
        if (store.readOnly.peek()) return { ok: false, error: 'read-only' };
        const applying = applyAccepted(base, p, now());
        if (!applying.ok) {
          issues = applying.issues;
          return { ok: false, error: 'blocked' };
        }
        const moved: MovedImage[] = [];
        const appliedIds = applying.applied.map((c) => c.id);
        const appliedAt = Object.fromEntries(
          appliedIds.map((changeId) => [changeId, applying.proposal.applied[changeId]]),
        );
        const statusBefore: ProposalStatus = p.status;
        const statusAfter: ProposalStatus = applying.proposal.status;
        // Writing `mapping.json` failed and the entry was undone: the link does nothing.
        let abandoned = false;
        // The project after `store.apply` (to undo only if it is still the one).
        let applied: Project | null = null;

        // Undo the entry: the proposal goes back to having the changes as accepted but not applied
        // and the images go back to `proposals/<id>/`. Redo: the opposite.
        const link: HistoryLink = {
          tag: id,
          undo: () => {
            if (abandoned) return undefined;
            return proposals
              .mutate<void, never>(id, (current) => {
                const rest = { ...current.applied };
                for (const changeId of appliedIds) delete rest[changeId];
                return {
                  ok: true,
                  value: undefined,
                  proposal: {
                    ...current,
                    applied: rest,
                    status:
                      current.status === statusAfter ? statusBefore : current.status,
                  },
                  before: async () => {
                    for (const m of moved) await storage.writeImage(m.from, m.blob);
                    return null;
                  },
                };
              })
              .then((r): LinkResult => {
                if (!r.ok) reportError('proposals.undoApply', new Error(r.error));
                return r.ok ? { ok: true } : { ok: false, error: r.error };
              });
          },
          redo: () => {
            if (abandoned) return undefined;
            return proposals
              .mutate<void, never>(id, (current) => {
                const again = { ...current.applied };
                for (const changeId of appliedIds) {
                  const entry = appliedAt[changeId];
                  if (entry && current.decisions[changeId]?.state === 'accepted') {
                    again[changeId] = entry;
                  }
                }
                return {
                  ok: true,
                  value: undefined,
                  proposal: {
                    ...current,
                    applied: again,
                    status:
                      current.status === statusBefore ? statusAfter : current.status,
                  },
                  after: async () => {
                    for (const m of moved) await storage.removeImage(m.from);
                  },
                };
              })
              .then((r): LinkResult => {
                if (!r.ok) reportError('proposals.redoApply', new Error(r.error));
                return r.ok ? { ok: true } : { ok: false, error: r.error };
              });
          },
        };

        const rollback = async () => {
          for (const m of moved) {
            await deps
              .dropProjectImage(m.to)
              .catch((e: unknown) => reportError('proposals.rollback', e));
          }
        };

        const prepare = async (): Promise<ApplyError | null> => {
          // 0. The library packages are read, validated and handed to the session, which
          // writes them to `specs/<folder>/` together with the project (copied: they stay in the proposal).
          for (const pkg of applying.packages) {
            const read = await readProposalPackage(storage, pkg, base, id);
            if (typeof read === 'string') {
              failedPath = pkg.from;
              return read;
            }
            deps.stagePackage({ id: pkg.specId, version: pkg.version }, read);
          }
          // 1. The images go to their final place (copied; the source is removed only at the end).
          const taken = new Set<string>();
          for (const file of await deps.takenImageFiles()) taken.add(fileNameKey(file));
          for (const image of base.containers) {
            if (image.file !== null) taken.add(fileNameKey(image.file));
          }
          // The sources are all read at once (in parallel with a limit); the checks and the
          // writes below follow in order, with the same errors.
          const sources = await readImageSources(storage, applying.files);
          for (const [i, move] of applying.files.entries()) {
            if (taken.has(fileNameKey(move.to))) {
              failedPath = move.to;
              await rollback();
              return 'image-exists';
            }
            const blob = sources[i];
            if (!blob) {
              failedPath = move.from;
              await rollback();
              return 'image-missing';
            }
            await deps.putProjectImage(move.to, blob);
            moved.push({ from: move.from, to: move.to, blob });
            taken.add(fileNameKey(move.to));
          }
          // 2. The project, in one undo entry. If it changed while we were copying, give up.
          if (store.project.peek() !== base) {
            await rollback();
            return 'stale';
          }
          if (applying.applied.length > 0) {
            const result = store.apply(() => applying.project, { link });
            if (!result.ok) {
              await rollback();
              return result.error === 'read-only' ? 'read-only' : 'failed';
            }
            applied = store.project.peek();
          }
          // 3. `mapping.json` first: the proposal only says "applied" if it was written. Otherwise,
          // undo the entry (no "redo"), return the copies and do not write the proposal.
          const saved = await deps.flush();
          if (!saved.ok) {
            abandoned = true;
            const undone = applied !== null && store.project.peek() === applied;
            if (undone) store.undo();
            store.discardRedoOf(id);
            // Project already swapped (the undo was skipped): it may cite the copies, which stay.
            if (undone) await rollback();
            return 'save-failed';
          }
          return null;
        };

        const unchanged =
          applying.applied.length === 0 && applying.proposal.status === p.status;
        return {
          ok: true,
          proposal: unchanged ? p : applying.proposal,
          value: { applied: applying.applied.length, files: applying.files.length },
          before: async () => {
            try {
              return await prepare();
            } catch (e) {
              // Storage exception (reading the package or image, writing the copy):
              // it becomes the typed write failure and the copies already made are removed.
              reportError('proposals.apply', e);
              await rollback();
              return 'write-failed';
            }
          },
          // 4. `mapping.json` was written, but `proposal.json` failed (phase 8.2, P7): the project
          // cannot stay applied with the proposal lacking `applied`. Undo the entry (the session
          // sees the confirmed state differ from the disk and schedules the rewrite), confirm the
          // rewrite with `flush` and only then remove the copies from `images/`: the `mapping.json`
          // on disk still cites them until the rewrite, and it never points to a deleted file. If
          // the rewrite fails, the copies are left for the session's cleanup when it succeeds.
          compensate: async () => {
            abandoned = true;
            const undone = applied !== null && store.project.peek() === applied;
            if (undone) store.undo();
            store.discardRedoOf(id);
            // The project is no longer the applied one (reloaded from outside in the write window):
            // there is nothing to rewrite, and the disk may cite the copies. They stay.
            if (!undone) return;
            const restored = await deps.flush();
            if (restored.ok) await rollback();
          },
          after: async () => {
            for (const m of moved) {
              await storage
                .removeImage(m.from)
                .catch((e: unknown) => reportError('proposals.removeSource', e));
            }
          },
        };
      }),
    );
    if (!outcome.ok) {
      return {
        ok: false,
        error: outcome.error,
        ...(issues ? { issues } : {}),
        ...(failedPath ? { path: failedPath } : {}),
      };
    }
    store.discardRedoOf(id);
    return { ok: true, proposal: outcome.proposal, ...outcome.value };
  };

  return {
    decide: (id, target, state) => decideMany(id, [target], state),
    decideMany,

    async restoreDecisions(id, previous, expected) {
      const result = await proposals.mutate<void, 'not-open' | 'stale'>(id, (p) => {
        if (p.status !== 'open') return { ok: false, error: 'not-open' };
        if (!sameDecisions(p.decisions, expected)) return { ok: false, error: 'stale' };
        // What was already applied remains accepted.
        if (
          Object.keys(p.applied).some(
            (changeId) => previous[changeId]?.state !== 'accepted',
          )
        ) {
          return { ok: false, error: 'stale' };
        }
        return { ok: true, value: undefined, proposal: { ...p, decisions: previous } };
      });
      if (!result.ok) return result;
      store.discardRedoOf(id);
      return { ok: true, proposal: result.proposal };
    },

    addNote: (id, target, text) =>
      noteMutation(
        id,
        (p) => {
          if (text.trim() === '') return 'empty-note';
          return addNoteTo(p, target, text);
        },
        (_before, after) => after.notes.at(-1)?.id ?? null,
      ),

    editNote: (id, noteId, text) =>
      noteMutation(
        id,
        (p) =>
          p.notes.some((n) => n.id === noteId)
            ? editProposalNote(p, noteId, text, now())
            : 'unknown-note',
        () => noteId,
      ),

    removeNote: (id, noteId) =>
      noteMutation(
        id,
        (p) =>
          p.notes.some((n) => n.id === noteId)
            ? removeProposalNote(p, noteId)
            : 'unknown-note',
        () => noteId,
      ),

    applyAccepted: applyAcceptedChanges,

    async removeProposal(id) {
      if (store.readOnly.peek()) return { ok: false, error: 'read-only' };
      if (store.reviewing.peek()) return { ok: false, error: 'reviewing' };
      return proposals.remove(id, () => store.detachLinks(id));
    },
  };
}
