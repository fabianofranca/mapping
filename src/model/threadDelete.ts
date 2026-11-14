import type { Thread, ThreadAuthorKind } from './thread';
import { normalizeEmail, userKey, userLabel } from './threadUsers';
import { lastMessage, type ThreadViewer } from './threadView';

// Deleting threads (decision 23): what goes away and whose it is. Only a person deletes; the
// dialog lists each author's messages, and a thread is deleted directly only when it is
// entirely the person's own.

export interface DeleteAuthorCount {
  readonly key: string;
  readonly label: string;
  readonly kind: ThreadAuthorKind;
  readonly count: number;
}

export interface MessageSummary {
  readonly messages: number;
  /** Most messages first; ties broken by name. */
  readonly authors: readonly DeleteAuthorCount[];
}

export interface DeleteImpact extends MessageSummary {
  /** How many threads go away. */
  readonly threads: number;
  /** Every message is from a person with the email of `me`: deletes without a dialog. */
  readonly direct: boolean;
}

function summarize(threads: readonly Thread[]): MessageSummary {
  const authors = new Map<string, DeleteAuthorCount>();
  let messages = 0;
  for (const t of threads) {
    for (const m of t.messages) {
      messages += 1;
      const key = userKey(m.author);
      const prev = authors.get(key);
      authors.set(key, {
        key,
        label: userLabel(m.author),
        kind: m.author.kind,
        count: (prev?.count ?? 0) + 1,
      });
    }
  }
  const sorted = [...authors.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
  return { messages, authors: sorted };
}

/** What is lost when deleting one or several threads, and whether they can be deleted directly. */
export function deleteImpact(
  threads: Thread | readonly Thread[],
  me: ThreadViewer | null,
): DeleteImpact {
  const list: readonly Thread[] = Array.isArray(threads) ? threads : [threads as Thread];
  const summary = summarize(list);
  const mine = normalizeEmail(me?.email);
  const direct =
    mine !== '' &&
    summary.messages > 0 &&
    list.every((t) =>
      t.messages.every(
        (m) => m.author.kind === 'human' && normalizeEmail(m.author.email) === mine,
      ),
    );
  return { ...summary, threads: list.length, direct };
}

export interface BulkDeleteCriteria {
  /** "Only resolved" (checked by default in the interface). */
  readonly onlyResolved: boolean;
  /** "With the last message before": ISO 8601 or a date (`2026-11-01`). Invalid: none. */
  readonly lastMessageBefore?: string;
}

export interface BulkDeleteCandidates extends MessageSummary {
  readonly threads: readonly Thread[];
}

function isBefore(thread: Thread, limit: number): boolean {
  const last = lastMessage(thread);
  return last !== null && Date.parse(last.at) < limit;
}

/**
 * The threads that "Delete threads…" would take, with the aggregated impact (authors and
 * counts). The criteria are only these two; the window's filter does not apply. An invalid date
 * deletes nothing.
 */
export function bulkDeleteCandidates(
  threads: readonly Thread[],
  criteria: BulkDeleteCriteria,
): BulkDeleteCandidates {
  const limit =
    criteria.lastMessageBefore === undefined
      ? null
      : Date.parse(criteria.lastMessageBefore);
  const picked = threads.filter(
    (t) =>
      (!criteria.onlyResolved || t.resolved !== null) &&
      (limit === null || isBefore(t, limit)),
  );
  return { threads: picked, ...summarize(picked) };
}
