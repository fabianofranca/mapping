import { computed, effect, signal, type ReadonlySignal } from '@preact/signals';
import {
  changeStatus,
  previewProject,
  projectIndex,
  quickReviewOf,
  visibleRevisedChanges,
  type Project,
  type Proposal,
} from '../model';
import type { QuickAcceptResult } from './proposalActions';
import type { ProjectSession } from './session';
import { openToolWindows, type ToolWindowId } from './toolWindows';
import type { EditorUi } from './ui';

// The quick review on the canvas (stage #1932, QR1, decisions 1 and 3 to 5, 8): which proposal of
// the open conversation shows as a ghost, why Accept is blocked and what Reject does on this
// device. UI state only: Accept goes through `ProposalActions.quickAccept`, and Reject writes
// nothing. The canvas, the bar and the card read `current` (phases QR2 and QR3).

/** Why Accept is not offered (decision 4): the ghost stays and only Review… does. */
export type QuickBlock =
  /** A live change no longer matches the project (the `changeStatus` conflict). */
  | 'conflict'
  /** A change touches a locked item. */
  | 'locked'
  /** The last Accept was refused with this error, and neither the proposal nor the project changed since. */
  | 'blocked'
  | 'stale'
  | 'revised';

export interface QuickReviewView {
  readonly proposal: Proposal;
  /** The conversation that links it. */
  readonly threadId: string;
  /** The container (`null`: the canvas) where the markings are. */
  readonly spaceId: string | null;
  /** Ids of the markings the proposal creates. */
  readonly created: readonly string[];
  /** Ids of the existing markings it changes. */
  readonly changed: readonly string[];
  /** Changes the agent revised that the person has not decided (the "Revised" flag). */
  readonly revised: number;
  /** The project as it would be, from the committed project (never the gesture preview). */
  readonly preview: Project;
  readonly blocked: QuickBlock | null;
}

export interface QuickReviewState {
  /** The quick review to show now, or `null`. */
  readonly current: ReadonlySignal<QuickReviewView | null>;
  /** Accept is running: the ghost is hidden so it never shows next to the applied marking. */
  readonly accepting: ReadonlySignal<boolean>;
  /**
   * Accepts the current quick review (`ProposalActions.quickAccept`). `null` when there is none.
   * A refusal with `blocked`, `stale` or `revised` is kept as the bar's reason line.
   */
  accept(): Promise<QuickAcceptResult | null>;
  /** Stops the effect that clears the Reject entries of revised proposals. */
  dispose(): void;
}

export interface QuickReviewDeps {
  readonly session: ProjectSession;
  readonly ui: EditorUi;
  /** The proposal open in the review (`null`: none). The quick review is off during a review. */
  readonly reviewOpen: ReadonlySignal<string | null>;
  /** The open tool windows (tests inject it). */
  readonly windows?: ReadonlySignal<ReadonlySet<ToolWindowId>>;
}

/** Reject on this device: hides the ghost until the proposal gets a new revision. Writes nothing. */
export function dismissQuick(ui: EditorUi, proposalId: string, revisions: number): void {
  ui.quickDismissed.value = new Map(ui.quickDismissed.peek()).set(proposalId, revisions);
}

/** "Show on the canvas": brings back a ghost rejected on this device. */
export function showQuickAgain(ui: EditorUi, proposalId: string): void {
  const current = ui.quickDismissed.peek();
  if (!current.has(proposalId)) return;
  const next = new Map(current);
  next.delete(proposalId);
  ui.quickDismissed.value = next;
}

const revisionsOf = (p: Proposal): number => p.revisions?.length ?? 0;

/** Rejected on this device, and not revised since. */
const isDismissed = (ui: EditorUi, p: Proposal): boolean =>
  ui.quickDismissed.value.get(p.id) === revisionsOf(p);

/** The proposal the latest message with a proposal links, in the conversation the window shows. */
function linkedProposal(
  ui: EditorUi,
  session: ProjectSession,
): { readonly threadId: string; readonly proposal: Proposal } | null {
  const target = ui.conversation.value;
  if (target?.kind !== 'thread') return null;
  const thread = session.threads.list.value.find((t) => t.id === target.id);
  const id =
    [...(thread?.messages ?? [])].reverse().find((m) => m.proposal !== null)?.proposal ??
    null;
  if (id === null) return null;
  const proposal = session.proposals.list.value.find((p) => p.id === id);
  return proposal ? { threadId: target.id, proposal } : null;
}

