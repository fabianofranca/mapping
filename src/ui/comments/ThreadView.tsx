import { useEffect, useState } from 'preact/hooks';
import { t } from '../../i18n';
import { awaiting, lastMessage, type Thread } from '../../model';
import { markThreadRead } from '../../store/threadReads';
import { selectThread } from '../../store/threadUi';
import { ActionMenu } from '../ActionMenu';
import { useCiteMenuItems } from '../CiteMenuItems';
import { Button } from '../controls';
import { useEditor } from '../EditorContext';
import { CitedIn } from './CitedIn';
import { Composer } from './Composer';
import { relativeTime } from './relativeTime';
import { threadErrorText, useThreadAccess } from './threadAccess';
import { ThreadMessage } from './ThreadMessage';
import { useDeleteThread } from './useDeleteThread';

interface ThreadViewProps {
  readonly thread: Thread;
  /** "em Button › variante": onde a conversa mora, quando não é o próprio item. */
  readonly where?: string | null;
  readonly onOpenSettings?: () => void;
}

function StateBadge({ thread }: { readonly thread: Thread }) {
  if (thread.resolved !== null) {
    return (
      <span class="thread-state thread-state-resolved">{t('thread.state.resolved')}</span>
    );
  }
  const agent = awaiting(thread) === 'agent';
  return (
    <span class={`thread-state ${agent ? 'thread-state-agent' : 'thread-state-human'}`}>
      {t(agent ? 'thread.state.awaitingAgent' : 'thread.state.awaitingHuman')}
    </span>
  );
}

/** Marca a conversa como lida enquanto ela está à vista (nunca recua, então não entra em laço). */
function useMarkRead(thread: Thread): void {
  const { session } = useEditor();
  const copyId = session.storage.copyId;
  const last = lastMessage(thread)?.at ?? thread.createdAt;
  useEffect(() => {
    if (copyId !== undefined) markThreadRead(copyId, thread.id, last);
  }, [copyId, thread.id, last]);
}

function ThreadActions({ thread }: { readonly thread: Thread }) {
  const { session, ui, review } = useEditor();
  const del = useDeleteThread();
  const citeItems = useCiteMenuItems();
  const [error, setError] = useState<string | null>(null);
  const resolved = thread.resolved !== null;
  const toggle = async () => {
    const actions = session.threadActions;
    const result = await (resolved
      ? actions.reopen(thread.id)
      : actions.resolve(thread.id));
    setError(result.ok ? null : result.error);
    // A conversa resolvida continua à vista (ela só aparece nos Detalhes quando escolhida).
    const project = review.derived.shownProject.peek();
    if (result.ok && project) selectThread(ui, project, result.thread);
  };
  return (
    <>
      <Button size="sm" onClick={() => void toggle()}>
        {t(resolved ? 'thread.reopen' : 'thread.resolve')}
      </Button>
      <ActionMenu
        label={t('thread.menu')}
        items={[
          ...citeItems({ kind: 'thread', id: thread.id }, null),
          {
            label: t('thread.delete'),
            danger: true,
            onSelect: () => del.request(thread),
          },
        ]}
      />
      {del.dialog}
      {error !== null && (
        <p class="field-error" role="alert">
          {threadErrorText(error)}
        </p>
      )}
    </>
  );
}

/**
 * A conversa inteira: selo de estado, Resolver/Reabrir e o menu ⋯ (Apagar) quando a pessoa pode
 * escrever, as mensagens e o compositor de resposta. Mostrar a conversa a marca como lida.
 */
export function ThreadView({ thread, where, onOpenSettings }: ThreadViewProps) {
  const { can, writable } = useThreadAccess();
  useMarkRead(thread);
  return (
    <div class="thread-view">
      <div class="thread-head">
        <StateBadge thread={thread} />
        <span class="thread-head-spacer" />
        {can && <ThreadActions thread={thread} />}
      </div>
      {where != null && where !== '' && (
        <p class="thread-resolved-by">{t('thread.in', { where })}</p>
      )}
      {thread.resolved !== null && (
        <p class="thread-resolved-by">
          {t('thread.resolvedBy', {
            name: thread.resolved.by.name,
            date: relativeTime(thread.resolved.at),
          })}
        </p>
      )}
      <ul class="thread-messages">
        {thread.messages.map((m) => (
          <ThreadMessage key={m.id} message={m} />
        ))}
      </ul>
      <CitedIn thread={thread} />
      {writable && thread.resolved === null && (
        <Composer
          target={{ kind: 'reply', threadId: thread.id }}
          onOpenSettings={onOpenSettings}
        />
      )}
    </div>
  );
}
