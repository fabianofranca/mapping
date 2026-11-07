import { t } from '../../i18n';
import { initials, threadSubject, type Project, type ThreadAnchor } from '../../model';
import type { ThreadEntry } from '../../store/threadDerived';
import {
  composingAnchor,
  selectedThreadId,
  selectThread,
  startComposing,
} from '../../store/threadUi';
import { Button } from '../controls';
import { Section } from '../DetailsSection';
import { useEditor } from '../EditorContext';
import { anchorLabel } from './anchorLabel';
import { Composer } from './Composer';
import { useThreadAccess } from './threadAccess';
import { ThreadView } from './ThreadView';

interface ThreadsSectionProps {
  /** O item (marcação, container ou seta) cujas conversas a seção mostra. */
  readonly itemId: string;
  /** A âncora de uma conversa nova neste item. */
  readonly anchor: {
    readonly kind: 'marking' | 'container' | 'arrow';
    readonly id: string;
  };
  readonly onOpenSettings?: () => void;
}

/** "em <onde>" quando a conversa não é do próprio item (anotação, campo, par, linha). */
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
              onClick={() => selectThread(ui, project, thread)}
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

interface SectionView {
  /** As conversas à vista: as abertas e a resolvida escolhida. */
  readonly visible: readonly ThreadEntry[];
  readonly selectedId: string | null;
  readonly composing: ThreadAnchor | null;
  readonly openCount: number;
  /** A conversa mostrada inteira: a escolhida ou a única; nenhuma enquanto se compõe. */
  readonly shown: ThreadEntry | null;
}

function viewOf(
  entries: readonly ThreadEntry[],
  selectedId: string | null,
  composing: ThreadAnchor | null,
): SectionView {
  const visible = entries.filter(
    (e) => e.thread.resolved === null || e.thread.id === selectedId,
  );
  const chosen = visible.find((e) => e.thread.id === selectedId);
  const only = visible.length === 1 ? visible[0] : undefined;
  return {
    visible,
    selectedId,
    composing,
    openCount: entries.filter((e) => e.thread.resolved === null).length,
    shown: composing === null ? (chosen ?? only ?? null) : null,
  };
}

interface BodyProps extends ThreadsSectionProps {
  readonly view: SectionView;
  readonly project: Project;
}

function SectionBody({ view, project, itemId, anchor, onOpenSettings }: BodyProps) {
  const { ui } = useEditor();
  const { composing, visible, shown, selectedId } = view;
  if (composing !== null) {
    return (
      <Composer
        target={{ kind: 'new', anchor: composing }}
        autoFocus
        onOpenSettings={onOpenSettings}
        onCancel={() => (ui.composing.value = null)}
      />
    );
  }
  if (visible.length === 0) {
    return <Composer target={{ kind: 'new', anchor }} onOpenSettings={onOpenSettings} />;
  }
  return (
    <>
      {visible.length > 1 && (
        <ThreadList
          entries={visible}
          project={project}
          itemId={itemId}
          selectedId={selectedId}
        />
      )}
      {shown && (
        <ThreadView
          key={shown.thread.id}
          thread={shown.thread}
          where={whereOf(project, itemId, shown.thread.anchor)}
          onOpenSettings={onOpenSettings}
        />
      )}
    </>
  );
}

/**
 * Seção "Conversas" dos Detalhes (decisão 18): sem conversa aberta, o compositor; com uma, ela
 * inteira; com mais de uma, a lista e a escolhida embaixo. A resolvida só aparece escolhida.
 * Some na revisão de proposta.
 */
export function ThreadsSection(props: ThreadsSectionProps) {
  const { ui, derived, store, review } = useEditor();
  const { can } = useThreadAccess();
  const project = review.derived.shownProject.value;
  if (!project || store.reviewing.value || review.proposalId.value !== null) return null;

  const entries = derived.threads.byItem.value.get(props.itemId) ?? [];
  const view = viewOf(entries, selectedThreadId(ui), composingAnchor(ui));
  const showNew = can && view.composing === null && view.visible.length > 0;

  return (
    <Section
      section={{ kind: 'comments' }}
      title={t('thread.section')}
      count={view.openCount}
      actions={
        showNew ? (
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
      <SectionBody {...props} view={view} project={project} />
    </Section>
  );
}
