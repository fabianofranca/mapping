import { t } from '../i18n';
import { annotationsOf, type Layer, type Marking, type Project } from '../model';
import type { ProjectActions } from '../store/project';
import { AnnotationEditor } from './AnnotationEditor';

interface AnnotationsPanelProps {
  readonly project: Project;
  readonly marking: Marking;
  /** Camadas visíveis (uma seção para cada). */
  readonly layers: readonly Layer[];
  /** Destino do botão principal "+ Anotação". */
  readonly activeLayer: Layer | null;
  readonly actions: ProjectActions;
  readonly readOnly: boolean;
}

/** Anotações da marcação, agrupadas por camada visível (cabeçalho na cor da camada). */
export function AnnotationsPanel({
  project,
  marking,
  layers,
  activeLayer,
  actions,
  readOnly,
}: AnnotationsPanelProps) {
  const add = (layer: Layer) => actions.addAnnotation(marking.id, layer.id);

  return (
    <section class="annotations" aria-label={t('annotation.heading')}>
      <div class="annotations-heading">
        <h3>{t('annotation.heading')}</h3>
        {activeLayer && (
          <button
            type="button"
            class="button button-primary"
            aria-label={t('annotation.addIn', { layer: activeLayer.name })}
            title={t('annotation.addIn', { layer: activeLayer.name })}
            disabled={readOnly}
            onClick={() => add(activeLayer)}
          >
            {t('annotation.add')}
          </button>
        )}
      </div>

      {layers.map((layer) => {
        const annotations = annotationsOf(project, marking.id, layer.id);
        return (
          <div
            key={layer.id}
            class="layer-section"
            style={{ '--layer-color': layer.color }}
          >
            <div class="layer-section-header">
              <span class="layer-dot" aria-hidden="true" />
              <strong class="layer-section-name">{layer.name}</strong>
              <button
                type="button"
                class="button"
                aria-label={t('annotation.addIn', { layer: layer.name })}
                title={t('annotation.addIn', { layer: layer.name })}
                disabled={readOnly}
                onClick={() => add(layer)}
              >
                {t('annotation.add')}
              </button>
            </div>
            {annotations.length === 0 ? (
              <p class="muted">{t('annotation.emptySection')}</p>
            ) : (
              annotations.map((annotation) => (
                <AnnotationEditor
                  key={annotation.id}
                  annotation={annotation}
                  actions={actions}
                  readOnly={readOnly}
                />
              ))
            )}
          </div>
        );
      })}
    </section>
  );
}
