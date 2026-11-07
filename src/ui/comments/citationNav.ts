import { projectIndex, type CitationTarget, type Project } from '../../model';
import { selectThread } from '../../store/threadUi';
import { expandSections, goToAnnotation, showLayer } from '../../store/ui';
import type { EditorContextValue } from '../EditorContext';
import { openReviewIn } from '../review/useReviewCommands';
import { openToolWindow } from '../toolWindowLayout';

// O clique num chip de citação (etapa Comentários, CM5): leva ao alvo reaproveitando o que o
// resto da app já faz (seleção, ir até a anotação, escolher a conversa, abrir a revisão).

type PartTarget = Extract<CitationTarget, { kind: 'field' | 'entry' | 'row' }>;

function goToLayer(editor: EditorContextValue, id: string): void {
  const { ui } = editor;
  showLayer(ui, id);
  expandSections(ui, [{ kind: 'annotations' }, { kind: 'layer', id }]);
  openToolWindow('layers');
}

/** Campo e linha focam o campo da anotação; o par só a anotação. */
function goToPart(
  editor: EditorContextValue,
  project: Project,
  target: PartTarget,
): void {
  const annotation = projectIndex(project).annotations.get(target.annotationId);
  if (!annotation) return;
  const field = target.kind === 'entry' ? null : target.key;
  goToAnnotation(editor.ui, annotation, field, project);
}

function goToItem(
  editor: EditorContextValue,
  project: Project,
  target: Extract<
    CitationTarget,
    { kind: 'marking' | 'container' | 'arrow' | 'annotation' }
  >,
): void {
  const { ui } = editor;
  if (target.kind === 'annotation') {
    const annotation = projectIndex(project).annotations.get(target.id);
    if (annotation) goToAnnotation(ui, annotation, null, project);
    return;
  }
  ui.selection.value = {
    kind: target.kind === 'container' ? 'image' : target.kind,
    id: target.id,
  };
}

function goToThread(editor: EditorContextValue, project: Project, id: string): void {
  const thread = editor.session.threads.list.peek().find((th) => th.id === id);
  if (thread) selectThread(editor.ui, project, thread);
}

/**
 * Vai até o alvo citado: marcação, container e seta são selecionados; anotação, campo, par e
 * linha levam o foco até a anotação (e o campo); a camada é mostrada na janela Camadas; a
 * conversa é escolhida e a proposta abre na revisão. Alvo que não existe mais não faz nada.
 */
export function goToCitation(editor: EditorContextValue, target: CitationTarget): void {
  if (target.kind === 'proposal') {
    openReviewIn(editor, target.id);
    return;
  }
  const project = editor.review.derived.shownProject.peek();
  if (!project) return;
  switch (target.kind) {
    case 'layer':
      return goToLayer(editor, target.id);
    case 'thread':
      return goToThread(editor, project, target.id);
    case 'field':
    case 'entry':
    case 'row':
      return goToPart(editor, project, target);
    default:
      return goToItem(editor, project, target);
  }
}
