import { t } from '../i18n';
import { canArrange, canFit, projectIndex, type Project } from '../model';
import { showToast } from '../store/ui';
import type { EditorContextValue } from './EditorContext';
import { markingErrorMessage } from './labels';
import { messageText } from './modelMessage';

// "Arrumar" (etapa Biblioteca, B3): o botão de Detalhes, o item do menu do canvas e o
// atalho chamam o mesmo caminho, que mostra o resultado num aviso curto.

/** A marcação tem âncora: o Arrumar também a encosta (R4, decisão 12). */
function isAnchored(project: Project, markingId: string): boolean {
  return projectIndex(project).anchorOf.has(markingId);
}

/**
 * O Arrumar vale para a marcação (no projeto à vista e no catálogo atual): um container com filhas
 * que se arruma, um componente sem slot com eixo que depende do conteúdo, que se ajusta a ele, ou
 * qualquer marcação com âncora, que se encosta nela.
 */
export function canArrangeMarking(
  editor: EditorContextValue,
  markingId: string,
): boolean {
  const project = editor.review.derived.shownProject.value;
  if (project === null) return false;
  const catalog = editor.derived.catalog.value;
  return (
    canArrange(project, catalog, markingId) ||
    canFit(project, catalog, markingId) ||
    isAnchored(project, markingId)
  );
}

/**
 * A dica do botão: arrumar as de dentro (container com filhas), ajustar ao conteúdo ou, na
 * marcação que só tem âncora, encostar nela.
 */
export function arrangeHintKey(
  editor: EditorContextValue,
  markingId: string,
): 'arrange.hint' | 'arrange.hintFit' | 'arrange.hintAnchor' {
  const project = editor.review.derived.shownProject.value;
  if (project === null) return 'arrange.hintFit';
  const catalog = editor.derived.catalog.value;
  if (canArrange(project, catalog, markingId)) return 'arrange.hint';
  if (canFit(project, catalog, markingId)) return 'arrange.hintFit';
  return isAnchored(project, markingId) ? 'arrange.hintAnchor' : 'arrange.hintFit';
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

/** "Encostar na âncora": encosta a marcação e avisa: "Encostado", com avisos, ou "Já está encostada". */
export function snapMarking(editor: EditorContextValue, markingId: string): void {
  const { actions, review, ui } = editor;
  const before = review.derived.shownProject.peek();
  const result = actions.snapToAnchor(markingId);
  if (!result.ok) {
    showToast(ui, markingErrorMessage(result.error));
    return;
  }
  const [first] = result.value;
  if (first !== undefined) {
    showToast(
      ui,
      t('anchor.snappedWarnings', {
        count: result.value.length,
        first: messageText(first),
      }),
    );
    return;
  }
  const changed = review.derived.shownProject.peek() !== before;
  showToast(ui, t(changed ? 'anchor.snapped' : 'anchor.snapNothing'));
}
