import { batch, effect, signal, type ReadonlySignal, type Signal } from '@preact/signals';
import { z } from 'zod';
import type { Perspective, Project } from '../model';
import type { RootPlacement } from '../model/perspectivePlace';
import { readSetting, writeSetting } from '../utils/safeStorage';
import type { ProjectStore } from './history';

// Perspectives in the store (stage #659, PE2). CONTRACT shared by the fronts of the phase:
// the session creates the state (`createPerspectiveState`), the project actions read the open
// perspective through `openId()`, the review locks the switch and the derived state builds the project in view.
//
// - The open perspective is UI state (it does not enter undo); `null` = Main. It is kept
//   in this browser by `project.id` (localStorage, through `safeStorage`).
// - The "For everyone" and the "Only me" ones stay together in `project.perspectives` IN MEMORY (so
//   undo, the gestures, the reconciliation on settle and the operations apply to both). The
//   "Only me" ones are those with an id in `localIds`: the session removes them from what it writes to `mapping.json`
//   (`fileProject`) and keeps them in IndexedDB by `project.id`.

/** Where the root created outside Main ended up in it (for the Details notice, PE3). */
export interface ArrivalInfo {
  readonly root: string;
  /** The source perspective. */
  readonly from: string;
  readonly kind: RootPlacement['kind'];
  /** The reference root (`near`/`occupied`), or `null` in the arrival area. */
  readonly referenceId: string | null;
}

/** Notice of a forced switch to Main. */
export type PerspectiveNotice =
  /** The open perspective disappeared (deleted here, in another browser or in an external reload). */
  | { readonly kind: 'removed'; readonly name: string }
  /** The review of a proposal opened Main. */
  | { readonly kind: 'review' };

export interface PerspectiveState {
  /** The open perspective (`null` = Main). Write only through `open`. */
  readonly id: ReadonlySignal<string | null>;
  /** The open id without tracking (for the actions, inside operations). */
  openId(): string | null;
  /**
   * Opens the perspective (`null` = Main). Refuses (returns `false`) with the switch locked or
   * an id the project does not have. It does not enter undo; keeps the choice in this browser.
   */
  open(id: string | null): boolean;
  /** Switch locked (the review of a proposal shows only Main, decision 12). */
  readonly locked: ReadonlySignal<boolean>;
  /** Locks/unlocks the switch. Locking opens Main (with the `review` notice if it was in another). */
  setLocked(locked: boolean): void;
  /** Last notice of a forced switch to Main; the interface shows it and clears it. */
  readonly notice: Signal<PerspectiveNotice | null>;
  /** The arrivals of the last operation that created roots outside Main (empty if none). */
  readonly arrivals: Signal<readonly ArrivalInfo[]>;
  /** Ids of the "Only me" perspectives (the others in `project.perspectives` are "For everyone"). */
  readonly localIds: ReadonlySignal<ReadonlySet<string>>;
  /** There is IndexedDB for the "Only me" ones (without it, the option is disabled, decision 14). */
  readonly localAvailable: boolean;
}

/** The open perspective in `p` (`null` = Main or an id that `p` does not have). */
export function openPerspectiveIn(p: Project, id: string | null): Perspective | null {
  if (id === null) return null;
  return p.perspectives.find((x) => x.id === id) ?? null;
}

/** `p` as it goes to the file: without the "Only me" perspectives (the same object if there are none). */
export function fileProject(p: Project, localIds: ReadonlySet<string>): Project {
  if (localIds.size === 0 || !p.perspectives.some((x) => localIds.has(x.id))) return p;
  return { ...p, perspectives: p.perspectives.filter((x) => !localIds.has(x.id)) };
}

// ---------------------------------------------------------------------------
// The open perspective, kept in this browser

const OPEN_KEY = 'mapping.openPerspective';
const OPEN_VERSION = 1;
/** Projects with the open perspective kept (the most recent ones), in the mold of `viewMode`. */
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

