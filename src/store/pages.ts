import {
  batch,
  computed,
  effect,
  signal,
  type ReadonlySignal,
  type Signal,
} from '@preact/signals';
import { z } from 'zod';
import { projectIndex, type Page, type Project } from '../model';
import { readSetting, writeSetting } from '../utils/safeStorage';
import type { HistoryStep, ProjectStore } from './history';
import { pageOfChange } from './pageChange';
import { perspectiveRootsOnPage } from './perspectiveShown';
import { openPerspectiveIn } from './perspectives';

// The open page in the store (stage #883, PG2, decision 5). CONTRACT shared by the fronts of the
// phase: the session creates the state (`createPageState`), the project actions read the open page
// through `openId()`, the derived state builds the project in view from `id`.
//
// - The open page is UI state (it does not enter undo and writes nothing to the project). It is kept
//   in this browser by `project.id` (localStorage, through `safeStorage`), like the open perspective.
// - It is always a page of the committed project: if the open one stops existing (deleted, undone,
//   external reload) the first page opens, with the `removed` notice. The one exception is the
//   review (stage #2177, PF3, decision 13): while the Proposed view of an open proposal is shown, the
//   review hands the preview over (`setProposed`) and a page that only the proposal creates can be
//   opened. That choice is never kept (`mapping.openPage`) and, when the preview goes away (the
//   Current view, exiting the review), the page that was open before comes back, with no notice.

/** What the interface tells about the pages; it shows the notice and clears it. */
export type PageNotice =
  /** The open page disappeared (deleted here, undone, or an external reload). */
  | { readonly kind: 'removed'; readonly name: string }
  /** Roots went to another page and the app stayed here: `pageId` is the destination. */
  | { readonly kind: 'moved'; readonly pageId: string; readonly name: string }
  /** An undo whose whole change is on another page (`name`); the open page did not change. */
  | { readonly kind: 'undone'; readonly name: string }
  /** A redo whose whole change is on another page (`name`); the open page did not change. */
  | { readonly kind: 'redone'; readonly name: string };

export interface PageState {
  /**
   * The open page: a page of the committed project, or (only in the review's Proposed view) a page
   * the proposal creates. Write only through `open`.
   */
  readonly id: ReadonlySignal<string>;
  /** The open id without tracking (for the actions, inside operations). */
  openId(): string;
  /**
   * Opens the page. Refuses (`false`) an id the project does not have (nor the review's preview, in
   * its Proposed view). Outside undo; kept in this browser, except a page only the proposal creates.
   */
  open(id: string): boolean;
  /**
   * The review hands over the project the Proposed view shows ("as it would be"), or `null` in the
   * Current view and outside the review. Its pages become openable (decision 13); when it goes away
   * a page only it had stops being the open one and the one before comes back, with no notice.
   */
  setProposed(project: Project | null): void;
  /** The pages of the view being shown (the Page menu): the preview's in the Proposed view, else the committed ones. */
  readonly pages: ReadonlySignal<readonly Page[]>;
  /** The ids of the pages only the proposal creates (empty outside the review's Proposed view). */
  readonly createdByProposal: ReadonlySignal<ReadonlySet<string>>;
  /**
   * The page `pageId` is about to be deleted on purpose (the delete dialog): when it is the open
   * one, the move to the first page skips the `removed` notice, once. `null` takes it back; any
   * other change to the project also clears it.
   */
  expectRemoval(pageId: string | null): void;
  /** Last notice about the pages; the interface shows it and clears it (`notice.value = null`). */
  readonly notice: Signal<PageNotice | null>;
  /** The roots of each page in the Completa of the view being shown, by page id (the page picker's count). */
  readonly rootCounts: ReadonlySignal<ReadonlyMap<string, number>>;
  /** The roots each perspective shows on the OPEN page, by perspective id (the perspective picker's count). */
  readonly perspectiveCounts: ReadonlySignal<ReadonlyMap<string, number>>;
  /** The open perspective has no root on the open page ("Nothing from this perspective on this page"). */
  readonly perspectiveEmpty: ReadonlySignal<boolean>;
}

