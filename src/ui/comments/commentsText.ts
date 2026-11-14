import { t } from '../../i18n';
import type { ThreadActionError } from '../../store/threadActions';

// Short texts of the Comments window, the status bar and the strip: counts in singular and
// plural and the reason an action was refused.

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

/** Why the action was refused, as text for the person. */
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
