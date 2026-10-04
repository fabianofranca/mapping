import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import type { Annotation, Layer, ListedMarking, Marking, Project } from '../model';
import { toggleLayerVisible, type Selection } from '../store/ui';
import { AnnotationLines, AnnotationTitle, IssueBadge } from './AnnotationSummary';
import { Choice } from './controls';
import { useEditor } from './EditorContext';
import { imageLabel, markingLabel, markingPath } from './labels';
import { annotationDisplayName } from './typedText';

interface ListViewProps {
  readonly onSelect: (selection: NonNullable<Selection>) => void;
}

/** Uma linha da tabela: uma anotação (própria ou herdada) de uma marcação. */
type ListRow =
  | { readonly kind: 'own'; readonly layer: Layer; readonly annotation: Annotation }
  | {
      readonly kind: 'inherited';
      readonly layer: Layer;
      readonly annotation: Annotation;
      readonly source: Marking;
    }
  /** Marcação sem anotação nas camadas visíveis (só com "mostrar sem anotação"). */
  | { readonly kind: 'empty' };

/** Linhas da marcação: próprias primeiro, herdadas depois, na ordem das camadas. */
function rowsOf({ sections, inherited }: ListedMarking): readonly ListRow[] {
  const rows: ListRow[] = [
    ...sections.flatMap(({ layer, annotations }) =>
      annotations.map((annotation): ListRow => ({ kind: 'own', layer, annotation })),
    ),
    ...inherited.flatMap(({ layer, items }) =>
      items.map(({ annotation, source }): ListRow => ({
        kind: 'inherited',
        layer,
        annotation,
        source,
      })),
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
  // Herdada sempre mostra o título; própria sem nome mostra só o selo de pendência.
  const named = a.type !== null || a.name !== null || row.kind === 'inherited';
  return (
    <>
      {named ? (
        <AnnotationTitle project={project} annotation={a} class="list-annotation-name" />
      ) : (
        row.kind === 'own' && <IssueBadge project={project} annotation={a} />
      )}
      {row.kind === 'own' && owner && (
        <span class="muted list-linked">
          {t('annotation.linkedTo', { name: annotationDisplayName(project, owner) })}
        </span>
      )}
      {row.kind === 'inherited' && (
        <span class="muted list-linked">
          {t('annotation.inheritedFrom', { name: markingPath(project, row.source) })}
        </span>
      )}
    </>
  );
}

/**
 * Janela Lista (P7): tabela Marcação | Camada | Anotação | Conteúdo, agrupada por
 * imagem, com uma linha por anotação. Escolher uma linha seleciona a marcação. Os
 * filtros são as camadas visíveis (compartilhadas com o canvas e o painel), "marcações
 * sem anotação" e "só incompletas". No celular a tabela vira cartões (CSS).
 */
export function ListView({ onSelect }: ListViewProps) {
  // Camadas visíveis (a lista respeita esse filtro) e os dados já montados da lista.
  const { store, ui, derived } = useEditor();
  const project = store.committed.value;
  const selection: Selection = ui.selection.value;
  const showEmpty = ui.listShowEmpty.value;
  const incompleteOnly = ui.listIncompleteOnly.value;
  const layers = derived.visibleLayers.value;
  const listing = derived.listing.value;
  const activeId = derived.activeLayerId.value;
  const selectedId = selection?.kind === 'marking' ? selection.id : null;
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

      {project.images.length === 0 ? (
        <p class="muted list-message">{t('list.emptyNoImages')}</p>
      ) : listing.length === 0 ? (
        <p class="muted list-message">
          {t(incompleteOnly ? 'list.emptyIncomplete' : 'list.empty')}
        </p>
      ) : (
        <div class="list-scroll">
          <table class="list-table" aria-label={t('list.title')}>
            <thead>
              <tr>
                <th scope="col">{t('list.col.marking')}</th>
                <th scope="col">{t('list.col.layer')}</th>
                <th scope="col">{t('list.col.annotation')}</th>
                <th scope="col">{t('list.col.content')}</th>
              </tr>
            </thead>
            {listing.map(({ image, markings }) => (
              <tbody key={image.id}>
                <tr class="list-image-row">
                  <th scope="colgroup" colSpan={4}>
                    {imageLabel(image)}
                  </th>
                </tr>
                {markings.flatMap((listed) => {
                  const { marking, path } = listed;
                  const label = path.map(markingLabel).join(t('marking.pathSeparator'));
                  return rowsOf(listed).map((row, i) => (
                    <tr
                      key={`${marking.id}:${row.kind === 'empty' ? '' : `${row.kind}:${row.annotation.id}`}`}
                      class={i === 0 ? 'list-row list-row-first' : 'list-row'}
                      data-marking={i === 0 ? marking.id : undefined}
                      data-selected={selectedId === marking.id || undefined}
                      onClick={() => onSelect({ kind: 'marking', id: marking.id })}
                    >
                      <td
                        class="list-cell list-cell-marking"
                        data-label={t('list.col.marking')}
                      >
                        {i === 0 && (
                          <button
                            type="button"
                            class="list-marking"
                            aria-current={selectedId === marking.id || undefined}
                            aria-label={t('list.select', { name: label })}
                          >
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
                            class={
                              row.kind === 'inherited'
                                ? 'list-cell list-cell-content list-inherited'
                                : 'list-cell list-cell-content'
                            }
                            data-label={t('list.col.content')}
                          >
                            {(row.kind === 'own' ||
                              row.annotation.type !== null ||
                              row.annotation.name !== null) && (
                              <AnnotationLines
                                project={project}
                                annotation={row.annotation}
                                lineClass="list-entry"
                                keyClass="list-key"
                              />
                            )}
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
