import { batch, computed, effect, signal, type ReadonlySignal } from '@preact/signals';
import { z } from 'zod';
import {
  CHANGE_TYPES,
  CANVAS_FILTER,
  NO_FILTERS,
  hasActiveFilters,
  proposalIndex,
  reviewKey,
  stepChange,
  type ChangeType,
  type Proposal,
  type ProposalDecisions,
  type ReviewFilters,
  type ReviewTarget,
} from '../model';
import type { ProjectStorage } from '../storage/types';
import { reportError } from '../utils/report';
import { readSetting, writeSetting } from '../utils/safeStorage';
import { createReviewDerived, type ReviewDerived, type ReviewView } from './derived';
import type {
  ApplyResult,
  DecisionResult,
  NoteResult,
  RemoveResult,
} from './proposalActions';
import { createProposedComponents, type ProposedComponents } from './proposedCatalog';
import type { ProjectSession } from './session';

// State of reviewing a proposal (stage 4): which proposal is open, the selected item,
// the filters, the Current/Proposed view and the "Undo" of the decision batches.
// It is UI state: the decisions and notes live in the proposal (written by the session) and what
// is computed from them, in `derived`. Resuming the review (last item, filters, view and
// known conflicts) and "seen" are kept in `localStorage` per device and per copy of the
// project (`ProjectStorage.copyId`), with try/catch, outside the proposal and the undo.

export type { ReviewView };

/** What comes back when reopening a proposal in this copy of the project, on this device. */
export interface ReviewResume {
  /** Last item seen. */
  readonly selected: ReviewTarget | null;
  readonly view: ReviewView;
  readonly filters: ReviewFilters;
  /**
   * Conflicts the person already knew about in this copy of the project (those seen on open and
   * those decided), so that only the new ones are marked ("New conflict").
   */
  readonly knownConflicts: readonly string[];
}

/** The last decision, with what it changed: the "Undo" notice (HANDOFF 8.3). */
export interface DecisionUndo {
  readonly proposalId: string;
  /** Earlier decisions: "Undo" rewrites them in a single write. */
  readonly previous: ProposalDecisions;
  /** Later decisions: "Undo" is only valid while they are still these. */
  readonly decisions: ProposalDecisions;
  /** Requested changes that changed state. */
  readonly changed: readonly string[];
  /** Changes that changed along with them, through dependencies ("4 changes rejected too"). */
  readonly cascaded: readonly string[];
  /** Who decided: the state applied to the target (`null` = cleared). */
  readonly state: 'accepted' | 'rejected' | null;
}

/**
 * Request to move focus to the marker of a change in Details (click or Enter on a
 * change in the Proposals window, phase 9.6): whoever draws the marker fulfills and clears it. The
 * arrows only select: focus stays in the list (HANDOFF-REVIEW-DETAILS, decision 2).
 */
export interface MarkRequest {
  readonly changeId: string;
  /** Tells two consecutive requests for the same change apart. */
  readonly seq: number;
}

/** Which control of the ✓ ✕ pair receives focus after a keyboard decision. */
export type DecisionControlKind = 'accept' | 'reject';
/** Where the pair is: the annotation card (Details) or the footer of the marker popover. */
export type DecisionSurface = 'card' | 'popover';

export type OpenReviewResult =
  | {
      readonly ok: true;
      /** `'full'`: back to where it stopped (there was state for this copy on this device). */
      readonly resumed: 'full' | 'none';
      /** Conflicts that appeared since the last opening in this copy. */
      readonly newConflicts: number;
    }
  | {
      readonly ok: false;
      readonly error: 'unknown-proposal' | 'withdrawn' | 'no-project';
    };

