import { useRef } from 'preact/hooks';
import { t } from '../i18n';
import { collapseTree, revealInTree, type Selection } from '../store/ui';
import { useEditor } from './EditorContext';
import { afterPaint, MarkingTree, scrollToSelected } from './MarkingTree';
import { ToolWindow } from './ToolWindow';
import { IconButton } from './controls';

interface TreeWindowProps {
  readonly onSelect: (selection: NonNullable<Selection>) => void;
}

/**
 * Markings Tree window (left), with Locate the selection and Collapse all. It shows
 * the project in view: in the Proposed view of the review, the "how it would look" (a
 * new import only has images and items in the preview); otherwise, the current project.
 */
export function TreeWindow({ onSelect }: TreeWindowProps) {
  const { review, ui } = useEditor();
  const body = useRef<HTMLDivElement>(null);
  const shown = review.derived.shownProject;
  const project = shown.value;
  const selection = ui.selection.value;

  const locate = () => {
    revealInTree(ui, shown.peek(), ui.selection.peek());
    afterPaint(() => scrollToSelected(body.current, true));
  };

  return (
    <ToolWindow
      id="tree"
      actions={
        <>
          <IconButton
            icon="locate"
            label={t('tree.locate')}
            disabled={selection === null}
            onClick={locate}
          />
          <IconButton
            icon="collapseAll"
            label={t('tree.collapseAll')}
            onClick={() => collapseTree(ui, shown.peek())}
          />
        </>
      }
    >
      <div ref={body}>
        {project && (
          <MarkingTree project={project} selection={selection} onSelect={onSelect} />
        )}
      </div>
    </ToolWindow>
  );
}
