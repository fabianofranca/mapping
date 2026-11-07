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

// O contexto das citações para a interface (etapa Comentários, CM5): o projeto à vista, todas as
// conversas (abertas e resolvidas) e as propostas carregadas. Quem resolve, rotula ou busca
// alvos usa o modelo (`src/model/citations.ts`); aqui só se monta o que ele pede.

export interface CitationUiContext extends CitationContext {
  /** O `<projeto>` das URLs `mapping://`: a pasta no disco ou, no modo local, o nome do projeto. */
  readonly projectName: string;
}

const subjectOf = (thread: Thread): string => threadSubject(thread);

/**
 * O contexto de citações do projeto à vista (`review.derived.shownProject`, que segue a visão
 * Atual/Proposto), ou `null` sem projeto. Lê os signals no render, então quem usa re-renderiza
 * quando o projeto, as conversas ou as propostas mudam.
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

/** O texto neutro do que não tem nome (rótulo do chip e valor gravado no link). */
export function citationNameFallback(): string {
  return t('citation.unnamed');
}

/** Como um chip aparece: o nome, se o alvo sumiu e, achado, o alvo (para o clique). */
export interface CitationView {
  /** O nome vivo; sem nome, o texto neutro; quebrada, o rótulo de reserva. */
  readonly name: string;
  readonly broken: boolean;
  readonly target: CitationTarget | null;
}

/**
 * Resolve `url` no projeto à vista e calcula o nome do chip (decisão 29). `label` é a reserva
 * de quando o alvo não existe mais; sem contexto (sem projeto), o chip fica quebrado.
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
