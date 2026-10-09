import { t } from '../../i18n';
import { Button } from '../controls';
import { useEditor } from '../EditorContext';
import { proposalNoticeMessage } from '../labels';
import { Notice } from '../Notice';
import { useReviewCommands } from './useReviewCommands';
import { undoMessage } from './useReview';

// Aviso discreto no canto do canvas quando uma proposta chega, muda ou some por fora
// (`session.proposals.notices`, conferido junto com o `mapping.json`). A proposta nova
// ganha "Revisar"; fechar o aviso limpa a fila (as propostas continuam na janela).

/**
 * "Desfazer" dos lotes e das dependências (HANDOFF-PROPOSALS 8.3): depois de "Aceitar
 * tudo", de uma decisão de nível ou de uma que levou outras junto, o aviso diz quantas
 * mudaram e oferece desfazer numa única escrita. Some na próxima ação.
 */
export function ReviewUndoNotice() {
  const { review } = useEditor();
  const undo = review.undoable.value;
  if (!undo || (undo.changed.length <= 1 && undo.cascaded.length === 0)) return null;
  return (
    <Notice
      tone="info"
      size="sm"
      onDismiss={() => review.dismissUndo()}
      actions={
        <Button size="sm" onClick={() => void review.undoLastDecision()}>
          {t('review.undo')}
        </Button>
      }
    >
      <span>{undoMessage(undo.changed.length, undo.cascaded.length, undo.state)}</span>
    </Notice>
  );
}

export function ProposalNotices() {
  return (
    <div class="canvas-corner">
      <ReviewUndoNotice />
      <ProposalNotice />
    </div>
  );
}

function ProposalNotice() {
  const { session, review } = useEditor();
  const { openReview } = useReviewCommands();
  const notices = session.proposals.notices.value;
  const latest = notices.at(-1);
  if (!latest) return null;
  // A proposta que já está aberta na revisão não precisa de aviso de "nova".
  if (latest.kind === 'added' && review.proposalId.value === latest.id) return null;
  const others = notices.length - 1;
  const dismiss = () => session.proposals.clearNotices();
  const more = others > 0 ? t('proposals.noticeMore', { count: others }) : null;
  return latest.kind === 'added' ? (
    <Notice
      tone="info"
      icon="proposal"
      title={t('proposals.noticeNewTitle')}
      onDismiss={dismiss}
      actions={
        <Button
          size="sm"
          onClick={() => {
            if (openReview(latest.id)) dismiss();
          }}
        >
          {t('proposals.action.review')}
        </Button>
      }
    >
      <span class="notice-box-text">{latest.title}</span>
      {more && <span class="muted">{more}</span>}
    </Notice>
  ) : (
    <Notice tone="info" icon="proposal" onDismiss={dismiss}>
      <span>{proposalNoticeMessage(latest)}</span>
      {more && <span class="muted">{more}</span>}
    </Notice>
  );
}