export interface ReviewState {
  /** Proposal open in the review; `null` outside it. */
  readonly proposalId: ReadonlySignal<string | null>;
  /** Selected target (proposal, project, image, item or change). */
  readonly selected: ReadonlySignal<ReviewTarget | null>;
  readonly view: ReadonlySignal<ReviewView>;
  readonly filters: ReadonlySignal<ReviewFilters>;
  /** Proposals already opened in this copy of the project, on this device (ids). */
  readonly seen: ReadonlySignal<ReadonlySet<string>>;
  /**
   * Changes in conflict that the person did not know about when opening the review: those that were already
   * in conflict at open and were not known, and those that appeared during the review
   * (project reloaded from outside). Empty outside the review.
   */
  readonly newConflicts: ReadonlySignal<ReadonlySet<string>>;
  /**
   * The new conflicts that the list notice announces: those of `newConflicts`, or empty if the
   * person dismissed the notice (X) and no new conflict appeared afterwards. State of the open
   * review: nothing is written and it resets on open and on close.
   */
  readonly staleNotice: ReadonlySignal<ReadonlySet<string>>;
  /** Dismisses the new-conflicts notice (X) until a new conflict appears. */
  dismissStaleNotice(): void;
  /** The person dismissed (X) the superseded-proposal notice in this review. */
  readonly supersededDismissed: ReadonlySignal<boolean>;
  dismissSupersededNotice(): void;
  /** The last decision, while "Undo" is valid; `null` after another action. */
  readonly undoable: ReadonlySignal<DecisionUndo | null>;
  /** Pending request to focus the marker of a change (Details); `null` with no request. */
  readonly markRequest: ReadonlySignal<MarkRequest | null>;
  /**
   * Request to open the suggested note of a change, with focus in the field (rejecting through the
   * popover with the mouse). It lives here, not in the popover, because rejecting may swap the card
   * of the created annotation and remount the marker: the new popover fulfills the
   * request. `null` with no request.
   */
  readonly noteRequest: ReadonlySignal<MarkRequest | null>;
  /** Derived state (levels, counts, "how it would look", pending items, conflicts). */
  readonly derived: ReviewDerived;
  /**
   * The component catalog the drawing reads: in the Proposed view, that of the applied library
   * plus the packages of the open proposal (read from `proposals/<id>/`, without writing); in Current, that
   * of the library. Whoever does not draw (insert palette, Sources diagnostics) reads `session.components`.
   */
  readonly components: ProposedComponents;

  /** Opens the review (read-only project) and returns to where it stopped. */
  open(proposalId: string): OpenReviewResult;
  /** Leaves the review, keeping where it stopped. The decisions stay in the proposal. */
  close(): void;
  select(target: ReviewTarget | null): void;
  /** Asks Details to move focus to the change's marker and open its popover. */
  requestMark(changeId: string): void;
  /** Fulfilled (or gave up) the `requestMark` request. */
  clearMarkRequest(): void;
  /** Asks for the change's suggested note (`noteRequest`); each request has a new `seq`. */
  requestNote(changeId: string): void;
  /** The note was closed empty, or the popover was closed: the request no longer applies. */
  clearNoteRequest(): void;
  /**
   * Deciding by keyboard may swap the card (or remount the popover) and remove from the DOM the button
   * that had focus; the browser sends focus to `body`. Whoever decided records here the control that
   * had focus, and the new ✓ ✕ pair recovers it on mount (`takeControlFocus`).
   */
  requestControlFocus(
    changeId: string,
    surface: DecisionSurface,
    control: DecisionControlKind,
  ): void;
  /** Delivers (once) the control that should receive focus in this pair; `null` with no request. */
  takeControlFocus(
    changeId: string,
    surface: DecisionSurface,
  ): DecisionControlKind | null;
  setView(view: ReviewView): void;
  setFilters(patch: Partial<ReviewFilters>): void;
  clearFilters(): void;

