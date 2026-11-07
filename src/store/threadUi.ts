import { batch } from '@preact/signals';
import {
  hostOf,
  resolveAnchor,
  type Project,
  type Thread,
  type ThreadAnchor,
} from '../model';
import { expandSections, type EditorUi, type Selection } from './ui';

// Seleção e rascunhos das conversas (etapa Comentários, decisões 19 e 20): estado só da UI.

/** Id da conversa selecionada, enquanto a seleção em que ela foi escolhida continua a mesma. */
export function selectedThreadId(ui: EditorUi): string | null {
  const chosen = ui.thread.value;
  return chosen !== null && chosen.selection === ui.selection.value ? chosen.id : null;
}

/** A âncora do rascunho de conversa nova, enquanto a seleção em que ele nasceu continua a mesma. */
export function composingAnchor(ui: EditorUi): ThreadAnchor | null {
  const draft = ui.composing.value;
  return draft !== null && draft.selection === ui.selection.value ? draft.anchor : null;
}

/** Chave do rascunho de uma resposta (a conversa) ou de uma conversa nova (a âncora). */
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

/** O item que a seleção usa para uma âncora com hospedeiro item; `null` nos outros casos. */
function selectionFor(project: Project, anchor: ThreadAnchor): Selection {
  const host = hostOf(project, anchor);
  if (host === null || host.kind === 'point') return null;
  return { kind: host.kind === 'container' ? 'image' : host.kind, id: host.id };
}

/** A conversa mora num item selecionável (marcação, container ou seta)? */
export function hasItemHost(project: Project, anchor: ThreadAnchor): boolean {
  return selectionFor(project, anchor) !== null;
}

/**
 * Escolhe uma conversa (pela janela, pelo pino ou por um chip): seleciona o item dela, abre a
 * seção Conversas e, numa anotação, campo, par ou linha, leva o foco até lá. A conversa sem item
 * (camada, ponto, órfã) deixa a seleção vazia e abre sozinha nos Detalhes.
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

/** Começa uma conversa nova em rascunho, ancorada em `anchor` (nada é gravado antes do Enviar). */
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
    expandSections(ui, [{ kind: 'comments' }]);
  });
}

/** A âncora órfã ou sem item (camada, ponto)? Esses casos abrem sozinhos nos Detalhes. */
export function isStandalone(project: Project, anchor: ThreadAnchor): boolean {
  return !hasItemHost(project, anchor) || resolveAnchor(project, anchor).orphan;
}
