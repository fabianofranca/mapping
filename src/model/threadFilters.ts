import { projectIndex } from './projectIndex';
import type { Thread, ThreadAnchor } from './thread';
import { userKey } from './threadUsers';
import { awaiting } from './threadView';
import type { Project } from './types';
import { fold } from './fold';

// Filters of the Comments window (decisions 21 and 34): status, user, text and "cites the selection".
// The interface default status is `open`, but the function requires the status explicitly.

export type ThreadStatusFilter =
  'all' | 'open' | 'awaitingAgent' | 'awaitingHuman' | 'resolved';

/**
 * "Only the ones that cite the selection" (decision 34): the selected item (marking, container or arrow) and,
 * per thread, the ids of the targets it cites. The cited id is that of the item or of the annotation that
 * contains the cited part (field, pair, row); the citations come from whoever extracts them from the messages.
 */
export interface ThreadSelectionFilter {
  readonly itemId: string;
  readonly cites: ReadonlyMap<string, readonly string[]>;
}

export interface ThreadFilter {
  readonly status: ThreadStatusFilter;
  /** Key of `userKey`: some message of the thread is from that user. */
  readonly user?: string;
  /** All the words, ignoring case and accents, in the text of the messages. */
  readonly text?: string;
  readonly selection?: ThreadSelectionFilter;
}

function matchesStatus(thread: Thread, status: ThreadStatusFilter): boolean {
  switch (status) {
    case 'all':
      return true;
    case 'resolved':
      return thread.resolved !== null;
    case 'open':
      return thread.resolved === null;
    case 'awaitingAgent':
      return awaiting(thread) === 'agent';
    default:
      return awaiting(thread) === 'human';
  }
}

function matchesText(thread: Thread, words: readonly string[]): boolean {
  if (words.length === 0) return true;
  const haystack = fold(thread.messages.map((m) => m.text).join('\n'));
  return words.every((w) => haystack.includes(w));
}

function anchoredIn(
  anchor: ThreadAnchor,
  itemId: string,
  annotationIds: ReadonlySet<string>,
): boolean {
  switch (anchor.kind) {
    case 'marking':
    case 'container':
    case 'arrow':
      return anchor.id === itemId;
    case 'annotation':
      return annotationIds.has(anchor.id);
    case 'field':
    case 'entry':
    case 'row':
      return annotationIds.has(anchor.annotationId);
    default:
      return false;
  }
}

/** The item and its annotations (the parts: fields, pairs and rows live in them). */
function selectionTargets(project: Project, itemId: string): ReadonlySet<string> {
  const owned = projectIndex(project).annotationsByMarking.get(itemId) ?? [];
  return new Set([itemId, ...owned.map((a) => a.id)]);
}

function selectionMatcher(
  project: Project,
  selection: ThreadSelectionFilter,
): (t: Thread) => boolean {
  const targets = selectionTargets(project, selection.itemId);
  return (t) =>
    anchoredIn(t.anchor, selection.itemId, targets) ||
    (selection.cites.get(t.id) ?? []).some((id) => targets.has(id));
}

/** Applies the filters together (AND), keeping the input order. */
export function filterThreads(
  threads: readonly Thread[],
  project: Project,
  filter: ThreadFilter,
): readonly Thread[] {
  const words = fold(filter.text ?? '')
    .split(/\s+/)
    .filter(Boolean);
  const inSelection = filter.selection
    ? selectionMatcher(project, filter.selection)
    : null;
  return threads.filter(
    (t) =>
      matchesStatus(t, filter.status) &&
      (filter.user === undefined ||
        t.messages.some((m) => userKey(m.author) === filter.user)) &&
      matchesText(t, words) &&
      (inSelection === null || inSelection(t)),
  );
}