/** The page state plus what the session needs internally. */
export interface PageStateHandle extends PageState {
  /** Tells the interface that roots went to `pageId` (the `moved` notice). */
  announceMoved(pageId: string): void;
  /** An undo or redo happened: says "Undone/Redone on <page>" when the whole change is on another page. */
  noteStep(step: HistoryStep): void;
  /** Stops observing the project (closing the session). */
  dispose(): void;
}

export interface PageStateDeps {
  readonly store: ProjectStore;
  /** `project.id` of the open project: keys the kept choice. */
  readonly projectId: string;
  /** The open perspective's id (`session.perspective.id`; `null` = Completa); without it, always the Completa. */
  readonly perspectiveId?: ReadonlySignal<string | null>;
}

// ---------------------------------------------------------------------------
// The open page, kept in this browser

const OPEN_KEY = 'mapping.openPage';
const OPEN_VERSION = 1;
/** Projects with the open page kept (the most recent ones), in the mold of `perspectives.ts`. */
const MAX_PROJECTS = 20;

const openSchema = z.object({ id: z.string().min(1), name: z.string() });
type StoredOpen = z.infer<typeof openSchema>;
type OpenBlob = Readonly<Record<string, StoredOpen>>;

/** Reads the blob from `localStorage`; corrupted text, another version or an invalid entry vanish. */
function readOpenBlob(): OpenBlob {
  const text = readSetting(OPEN_KEY);
  if (text === null) return {};
  try {
    const parsed = z
      .object({ v: z.literal(OPEN_VERSION), open: z.record(z.string(), z.unknown()) })
      .safeParse(JSON.parse(text));
    if (!parsed.success) return {};
    const out: Record<string, StoredOpen> = {};
    for (const [scope, value] of Object.entries(parsed.data.open)) {
      const entry = openSchema.safeParse(value);
      if (entry.success) out[scope] = entry.data;
    }
    return out;
  } catch {
    return {};
  }
}

/** Keeps this project's choice (the most recently written goes last). */
function writeOpen(projectId: string, entry: StoredOpen): void {
  const others = Object.entries(readOpenBlob()).filter(([key]) => key !== projectId);
  const next = [...others, [projectId, entry] as const];
  writeSetting(
    OPEN_KEY,
    JSON.stringify({
      v: OPEN_VERSION,
      open: Object.fromEntries(next.slice(-MAX_PROJECTS)),
    }),
  );
}

const NO_PAGES: ReadonlySet<string> = new Set();

/** The name of the page `id` in `p`, or `null` if `p` does not have it. */
function nameOf(p: Project | null, id: string): string | null {
  return p?.pages.find((g) => g.id === id)?.name ?? null;
}

// ---------------------------------------------------------------------------
// The state

/**
 * Creates the page state of a session. It is born from the choice kept for the `project.id` (if
 * that page is gone, the first one opens with the `removed` notice); an `effect` over the committed
 * project takes to the first page, with the notice, whoever was on a page that ceased to exist
 * (deleted here, undone or in an external reload) and keeps the kept name up to date on rename.
 */
