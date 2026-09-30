import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import {
  annotationsOf,
  getInheritedAnnotations,
  type Annotation,
  type Layer,
  type Marking,
  type Project,
} from '../model';
import type { ProjectActions } from '../store/project';
import { AnnotationEditor } from './AnnotationEditor';
import { annotationLabel, markingPath } from './labels';

interface AnnotationsPanelProps {
  readonly project: Project;
  readonly marking: Marking;
  /** Camadas visíveis (uma seção para cada). */
  readonly layers: readonly Layer[];
  /** Destino do botão principal "+ Anotação". */
  readonly activeLayer: Layer | null;
  readonly actions: ProjectActions;
  readonly readOnly: boolean;
  /** Torna a camada visível (para ir até uma anotação vinculada numa camada oculta). */
  readonly onShowLayer: (layerId: string) => void;
  /** Seleciona outra marcação e centraliza o canvas nela ("ir para Porta"). */
  readonly onSelectMarking: (markingId: string) => void;
}

/** Anotações da marcação, agrupadas por camada visível (cabeçalho na cor da camada). */
export function AnnotationsPanel({
  project,
  marking,
  layers,
  activeLayer,
  actions,
  readOnly,
  onShowLayer,
  onSelectMarking,
}: AnnotationsPanelProps) {
  const add = (layer: Layer) => actions.addAnnotation(marking.id, layer.id);
  const root = useRef<HTMLElement>(null);
  /** Anotação para onde ir assim que ela estiver na tela (a camada pode acabar de ser mostrada). */
  const [goTo, setGoTo] = useState<string | null>(null);
  const visibleLayerIds = new Set(layers.map((l) => l.id));
  const inherited = getInheritedAnnotations(project, marking.id);
  const sourceOf = (a: Annotation) => project.markings.find((m) => m.id === a.markingId);

  useEffect(() => {
    if (goTo === null) return;
    const target = [
      ...(root.current?.querySelectorAll<HTMLElement>('[data-annotation]') ?? []),
    ].find((el) => el.dataset.annotation === goTo);
    if (!target) return;
    setGoTo(null);
    target.scrollIntoView({ block: 'nearest' });
    target.querySelector<HTMLElement>('input')?.focus({ preventScroll: true });
  }, [goTo, layers.length, project]);

  return (
    <section class="annotations" ref={root} aria-label={t('annotation.heading')}>
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
                  project={project}
                  annotation={annotation}
                  visibleLayerIds={visibleLayerIds}
                  onGoToAnnotation={(a) => setGoTo(a.id)}
                  onShowLayer={onShowLayer}
                  actions={actions}
                  readOnly={readOnly}
                />
              ))
            )}
            <InheritedList
              project={project}
              items={inherited.filter((a) => a.layerId === layer.id)}
              sourceOf={sourceOf}
              onSelectMarking={onSelectMarking}
            />
          </div>
        );
      })}
    </section>
  );
}

interface InheritedListProps {
  readonly project: Project;
  readonly items: readonly Annotation[];
  readonly sourceOf: (annotation: Annotation) => Marking | undefined;
  readonly onSelectMarking: (markingId: string) => void;
}

/** Seção "Herdadas" de uma camada: anotações dos ancestrais, somente leitura. */
function InheritedList({
  project,
  items,
  sourceOf,
  onSelectMarking,
}: InheritedListProps) {
  if (items.length === 0) return null;
  return (
    <div class="inherited">
      <h4 class="inherited-heading">{t('annotation.inheritedHeading')}</h4>
      {items.map((a) => {
        const source = sourceOf(a);
        const sourceName = source ? markingPath(project, source) : '';
        return (
          <div key={a.id} class="inherited-item">
            <strong class="inherited-name">{annotationLabel(a)}</strong>
            {a.name !== null &&
              a.entries.map((e, i) => (
                <span key={i} class="inherited-entry">
                  {e.key}: {e.value}
                </span>
              ))}
            {a.name === null &&
              a.entries.slice(1).map((e, i) => (
                <span key={i} class="inherited-entry">
                  {e.key}: {e.value}
                </span>
              ))}
            {source && (
              <span class="inherited-source">
                {t('annotation.inheritedFrom', { name: sourceName })}
                {' · '}
                <button
                  type="button"
                  class="link-button"
                  onClick={() => onSelectMarking(source.id)}
                >
                  {t('annotation.goToMarking', { name: sourceName })}
                </button>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
