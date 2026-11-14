import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import {
  projectIndex,
  roleLabelOf,
  type Annotation,
  type Arrow,
  type Layer,
  type ListedMarking,
  type Marking,
  type Project,
} from '../model';
import type { Selection } from '../store/ui';
import { AnnotationLines, AnnotationTitle, IssueBadge } from './AnnotationSummary';
import { Choice } from './controls';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { arrowShort, arrowText, imageLabel, markingLabel } from './labels';
import { annotationDisplayName } from './typedText';

interface ListViewProps {
  readonly onSelect: (selection: NonNullable<Selection>) => void;
}

/** One table row: an annotation of a marking. */
type ListRow =
  | { readonly kind: 'own'; readonly layer: Layer; readonly annotation: Annotation }
  /** Marking without an annotation in the visible layers (only with "show without annotation"). */
  | { readonly kind: 'empty' };

/** Rows of the marking, in layer order. */
function rowsOf({ sections }: ListedMarking): readonly ListRow[] {
  const rows: ListRow[] = [
    ...sections.flatMap(({ layer, annotations }) =>
      annotations.map((annotation): ListRow => ({ kind: 'own', layer, annotation })),
    ),
  ];
  return rows.length > 0 ? rows : [{ kind: 'empty' }];
}

/** The layer tag (dot and name) of the List, Incomplete and Warnings tables. */
export function LayerCell({ layer }: { readonly layer: Layer }) {
  return (
    <span class="list-layer-tag" style={{ '--layer-color': layer.color }}>
      <span class="layer-dot" aria-hidden="true" />
      <span class="list-layer-name">{layer.name}</span>
    </span>
  );
}

/** Membership path of the marking, with the arrow (if any) at the end: "Origin › → Destination". */
export function markingPathLabel(
  project: Project,
  path: readonly Marking[],
  arrow?: Arrow,
): string {
  return [
    ...path.map((m) => markingLabel(project, m)),
    ...(arrow ? [arrowShort(project, arrow)] : []),
  ].join(t('marking.pathSeparator'));
}

interface MarkingCellProps {
  /** The visible text (path or name). */
  readonly label: string;
  /** The button's accessible name. */
  readonly name: string;
  readonly arrow?: boolean;
  readonly current?: boolean;
  readonly needsReview?: boolean;
}

/** The first column's button: the marking (or arrow) that the row describes. */
export function MarkingCell({
  label,
  name,
  arrow,
  current,
  needsReview,
}: MarkingCellProps) {
  return (
    <button
      type="button"
      class="list-marking"
      aria-current={current || undefined}
      aria-label={name}
    >
      {arrow && <Icon name="arrow" />}
      {needsReview && (
        <span class="tree-warning" title={t('marking.needsReview')}>
          ⚠{' '}
        </span>
      )}
      {label}
    </button>
  );
}

/** "↳ of Button" and, in the role link, "↳ of Button (Click)". */
function linkedText(project: Project, a: Annotation, owner: Annotation): string {
  const name = annotationDisplayName(project, owner);
  const role = roleLabelOf(project, a);
  return role === null
    ? t('annotation.linkedTo', { name })
    : t('annotation.linkedToRole', { name, role });
}

function AnnotationCell({
  project,
  row,
}: {
  readonly project: Project;
  readonly row: Exclude<ListRow, { kind: 'empty' }>;
}) {
  const { annotation: a } = row;
  const owner = a.parentAnnotationId
    ? projectIndex(project).annotations.get(a.parentAnnotationId)
    : undefined;
  // With no name or type, shows only the pending badge.
  const named = a.type !== null || a.name !== null;
  return (
    <>
      {named ? (
        <AnnotationTitle project={project} annotation={a} class="list-annotation-name" />
      ) : (
        <IssueBadge project={project} annotation={a} />
      )}
      {owner && <span class="muted list-linked">{linkedText(project, a, owner)}</span>}
    </>
  );
}

/**
 * List window (P7): table Marking | Layer | Annotation | Content, grouped by
 * image, with one row per annotation. Choosing a row selects the marking. The
 * filters are the visible layers (shared with the canvas and the panel), "markings
 * without annotation" and "incomplete only".
 */
