import { t } from '../../i18n';
import { initials, threadSubject, type Project, type ThreadAnchor } from '../../model';
import type { ThreadEntry } from '../../store/threadDerived';
import { selectedThreadId, selectThread, startComposing } from '../../store/threadUi';
import { Button } from '../controls';
import { Section } from '../DetailsSection';
import { useEditor } from '../EditorContext';
import { anchorLabel } from './anchorLabel';
import { showAndFocusToolWindow } from '../toolWindowLayout';
import { useThreadAccess } from './threadAccess';

interface ThreadsSectionProps {
  /** The item (marking, container or arrow) whose threads the section shows. */
  readonly itemId: string;
  /** The anchor of a new thread on this item. */
  readonly anchor: {
    readonly kind: 'marking' | 'container' | 'arrow';
    readonly id: string;
  };
  readonly onOpenSettings?: () => void;
}

/** "on <where>" when the thread is not the item's own (annotation, field, pair, row). */
function whereOf(project: Project, itemId: string, anchor: ThreadAnchor): string | null {
  const own = 'id' in anchor && anchor.id === itemId && anchor.kind !== 'annotation';
  return own ? null : anchorLabel(project, anchor);
}

interface ThreadListProps {
  readonly entries: readonly ThreadEntry[];
  readonly project: Project;
  readonly itemId: string;
  readonly selectedId: string | null;
}

function ThreadList({ entries, project, itemId, selectedId }: ThreadListProps) {
  const { ui, derived } = useEditor();
  const unread = derived.threads.unreadIds.value;
  return (
    <ul class="thread-list" aria-label={t('thread.list')}>
      {entries.map(({ thread }) => {
        const where = whereOf(project, itemId, thread.anchor);
        const first = thread.messages[0];
        const isUnread = unread.has(thread.id);
        return (
          <li key={thread.id}>
            <button
              type="button"
              class={`thread-row${isUnread ? ' thread-row-unread' : ''}`}
              aria-current={thread.id === selectedId}
              title={isUnread ? t('thread.unread') : undefined}
              onClick={() => {
                selectThread(ui, project, thread);
                showAndFocusToolWindow('conversation');
              }}
            >
              <span class="thread-avatar" aria-hidden="true">
                {first ? initials(first.author) : ''}
              </span>
              <span class="thread-row-main">
                <span class="thread-row-subject">{threadSubject(thread)}</span>
                {where !== null && (
                  <span class="thread-row-meta">{t('thread.in', { where })}</span>
                )}
              </span>
              <span class="thread-row-count">
                {thread.messages.length === 1
                  ? t('thread.messagesOne')
                  : t('thread.messages', { count: thread.messages.length })}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

interface BodyProps extends ThreadsSectionProps {
  readonly visible: readonly ThreadEntry[];
  readonly selectedId: string | null;
  readonly project: Project;
}

function SectionBody({ visible, selectedId, project, itemId }: BodyProps) {
  if (visible.length === 0) {
    return (
      <p class="thread-section-empty muted" role="status">
        {t('thread.sectionEmpty')}
      </p>
    );
  }
  return (
    <ThreadList
      entries={visible}
      project={project}
      itemId={itemId}
      selectedId={selectedId}
    />
  );
}

/**
 * "Conversations" section of the Details (stage #1881, decision 9): the list of the item's open
 * conversations (plus the window's one, if resolved). A row opens the conversation in the
 * Conversation window and **New** opens its composer there; the section never shows a thread or a
 * composer. Hidden in proposal review.
 */
export function ThreadsSection(props: ThreadsSectionProps) {
  const { ui, derived, store, review } = useEditor();
  const { can } = useThreadAccess();
  const project = review.derived.shownProject.value;
  if (!project || store.reviewing.value || review.proposalId.value !== null) return null;

  const entries = derived.threads.byItem.value.get(props.itemId) ?? [];
  const selectedId = selectedThreadId(ui);
  const visible = entries.filter(
    (e) => e.thread.resolved === null || e.thread.id === selectedId,
  );
  const openCount = entries.filter((e) => e.thread.resolved === null).length;

  return (
    <Section
      section={{ kind: 'comments' }}
      title={t('thread.section')}
      count={openCount}
      actions={
        can ? (
          <Button
            size="sm"
            title={t('thread.newHint')}
            onClick={() => startComposing(ui, project, props.anchor)}
          >
            {t('thread.new')}
          </Button>
        ) : undefined
      }
    >
      <SectionBody
        {...props}
        visible={visible}
        selectedId={selectedId}
        project={project}
      />
    </Section>
  );
}
