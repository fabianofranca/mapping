import { t } from '../../i18n';
import { citationUrl, threadSubject, type Thread } from '../../model';
import { useEditor } from '../EditorContext';
import { CitationChip } from './CitationChip';
import { useCitationContext } from './citationContext';

/**
 * "Cited in" (decision 33): one chip per thread, open or resolved, that cites the shown
 * thread. Goes away when nobody cites it.
 */
export function CitedIn({ thread }: { readonly thread: Thread }) {
  const { derived } = useEditor();
  const ctx = useCitationContext();
  const ids = derived.threads.citedIn.value.get(thread.id);
  if (ctx === null || ids === undefined) return null;
  const byId = new Map(ctx.threads.map((th) => [th.id, th]));
  const chips = ids.flatMap((id) => {
    const other = byId.get(id);
    const url = other
      ? citationUrl(ctx.projectName, ctx.project, ctx.threads, { kind: 'thread', id })
      : null;
    return other && url !== null
      ? [<CitationChip key={id} url={url} label={threadSubject(other)} />]
      : [];
  });
  if (chips.length === 0) return null;
  return (
    <div class="thread-cited-in" data-cited-in="">
      <span class="thread-cited-in-label">{t('thread.citedIn')}</span>
      {chips}
    </div>
  );
}
