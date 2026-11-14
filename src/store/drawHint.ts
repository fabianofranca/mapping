import type { Project } from '../model';
import type { EditorMode, Selection } from './ui';

/**
 * The Draw mode hint ("Drag over an image…") shows in the canvas bar, in place of
 * "Nothing selected": only in `draw` mode, with the project unlocked, no selection and the
 * shown project having at least one container. One place for the condition (read by `Breadcrumbs`).
 */
export function drawHintVisible(input: {
  readonly mode: EditorMode;
  readonly locked: boolean;
  readonly selection: Selection;
  readonly shownProject: Project | null;
}): boolean {
  return (
    input.mode === 'draw' &&
    !input.locked &&
    input.selection === null &&
    (input.shownProject?.containers.length ?? 0) > 0
  );
}