  decide(
    target: ReviewTarget,
    state: 'accepted' | 'rejected' | null,
  ): Promise<DecisionResult>;
  /**
   * Decides several targets in a single write and a single "Undo" entry (the buttons of the
   * dependency notices). `null` if no proposal is open.
   */
  decideMany(
    targets: readonly ReviewTarget[],
    state: 'accepted' | 'rejected' | null,
  ): Promise<DecisionResult | null>;
  /** Decides what the list shows (with active filters, only the visible ones; without filters, the whole proposal). */
  decideVisible(state: 'accepted' | 'rejected' | null): Promise<DecisionResult | null>;
  /** Undoes the last decision in a single write. `false` if it no longer applies (someone decided afterwards). */
  undoLastDecision(): Promise<boolean>;
  dismissUndo(): void;

  addNote(target: ReviewTarget, text: string): Promise<NoteResult | null>;
  editNote(noteId: string, text: string): Promise<NoteResult | null>;
  removeNote(noteId: string): Promise<NoteResult | null>;
  /** "Apply accepted". */
  apply(): Promise<ApplyResult | null>;
  /**
   * Deletes a closed proposal (⋯ menu of the list) and forgets what this copy kept about it
   * (`seen` and the point where it stopped). Only outside the review.
   */
  removeProposal(id: string): Promise<RemoveResult>;

