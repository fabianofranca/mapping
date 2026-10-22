import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import type { Annotation, Layer, ListedMarking, Project } from '../model';
import { toggleLayerVisible, type Selection } from '../store/ui';
import { AnnotationLines, AnnotationTitle, IssueBadge } from './AnnotationSummary';
import { Choice } from './controls';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { arrowShort, arrowText, imageLabel, markingLabel } from './labels';
import { annotationDisplayName } from './typedText';

interface ListViewProps {
  readonly onSelect: (selection: NonNullable<Selection>) => void;
}

/** Uma linha da tabela: uma anotação de uma marcação. */
type ListRow =
  | { readonly kind: 'own'; readonly layer: Layer; readonly annotation: Annotation }
  /** Marcação sem anotação nas camadas visíveis (só com "mostrar sem anotação"). */
  | { readonly kind: 'empty' };

/** Linhas da marcação, na ordem das camadas. */
function rowsOf({ sections }: ListedMarking): readonly ListRow[] {
  const rows: ListRow[] = [
    ...sections.flatMap(({ layer, annotations }) =>
      annotations.map((annotation): ListRow => ({ kind: 'own', layer, annotation })),
    ),
  ];
  return rows.length > 0 ? rows : [{ kind: 'empty' }];
}

function LayerCell({ layer }: { readonly layer: Layer }) {
  return (
    <span class="list-layer-tag" style={{ '--layer-color': layer.color }}>
      <span class="layer-dot" aria-hidden="true" />
      <span class="list-layer-name">{layer.name}</span>
    </span>
  );
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
    ? project.annotations.find((other) => other.id === a.parentAnnotationId)
    : undefined;
  // Sem nome nem tipo, mostra só o selo de pendência.
  const named = a.type !== null || a.name !== null;
  return (
    <>
      {named ? (
        <AnnotationTitle project={project} annotation={a} class="list-annotation-name" />
      ) : (
        <IssueBadge project={project} annotation={a} />
      )}
      {owner && (
        <span class="muted list-linked">
          {t('annotation.linkedTo', { name: annotationDisplayName(project, owner) })}
        </span>
      )}
    </>
  );
}

/**
 * Janela Lista (P7): tabela Marcação | Camada | Anotação | Conteúdo, agrupada por
 * imagem, com uma linha por anotação. Escolher uma linha seleciona a marcação. Os
 * filtros são as camadas visíveis (compartilhadas com o canvas e o painel), "marcações
 * sem anotação" e "só incompletas".
 */
export function ListView({ onSelect }: ListViewProps) {
  // Camadas visíveis (a lista respeita esse filtro) e os dados já montados da lista.
  const { review, ui, derived } = useEditor();
  // O projeto à vista, o mesmo de `derived.listing` (na visão Proposto, o "como ficaria").
  const project = review.derived.shownProject.value;
  const selection: Selection = ui.selection.value;
  const showEmpty = ui.listShowEmpty.value;
  const incompleteOnly = ui.listIncompleteOnly.value;
  const layers = derived.visibleLayers.value;
  const listing = derived.listing.value;
  const activeId = derived.activeLayerId.value;
  // A seta selecionada destaca a linha dela (os ids de setas e marcações não se repetem).
  const selectedId =
    selection?.kind === 'marking' || selection?.kind === 'arrow' ? selection.id : null;
  const root = useRef<HTMLDivElement>(null);

  // Seleção feita no canvas (ou na árvore): mantém a linha da lista à vista.
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
              disabled={layer.id === activeId}
              aria-label={t('layer.visible', { name: layer.name })}
              label={<LayerCell layer={layer} />}
              onChange={() => toggleLayerVisible(ui, project, layer.id)}
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
          label={`⚠ ${t('list.incomplete')}`}
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
                  // Linha de seta: o dono é a seta ("→ Destino", ou o nome dela).
                  const ownerId = arrow?.id ?? marking.id;
                  const label = arrow
                    ? arrowShort(project, arrow)
                    : path.map(markingLabel).join(t('marking.pathSeparator'));
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
                          <button
                            type="button"
                            class="list-marking"
                            aria-current={selectedId === ownerId || undefined}
                            aria-label={t('list.select', {
                              name: arrow ? arrowText(project, arrow) : label,
                            })}
                          >
                            {arrow && <Icon name="arrow" />}
                            {marking.needsReview && (
                              <span class="tree-warning" title={t('marking.needsReview')}>
                                ⚠{' '}
                              </span>
                            )}
                            {label}
                          </button>
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
