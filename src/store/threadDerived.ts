import { computed, signal, type ReadonlySignal } from '@preact/signals';
import {
  awaiting,
  backlinks,
  citedItemIds,
  citedTargets,
  filterThreads,
  hostOf,
  isUnread,
  pinGroups,
  proposalThreads,
  resolveAnchor,
  threadUsers,
  type AnchorResolution,
  type CitationContext,
  type CitationProposal,
  type PinGroup,
  type Project,
  type Thread,
  type ThreadUser,
} from '../model';
import type { Identity } from './identity';
import { lastReadAt, threadReads } from './threadReads';
import { selectedThreadId } from './threadUi';
import type { EditorUi } from './ui';

// Derived thread state (Comments stage): the Comments window, the Threads section of the
// Details and the status bar read from here, without recomputing. It depends only on the
// threads, the project in view, the identity and the window filters; pan and zoom do not go
// through here.

/** A thread with its place in the project in view. */
export interface ThreadEntry {
  readonly thread: Thread;
  readonly resolution: AnchorResolution;
}

export interface ThreadSources {
  readonly threads: ReadonlySignal<readonly Thread[]>;
  /** The project copy (where the "read" mark is kept); `null` outside a session. */
  readonly copyId: string | null;
  readonly identity: ReadonlySignal<Identity | null>;
  /** The loaded proposals (id and title), to resolve the citations; without them, none. */
  readonly proposals?: ReadonlySignal<readonly CitationProposal[]>;
}

export interface ThreadDerived {
  /** All threads (open and resolved), newest first, with the anchor resolved. */
  readonly entries: ReadonlySignal<readonly ThreadEntry[]>;
  /** Threads by the item that hosts them (marking, container or arrow), with those of its parts. */
  readonly byItem: ReadonlySignal<ReadonlyMap<string, readonly ThreadEntry[]>>;
  readonly openCount: ReadonlySignal<number>;
  readonly awaitingAgentCount: ReadonlySignal<number>;
  readonly awaitingHumanCount: ReadonlySignal<number>;
  readonly resolvedCount: ReadonlySignal<number>;
  /** Ids of the threads with an unread message (decision 16). */
  readonly unreadIds: ReadonlySignal<ReadonlySet<string>>;
  /**
   * Groups of the canvas pins (decision 24), one per item that hosts the anchor: with the pins
   * on, the open threads and the selected resolved one; off, only the selected one. It does
   * not depend on the viewport (pan and zoom do not recompute them).
   */
  readonly pins: ReadonlySignal<readonly PinGroup[]>;
  /** Users of the threads (User filter). */
  readonly users: ReadonlySignal<readonly ThreadUser[]>;
  /** The window rows: the threads after the status, user, search and selection filters. */
  readonly rows: ReadonlySignal<readonly ThreadEntry[]>;
  /**
   * "Cited in" (decision 33): for each thread cited by another, the ids of the ones that cite
   * it (open and resolved).
   */
  readonly citedIn: ReadonlySignal<ReadonlyMap<string, readonly string[]>>;
  /** Proposal → the first thread that linked it (decision 36). */
  readonly proposalThreads: ReadonlySignal<ReadonlyMap<string, string>>;
}

const NO_SOURCES: ThreadSources = {
  threads: signal<readonly Thread[]>([]),
  copyId: null,
  identity: signal<Identity | null>(null),
};

export const NO_THREAD_SOURCES = NO_SOURCES;

const NO_PINS: readonly PinGroup[] = [];
const NO_PROPOSALS = signal<readonly CitationProposal[]>([]);

/** The item (marking, container or arrow) where the thread lives, if any. */
export function itemHostId(entry: ThreadEntry, project: Project): string | null {
  const host = hostOf(project, entry.thread.anchor);
  return host !== null && host.kind !== 'point' ? host.id : null;
}

