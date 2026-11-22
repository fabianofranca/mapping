import { batch } from '@preact/signals';
import { hostOf, type Project, type Thread, type ThreadAnchor } from '../model';
import { showToolWindow } from './toolWindows';
import { expandSections, type EditorUi, type Selection } from './ui';

// Thread selection and drafts (Comments stage, decisions 19 and 20): UI-only state.

/** Id of the conversation in the window, if it is an existing one. */
export function selectedThreadId(ui: EditorUi): string | null {
  const target = ui.conversation.value;
  return target !== null && target.kind === 'thread' ? target.id : null;
}

/** The anchor of the new-conversation draft in the window, if there is one. */
export function composingAnchor(ui: EditorUi): ThreadAnchor | null {
  const target = ui.conversation.value;
  return target !== null && target.kind === 'new' ? target.anchor : null;
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

/**
 * Chooses a conversation (from the list, the pin or a chip): shows it in the Conversation window,
 * selects its item, opens the Conversations section and, on an annotation, field, pair or row,
 * moves focus there. A conversation without an item (layer, point, orphan) leaves the selection
 * empty.
 */
export function selectThread(ui: EditorUi, project: Project, thread: Thread): void {
  const anchor = thread.anchor;
  const target = selectionFor(project, anchor);
  batch(() => {
    ui.selection.value = target;
    ui.conversation.value = { kind: 'thread', id: thread.id };
    showToolWindow('conversation');
    expandSections(ui, [{ kind: 'comments' }]);
    if (anchor.kind === 'annotation') ui.focusAnnotation.value = anchor.id;
    if (anchor.kind === 'field' || anchor.kind === 'row') {
      ui.focusAnnotation.value = anchor.annotationId;
      ui.focusField.value = anchor.key;
    }
    if (anchor.kind === 'entry') ui.focusAnnotation.value = anchor.annotationId;
  });
}

/**
 * Shows a conversation in the Conversation window without touching the selection (the review:
 * the window opens the thread, the canvas and the Details stay where they are).
 */
export function showConversation(ui: EditorUi, threadId: string): void {
  batch(() => {
    ui.conversation.value = { kind: 'thread', id: threadId };
    showToolWindow('conversation');
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
    ui.selection.value = target;
    ui.conversation.value = { kind: 'new', anchor };
    showToolWindow('conversation');
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
 * Click on a pin (decision 24): with one conversation, opens it in the window (and selects its
 * item); with several on the same item, selects the item and opens the list, leaving the window
 * as it is.
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
    ui.selection.value = target;
    expandSections(ui, [{ kind: 'comments' }]);
  });
}
