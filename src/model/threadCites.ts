import type { CitationTarget } from './citations';
import type { Thread } from './thread';

// Thread links that the interface shows (Comments stage, CM5): which canvas items a thread
// cites (the "only those that cite the selection" filter, decision 34) and the thread that
// linked each proposal (the "from the thread" line of the Proposals window, decision 36). Pure.

/**
 * The ids that the selection filter compares: the item's (marking, container or arrow) or that of
 * the annotation holding the cited part (field, pair and row). Layer, thread and proposal are not
 * canvas items and are left out. Keeps the order and does not repeat.
 */
export function citedItemIds(targets: readonly CitationTarget[]): string[] {
  const ids = new Set<string>();
  for (const target of targets) {
    switch (target.kind) {
      case 'marking':
      case 'container':
      case 'arrow':
      case 'annotation':
        ids.add(target.id);
        break;
      case 'field':
      case 'entry':
      case 'row':
        ids.add(target.annotationId);
        break;
      default:
        break;
    }
  }
  return [...ids];
}

/**
 * For each proposal linked to some message (`message.proposal`), the thread that linked it
 * first: the one with the oldest message.
 */
export function proposalThreads(threads: readonly Thread[]): ReadonlyMap<string, string> {
  const firstAt = new Map<string, string>();
  const result = new Map<string, string>();
  for (const thread of threads) {
    for (const m of thread.messages) {
      if (m.proposal === null) continue;
      const seen = firstAt.get(m.proposal);
      if (seen === undefined || m.at < seen) {
        firstAt.set(m.proposal, m.at);
        result.set(m.proposal, thread.id);
      }
    }
  }
  return result;
}
