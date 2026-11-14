import { useMemo } from 'preact/hooks';
import { t } from '../../i18n';
import {
  liveCitation,
  parseAnyRef,
  threadSubject,
  type CitationContext,
  type CitationTarget,
  type Thread,
} from '../../model';
import { useEditor } from '../EditorContext';

// The citations context for the interface (Comments stage, CM5): the project in view, all the
// threads (open and resolved) and the loaded proposals. Whoever resolves, labels or searches
// targets uses the model (`src/model/citations.ts`); here we only build what it asks for.

export interface CitationUiContext extends CitationContext {
  /** The `<project>` of the `mapping://` URLs: the folder on disk or, in local mode, the project name. */
  readonly projectName: string;
}

const subjectOf = (thread: Thread): string => threadSubject(thread);

/**
 * The citations context of the project in view (`review.derived.shownProject`, which follows the
 * Current/Proposed view), or `null` without a project. It reads the signals at render time, so
 * whoever uses it re-renders when the project, the threads or the proposals change.
 */
export function useCitationContext(): CitationUiContext | null {
  const { session, review } = useEditor();
  const project = review.derived.shownProject.value;
  const threads = session.threads.list.value;
  const proposalList = session.proposals.list.value;
  const folderName = session.storage.folderName;
  const proposals = useMemo(
    () => proposalList.map(({ id, title }) => ({ id, title })),
    [proposalList],
  );
  return useMemo(
    () =>
      project === null
        ? null
        : {
            project,
            threads,
            proposals,
            subjectOf,
            projectName: folderName ?? project.project.name,
          },
    [project, threads, proposals, folderName],
  );
}

/** The neutral text for what has no name (chip label and the value stored in the link). */
export function citationNameFallback(): string {
  return t('citation.unnamed');
}

/** How a chip looks: the name, whether the target is gone and, if found, the target (to click). */
export interface CitationView {
  /** The live name; without a name, the neutral text; broken, the fallback label. */
  readonly name: string;
  readonly broken: boolean;
  readonly target: CitationTarget | null;
}

/**
 * Resolves `url` in the project in view and computes the chip name (decision 29). `label` is the
 * fallback for when the target no longer exists; without context (no project), the chip is broken.
 */
export function describeCitation(
  ctx: CitationContext | null,
  url: string,
  label: string,
): CitationView {
  const unnamed = citationNameFallback();
  const reserve = label === '' ? unnamed : label;
  if (ctx === null) return { name: reserve, broken: true, target: null };
  const live = liveCitation(ctx, { label, url, ref: parseAnyRef(url) });
  if (live.broken || !live.resolution.found) {
    return { name: reserve, broken: true, target: null };
  }
  const name = live.label === null || live.label === '' ? unnamed : live.label;
  return { name, broken: false, target: live.resolution.target };
}
