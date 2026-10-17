import { t } from '../i18n';
import { canArrange } from '../model';
import { showToast } from '../store/ui';
import type { EditorContextValue } from './EditorContext';
import { markingErrorMessage } from './labels';

// "Arrumar" (etapa Biblioteca, B3): o botão de Detalhes, o item do menu do canvas e o
// atalho chamam o mesmo caminho, que mostra o resultado num aviso curto.

/** A marcação é um container que dá para arrumar (no projeto à vista e no catálogo atual). */
export function canArrangeMarking(
  editor: EditorContextValue,
  markingId: string,
): boolean {
  const project = editor.review.derived.shownProject.value;
  return project !== null && canArrange(project, editor.derived.catalog.value, markingId);
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
    showToast(ui, t('arrange.doneWarnings', { count: warnings.length, first }));
  } else {
    showToast(ui, t(changed ? 'arrange.done' : 'arrange.nothing'));
  }
}
