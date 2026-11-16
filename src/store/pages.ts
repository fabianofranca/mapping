import {
  batch,
  computed,
  effect,
  signal,
  type ReadonlySignal,
  type Signal,
} from '@preact/signals';
import { z } from 'zod';
import { projectIndex, type Project } from '../model';
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
//   external reload) the first page opens, with the `removed` notice.

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
  /** The open page: always a page of the committed project. Write only through `open`. */
  readonly id: ReadonlySignal<string>;
  /** The open id without tracking (for the actions, inside operations). */
  openId(): string;
  /** Opens the page. Refuses (`false`) an id the project does not have. Outside undo; kept in this browser. */
  open(id: string): boolean;
  /** Last notice about the pages; the interface shows it and clears it (`notice.value = null`). */
  readonly notice: Signal<PageNotice | null>;
  /** The roots of each page in the Completa, by page id (the page picker's count). */
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
  /** The name of the open one the last time the project had it (for the `removed` notice). */
  let knownName = first?.name ?? '';

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
    const wanted = chosen.value;
    if (p === null || p.pages.some((g) => g.id === wanted)) return wanted;
    return p.pages[0]?.id ?? wanted;
  });

  const stop = effect(() => {
    const p = store.committed.value;
    if (p === null) return;
    const current = chosen.peek();
    const name = nameOf(p, current);
    if (name === null) {
      const fallback = p.pages[0];
      if (fallback === undefined) return;
      batch(() => {
        chosen.value = fallback.id;
        notice.value = { kind: 'removed', name: knownName };
      });
      knownName = fallback.name;
      writeOpen(projectId, { id: fallback.id, name: fallback.name });
    } else if (name !== knownName) {
      knownName = name;
      writeOpen(projectId, { id: current, name });
    }
  });

  const rootCounts = computed((): ReadonlyMap<string, number> => {
    const p = store.committed.value;
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
      if (name === null) return false;
      knownName = name;
      chosen.value = page;
      writeOpen(projectId, { id: page, name });
      return true;
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
