import { t } from '../i18n';
import { projectIndex, type PageAnchorCrossing, type PageArrowCrossing } from '../model';
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
  /** `anchors` of the `page-anchor-crossing` refusal (or of the arrow one: either list may be empty). */
  readonly anchors: readonly PageAnchorCrossing[];
  readonly onGoToArrow: (arrowId: string) => void;
  readonly onGoToMarking: (anchor: PageAnchorCrossing) => void;
  readonly onClose: () => void;
}

function refusedTitle(arrows: number, anchors: number): string {
  if (anchors === 0) return t('page.move.refusedTitle');
  return arrows === 0
    ? t('page.move.refusedAnchorsTitle')
    : t('page.move.refusedBothTitle');
}

export function MovePageRefusedDialog({
  arrows,
  anchors,
  onGoToArrow,
  onGoToMarking,
  onClose,
}: RefusedProps) {
  const { store } = useEditor();
  const project = store.committed.value;
  if (!project) return null;
  const { markings } = projectIndex(project);
  return (
    <Dialog
      title={refusedTitle(arrows.length, anchors.length)}
      alert
      onCancel={onClose}
      actions={<Button onClick={onClose}>{t('common.close')}</Button>}
    >
      {arrows.length > 0 && <p>{t('page.move.refusedText')}</p>}
      {arrows.length > 0 && (
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
      )}
      {anchors.length > 0 && (
        <>
          {arrows.length === 0 && <p>{t('page.move.refusedAnchorsText')}</p>}
          <ul class="page-refused-list">
            {anchors.map((anchor) => (
              <li key={anchor.marking}>
                <span class="page-refused-arrow">
                  {t('page.move.refusedAnchor', {
                    marking: arrowEndLabel(project, markings.get(anchor.marking)),
                    to: arrowEndLabel(project, markings.get(anchor.to)),
                  })}
                </span>
                <Button
                  size="sm"
                  onClick={() => {
                    onGoToMarking(anchor);
                    onClose();
                  }}
                >
                  {t('page.move.goToMarking')}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}
