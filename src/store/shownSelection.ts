import type { Project } from '../model';
import type { ReviewState } from './review';
import { resolveSelection, type ResolvedSelection, type Selection } from './ui';

// A seleção resolvida contra o projeto à vista (`review.derived.shownProject`): na visão
// Proposto da revisão, o item de uma criação rejeitada já não está no "como ficaria", mas
// continua selecionado (os Detalhes o mostram com "A criação foi rejeitada"); a trilha, a
// barra de status e a limpeza depois de recarregar o resolvem então pelo "como ficaria" sem
// as decisões. Na visão Atual e fora da revisão, só o projeto à vista (a criação ainda não
// existe lá: "Nada selecionado").

type ReviewSource = Pick<ReviewState, 'derived' | 'view' | 'proposalId'>;

/** O projeto em que a seleção existe (o à vista; senão, a prévia sem decisões); `null` se em nenhum. */
export function selectionProject(
  review: ReviewSource,
  selection: Selection,
  peek = false,
): Project | null {
  const d = review.derived;
  const shown = peek ? d.shownProject.peek() : d.shownProject.value;
  if (resolveSelection(shown, selection)) return shown;
  const reviewing = peek ? review.proposalId.peek() : review.proposalId.value;
  const view = peek ? review.view.peek() : review.view.value;
  if (reviewing === null || view !== 'proposed') return null;
  const full = peek ? d.fullPreview.peek() : d.fullPreview.value;
  return resolveSelection(full, selection) ? full : null;
}

/** A seleção resolvida pelo projeto à vista, com a prévia sem decisões na visão Proposto. */
export function resolveShownSelection(
  review: ReviewSource,
  selection: Selection,
  peek = false,
): ResolvedSelection {
  return resolveSelection(selectionProject(review, selection, peek), selection);
}