export function ListView({ onSelect }: ListViewProps) {
  // Visible layers (the list respects this filter) and the list's already assembled data.
  const { review, ui, derived, layers: layerVisibility } = useEditor();
  // The project in view, the same as `derived.listing` (in the Proposed view, the "as it would be").
  const project = review.derived.shownProject.value;
  const selection: Selection = ui.selection.value;
  const showEmpty = ui.listShowEmpty.value;
  const incompleteOnly = ui.listIncompleteOnly.value;
  const layers = derived.visibleLayers.value;
  const listing = derived.listing.value;
  // The selected arrow highlights its row (arrow and marking ids do not repeat).
  const selectedId =
    selection?.kind === 'marking' || selection?.kind === 'arrow' ? selection.id : null;
  const root = useRef<HTMLDivElement>(null);

  // Selection made on the canvas (or in the tree): keeps the list row in view.
  useEffect(() => {
    if (!selectedId) return;
    const el = [...(root.current?.querySelectorAll<HTMLElement>('[data-marking]') ?? [])];
    el.find((row) => row.dataset.marking === selectedId)?.scrollIntoView({
      block: 'nearest',
    });
  }, [selectedId, listing.length]);

  if (!project) return null;

  const shownIds = new Set(layers.map((l) => l.id));

  return (
    <div class="list-view" ref={root}>
      <div class="list-filters">
        <div class="list-layers" role="group" aria-label={t('list.layers')}>
          {project.layers.map((layer) => (
            <Choice
              key={layer.id}
              checked={shownIds.has(layer.id)}
              aria-label={t('layer.visible', { name: layer.name })}
              label={<LayerCell layer={layer} />}
              onChange={() => layerVisibility.toggle(layer.id)}
            />
          ))}
        </div>
        <Choice
          checked={showEmpty}
          label={t('list.showEmpty')}
          onChange={(e) => (ui.listShowEmpty.value = e.currentTarget.checked)}
        />
        <Choice
          checked={incompleteOnly}
          label={
            <>
              <Icon name="warning" />
              {t('list.incomplete')}
            </>
          }
          onChange={(e) => (ui.listIncompleteOnly.value = e.currentTarget.checked)}
        />
      </div>

      {project.containers.length === 0 && project.markings.length === 0 ? (
        <p class="muted list-message">{t('list.emptyNoImages')}</p>
      ) : listing.length === 0 ? (
        <p class="muted list-message">
          {t(incompleteOnly ? 'list.emptyIncomplete' : 'list.empty')}
        </p>
      ) : (
        <div class="list-scroll">
          <table class="list-table list-table-fixed" aria-label={t('list.title')}>
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
                <th scope="col">{t('list.col.content')}</th>
              </tr>
            </thead>
            {listing.map(({ image, markings }) => (
              <tbody key={image?.id ?? 'canvas'}>
                <tr class="list-image-row">
                  <th scope="colgroup" colSpan={4}>
                    {image ? imageLabel(image) : t('canvas.name')}
                  </th>
                </tr>
                {markings.flatMap((listed) => {
                  const { marking, path, arrow } = listed;
                  // Arrow row: the owner is the arrow ("→ Destination", or its name).
                  const ownerId = arrow?.id ?? marking.id;
                  const label = arrow
                    ? arrowShort(project, arrow)
                    : path
                        .map((m) => markingLabel(project, m))
                        .join(t('marking.pathSeparator'));
                  return rowsOf(listed).map((row, i) => (
                    <tr
                      key={`${ownerId}:${row.kind === 'empty' ? '' : `${row.kind}:${row.annotation.id}`}`}
                      class={i === 0 ? 'list-row list-row-first' : 'list-row'}
                      data-marking={i === 0 ? ownerId : undefined}
                      data-selected={selectedId === ownerId || undefined}
                      onClick={() =>
                        onSelect({ kind: arrow ? 'arrow' : 'marking', id: ownerId })
                      }
                    >
                      <td
                        class="list-cell list-cell-marking"
                        data-label={t('list.col.marking')}
                      >
                        {i === 0 && (
                          <MarkingCell
                            label={label}
                            name={t('list.select', {
                              name: arrow ? arrowText(project, arrow) : label,
                            })}
                            arrow={arrow !== undefined}
                            current={selectedId === ownerId}
                            needsReview={marking.needsReview}
                          />
                        )}
                      </td>
                      {row.kind === 'empty' ? (
                        <td class="list-cell muted list-none" colSpan={3}>
                          {t('list.noAnnotations')}
                        </td>
                      ) : (
                        <>
                          <td
                            class="list-cell list-cell-layer"
                            data-label={t('list.col.layer')}
                          >
                            <LayerCell layer={row.layer} />
                          </td>
                          <td class="list-cell" data-label={t('list.col.annotation')}>
                            <AnnotationCell project={project} row={row} />
                          </td>
                          <td
                            class="list-cell list-cell-content"
                            data-label={t('list.col.content')}
                          >
                            <AnnotationLines
                              project={project}
                              annotation={row.annotation}
                              lineClass="list-entry"
                              keyClass="list-key"
                            />
                          </td>
                        </>
                      )}
                    </tr>
                  ));
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  );
}
