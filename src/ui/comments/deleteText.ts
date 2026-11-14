import { t } from '../../i18n';
import type { MessageSummary } from '../../model';

/** "5 messages will go away: 3 from Marina Alves, 2 from Claude Code (agent)." (decision 23). */
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
