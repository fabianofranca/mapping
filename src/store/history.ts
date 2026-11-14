import { batch, computed, signal, type ReadonlySignal } from '@preact/signals';
import { ModelError, type ModelErrorCode } from '../model/errors';
import { touchProject } from '../model/project';
import type { Project } from '../model/types';
import { reportError } from '../utils/report';

/** Limit of entries on the undo stack. */
export const HISTORY_LIMIT = 100;

/** Pure operation applied to the project (see `src/model/`). */
export type Operation = (p: Project) => Project;

export type StoreErrorCode =
  | ModelErrorCode
  | 'no-project'
  | 'read-only'
  | 'gesture-active'
  | 'reviewing'
  // "Only me" perspectives (#659): without IndexedDB, or writing to it failed.
  | 'local-unavailable'
  // Perspectives: taking an "Only me" one to the file did not write `mapping.json`.
  | 'save-failed'
  // Perspectives: command that only applies on the Main one (drawing on the canvas, arrow route,
  // tidy, delete root).
  | 'principal-only';

/**
 * Effect outside the project tied to a history entry: applying the accepted changes
 * of a proposal also marks the proposal as applied, and undoing/redoing that entry
 * must undo/redo that too. `tag` identifies the owner (the proposal id). An
 * entry with `link` is born from the review, so it goes through the review's read-only lock.
 */
export interface HistoryLink {
  readonly tag: string;
  /**
   * Undo/redo the effect. The promise carries the result of the write: while it is
   * pending the history stays stopped, and a failure reverts the step. Without a promise
   * (synchronous effect), it counts as success.
   */
  readonly undo: () => Promise<LinkResult> | undefined;
  readonly redo: () => Promise<LinkResult> | undefined;
}

export type LinkResult =
  { readonly ok: true } | { readonly ok: false; readonly error: string };

/** The last failure of a link (the step was reverted); `seq` tells apart equal consecutive failures. */
export interface LinkFailure {
  readonly seq: number;
  readonly error: string;
}

export interface ApplyOptions {
  readonly link?: HistoryLink;
}

/** A history entry: the project from before the transition and its effect. */
interface Frame {
  readonly project: Project;
  readonly link: HistoryLink | null;
}

export type ActionResult<T = void> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: StoreErrorCode };

export interface ProjectStoreDeps {
  /** ISO date used in `project.updatedAt`. */
  readonly now?: () => string;
}

export interface LoadOptions {
  readonly readOnly?: boolean;
}

/**
 * Project state (what goes to the JSON) with undo/redo.
 * The history is a stack of immutable snapshots. UI state does not go in here.
 */
export interface ProjectStore {
  /** Current project, with the preview of the gesture in progress (read by the canvas, for geometry). */
  readonly project: ReadonlySignal<Project | null>;
  /**
   * Project without the gesture previews: outside a gesture it is the same object as `project`;
   * during the gesture it stays at the project from the start and only changes on `commitGesture`/`cancelGesture`.
   * The interface and the derived state read this one, to avoid rendering on every `pointermove`.
   */
  readonly committed: ReadonlySignal<Project | null>;
  readonly readOnly: ReadonlySignal<boolean>;
  readonly canUndo: ReadonlySignal<boolean>;
  readonly canRedo: ReadonlySignal<boolean>;
  /** Increments on every project change (useful for autosave). */
  readonly revision: ReadonlySignal<number>;
  readonly gestureActive: ReadonlySignal<boolean>;
  /**
   * Review of an open proposal (stage 4): the project becomes read-only, and only the
   * entries tied to the open proposal (`ApplyOptions.link`, with `link.tag` equal to its
   * id) can be applied, undone and redone.
   */
  readonly reviewing: ReadonlySignal<boolean>;
  /**
   * Editing blocked for any reason: read-only or open review. The interface
   * uses this one to disable what would be refused (drawing, adding images, locking…).
   */
  readonly locked: ReadonlySignal<boolean>;
  /** Write failure when undoing/redoing an application; the interface shows the error. */
  readonly linkFailure: ReadonlySignal<LinkFailure | null>;

  /**
   * Image files referenced by the current project or by any
   * history snapshot (undo/redo/gesture). Whoever keeps the content of
   * removed images only needs it while the file is in this set.
   */
  referencedImageFiles(): ReadonlySet<string>;