/** Keeps this project's choice (`null` erases it: Main is the start). */
function writeOpen(projectId: string, entry: StoredOpen | null): void {
  const others = Object.entries(readOpenBlob()).filter(([key]) => key !== projectId);
  const next = entry === null ? others : [...others, [projectId, entry] as const];
  writeSetting(
    OPEN_KEY,
    JSON.stringify({
      v: OPEN_VERSION,
      open: Object.fromEntries(next.slice(-MAX_PROJECTS)),
    }),
  );
}

// ---------------------------------------------------------------------------
// The state

/** The perspectives state plus what the session and the actions need internally. */
export interface PerspectiveStateHandle extends PerspectiveState {
  /** Replaces the set of "Only me" ones (the session, after an external reload). */
  setLocalIds(ids: ReadonlySet<string>): void;
  /** Marks/unmarks a perspective as "Only me". */
  setLocal(id: string, local: boolean): void;
  /** Stops observing the project (closing the session). */
  dispose(): void;
}

export interface PerspectiveStateDeps {
  readonly store: ProjectStore;
  /** `project.id` of the open project: keys the kept choice. */
  readonly projectId: string;
  /** There is IndexedDB for the "Only me" ones. */
  readonly localAvailable: boolean;
  /** Ids of the "Only me" ones that the session already merged into the project on opening. */
  readonly localIds?: ReadonlySet<string>;
}

/** The name of the perspective `id` in `p`, or `null` if `p` does not have it. */
function nameOf(p: Project | null, id: string): string | null {
  return p?.perspectives.find((x) => x.id === id)?.name ?? null;
}

/**
 * Creates the perspectives state of a session. The open one is born from the choice kept for the
 * `project.id` (if the perspective disappeared, opens Main with the `removed` notice); an `effect`
 * over the confirmed project takes to Main, with the notice, whoever was in a perspective that
 * ceased to exist (deleted here, undone or in an external reload).
 */
export function createPerspectiveState(
  deps: PerspectiveStateDeps,
): PerspectiveStateHandle {
  const { store, projectId } = deps;
  const openId = signal<string | null>(null);
  const locked = signal(false);
  const notice = signal<PerspectiveNotice | null>(null);
  const arrivals = signal<readonly ArrivalInfo[]>([]);
  const localIds = signal<ReadonlySet<string>>(deps.localIds ?? new Set());
  /** The name of the open one the last time the project had it (for the `removed` notice). */
  let knownName = '';

  const saved = readOpenBlob()[projectId];
  if (saved !== undefined) {
    const name = nameOf(store.committed.peek(), saved.id);
    if (name !== null) {
      openId.value = saved.id;
      knownName = name;
    } else {
      notice.value = { kind: 'removed', name: saved.name };
      writeOpen(projectId, null);
    }
  }

  const stop = effect(() => {
    const p = store.committed.value;
    const id = openId.peek();
    if (p === null || id === null) return;
    const name = nameOf(p, id);
    if (name === null) {
      batch(() => {
        openId.value = null;
        notice.value = { kind: 'removed', name: knownName };
      });
      writeOpen(projectId, null);
    } else if (name !== knownName) {
      knownName = name;
      writeOpen(projectId, { id, name });
    }
  });

  return {
    id: openId,
    openId: () => openId.peek(),
    open(id) {
      if (locked.peek()) return false;
      if (id !== null) {
        const name = nameOf(store.committed.peek(), id);
        if (name === null) return false;
        knownName = name;
        openId.value = id;
        writeOpen(projectId, { id, name });
        return true;
      }
      openId.value = null;
      knownName = '';
      writeOpen(projectId, null);
      return true;
    },
    locked,
    setLocked(value) {
      batch(() => {
        locked.value = value;
        // Only the in-memory choice changes: the kept one returns when the review ends and the app reopens.
        if (value && openId.peek() !== null) {
          openId.value = null;
          notice.value = { kind: 'review' };
        }
      });
    },
    notice,
    arrivals,
    localIds,
    localAvailable: deps.localAvailable,
    setLocalIds(ids) {
      localIds.value = ids;
    },
    setLocal(id, local) {
      const next = new Set(localIds.peek());
      if (local) next.add(id);
      else next.delete(id);
      localIds.value = next;
    },
    dispose: stop,
  };
}
