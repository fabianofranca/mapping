import { t } from '../i18n';
import {
  findSpecType,
  NOTICE_KINDS,
  type JsonValue,
  type NoticeGroup,
  type NoticeUsage,
  type Project,
  type SpecNoticeKind,
} from '../model';
import type { AnnotationLocation } from '../store/ui';
import { AnnotationTitle } from './AnnotationSummary';
import { Choice, Segmented, type SegmentedItem } from './controls';
import { useEditor } from './EditorContext';
import { LayerCell, MarkingCell, markingPathLabel } from './ListView';
import { arrowText } from './labels';
import { NoticeBadge, noticeKindLabel } from './NoticeBadge';

interface NoticesViewProps {
  /** Goes to the annotation (shows the layer, selects the marking and scrolls the panel to it). */
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
}

type KindFilter = SpecNoticeKind | 'all';

/** The field's value (or the column's cells) as a one-line text. */
function valueText(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(', ');
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** The notice's place: "Alert" (type), "Alert › legacyStyle" (field), "Alert › events › handler". */
function placeText(project: Project, usage: NoticeUsage): string {
  const type = findSpecType(project, {
    specId: usage.specId,
    typeId: usage.typeId,
  })?.type;
  return [type?.name ?? usage.typeId, usage.key, usage.column]
    .filter((part): part is string => Boolean(part))
    .join(' › ');
}

/** The group's header: badge, place, scope, message, `since` and how many annotations it affects. */
function GroupHead({
  project,
  group,
}: {
  readonly project: Project;
  readonly group: NoticeGroup;
}) {
  const { usage } = group;
  return (
    <tr class="notices-group-row">
      <th scope="colgroup" colSpan={4}>
        <span class="notices-group-head">
          <NoticeBadge notice={usage.notice} />
          <strong class="notices-place">{placeText(project, usage)}</strong>
          <span class="muted">{t(`notices.scope.${usage.scope}`)}</span>
          <span class="notices-message">{usage.notice.message}</span>
          {usage.notice.since && (
            <span class="muted">{t('notice.since', { date: usage.notice.since })}</span>
          )}
          <span class="notices-count muted">
            {t('notices.count', { count: group.count })}
          </span>
        </span>
      </th>
    </tr>
  );
}

function kindItems(
  counts: {
    readonly total: number;
    readonly byKind: Readonly<Record<SpecNoticeKind, number>>;
  },
  present: readonly SpecNoticeKind[],
  selected: SpecNoticeKind | null,
): SegmentedItem<KindFilter>[] {
  const kinds = NOTICE_KINDS.filter((k) => present.includes(k) || k === selected);
  return [
    { id: 'all', label: `${t('notices.all')} ${counts.total}` },
    ...kinds.map((k) => ({
      id: k,
      label: `${noticeKindLabel(k)} ${counts.byKind[k]}`,
    })),
  ];
}

/**
 * Notices window (stage #486, AV3): the specialization's notices grouped by notice (from most
 * to least severe), each with the annotations it affects. Choosing a row goes to the annotation.
 * The filters (`kind`, "Only notices in use" and "Visible layers only") are UI state.
 */
export function NoticesView({ onGoToAnnotation }: NoticesViewProps) {
  const { review, ui, derived } = useEditor();
  // The project in view, the same as `derived.noticeList` (in the Proposed view, the preview).
  const project = review.derived.shownProject.value;
  const kind = ui.noticeKind.value;
  const list = derived.noticeList.value;
  const counts = derived.noticeCounts.value;
  if (!project) return null;
  const filtered =
    kind !== null || ui.noticesVisibleOnly.value || !ui.noticesInUseOnly.value;

  return (
    <div class="list-view">
      <div class="list-filters">
        <Segmented
          label={t(
            counts.unit === 'notices'
              ? 'notices.kindFilterNotices'
              : 'notices.kindFilter',
          )}
          items={kindItems(counts, counts.present, kind)}
          value={kind ?? 'all'}
          onSelect={(id) => (ui.noticeKind.value = id === 'all' ? null : id)}
        />
        <Choice
          checked={ui.noticesInUseOnly.value}
          label={t('notices.inUseOnly')}
          onChange={(e) => (ui.noticesInUseOnly.value = e.currentTarget.checked)}
        />
        <Choice
          checked={ui.noticesVisibleOnly.value}
          label={t('notices.visibleOnly')}
          onChange={(e) => (ui.noticesVisibleOnly.value = e.currentTarget.checked)}
        />
      </div>

      {list.length === 0 ? (
        <p class="muted list-message">
          {t(filtered ? 'notices.emptyFiltered' : 'notices.empty')}
        </p>
      ) : (
        <div class="list-scroll">
          <table class="list-table list-table-fixed" aria-label={t('notices.title')}>
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
                <th scope="col">{t('notices.col.value')}</th>
              </tr>
            </thead>
            {list.map((group, index) => (
              <tbody key={`${index}-${group.usage.notice.kind}`}>
                <GroupHead project={project} group={group} />
                {group.rows.length === 0 && (
                  <tr class="notices-unused-row">
                    <td colSpan={4} class="list-cell muted">
                      {t('notices.unused')}
                    </td>
                  </tr>
                )}
                {group.rows.map(({ annotation, path, layer, arrow, value }) => {
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
                          name={t('notices.go', {
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
                      <td class="list-cell" data-label={t('notices.col.value')}>
                        {valueText(value)}
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
