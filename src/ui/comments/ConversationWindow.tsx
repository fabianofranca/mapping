import { t } from '../../i18n';
import type { ThreadEntry } from '../../store/threadDerived';
import { composingAnchor, selectedThreadId } from '../../store/threadUi';
import { useEditor } from '../EditorContext';
import { anchorLabel } from './anchorLabel';
import { Composer } from './Composer';
import { StateBadge, ThreadView } from './ThreadView';

// Conversation window (stage #1881, CV2, decisions 6 to 11): the only place where a conversation
// is shown and written. Its target is `ui.conversation`; it does not follow the selection.

/** The entry of the conversation in the window; `null` when there is none (or it was deleted). */
function useShownEntry(): ThreadEntry | null {
  const { ui, derived } = useEditor();
  const id = selectedThreadId(ui);
  if (id === null) return null;
  return derived.threads.entries.value.find((e) => e.thread.id === id) ?? null;
}

/** The state badge, for the window header (`actions` slot of the tool window). */
export function ConversationStateBadge() {
  const entry = useShownEntry();
  return entry ? <StateBadge thread={entry.thread} /> : null;
}

interface ConversationWindowProps {
  /** Opens Settings (the notice with no identity leads there). */
  readonly onOpenSettings?: () => void;
}

function Empty() {
  return (
    <p class="conversation-empty muted" role="status">
      {t('conversation.empty')}
    </p>
  );
}

export function ConversationWindow({ onOpenSettings }: ConversationWindowProps) {
  const { ui, review } = useEditor();
  const entry = useShownEntry();
  const composing = composingAnchor(ui);
  const project = review.derived.shownProject.value;
  const anchor = entry?.thread.anchor ?? composing;
  if (!project || !anchor) return <Empty />;
  return (
    <div class="conversation-view">
      <p class="conversation-anchor">
        {t('conversation.anchor', { where: anchorLabel(project, anchor) })}
      </p>
      {entry ? (
        <ThreadView
          key={entry.thread.id}
          thread={entry.thread}
          showState={false}
          onOpenSettings={onOpenSettings}
        />
      ) : (
        <Composer
          key={JSON.stringify(anchor)}
          target={{ kind: 'new', anchor }}
          autoFocus
          onOpenSettings={onOpenSettings}
          onCancel={() => (ui.conversation.value = null)}
        />
      )}
    </div>
  );
}