export function createPageState(deps: PageStateDeps): PageStateHandle {
  const { store, projectId } = deps;
  const first = store.committed.peek()?.pages[0];
  const chosen = signal<string>(first?.id ?? '');
  const notice = signal<PageNotice | null>(null);
  /** The project the review's Proposed view shows; `null` outside it (decision 13). */
  const proposed = signal<Project | null>(null);
  /** The page of `proposed` the person opened that the committed project lacks; never kept. */
  const proposedChoice = signal<string | null>(null);
  /** The name of the open one the last time the project had it (for the `removed` notice). */
  let knownName = first?.name ?? '';
  /** The page whose next removal is deliberate (`expectRemoval`); every change of the project clears it. */
  let expected: string | null = null;

  const saved = readOpenBlob()[projectId];
  if (saved !== undefined) {
    const name = nameOf(store.committed.peek(), saved.id);
    if (name !== null) {
      chosen.value = saved.id;
      knownName = name;
    } else {
      notice.value = { kind: 'removed', name: saved.name };
      if (first !== undefined) writeOpen(projectId, { id: first.id, name: first.name });
    }
  }

  // Never a page the project does not have, not even for the instant before the effect moves it.
  const id = computed((): string => {
    const p = store.committed.value;
    const extra = proposedChoice.value;
    if (extra !== null && proposed.value?.pages.some((g) => g.id === extra)) return extra;
    const wanted = chosen.value;
    if (p === null || p.pages.some((g) => g.id === wanted)) return wanted;
    return p.pages[0]?.id ?? wanted;
  });

  const stop = effect(() => {
    const p = store.committed.value;
    if (p === null) return;
    const current = chosen.peek();
    const name = nameOf(p, current);
    const deliberate = expected === current;
    expected = null;
    if (name === null) {
      const fallback = p.pages[0];
      if (fallback === undefined) return;
      batch(() => {
        chosen.value = fallback.id;
        if (!deliberate) notice.value = { kind: 'removed', name: knownName };
      });
      knownName = fallback.name;
      writeOpen(projectId, { id: fallback.id, name: fallback.name });
    } else if (name !== knownName) {
      knownName = name;
      writeOpen(projectId, { id: current, name });
    }
  });

  const pages = computed((): readonly Page[] => {
    return proposed.value?.pages ?? store.committed.value?.pages ?? [];
  });

  const createdByProposal = computed((): ReadonlySet<string> => {
    const p = proposed.value;
    const base = store.committed.value;
    if (p === null || base === null) return NO_PAGES;
    const known = new Set(base.pages.map((g) => g.id));
    const created = p.pages.filter((g) => !known.has(g.id)).map((g) => g.id);
    return created.length === 0 ? NO_PAGES : new Set(created);
  });

  const rootCounts = computed((): ReadonlyMap<string, number> => {
    const p = proposed.value ?? store.committed.value;
    if (p === null) return new Map();
    const { rootsByPage } = projectIndex(p);
    return new Map(p.pages.map((g) => [g.id, rootsByPage.get(g.id)?.length ?? 0]));
  });

  const perspectiveCounts = computed((): ReadonlyMap<string, number> => {
    const p = store.committed.value;
    if (p === null) return new Map();
    const page = id.value;
    return new Map(p.perspectives.map((x) => [x.id, perspectiveRootsOnPage(p, x, page)]));
  });

  const perspectiveEmpty = computed((): boolean => {
    const p = store.committed.value;
    const open =
      p === null ? null : openPerspectiveIn(p, deps.perspectiveId?.value ?? null);
    return p !== null && open !== null && perspectiveRootsOnPage(p, open, id.value) === 0;
  });

  return {
    id,
    openId: () => id.peek(),
    open(page) {
      const name = nameOf(store.committed.peek(), page);
      if (name === null) {
        // Only the review's preview has it (decision 13): shown, never kept.
        if (nameOf(proposed.peek(), page) === null) return false;
        proposedChoice.value = page;
        return true;
      }
      knownName = name;
      batch(() => {
        chosen.value = page;
        proposedChoice.value = null;
      });
      writeOpen(projectId, { id: page, name });
      return true;
    },
    setProposed(project) {
      batch(() => {
        proposed.value = project;
        const extra = proposedChoice.peek();
        if (extra !== null && nameOf(project, extra) === null)
          proposedChoice.value = null;
      });
    },
    pages,
    createdByProposal,
    expectRemoval(pageId) {
      expected = pageId;
    },
    notice,
    rootCounts,
    perspectiveCounts,
    perspectiveEmpty,
    announceMoved(pageId) {
      const name = nameOf(store.committed.peek(), pageId);
      if (name !== null) notice.value = { kind: 'moved', pageId, name };
    },
    noteStep({ kind, from, to }) {
      const name = pageOfChange(from, to, id.peek());
      if (name !== null) {
        notice.value = { kind: kind === 'undo' ? 'undone' : 'redone', name };
      }
    },
    dispose: stop,
  };
}
