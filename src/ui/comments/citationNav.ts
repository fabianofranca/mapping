import { projectIndex, type CitationTarget, type Project } from '../../model';
import { selectThread } from '../../store/threadUi';
import { expandSections, goToAnnotation } from '../../store/ui';
import type { EditorContextValue } from '../EditorContext';
import { openReviewIn } from '../review/useReviewCommands';
import { openToolWindow } from '../toolWindowLayout';

// Click on a citation chip (Comments stage, CM5): leads to the target reusing what the
// rest of the app already does (selection, go to the annotation, pick the thread, open the review).

type PartTarget = Extract<CitationTarget, { kind: 'field' | 'entry' | 'row' }>;

function goToLayer(editor: EditorContextValue, id: string): void {
  const { ui } = editor;
  editor.layers.show(id);
  expandSections(ui, [{ kind: 'annotations' }, { kind: 'layer', id }]);
  openToolWindow('layers');
}

/** Field and row focus the annotation's field; the pair only the annotation. */
function goToPart(
  editor: EditorContextValue,
  project: Project,
  target: PartTarget,
): void {
  const annotation = projectIndex(project).annotations.get(target.annotationId);
  if (!annotation) return;
  const field = target.kind === 'entry' ? null : target.key;
  goToAnnotation(editor.ui, annotation, field, project, editor.layers.show);
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
    if (annotation) goToAnnotation(ui, annotation, null, project, editor.layers.show);
    return;
  }
  ui.selection.value = {
    kind: target.kind === 'container' ? 'image' : target.kind,
    id: target.id,
  };
}

function goToThread(editor: EditorContextValue, project: Project, id: string): void {
  const thread = editor.session.threads.list.peek().find((th) => th.id === id);
  if (!thread) return;
  selectThread(editor.ui, project, thread);
  // From the chip of a window that is not Details (e.g. "from the thread" in Proposals), the
  // thread only shows up if Details is in view.
  openToolWindow('details');
}

/**
 * Goes to the cited target: marking, container and arrow are selected; annotation, field, pair and
 * row take focus to the annotation (and the field); the layer is shown in the Layers window; the
 * thread is picked and the proposal opens in review. A target that no longer exists does nothing.
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
