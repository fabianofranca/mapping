import type { Project } from '../../model';
import type { EditorUi } from '../../store/ui';
import type { ThreadEntry } from '../../store/threadDerived';
import { composingAnchor, isStandalone, selectedThreadId } from '../../store/threadUi';
import { useEditor } from '../EditorContext';
import { anchorLabel } from './anchorLabel';
import { Composer } from './Composer';
import { ThreadView } from './ThreadView';

/** A conversa escolhida (ou o rascunho em andamento) não tem item para selecionar? */
export function hasStandaloneThread(
  ui: EditorUi,
  project: Project,
  entries: readonly ThreadEntry[],
): boolean {
  const composing = composingAnchor(ui);
  if (composing !== null) return isStandalone(project, composing);
  const id = selectedThreadId(ui);
  const entry = id === null ? undefined : entries.find((e) => e.thread.id === id);
  return entry !== undefined && isStandalone(project, entry.thread.anchor);
}

interface StandaloneProps {
  readonly onOpenSettings?: () => void;
}

/**
 * Detalhes de uma conversa sem item (camada, ponto solto, órfã): o cabeçalho diz onde ela
 * mora e abaixo vêm a conversa ou o compositor da conversa nova. No lugar do painel de seleção.
 */
export function StandaloneThreadPanel({ onOpenSettings }: StandaloneProps) {
  const { ui, derived, review } = useEditor();
  const project = review.derived.shownProject.value;
  const id = selectedThreadId(ui);
  const composing = composingAnchor(ui);
  const entry =
    id === null ? null : derived.threads.entries.value.find((e) => e.thread.id === id);
  const anchor = entry?.thread.anchor ?? composing;
  if (!project || !anchor) return null;
  return (
    <div class="thread-standalone">
      <h2 class="thread-standalone-title">{anchorLabel(project, anchor)}</h2>
      {entry ? (
        <ThreadView
          key={entry.thread.id}
          thread={entry.thread}
          onOpenSettings={onOpenSettings}
        />
      ) : (
        <Composer
          target={{ kind: 'new', anchor: composing! }}
          autoFocus
          onOpenSettings={onOpenSettings}
          onCancel={() => (ui.composing.value = null)}
        />
      )}
    </div>
  );
}