  load(project: Project, options?: LoadOptions): void;
  close(): void;
  /** Turns on the review of the proposal with id `tag`, or turns it off with `null`. */
  setReviewing(tag: string | null): void;
  /** Applies the operation and creates a history entry. */
  apply(op: Operation, options?: ApplyOptions): ActionResult;
  /**
   * Discards the "redo" if any entry of it has the effect of `tag`: the proposal changed
   * after the undo, so redoing would leave project and proposal out of sync.
   */
  discardRedoOf(tag: string): void;
  /**
   * Removes the link (`HistoryLink`) of `tag` from all entries, in undo and redo:
   * the proposal was deleted, so undo and redo only touch the project. The entries stay.
   */
  detachLinks(tag: string): void;
  undo(): boolean;
  redo(): boolean;

  /** Starts a gesture (drag/resize): the previews do not enter the history. */
  beginGesture(): ActionResult;
  /**
   * Gesture preview: applies `op` to the project from the start of the gesture. If the
   * operation fails, the project stays at the last valid preview.
   */
  updateGesture(op: Operation): ActionResult;
  /** Ends the gesture producing a single history entry (if anything changed). */
  commitGesture(): void;
  /** Discards the gesture and goes back to the project from its start. */
  cancelGesture(): void;
}

function run(op: Operation, p: Project): ActionResult<Project> {
  try {
    return { ok: true, value: op(p) };
  } catch (e) {
    if (e instanceof ModelError) return { ok: false, error: e.code };
    throw e;
  }
}

