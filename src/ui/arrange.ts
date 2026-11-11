import { t } from '../i18n';
import { canArrange, canFit } from '../model';
import { showToast } from '../store/ui';
import type { EditorContextValue } from './EditorContext';
import { markingErrorMessage } from './labels';
import { messageText } from './modelMessage';

// "Arrumar" (etapa Biblioteca, B3): o botão de Detalhes, o item do menu do canvas e o
// atalho chamam o mesmo caminho, que mostra o resultado num aviso curto.

/**
 * O Arrumar vale para a marcação (no projeto à vista e no catálogo atual): um container com filhas
 * que se arruma ou um componente sem slot com eixo que depende do conteúdo, que se ajusta a ele.
 */
export function canArrangeMarking(
  editor: EditorContextValue,
  markingId: string,
): boolean {
  const project = editor.review.derived.shownProject.value;
  if (project === null) return false;
  const catalog = editor.derived.catalog.value;
  return canArrange(project, catalog, markingId) || canFit(project, catalog, markingId);
}

/** A dica do botão: arrumar as de dentro (container com filhas) ou ajustar ao conteúdo (o resto). */
export function arrangeHintKey(
  editor: EditorContextValue,
  markingId: string,
): 'arrange.hint' | 'arrange.hintFit' {
  const project = editor.review.derived.shownProject.value;
  const arranges =
    project !== null && canArrange(project, editor.derived.catalog.value, markingId);
  return arranges ? 'arrange.hint' : 'arrange.hintFit';
}

/** Arruma a marcação e avisa: "Arrumado", "Arrumado com N avisos: …" ou "Nada a arrumar". */
export function arrangeMarking(editor: EditorContextValue, markingId: string): void {
  const { actions, review, ui } = editor;
  const before = review.derived.shownProject.peek();
  const result = actions.arrange(markingId);
  if (!result.ok) {
    showToast(ui, markingErrorMessage(result.error));
    return;
  }
  const warnings = result.value;
  const changed = review.derived.shownProject.peek() !== before;
  const [first] = warnings;
  if (first !== undefined) {
    showToast(
      ui,
      t('arrange.doneWarnings', { count: warnings.length, first: messageText(first) }),
    );
  } else {
    showToast(ui, t(changed ? 'arrange.done' : 'arrange.nothing'));
  }
}