export function createThreadDerived(
  project: ReadonlySignal<Project | null>,
  ui: EditorUi,
  sources: ThreadSources = NO_SOURCES,
): ThreadDerived {
  const entries = computed((): readonly ThreadEntry[] => {
    const p = project.value;
    if (!p) return [];
    return sources.threads.value.map((thread) => ({
      thread,
      resolution: resolveAnchor(p, thread.anchor),
    }));
  });

  const byItem = computed(() => {
    const map = new Map<string, ThreadEntry[]>();
    for (const entry of entries.value) {
      const r = entry.resolution;
      if (r.orphan || r.host === null || r.host.kind === 'point') continue;
      const list = map.get(r.host.id);
      if (list) list.push(entry);
      else map.set(r.host.id, [entry]);
    }
    return map as ReadonlyMap<string, readonly ThreadEntry[]>;
  });

  const count = (test: (t: Thread) => boolean) =>
    computed(() => sources.threads.value.filter(test).length);

  const unreadIds = computed((): ReadonlySet<string> => {
    const me = sources.identity.value;
    // Reading the blob here makes the "unread" state update when `markThreadRead` writes.
    void threadReads.value;
    const copy = sources.copyId;
    const ids = new Set<string>();
    for (const t of sources.threads.value) {
      const read = copy === null ? null : lastReadAt(copy, t.id);
      if (isUnread(t, read, me)) ids.add(t.id);
    }
    return ids;
  });

  const users = computed(() => threadUsers(sources.threads.value));

  const pins = computed((): readonly PinGroup[] => {
    const p = project.value;
    if (!p) return NO_PINS;
    const selected = selectedThreadId(ui);
    const all = sources.threads.value;
    const threads = ui.commentPins.value ? all : all.filter((t) => t.id === selected);
    if (threads.length === 0) return NO_PINS;
    const unread = unreadIds.value;
    return pinGroups(p, threads, {
      selectedThreadId: selected,
      unread: (t) => unread.has(t.id),
    });
  });

  const citedIn = computed(() => backlinks(sources.threads.value));
  const proposalThreadMap = computed(() => proposalThreads(sources.threads.value));

  // The items each thread cites (the selection filter): it depends only on the project, the
  // threads and the proposals, so pan, zoom and selection changes do not recompute it. Lazy:
  // it only runs with the filter on.
  const citesByThread = computed((): ReadonlyMap<string, readonly string[]> => {
    const p = project.value;
    const map = new Map<string, readonly string[]>();
    if (!p) return map;
    const threads = sources.threads.value;
    const ctx: CitationContext = {
      project: p,
      threads,
      proposals: (sources.proposals ?? NO_PROPOSALS).value,
    };
    for (const thread of threads) {
      const ids = citedItemIds(citedTargets(thread, ctx));
      if (ids.length > 0) map.set(thread.id, ids);
    }
    return map;
  });

  const rows = computed((): readonly ThreadEntry[] => {
    const p = project.value;
    if (!p) return [];
    const user = ui.commentsUser.value;
    const selected = ui.commentsCiteSelection.value ? ui.selection.value : null;
    const kept = filterThreads(
      entries.value.map((e) => e.thread),
      p,
      {
        status: ui.commentsStatus.value,
        ...(user === '' ? {} : { user }),
        text: ui.commentsText.value,
        ...(selected === null
          ? {}
          : { selection: { itemId: selected.id, cites: citesByThread.value } }),
      },
    );
    const keep = new Set(kept.map((t) => t.id));
    return entries.value.filter((e) => keep.has(e.thread.id));
  });

  return {
    entries,
    byItem,
    openCount: count((t) => t.resolved === null),
    awaitingAgentCount: count((t) => awaiting(t) === 'agent'),
    awaitingHumanCount: count((t) => awaiting(t) === 'human'),
    resolvedCount: count((t) => t.resolved !== null),
    unreadIds,
    pins,
    users,
    rows,
    citedIn,
    proposalThreads: proposalThreadMap,
  };
}
