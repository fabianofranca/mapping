import { t } from '../../i18n';
import type { MessageSummary } from '../../model';

/** "Vão embora 5 mensagens: 3 de Marina Alves, 2 de Claude Code (agente)." (decisão 23). */
export function impactText(impact: MessageSummary): string {
  const authors = impact.authors
    .map((a) =>
      t('comments.delete.author', {
        count: a.count,
        name:
          a.kind === 'agent' ? t('comments.delete.agent', { name: a.label }) : a.label,
      }),
    )
    .join(', ');
  return t(impact.messages === 1 ? 'comments.delete.goesOne' : 'comments.delete.goes', {
    count: impact.messages,
    authors,
  });
}