/** Why Accept is blocked by the project alone: a conflict, then a lock. */
function projectBlock(p: Proposal, project: Project): 'conflict' | 'locked' | null {
  const statuses = p.changes.map((c) => changeStatus(p, c, project));
  if (statuses.some((s) => s.conflict)) return 'conflict';
  if (statuses.some((s) => s.locked)) return 'locked';
  return null;
}

interface Refused {
  readonly proposal: Proposal | undefined;
  readonly project: Project | null;
  readonly error: 'blocked' | 'stale' | 'revised';
}

export function createQuickReview(deps: QuickReviewDeps): QuickReviewState {
  const { session, ui } = deps;
  const windows = deps.windows ?? openToolWindows;
  const { store } = session;
  const accepting = signal(false);
  const refused = signal<Refused | null>(null);

  /** Decision 3: a review open, a read-only project, view mode or a perspective other than Main. */
  const off = (): boolean =>
    deps.reviewOpen.value !== null ||
    store.readOnly.value ||
    ui.viewMode.value ||
    session.perspective.id.value !== null;

  // The proposal that could show and what it needs: nothing here reads `store.project`, so a
  // gesture preview does not recompute it.
  const candidate = computed(() => {
    if (!windows.value.has('conversation') || off()) return null;
    const linked = linkedProposal(ui, session);
    const project = store.committed.value;
    if (!linked || !project) return null;
    if (isDismissed(ui, linked.proposal)) return null;
    const eligibility = quickReviewOf(linked.proposal, project);
    if (!eligibility.ok) return null;
    return { ...linked, eligibility, project };
  });

  // Memoized by the committed project and the proposal: the only inputs of `candidate`.
  const preview = computed(() => {
    const c = candidate.value;
    return c ? previewProject(c.project, c.proposal).project : null;
  });

  const onOpenPage = (touched: readonly string[], project: Project, pageId: string) => {
    const pageOf = projectIndex(project).pageOf;
    return touched.every((id) => pageOf.get(id) === pageId);
  };

  const current = computed((): QuickReviewView | null => {
    const c = candidate.value;
    const shown = preview.value;
    if (!c || !shown || accepting.value) return null;
    const { created, changed, spaceId } = c.eligibility;
    if (!onOpenPage([...created, ...changed], shown, session.page.id.value)) return null;
    const last = refused.value;
    const refusal =
      last && last.proposal === c.proposal && last.project === c.project
        ? last.error
        : null;
    return {
      proposal: c.proposal,
      threadId: c.threadId,
      spaceId,
      created,
      changed,
      revised: visibleRevisedChanges(c.proposal).length,
      preview: shown,
      blocked: projectBlock(c.proposal, c.project) ?? refusal,
    };
  });

  // A new revision of a proposal rejected on this device brings the ghost back (decision 8): its
  // entry goes away. `candidate` already ignores an entry with another revision count.
  const stopClearing = effect(() => {
    const dismissed = ui.quickDismissed.value;
    if (dismissed.size === 0) return;
    let next: Map<string, number> | null = null;
    for (const [id, revisions] of dismissed) {
      const p = session.proposals.list.value.find((x) => x.id === id);
      if (p && revisionsOf(p) !== revisions) (next ??= new Map(dismissed)).delete(id);
    }
    if (next) ui.quickDismissed.value = next;
  });

  return {
    current,
    accepting,
    async accept() {
      const view = current.peek();
      // Blocked by a conflict or a lock: only Review… is offered (decision 4).
      if (!view || view.blocked === 'conflict' || view.blocked === 'locked') return null;
      accepting.value = true;
      try {
        const result = await session.proposalActions.quickAccept(view.proposal.id);
        const error = result.ok ? null : result.error;
        if (error === 'blocked' || error === 'stale' || error === 'revised') {
          // The session may have adopted a newer proposal file: the reason belongs to that one.
          refused.value = {
            proposal: session.proposals.get(view.proposal.id) ?? undefined,
            project: store.committed.peek(),
            error,
          };
        } else {
          refused.value = null;
        }
        return result;
      } finally {
        accepting.value = false;
      }
    },
    dispose: stopClearing,
  };
}
