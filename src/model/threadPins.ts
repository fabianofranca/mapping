import { firstThreadMessage, type Thread } from './thread';
import { initials } from './threadUsers';
import { awaiting, hostKey, hostOf, type ThreadHost } from './threadView';
import type { Project } from './types';

// Canvas pins (decision 24): one pin per item that hosts the anchor, not by proximity. The
// model only groups and decides color, label and "unread"; showing or not (Threads button,
// clean View, review) is interface state.

/** Pin color, from most to least urgent: awaiting human, awaiting agent, resolved. */
export type PinColor = 'awaitingHuman' | 'awaitingAgent' | 'resolved';

export interface PinGroup {
  readonly hostKey: string;
  readonly host: ThreadHost;
  /** Ids of the group's threads, in input order. */
  readonly threadIds: readonly string[];
  readonly count: number;
  readonly color: PinColor;
  /** Initials of who opened the thread (only with one thread; otherwise `null`). */
  readonly initials: string | null;
  /** Messages of the thread (only with one thread; otherwise `null`). */
  readonly messages: number | null;
  /** `"MA 3"` (initials and messages) with one thread; the count (`"3"`) with several. */
  readonly label: string;
  readonly hasUnread: boolean;
}

export interface PinGroupOptions {
  /** The selected thread: it is the only resolved one that gets a pin. */
  readonly selectedThreadId: string | null;
  readonly unread: (thread: Thread) => boolean;
}

const URGENCY: Record<PinColor, number> = {
  awaitingHuman: 3,
  awaitingAgent: 2,
  resolved: 1,
};

function colorOf(thread: Thread): PinColor {
  const waiting = awaiting(thread);
  if (waiting === 'human') return 'awaitingHuman';
  return waiting === 'agent' ? 'awaitingAgent' : 'resolved';
}

function describeGroup(
  hostKeyValue: string,
  host: ThreadHost,
  members: readonly Thread[],
  unread: (t: Thread) => boolean,
): PinGroup {
  const color = members
    .map(colorOf)
    .reduce((best, c) => (URGENCY[c] > URGENCY[best] ? c : best));
  const only = members.length === 1 ? members[0] : undefined;
  const author = only ? firstThreadMessage(only)?.author : undefined;
  const who = author ? initials(author) : null;
  const messages = only ? only.messages.length : null;
  return {
    hostKey: hostKeyValue,
    host,
    threadIds: members.map((t) => t.id),
    count: members.length,
    color,
    initials: who,
    messages,
    label:
      who !== null && messages !== null ? `${who} ${messages}` : String(members.length),
    hasUnread: members.some(unread),
  };
}

/**
 * Pin groups per host item. Open threads and the selected resolved one are included; layer,
 * orphan and ownerless annotation have no pin. The order is that of the first thread of each
 * group in the input.
 */
export function pinGroups(
  project: Project,
  threads: readonly Thread[],
  options: PinGroupOptions,
): readonly PinGroup[] {
  const groups = new Map<string, { host: ThreadHost; members: Thread[] }>();
  for (const t of threads) {
    if (t.resolved !== null && t.id !== options.selectedThreadId) continue;
    const host = hostOf(project, t.anchor);
    if (host === null) continue;
    const key = hostKey(host);
    const group = groups.get(key);
    if (group) group.members.push(t);
    else groups.set(key, { host, members: [t] });
  }
  return [...groups].map(([key, g]) =>
    describeGroup(key, g.host, g.members, options.unread),
  );
}
