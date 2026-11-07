import { t } from '../../i18n';
import { citationUrl, threadSubject } from '../../model';
import { CitationChip } from '../comments/CitationChip';
import { useCitationContext } from '../comments/citationContext';
import { useEditor } from '../EditorContext';

/**
 * "da conversa <chip>" na linha da proposta (decisão 36): a primeira conversa que a ligou a uma
 * mensagem. O chip abre a conversa. Some quando nenhuma conversa a ligou.
 */
export function ProposalThreadLink({ proposalId }: { readonly proposalId: string }) {
  const { derived } = useEditor();
  const ctx = useCitationContext();
  const threadId = derived.threads.proposalThreads.value.get(proposalId);
  if (ctx === null || threadId === undefined) return null;
  const thread = ctx.threads.find((th) => th.id === threadId);
  if (!thread) return null;
  const url = citationUrl(ctx.projectName, ctx.project, ctx.threads, {
    kind: 'thread',
    id: threadId,
  });
  if (url === null) return null;
  return (
    <span class="proposal-row-thread" data-proposal-thread="">
      <span class="muted">{t('proposals.fromThread')}</span>
      <CitationChip url={url} label={threadSubject(thread)} />
    </span>
  );
}
