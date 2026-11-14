import { t } from '../i18n';
import type { AnnotationLocation } from '../store/ui';
import { AnnotationTitle } from './AnnotationSummary';
import { Choice } from './controls';
import { useEditor } from './EditorContext';
import { LayerCell, MarkingCell, markingPathLabel } from './ListView';
import { arrowText, imageLabel } from './labels';
import { issueMessage } from './typedText';

interface IncompleteViewProps {
  /** Goes to the annotation (shows the layer, selects the marking and scrolls the panel to it). */
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
}

/**
 * Incomplete window (B5): the project's pending items grouped by image, each with
 * the marking, the layer and the reasons. Choosing one goes to the annotation. "Visible
 * layers only" restricts the list to the layers the canvas shows.
 */
export function IncompleteView({ onGoToAnnotation }: IncompleteViewProps) {
  const { review, ui, derived } = useEditor();
  // The project in view, the same as `derived.incompleteList` (in the Proposed view, the preview).
  const project = review.derived.shownProject.value;
  const visibleOnly = ui.incompleteVisibleOnly.value;
  const list = derived.incompleteList.value;
  if (!project) return null;

  return (
    <div class="list-view">
      <div class="list-filters">
        <Choice
          checked={visibleOnly}
          label={t('incomplete.visibleOnly')}
          onChange={(e) => (ui.incompleteVisibleOnly.value = e.currentTarget.checked)}
        />
      </div>

      {list.length === 0 ? (
        <p class="muted list-message">
          {t(visibleOnly ? 'incomplete.emptyVisible' : 'incomplete.empty')}
        </p>
      ) : (
        <div class="list-scroll">
          <table
            class="list-table list-table-fixed incomplete-table"
            aria-label={t('incomplete.title')}
          >
            <thead>
              <tr>
                <th scope="col" class="list-col-marking">
                  {t('list.col.marking')}
                </th>
                <th scope="col" class="list-col-layer">
                  {t('list.col.layer')}
                </th>
                <th scope="col" class="list-col-annotation">
                  {t('list.col.annotation')}
                </th>
                <th scope="col">{t('incomplete.col.reasons')}</th>
              </tr>
            </thead>
            {list.map(({ image, items }) => (
              <tbody key={image?.id ?? 'canvas'}>
                <tr class="list-image-row">
                  <th scope="colgroup" colSpan={4}>
                    {image ? imageLabel(image) : t('canvas.name')}
                  </th>
                </tr>
                {items.map(({ annotation, path, layer, issues, arrow }) => {
                  // Arrow annotation: the origin and the arrow ("Origin › → Target").
                  const label = markingPathLabel(project, path, arrow);
                  return (
                    <tr
                      key={annotation.id}
                      class="list-row list-row-first"
                      onClick={() => onGoToAnnotation(annotation)}
                    >
                      <td
                        class="list-cell list-cell-marking"
                        data-label={t('list.col.marking')}
                      >
                        <MarkingCell
                          label={label}
                          name={t('incomplete.go', {
                            name: arrow ? arrowText(project, arrow) : label,
                          })}
                          arrow={arrow !== undefined}
                        />
                      </td>
                      <td
                        class="list-cell list-cell-layer"
                        data-label={t('list.col.layer')}
                      >
                        <LayerCell layer={layer} />
                      </td>
                      <td class="list-cell" data-label={t('list.col.annotation')}>
                        <AnnotationTitle
                          project={project}
                          annotation={annotation}
                          class="list-annotation-name"
                        />
                      </td>
                      <td class="list-cell" data-label={t('incomplete.col.reasons')}>
                        <ul class="incomplete-reasons">
                          {issues.map((issue, i) => (
                            <li key={i}>{issueMessage(project, annotation, issue)}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  );
}
