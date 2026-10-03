import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { toggleLayerVisible, type Selection } from '../store/ui';
import { AnnotationLines, AnnotationTitle, IssueBadge } from './AnnotationSummary';
import { useEditor } from './EditorContext';
import { imageLabel, markingLabel, markingPath } from './labels';
import { annotationDisplayName } from './typedText';

interface ListViewProps {
  readonly onSelect: (selection: NonNullable<Selection>) => void;
}

/**
 * Visão de Lista: Imagem → Marcação (caminho completo) → Camada → Anotações com
 * seus pares. Tocar num item seleciona a marcação. Os filtros são as camadas
 * visíveis (compartilhadas com o canvas e o painel) e "marcações sem anotação".
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

  // Seleção feita no canvas (ou na árvore): mantém o item da lista à vista.
  useEffect(() => {
    if (!selectedId) return;
    const el = [...(root.current?.querySelectorAll<HTMLElement>('[data-marking]') ?? [])];
    el.find((item) => item.dataset.marking === selectedId)?.scrollIntoView({
      block: 'nearest',
    });
  }, [selectedId, listing.length]);

  if (!project) return null;

  const shownIds = new Set(layers.map((l) => l.id));
  const ownerLabel = (ownerId: string | null): string | null => {
    const owner = ownerId ? project.annotations.find((a) => a.id === ownerId) : undefined;
    return owner ? annotationDisplayName(project, owner) : null;
  };

  return (
    <div class="list-view" ref={root}>
      <div class="list-filters">
        <div class="list-layers" role="group" aria-label={t('list.layers')}>
          {project.layers.map((layer) => (
            <label
              key={layer.id}
              class="list-layer"
              style={{ '--layer-color': layer.color }}
            >
              <input
                type="checkbox"
                checked={shownIds.has(layer.id)}
                disabled={layer.id === activeId}
                aria-label={t('layer.visible', { name: layer.name })}
                onChange={() => toggleLayerVisible(ui, project, layer.id)}
              />
              <span class="layer-dot" aria-hidden="true" />
              <span class="list-layer-name">{layer.name}</span>
            </label>
          ))}
        </div>
        <label class="list-check">
          <input
            type="checkbox"
            checked={showEmpty}
            onChange={(e) => (ui.listShowEmpty.value = e.currentTarget.checked)}
          />
          <span>{t('list.showEmpty')}</span>
        </label>
        <label class="list-check">
          <input
            type="checkbox"
            checked={incompleteOnly}
            onChange={(e) => (ui.listIncompleteOnly.value = e.currentTarget.checked)}
          />
          <span>⚠ {t('list.incomplete')}</span>
        </label>
      </div>

      {project.images.length === 0 ? (
        <p class="muted">{t('list.emptyNoImages')}</p>
      ) : listing.length === 0 ? (
        <p class="muted">{t(incompleteOnly ? 'list.emptyIncomplete' : 'list.empty')}</p>
      ) : (
        <ul class="list-images" aria-label={t('list.title')}>
          {listing.map(({ image, markings }) => (
            <li key={image.id}>
              <h3 class="list-image">{imageLabel(image)}</h3>
              <ul class="list-markings">
                {markings.map(({ marking, path, sections, inherited }) => {
                  const label = path.map(markingLabel).join(t('marking.pathSeparator'));
                  return (
                    <li key={marking.id}>
                      <button
                        type="button"
                        class="list-marking"
                        data-marking={marking.id}
                        aria-current={selectedId === marking.id || undefined}
                        aria-label={t('list.select', { name: label })}
                        onClick={() => onSelect({ kind: 'marking', id: marking.id })}
                      >
                        <span class="list-path">
                          {marking.needsReview && (
                            <span class="tree-warning" title={t('marking.needsReview')}>
                              ⚠{' '}
                            </span>
                          )}
                          {label}
                        </span>
                        {sections.length === 0 && inherited.length === 0 && (
                          <span class="muted list-none">{t('list.noAnnotations')}</span>
                        )}
                        {sections.map(({ layer, annotations }) => (
                          <span
                            key={layer.id}
                            class="list-layer-section"
                            style={{ '--layer-color': layer.color }}
                          >
                            <span class="list-layer-header">
                              <span class="layer-dot" aria-hidden="true" />
                              {layer.name}
                            </span>
                            {annotations.map((a) => (
                              <span key={a.id} class="list-annotation">
                                {(a.type !== null || a.name !== null) && (
                                  <AnnotationTitle
                                    project={project}
                                    annotation={a}
                                    class="list-annotation-name"
                                  />
                                )}
                                {ownerLabel(a.parentAnnotationId) !== null && (
                                  <span class="muted list-linked">
                                    {t('annotation.linkedTo', {
                                      name: ownerLabel(a.parentAnnotationId) ?? '',
                                    })}
                                  </span>
                                )}
                                {a.type === null && a.name === null && (
                                  <IssueBadge project={project} annotation={a} />
                                )}
                                <AnnotationLines
                                  project={project}
                                  annotation={a}
                                  lineClass="list-entry"
                                  keyClass="list-key"
                                />
                              </span>
                            ))}
                          </span>
                        ))}
                        {inherited.map(({ layer, items }) => (
                          <span
                            key={`inherited:${layer.id}`}
                            class="list-layer-section list-inherited"
                            style={{ '--layer-color': layer.color }}
                          >
                            <span class="list-layer-header">
                              <span class="layer-dot" aria-hidden="true" />
                              {layer.name}
                            </span>
                            {items.map(({ annotation: a, source }) => (
                              <span key={a.id} class="list-annotation">
                                <AnnotationTitle
                                  project={project}
                                  annotation={a}
                                  class="list-annotation-name"
                                />
                                {(a.type !== null || a.name !== null) && (
                                  <AnnotationLines
                                    project={project}
                                    annotation={a}
                                    lineClass="list-entry"
                                    keyClass="list-key"
                                  />
                                )}
                                <span class="muted list-linked">
                                  {t('annotation.inheritedFrom', {
                                    name: markingPath(project, source),
                                  })}
                                </span>
                              </span>
                            ))}
                          </span>
                        ))}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
