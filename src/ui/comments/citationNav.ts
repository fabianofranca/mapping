import { projectIndex, type CitationTarget, type Project } from '../../model';
import type { RevealTarget } from '../../store/reveal';
import { selectThread } from '../../store/threadUi';
import { expandSections, goToAnnotation } from '../../store/ui';
import type { EditorContextValue } from '../EditorContext';
import { openReviewIn } from '../review/useReviewCommands';
import { navigateTo } from '../pageNavigation';
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

/** The target of a citation as `revealTarget` takes it (the thread goes through its anchor). */
function revealTargetOf(
  editor: EditorContextValue,
  target: CitationTarget,
): RevealTarget {
  if (target.kind !== 'thread') return target;
  const thread = editor.session.threads.list.peek().find((th) => th.id === target.id);
  return thread?.anchor ?? target;
}

/**
 * Goes to the cited target: marking, container and arrow are selected; annotation, field, pair and
 * row take focus to the annotation (and the field); the layer is shown in the Layers window; the
 * thread is picked and the proposal opens in review. A target that no longer exists does nothing.
 * An item on another page opens the page first (and the Completa, if the perspective hides it): the
 * project in view is read after that, so it already has the item.
 */
export function goToCitation(editor: EditorContextValue, target: CitationTarget): void {
  if (target.kind === 'proposal') {
    openReviewIn(editor, target.id);
    return;
  }
  navigateTo(editor, revealTargetOf(editor, target), () => {
    const project = editor.review.derived.shownProject.peek();
    if (project) goTo(editor, project, target);
  });
}

function goTo(
  editor: EditorContextValue,
  project: Project,
  target: CitationTarget,
): void {
  switch (target.kind) {
    case 'layer':
      return goToLayer(editor, target.id);
    case 'thread':
      return goToThread(editor, project, target.id);
    case 'field':
    case 'entry':
    case 'row':
      return goToPart(editor, project, target);
    case 'proposal':
      return;
    default:
      return goToItem(editor, project, target);
  }
}
