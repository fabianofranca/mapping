import { batch } from '@preact/signals';
import {
  hostOf,
  resolveAnchor,
  type Project,
  type Thread,
  type ThreadAnchor,
} from '../model';
import { expandSections, type EditorUi, type Selection } from './ui';

// Thread selection and drafts (Comments stage, decisions 19 and 20): UI-only state.

/** Id of the selected thread, as long as the selection in which it was chosen stays the same. */
export function selectedThreadId(ui: EditorUi): string | null {
  const chosen = ui.thread.value;
  return chosen !== null && chosen.selection === ui.selection.value ? chosen.id : null;
}

/** The anchor of the new-thread draft, as long as the selection in which it was born stays the
 * same. */
export function composingAnchor(ui: EditorUi): ThreadAnchor | null {
  const draft = ui.composing.value;
  return draft !== null && draft.selection === ui.selection.value ? draft.anchor : null;
}

/** Key of the draft of a reply (the thread) or of a new thread (the anchor). */
export const replyDraftKey = (threadId: string): string => `reply:${threadId}`;
export function newDraftKey(anchor: ThreadAnchor): string {
  return `new:${JSON.stringify(anchor)}`;
}

export function draftOf(ui: EditorUi, key: string): string {
  return ui.threadDrafts.value.get(key) ?? '';
}

export function setDraft(ui: EditorUi, key: string, text: string): void {
  const next = new Map(ui.threadDrafts.peek());
  if (text === '') next.delete(key);
  else next.set(key, text);
  ui.threadDrafts.value = next;
}

/** The item the selection uses for an anchor with an item host; `null` in the other cases. */
function selectionFor(project: Project, anchor: ThreadAnchor): Selection {
  const host = hostOf(project, anchor);
  if (host === null || host.kind === 'point') return null;
  return { kind: host.kind === 'container' ? 'image' : host.kind, id: host.id };
}

/** Does the thread live on a selectable item (marking, container or arrow)? */
export function hasItemHost(project: Project, anchor: ThreadAnchor): boolean {
  return selectionFor(project, anchor) !== null;
}

/**
 * Chooses a thread (from the window, the pin or a chip): selects its item, opens the Threads
 * section and, on an annotation, field, pair or row, moves focus there. A thread without an item
 * (layer, point, orphan) leaves the selection empty and opens by itself in the Details.
 */
export function selectThread(ui: EditorUi, project: Project, thread: Thread): void {
  const anchor = thread.anchor;
  const target = selectionFor(project, anchor);
  batch(() => {
    ui.composing.value = null;
    ui.selection.value = target;
    ui.thread.value = { id: thread.id, selection: ui.selection.peek() };
    expandSections(ui, [{ kind: 'comments' }]);
    if (anchor.kind === 'annotation') ui.focusAnnotation.value = anchor.id;
    if (anchor.kind === 'field' || anchor.kind === 'row') {
      ui.focusAnnotation.value = anchor.annotationId;
      ui.focusField.value = anchor.key;
    }
    if (anchor.kind === 'entry') ui.focusAnnotation.value = anchor.annotationId;
  });
}

/** Starts a new thread as a draft, anchored at `anchor` (nothing is saved before Send). */
export function startComposing(
  ui: EditorUi,
  project: Project,
  anchor: ThreadAnchor,
): void {
  const target = selectionFor(project, anchor);
  batch(() => {
    ui.thread.value = null;
    ui.selection.value = target;
    ui.composing.value = { anchor, selection: ui.selection.peek() };
    // A new thread turns the pins on (decision 24): the draft at the point shows the dashed pin.
    ui.commentPins.value = true;
    expandSections(ui, [{ kind: 'comments' }]);
  });
}

/**
 * Arms the Comment button (decision 25): turns the pins on, goes back to Navigate keeping the
 * previous tool and waits for a click on the canvas.
 */
export function armComment(ui: EditorUi): void {
  batch(() => {
    if (ui.commentArm.peek() === null) {
      ui.commentArm.value = { mode: ui.mode.peek() };
    }
    ui.mode.value = 'navigate';
    ui.commentPins.value = true;
  });
}

/** Disarms Comment and goes back to the previous tool; `false` if it was not armed. */
export function cancelComment(ui: EditorUi): boolean {
  const armed = ui.commentArm.peek();
  if (armed === null) return false;
  batch(() => {
    ui.commentArm.value = null;
    ui.mode.value = armed.mode;
  });
  return true;
}

/** The Comment click: opens the draft at `anchor` and goes back to the previous tool. */
export function placeComment(ui: EditorUi, project: Project, anchor: ThreadAnchor): void {
  batch(() => {
    cancelComment(ui);
    startComposing(ui, project, anchor);
  });
}

/**
 * Click on a pin (decision 24): with one thread, selects it (item and thread in the Details; on
 * the point, only the thread); with several on the same item, selects the item and opens the
 * list.
 */
export function activatePin(
  ui: EditorUi,
  project: Project,
  threads: readonly Thread[],
): void {
  const [first] = threads;
  if (first === undefined) return;
  if (threads.length === 1) {
    selectThread(ui, project, first);
    return;
  }
  const target = selectionFor(project, first.anchor);
  batch(() => {
    ui.composing.value = null;
    ui.selection.value = target;
    ui.thread.value = null;
    expandSections(ui, [{ kind: 'comments' }]);
  });
}

/** Is the anchor orphaned or without an item (layer, point)? Those cases open by themselves in
 * the Details. */
export function isStandalone(project: Project, anchor: ThreadAnchor): boolean {
  return !hasItemHost(project, anchor) || resolveAnchor(project, anchor).orphan;
}