export function createProjectStore(deps: ProjectStoreDeps = {}): ProjectStore {
  const now = deps.now ?? (() => new Date().toISOString());

  const project = signal<Project | null>(null);
  const readOnly = signal(false);
  const past = signal<readonly Frame[]>([]);
  const future = signal<readonly Frame[]>([]);
  const reviewTag = signal<string | null>(null);
  const reviewing = computed(() => reviewTag.value !== null);
  const revision = signal(0);
  /** An undo/redo of a link is waiting for the write: the history stays stopped. */
  const linkPending = signal(false);
  const linkFailure = signal<LinkFailure | null>(null);
  let linkSeq = 0;
  /** Project at the start of the gesture in progress; `null` when there is no gesture. */
  const gestureBase = signal<Project | null>(null);

  const guard = (fromReview = false): ActionResult<Project> => {
    const current = project.value;
    if (!current) return { ok: false, error: 'no-project' };
    if (readOnly.value) return { ok: false, error: 'read-only' };
    if (reviewing.value && !fromReview) return { ok: false, error: 'reviewing' };
    return { ok: true, value: current };
  };

  /**
   * Runs the link's effect. Asynchronous: the history stops until the write finishes; if
   * it fails, `revert` returns the step (only if nothing else changed the project since).
   */
  const runLink = (run: () => Promise<LinkResult> | undefined, revert: () => void) => {
    let pending: Promise<LinkResult> | undefined;
    try {
      pending = run();
    } catch (e) {
      // Synchronous failure: same as the asynchronous one, returns the step and leaves the error in view.
      reportError('history.link', e);
      batch(() => {
        revert();
        linkFailure.value = { seq: ++linkSeq, error: 'failed' };
      });
      return;
    }
    if (!pending) return;
    const token = ++linkSeq;
    const stepped = project.peek();
    linkPending.value = true;
    const settle = (result: LinkResult) => {
      batch(() => {
        if (token === linkSeq) linkPending.value = false;
        if (result.ok) return;
        if (project.peek() === stepped) revert();
        linkFailure.value = { seq: token, error: result.error };
      });
    };
    pending.then(settle, (e: unknown) => {
      reportError('history.link', e);
      settle({ ok: false, error: 'failed' });
    });
  };

  const commit = (before: Project, after: Project, link: HistoryLink | null = null) => {
    batch(() => {
      past.value = [...past.value, { project: before, link }].slice(-HISTORY_LIMIT);
      future.value = [];
      project.value = touchProject(after, now());
      revision.value++;
    });
  };

  const committed = computed(() => gestureBase.value ?? project.value);

  return {
    project,
    committed,
    readOnly,
    revision,
    canUndo: computed(() => {
      const top = past.value.at(-1);
      return (
        top !== undefined &&
        !linkPending.value &&
        gestureBase.value === null &&
        (reviewTag.value === null || top.link?.tag === reviewTag.value)
      );
    }),
    canRedo: computed(() => {
      const top = future.value[0];
      return (
        top !== undefined &&
        !linkPending.value &&
        gestureBase.value === null &&
        (reviewTag.value === null || top.link?.tag === reviewTag.value)
      );
    }),
    gestureActive: computed(() => gestureBase.value !== null),
    reviewing,
    locked: computed(() => readOnly.value || reviewing.value),
    linkFailure,

    referencedImageFiles() {
      const files = new Set<string>();
      // Neighboring snapshots tend to share the same images array.
      const seen = new Set<readonly unknown[]>();
      const collect = (p: Project | null) => {
        if (!p || seen.has(p.containers)) return;
        seen.add(p.containers);
        for (const image of p.containers) if (image.file !== null) files.add(image.file);
      };
      collect(project.peek());
      collect(gestureBase.peek());
      for (const frame of past.peek()) collect(frame.project);
      for (const frame of future.peek()) collect(frame.project);
      return files;
    },

    load(p, options = {}) {
      batch(() => {
        project.value = p;
        readOnly.value = options.readOnly ?? false;
        past.value = [];
        future.value = [];
        gestureBase.value = null;
        revision.value = 0;
        linkPending.value = false;
      });
    },

    close() {
      batch(() => {
        project.value = null;
        readOnly.value = false;
        reviewTag.value = null;
        past.value = [];
        future.value = [];
        gestureBase.value = null;
        linkPending.value = false;
      });
    },

    setReviewing(tag) {
      reviewTag.value = tag;
    },

    apply(op, options = {}) {
      if (gestureBase.value) return { ok: false, error: 'gesture-active' };
      const link = options.link ?? null;
      const current = guard(link !== null);
      if (!current.ok) return current;
      const result = run(op, current.value);
      if (!result.ok) return result;
      if (result.value !== current.value) commit(current.value, result.value, link);
      return { ok: true, value: undefined };
    },

    discardRedoOf(tag) {
      if (future.value.some((frame) => frame.link?.tag === tag)) future.value = [];
    },

    detachLinks(tag) {
      const detach = (frames: readonly Frame[]): readonly Frame[] =>
        frames.some((frame) => frame.link?.tag === tag)
          ? frames.map((frame) =>
              frame.link?.tag === tag ? { project: frame.project, link: null } : frame,
            )
          : frames;
      past.value = detach(past.value);
      future.value = detach(future.value);
    },

    undo() {
      const previous = past.value.at(-1);
      const current = project.value;
      if (!previous || !current || gestureBase.value || readOnly.value) return false;
      if (linkPending.value) return false;
      if (reviewTag.value !== null && previous.link?.tag !== reviewTag.value)
        return false;
      batch(() => {
        past.value = past.value.slice(0, -1);
        future.value = [{ project: current, link: previous.link }, ...future.value];
        project.value = touchProject(previous.project, now());
        revision.value++;
      });
      const link = previous.link;
      if (link) {
        runLink(link.undo, () => {
          past.value = [...past.value, previous].slice(-HISTORY_LIMIT);
          future.value = future.value.slice(1);
          project.value = current;
          revision.value++;
        });
      }
      return true;
    },

    redo() {
      const [next, ...rest] = future.value;
      const current = project.value;
      if (!next || !current || gestureBase.value || readOnly.value) return false;
      if (linkPending.value) return false;
      if (reviewTag.value !== null && next.link?.tag !== reviewTag.value) return false;
      batch(() => {
        future.value = rest;
        past.value = [...past.value, { project: current, link: next.link }].slice(
          -HISTORY_LIMIT,
        );
        project.value = touchProject(next.project, now());
        revision.value++;
      });
      const link = next.link;
      if (link) {
        runLink(link.redo, () => {
          past.value = past.value.slice(0, -1);
          future.value = [next, ...future.value];
          project.value = current;
          revision.value++;
        });
      }
      return true;
    },

    beginGesture() {
      if (gestureBase.value) return { ok: false, error: 'gesture-active' };
      const current = guard();
      if (!current.ok) return current;
      gestureBase.value = current.value;
      return { ok: true, value: undefined };
    },

    updateGesture(op) {
      const base = gestureBase.value;
      if (!base) return { ok: false, error: 'no-project' };
      const result = run(op, base);
      if (!result.ok) return result;
      project.value = result.value;
      return { ok: true, value: undefined };
    },

    commitGesture() {
      const base = gestureBase.value;
      const current = project.value;
      // In a batch: `committed` goes straight from the project at the start to the end.
      batch(() => {
        gestureBase.value = null;
        if (base && current && current !== base) commit(base, current);
      });
    },

    cancelGesture() {
      const base = gestureBase.value;
      batch(() => {
        gestureBase.value = null;
        if (base) project.value = base;
      });
    },
  };
}
