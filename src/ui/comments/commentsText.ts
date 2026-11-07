import { t } from '../../i18n';
import type { ThreadActionError } from '../../store/threadActions';

// Textos curtos da janela Comentários, da barra de status e da faixa: contagens no singular e no
// plural e o motivo de uma ação recusada.

/** "5 abertas" / "1 aberta". */
export function openCountText(count: number): string {
  return count === 1 ? t('comments.openCountOne') : t('comments.openCount', { count });
}

/** "5 conversas abertas · 2 aguardando agente" (a barra de status). */
export function statusBarText(open: number, awaitingAgent: number): string {
  const base =
    open === 1
      ? t('comments.statusBar.openOne')
      : t('comments.statusBar.open', { count: open });
  return awaitingAgent > 0
    ? t('comments.statusBar.awaiting', { open: base, count: awaitingAgent })
    : base;
}

/** "N abertas · M aguardando agente · K resolvidas" (o resumo da janela). */
export function summaryText(
  open: number,
  awaitingAgent: number,
  resolved: number,
): string {
  return [
    open === 1 ? t('comments.count.openOne') : t('comments.count.open', { count: open }),
    t('comments.count.awaitingAgent', { count: awaitingAgent }),
    resolved === 1
      ? t('comments.count.resolvedOne')
      : t('comments.count.resolved', { count: resolved }),
  ].join(' · ');
}

/** Por que a ação foi recusada, em texto para a pessoa. */
export function actionErrorText(error: ThreadActionError): string {
  switch (error) {
    case 'no-identity':
      return t('comments.error.noIdentity');
    case 'read-only':
      return t('comments.error.readOnly');
    case 'reviewing':
      return t('comments.error.reviewing');
    default:
      return t('comments.error.generic');
  }
}
