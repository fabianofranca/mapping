import type { Project } from '../../model';
import type { EditorUi } from '../../store/ui';
import type { ThreadEntry } from '../../store/threadDerived';
import { composingAnchor, isStandalone, selectedThreadId } from '../../store/threadUi';
import { useEditor } from '../EditorContext';
import { anchorLabel } from './anchorLabel';
import { Composer } from './Composer';
import { ThreadView } from './ThreadView';

/** Does the chosen thread (or the draft in progress) have no item to select? */
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
 * Details of a thread without an item (layer, loose point, orphan): the header says where it lives
 * and below come the thread or the composer of the new thread. In place of the selection panel.
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
