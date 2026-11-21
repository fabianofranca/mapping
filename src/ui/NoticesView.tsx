import { t } from '../i18n';
import type { AuditRow, Project } from '../model';
import type { AnnotationLocation } from '../store/ui';
import { AnnotationTitle } from './AnnotationSummary';
import { Choice } from './controls';
import { useEditor } from './EditorContext';
import { LayerCell, MarkingCell, markingPathLabel } from './ListView';
import { arrowText } from './labels';
import { auditFindingText } from './accessibilityText';

interface NoticesViewProps {
  /** Goes to the annotation (shows the layer, selects the marking and scrolls the panel to it). */
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
}

/** The Accessibility section (stage #1127): the audit's warnings, with their own header and count. */
function AccessibilitySection({
  project,
  rows,
  onGoToAnnotation,
}: {
  readonly project: Project;
  readonly rows: readonly AuditRow[];
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
}) {
  return (
    <tbody>
      <tr class="notices-group-row">
        <th scope="colgroup" colSpan={4}>
          <span class="notices-group-head">
            <strong class="notices-place">{t('notices.accessibility.title')}</strong>
            <span class="notices-count muted">
              {t('notices.accessibility.count', { count: rows.length })}
            </span>
          </span>
        </th>
      </tr>
      {rows.map(({ annotation, path, layer, arrow, finding }) => {
        const label = markingPathLabel(project, path, arrow);
        return (
          <tr
            key={`${annotation.id}:${finding.code}`}
            class="list-row list-row-first"
            onClick={() => onGoToAnnotation(annotation)}
          >
            <td class="list-cell list-cell-marking" data-label={t('list.col.marking')}>
              <MarkingCell
                label={label}
                name={t('notices.accessibility.go', {
                  name: arrow ? arrowText(project, arrow) : label,
                })}
                arrow={arrow !== undefined}
              />
            </td>
            <td class="list-cell list-cell-layer" data-label={t('list.col.layer')}>
              <LayerCell layer={layer} />
            </td>
            <td class="list-cell notices-cell" data-label={t('list.col.annotation')}>
              <AnnotationTitle
                project={project}
                annotation={annotation}
                class="list-annotation-name"
              />
            </td>
            <td class="list-cell" data-label={t('notices.col.warning')}>
              {auditFindingText(finding)}
            </td>
          </tr>
        );
      })}
    </tbody>
  );
}

/**
 * Notices window (stage #486, AV3; stage #2085): only the Accessibility section, the audit's warnings
 * with one row per warning. Choosing a row goes to the annotation. "Only visible layers" is UI state.
 */
export function NoticesView({ onGoToAnnotation }: NoticesViewProps) {
  const { review, ui, derived } = useEditor();
  // The project in view (in the Proposed view, the preview).
  const project = review.derived.shownProject.value;
  const audit = derived.auditList.value;
  if (!project) return null;
  const visibleOnly = ui.noticesVisibleOnly.value;

  return (
    <div class="list-view">
      <div class="list-filters">
        <Choice
          checked={visibleOnly}
          label={t('notices.visibleOnly')}
          onChange={(e) => (ui.noticesVisibleOnly.value = e.currentTarget.checked)}
        />
      </div>

      {audit.length === 0 ? (
        <p class="muted list-message">
          {t(visibleOnly ? 'notices.emptyFiltered' : 'notices.empty')}
        </p>
      ) : (
        <div class="list-scroll">
          <table
            class="list-table list-table-fixed notices-table"
            aria-label={t('notices.title')}
          >
            <thead>
              <tr>
                <th scope="col" class="list-col-marking" title={t('list.col.marking')}>
                  {t('list.col.marking')}
                </th>
                <th scope="col" class="list-col-layer" title={t('list.col.layer')}>
                  {t('list.col.layer')}
                </th>
                <th
                  scope="col"
                  class="list-col-annotation"
                  title={t('list.col.annotation')}
                >
                  {t('list.col.annotation')}
                </th>
                <th scope="col" title={t('notices.col.warning')}>
                  {t('notices.col.warning')}
                </th>
              </tr>
            </thead>
            <AccessibilitySection
              project={project}
              rows={audit}
              onGoToAnnotation={onGoToAnnotation}
            />
          </table>
        </div>
      )}
    </div>
  );
}
