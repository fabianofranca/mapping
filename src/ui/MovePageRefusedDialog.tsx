import { t } from '../i18n';
import { projectIndex, type PageArrowCrossing } from '../model';
import { Button } from './controls';
import { Dialog } from './Dialog';
import { useEditor } from './EditorContext';
import { arrowEndLabel } from './labels';

// "Move to page" refused (stage #883, PG2, decision 11): the move would cut arrows, so nothing
// changed. The dialog lists each arrow as "from → to" (the end names come from the project) with
// "Go to the arrow", which calls `onGoToArrow(arrowId)` and closes. The opener (the context menu or
// the Details) passes the navigation: select the arrow, switch to its page, frame it.

interface RefusedProps {
  /** `arrows` of the `page-arrow-crossing` refusal (`MoveRootsResult`). */
  readonly arrows: readonly PageArrowCrossing[];
  readonly onGoToArrow: (arrowId: string) => void;
  readonly onClose: () => void;
}

export function MovePageRefusedDialog({ arrows, onGoToArrow, onClose }: RefusedProps) {
  const { store } = useEditor();
  const project = store.committed.value;
  if (!project) return null;
  const { markings } = projectIndex(project);
  return (
    <Dialog
      title={t('page.move.refusedTitle')}
      alert
      onCancel={onClose}
      actions={<Button onClick={onClose}>{t('common.close')}</Button>}
    >
      <p>{t('page.move.refusedText')}</p>
      <ul class="page-refused-list">
        {arrows.map((arrow) => (
          <li key={arrow.id}>
            <span class="page-refused-arrow">
              {t('page.move.refusedArrow', {
                from: arrowEndLabel(project, markings.get(arrow.from)),
                to: arrowEndLabel(project, markings.get(arrow.to)),
              })}
            </span>
            <Button
              size="sm"
              onClick={() => {
                onGoToArrow(arrow.id);
                onClose();
              }}
            >
              {t('page.move.goToArrow')}
            </Button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