  /**
   * Selects the next/previous pending (undecided) or conflicting change relative to the
   * selected one, among those that pass the filters, wrapping around. Returns the target.
   */
  step(kind: 'pending' | 'conflict', direction: 1 | -1): ReviewTarget | null;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Resuming the review: per-device state (phase 8.2, blob v2)
//
// A single blob in `localStorage` (`mapping.reviewResume`), versioned: `seen`, the proposals
// already opened (keys `copyId|proposalId`, unbounded: only ids) and `resume`, the position, the
// view, the filters and the known conflicts per proposal (the same keys, the 12 most
// recent per copy). "Seen" and "resume" are separate on purpose: evicting an entry
// from resume never returns the proposal to "New". Unknown version, corrupted text or the
// old format (a flat `Record`) are discarded, not migrated.

const RESUME_KEY = 'mapping.reviewResume';
const RESUME_VERSION = 2;
/** Proposals with a remembered position, per copy of the project (the most recent ones). */
const MAX_RESUME_PER_COPY = 12;
/** Conflicts stored per proposal. */
const MAX_KNOWN_CONFLICTS = 500;

const targetSchema = z.object({
  level: z.enum(['proposal', 'project', 'canvas', 'image', 'item', 'change']),
  id: z.string().nullable(),
});

const resumeSchema = z.object({
  selected: targetSchema.nullable(),
  view: z.enum(['current', 'proposed']),
  filters: z.object({
    types: z.array(z.enum(CHANGE_TYPES as [ChangeType, ...ChangeType[]])),
    imageId: z.string().nullable(),
    layerId: z.string().nullable(),
    decision: z.enum(['all', 'undecided', 'accepted', 'rejected']),
    onlyConflicts: z.boolean(),
    // Blob written before stage #644 does not have the field: it counts as off (without changing the version).
    onlyRevised: z.boolean().default(false),
  }),
  knownConflicts: z.array(z.string()),
});

const blobSchema = z.object({
  v: z.literal(RESUME_VERSION),
  seen: z.array(z.string()),
  resume: z.record(z.string(), resumeSchema),
});

interface ResumeBlob {
  readonly v: typeof RESUME_VERSION;
  readonly seen: readonly string[];
  readonly resume: Readonly<Record<string, ReviewResume>>;
}

const EMPTY_BLOB: ResumeBlob = { v: RESUME_VERSION, seen: [], resume: {} };

function readBlob(): ResumeBlob {
  const text = readSetting(RESUME_KEY);
  if (text === null) return EMPTY_BLOB;
  try {
    const parsed = blobSchema.safeParse(JSON.parse(text));
    return parsed.success ? (parsed.data as ResumeBlob) : EMPTY_BLOB;
  } catch {
    // Corrupted text: the review goes back to the start, nothing more.
    return EMPTY_BLOB;
  }
}

function writeBlob(blob: ResumeBlob): void {
  writeSetting(RESUME_KEY, JSON.stringify(blob));
}

/** Separates the copy from the proposal id (the id never has `|`: `PROPOSAL_ID_RE`). */
const KEY_SEPARATOR = '|';

/**
 * The copy of the project the stored state belongs to: `ProjectStorage.copyId` (phase 8.4;
 * local: the project id; folder: the id of the recents entry). The same proposal (same
 * id) in two copies (the imported zip and its unzipped folder, two folders with the
 * same name) has different conflicts and position. Every session receives a storage with
 * `copyId`; without it, the copies would share state, so Diagnostics logs it.
 */
function resumeScope(storage: ProjectStorage): string {
  const id = storage.copyId;
  if (id !== undefined && id !== '') return id;
  reportError('review.scope', new Error(`storage sem copyId (${storage.kind})`));
  return '';
}

const keyOf = (scope: string, proposalId: string) =>
  `${scope}${KEY_SEPARATOR}${proposalId}`;

/** Ids of the proposals of this copy in `seen`. */
function seenOf(blob: ResumeBlob, scope: string): Set<string> {
  const prefix = `${scope}${KEY_SEPARATOR}`;
  const result = new Set<string>();
  for (const key of blob.seen) {
    if (key.startsWith(prefix)) result.add(key.slice(prefix.length));
  }
  return result;
}

/**
 * The blob with this proposal's entry replaced (the most recent last) and only the
 * `MAX_RESUME_PER_COPY` most recent **of this copy**; those of other copies stay
 * as they are. `seen` only grows.
 */
function withEntry(
  blob: ResumeBlob,
  scope: string,
  key: string,
  entry: ReviewResume,
): ResumeBlob {
  const prefix = `${scope}${KEY_SEPARATOR}`;
  const others: [string, ReviewResume][] = [];
  const own: [string, ReviewResume][] = [];
  for (const pair of Object.entries(blob.resume)) {
    if (pair[0] === key) continue;
    (pair[0].startsWith(prefix) ? own : others).push(pair);
  }
  own.push([key, entry]);
  return {
    v: RESUME_VERSION,
    seen: blob.seen.includes(key) ? blob.seen : [...blob.seen, key],
    resume: Object.fromEntries([...others, ...own.slice(-MAX_RESUME_PER_COPY)]),
  };
}

/** The blob without what this copy kept of the proposal (deleted); `null` if there was nothing. */
function withoutEntry(blob: ResumeBlob, key: string): ResumeBlob | null {
  const hasSeen = blob.seen.includes(key);
  const hasResume = Object.hasOwn(blob.resume, key);
  if (!hasSeen && !hasResume) return null;
  return {
    v: RESUME_VERSION,
    seen: blob.seen.filter((k) => k !== key),
    resume: Object.fromEntries(Object.entries(blob.resume).filter(([k]) => k !== key)),
  };
}

const START_VIEW: ReviewView = 'proposed';
const NO_CONFLICTS: ReadonlySet<string> = new Set();
/** Deciding without an open review: there is no proposal the decision applies to. */
const NOT_OPEN: DecisionResult = { ok: false, error: 'unknown-proposal' };

function sameTarget(a: ReviewTarget | null, b: ReviewTarget | null): boolean {
  return a === b || (a !== null && b !== null && a.level === b.level && a.id === b.id);
}

export function createReviewState(session: ProjectSession): ReviewState {
  const { store, proposals, proposalActions, perspective } = session;
  const scope = resumeScope(session.storage);
  const proposalId = signal<string | null>(null);
  const selected = signal<ReviewTarget | null>(null);
  const view = signal<ReviewView>(START_VIEW);
  const filters = signal<ReviewFilters>(NO_FILTERS);
  const undoable = signal<DecisionUndo | null>(null);
  const markRequest = signal<MarkRequest | null>(null);
  let markSeq = 0;
  const noteRequest = signal<MarkRequest | null>(null);
  let controlFocus: {
    changeId: string;
    surface: DecisionSurface;
    control: DecisionControlKind;
  } | null = null;
  // The conflicts the person knew about on open: whatever is outside them is "new". And those
  // that were in view on open (announced by the notice), which become known on close.
  const knownAtOpen = signal<ReadonlySet<string>>(NO_CONFLICTS);
  let conflictsAtOpen: ReadonlySet<string> = NO_CONFLICTS;
  // The new conflicts the person dismissed in the notice (X) and whether they dismissed the superseded one.
  const staleDismissed = signal<ReadonlySet<string>>(NO_CONFLICTS);
  const supersededDismissed = signal(false);
  // Only the proposals of this copy count as seen (that of a new copy is new, G1).
  const seen = signal<ReadonlySet<string>>(seenOf(readBlob(), scope));

  /**
   * Merges into the in-memory `seen` what the blob has now (another tab may have opened a
   * proposal) plus `extra`, reassigning the signal only if some id entered: `derived.rows`
   * depends on it and `remember` runs on every selection.
   */
  const mergeSeen = (blob: ResumeBlob, extra?: string) => {
    const current = seen.peek();
    const next = seenOf(blob, scope);
    for (const id of current) next.add(id);
    if (extra !== undefined) next.add(extra);
    if (next.size !== current.size) seen.value = next;
  };

  const derived = createReviewDerived(store, {
    proposals: proposals.list,
    proposalId,
    view,
    filters,
    seen,
    perspectiveId: perspective.id,
  });

  const components = createProposedComponents({
    base: session.components,
    proposal: derived.proposal,
    view,
    shown: derived.shownProject,
    read: (path) => session.readImage(path),
  });

  const newConflicts = computed((): ReadonlySet<string> => {
    if (proposalId.value === null) return NO_CONFLICTS;
    const known = knownAtOpen.value;
    const fresh = new Set<string>();
    for (const id of derived.conflictIds.value) if (!known.has(id)) fresh.add(id);
    return fresh.size === 0 ? NO_CONFLICTS : fresh;
  });

  const staleNotice = computed((): ReadonlySet<string> => {
    const fresh = newConflicts.value;
    const dismissed = staleDismissed.value;
    for (const id of fresh) if (!dismissed.has(id)) return fresh;
    return NO_CONFLICTS;
  });

  /** Does the target exist in the open proposal? */
  const exists = (target: ReviewTarget, p: Proposal): boolean => {
    if (
      target.level === 'proposal' ||
      target.level === 'project' ||
      target.level === 'canvas'
    ) {
      return true;
    }
    if (target.id === null) return false;
    if (target.level === 'change') return proposalIndex(p).changes.has(target.id);
    return derived.tree.peek()?.nodes.has(reviewKey(target)) ?? false;
  };

  const firstPending = (): ReviewTarget => {
    const id = derived.pendingIds.peek()[0];
    return id === undefined ? { level: 'proposal', id: null } : { level: 'change', id };
  };

  /**
   * The blob with what has not been written yet: `remember` runs on every arrow key, so it
   * keeps the result in memory and the write goes out grouped, one per frame (and immediately, on
   * closing the review). With nothing pending, it rereads the storage: what another tab wrote stays.
   */
  let pendingBlob: ResumeBlob | null = null;
  let resumeFrame: number | null = null;
  let resumeTimer: ReturnType<typeof setTimeout> | null = null;
  const currentBlob = (): ResumeBlob => pendingBlob ?? readBlob();
  const flushResume = () => {
    if (resumeFrame !== null && typeof cancelAnimationFrame === 'function')
      cancelAnimationFrame(resumeFrame);
    if (resumeTimer !== null) clearTimeout(resumeTimer);
    resumeFrame = null;
    resumeTimer = null;
    if (pendingBlob === null) return;
    const blob = pendingBlob;
    pendingBlob = null;
    writeBlob(blob);
  };
  const scheduleResumeWrite = () => {
    if (resumeFrame !== null || resumeTimer !== null) return;
    if (typeof requestAnimationFrame === 'function') {
      resumeFrame = requestAnimationFrame(flushResume);
      // A background tab pauses frames: the timer guarantees the write.
      resumeTimer = setTimeout(flushResume, 500);
    } else {
      resumeTimer = setTimeout(flushResume, 0);
    }
  };

  /**
   * Writes the point where the review is. Rereads the blob and replaces only this proposal's entry
   * in this copy (what another tab or another copy wrote stays). `known`: the conflicts that
   * become known; without it, those the entry already had. If `localStorage`
   * is blocked, the write is swallowed and the in-memory `seen` holds anyway.
   */
  const remember = (known?: readonly string[]) => {
    const id = proposalId.peek();
    if (id === null) return;
    const blob = currentBlob();
    const key = keyOf(scope, id);
    const entry: ReviewResume = {
      selected: selected.peek(),
      view: view.peek(),
      filters: filters.peek(),
      knownConflicts: known ?? blob.resume[key]?.knownConflicts ?? [],
    };
    pendingBlob = withEntry(blob, scope, key, entry);
    scheduleResumeWrite();
    mergeSeen(blob, id);
  };

  // A proposal deleted from outside closes the review; an external change that removes the selected item
  // from the proposal goes back to the first pending one.
  const stopWatching = effect(() => {
    const id = proposalId.value;
    if (id === null) return;
    const p = derived.proposal.value;
    if (p === null) {
      // Deleted from outside: does not leave a resume entry for a proposal that does not exist.
      pendingBlob = null;
      closeReview();
      return;
    }
    const target = selected.peek();
    if (target !== null && !exists(target, p)) selected.value = firstPending();
  });

  function closeReview() {
    if (proposalId.peek() === null) return;
    // Those the person knew about or saw announced on open become known
    // plus those it decided (deciding is proof it saw them); a conflict that appeared
    // during the review (external reload) and was left undecided comes back as new on the next
    // opening (P6). A proposal deleted from outside does not gain an entry (P11).
    const p = derived.proposal.peek();
    if (p) {
      const known = new Set([...knownAtOpen.peek(), ...conflictsAtOpen]);
      for (const id of derived.conflictIds.peek()) {
        if (p.decisions[id] !== undefined) known.add(id);
      }
      remember([...known].slice(0, MAX_KNOWN_CONFLICTS));
    }
    flushResume();
    batch(() => {
      proposalId.value = null;
      selected.value = null;
      knownAtOpen.value = NO_CONFLICTS;
      conflictsAtOpen = NO_CONFLICTS;
      staleDismissed.value = NO_CONFLICTS;
      supersededDismissed.value = false;
      undoable.value = null;
      markRequest.value = null;
      noteRequest.value = null;
      controlFocus = null;
      view.value = START_VIEW;
      filters.value = NO_FILTERS;
      store.setReviewing(null);
      // The swap comes back; the previous perspective does not reopen on its own.
      perspective.setLocked(false);
    });
  }

  const record = (
    id: string,
    result: DecisionResult,
    state: DecisionUndo['state'],
  ): DecisionResult => {
    if (result.ok && result.changed.length + result.cascaded.length > 0) {
      undoable.value = {
        proposalId: id,
        previous: result.previous,
        decisions: result.decisions,
        changed: result.changed,
        cascaded: result.cascaded,
        state,
      };
    }
    return result;
  };

  const withOpen = <T>(run: (id: string) => Promise<T>): Promise<T | null> => {
    const id = proposalId.peek();
    return id === null ? Promise.resolve(null) : run(id);
  };

  return {
    proposalId,
    selected,
    view,
    filters,
    seen,
    newConflicts,
    staleNotice,
    dismissStaleNotice() {
      staleDismissed.value = newConflicts.peek();
    },
    supersededDismissed,
    dismissSupersededNotice() {
      supersededDismissed.value = true;
    },
    undoable,
    markRequest,
    noteRequest,
    derived,
    components,

    open(id) {
      const p = proposals.get(id);
      if (!p) return { ok: false, error: 'unknown-proposal' };
      if (p.status === 'withdrawn') return { ok: false, error: 'withdrawn' };
      if (!store.committed.peek()) return { ok: false, error: 'no-project' };
      if (proposalId.peek() !== null && proposalId.peek() !== id) closeReview();
      // Reread now: another tab may have written after this one opened.
      const blob = currentBlob();
      const entry = blob.resume[keyOf(scope, id)];
      batch(() => {
        // The review shows only the Main one (decision 12): opens it and locks the swap.
        perspective.setLocked(true);
        proposalId.value = id;
        store.setReviewing(id);
        undoable.value = null;
        staleDismissed.value = NO_CONFLICTS;
        supersededDismissed.value = false;
      });
      const conflicts = derived.conflictIds.peek();
      // With no entry (first opening in this copy) there is nothing to compare with: nothing is new.
      const known: ReadonlySet<string> = entry
        ? new Set(entry.knownConflicts)
        : conflicts;
      // Conflicts in view on open are announced ("N new conflict(s)") and become
      // known on close; those that appear during the review, only if decided.
      conflictsAtOpen = conflicts;
      let target = entry?.selected ?? null;
      if (target === null || !exists(target, p)) target = firstPending();
      // Filters of an image or layer that no longer exist must not hide everything. The
      // layer counts if it exists in the current project or in the preview (created by the proposal).
      const savedFilters = entry?.filters ?? NO_FILTERS;
      const tree = derived.tree.peek();
      const layers = [
        ...(store.committed.peek()?.layers ?? []),
        ...(derived.preview.peek()?.project.layers ?? []),
      ];
      const cleanFilters: ReviewFilters = {
        ...savedFilters,
        imageId:
          savedFilters.imageId !== null &&
          (savedFilters.imageId === CANVAS_FILTER
            ? (tree?.changeIdsOf({ level: 'canvas', id: null }).length ?? 0) > 0
            : tree?.nodes.has(`image:${savedFilters.imageId}`))
            ? savedFilters.imageId
            : null,
        layerId:
          savedFilters.layerId !== null &&
          layers.some((l) => l.id === savedFilters.layerId)
            ? savedFilters.layerId
            : null,
      };
      batch(() => {
        selected.value = target;
        view.value = entry?.view ?? START_VIEW;
        filters.value = cleanFilters;
        knownAtOpen.value = known;
      });
      // Opening removes all this proposal's notices from the queue (new, revised, changed).
      proposals.dismissNotice(id);
      remember([...known].slice(0, MAX_KNOWN_CONFLICTS));
      return {
        ok: true,
        resumed: entry ? 'full' : 'none',
        newConflicts: newConflicts.peek().size,
      };
    },

    close: closeReview,

    select(target) {
      // A focus request applies to the change it names; going to another discards it.
      const pending = markRequest.peek();
      if (
        pending !== null &&
        !(target?.level === 'change' && target.id === pending.changeId)
      ) {
        markRequest.value = null;
      }
      const note = noteRequest.peek();
      if (note !== null && !(target?.level === 'change' && target.id === note.changeId)) {
        noteRequest.value = null;
      }
      if (sameTarget(selected.peek(), target)) return;
      selected.value = target;
      remember();
    },

    requestMark(changeId) {
      markRequest.value = { changeId, seq: ++markSeq };
    },

    clearMarkRequest() {
      markRequest.value = null;
    },

    requestNote(changeId) {
      noteRequest.value = { changeId, seq: ++markSeq };
    },

    clearNoteRequest() {
      noteRequest.value = null;
    },

    requestControlFocus(changeId, surface, control) {
      controlFocus = { changeId, surface, control };
    },

    takeControlFocus(changeId, surface) {
      const ask = controlFocus;
      if (!ask || ask.changeId !== changeId || ask.surface !== surface) return null;
      controlFocus = null;
      return ask.control;
    },

    setView(next) {
      if (view.peek() === next) return;
      view.value = next;
      remember();
    },

    setFilters(patch) {
      filters.value = { ...filters.peek(), ...patch };
      remember();
    },

    clearFilters() {
      if (!hasActiveFilters(filters.peek())) return;
      filters.value = NO_FILTERS;
      remember();
    },

    decide: (target, state) =>
      withOpen((id) =>
        proposalActions.decide(id, target, state).then((r) => record(id, r, state)),
      ).then((result) => result ?? NOT_OPEN),

    decideMany: (targets, state) =>
      withOpen(async (id) =>
        targets.length === 0
          ? ({ ok: false, error: 'unknown-target' } as const)
          : record(id, await proposalActions.decideMany(id, targets, state), state),
      ),

    decideVisible: (state) =>
      withOpen(async (id) => {
        const active = hasActiveFilters(filters.peek());
        const targets: ReviewTarget[] = active
          ? derived.visibleIds
              .peek()
              .map((changeId) => ({ level: 'change', id: changeId }))
          : [{ level: 'proposal', id: null }];
        if (targets.length === 0) return { ok: false, error: 'unknown-target' } as const;
        return record(id, await proposalActions.decideMany(id, targets, state), state);
      }),

    async undoLastDecision() {
      const last = undoable.peek();
      if (!last) return false;
      undoable.value = null;
      const result = await proposalActions.restoreDecisions(
        last.proposalId,
        last.previous,
        last.decisions,
      );
      return result.ok;
    },

    dismissUndo() {
      undoable.value = null;
    },

    addNote: (target, text) =>
      withOpen((id) => proposalActions.addNote(id, target, text)),
    editNote: (noteId, text) =>
      withOpen((id) => proposalActions.editNote(id, noteId, text)),
    removeNote: (noteId) => withOpen((id) => proposalActions.removeNote(id, noteId)),

    apply: () =>
      withOpen(async (id) => {
        // Applying closes what can be undone in the review: the project changes base.
        undoable.value = null;
        // Until the proposal says "applied" (or the apply is undone), the review does not
        // reevaluate: the project would already have the accepted ones and the proposal not yet. Hold it here, at the
        // click, before the apply enters the queue; the snapshot is of the earlier project.
        const release = derived.hold();
        try {
          return await proposalActions.applyAccepted(id);
        } finally {
          release();
        }
      }),

    async removeProposal(id) {
      // Inside the review the list does not even appear; the guard is for whoever calls through another path.
      if (proposalId.peek() !== null) return { ok: false, error: 'reviewing' };
      const result = await proposalActions.removeProposal(id);
      if (!result.ok) return result;
      // Forgets what this copy kept of the proposal: one with the same id that arrives later is
      // truly new, and the resume entry does not become orphaned in the blob.
      const blob = currentBlob();
      pendingBlob = null;
      const trimmed = withoutEntry(blob, keyOf(scope, id));
      if (trimmed) writeBlob(trimmed);
      if (seen.peek().has(id)) {
        const next = new Set(seen.peek());
        next.delete(id);
        seen.value = next;
      }
      return result;
    },

    step(kind, direction) {
      const visible = new Set(derived.visibleIds.peek());
      const candidates =
        kind === 'pending'
          ? derived.pendingIds.peek().filter((id) => visible.has(id))
          : [...derived.conflictIds.peek()].filter((id) => visible.has(id));
      const order = derived.order.peek();
      const sorted = [...candidates].sort(
        (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0),
      );
      const current = selected.peek();
      const tree = derived.tree.peek();
      // From an item or image, starts at its first change.
      const from =
        current === null
          ? null
          : current.level === 'change'
            ? current.id
            : (tree?.changeIdsOf(current)[0] ?? null);
      const next = stepChange(sorted, order, from, direction);
      if (next === null) return null;
      const target: ReviewTarget = { level: 'change', id: next };
      selected.value = target;
      remember();
      return target;
    },

    dispose() {
      stopWatching();
      closeReview();
      flushResume();
      components.dispose();
    },
  };
}
