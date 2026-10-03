import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import {
  annotationsOf,
  getInheritedAnnotations,
  layerAnnotationTypes,
  validTypedOwners,
  type Annotation,
  type AnnotationTypeRef,
  type Layer,
  type Marking,
  type Project,
  type SpecAnnotationType,
} from '../model';
import type { AnnotationLocation } from '../store/ui';
import { AnnotationEditor } from './AnnotationEditor';
import { AnnotationLines, AnnotationTitle } from './AnnotationSummary';
import { Dialog } from './Dialog';
import { useEditor } from './EditorContext';
import { markingPath } from './labels';
import { annotationDisplayName, ownerTypeNames } from './typedText';

interface AnnotationsPanelProps {
  readonly project: Project;
  readonly marking: Marking;
  /** Camadas visíveis (uma seção para cada). */
  readonly layers: readonly Layer[];
  /** Destino do botão principal "+ Anotação". */
  readonly activeLayer: Layer | null;
  readonly readOnly: boolean;
  /** Torna a camada visível (para ir até uma anotação vinculada numa camada oculta). */
  readonly onShowLayer: (layerId: string) => void;
  /** Seleciona outra marcação e centraliza o canvas nela ("ir para Porta"). */
  readonly onSelectMarking: (markingId: string) => void;
  /** Vai até a anotação, em qualquer marcação (backlinks, alvo, vinculadas). */
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
  /** Anotação para rolar até assim que estiver na tela (estado da UI). */
  readonly focusAnnotation: string | null;
  readonly onFocusDone: () => void;
}

/** Passos da criação numa camada de especialização (docs/history/PLAN-etapas-1-2.md 13.5, "Criar"). */
type CreateStep =
  | { readonly kind: 'type'; readonly layer: Layer }
  | {
      readonly kind: 'owner';
      readonly layer: Layer;
      readonly type: AnnotationTypeRef;
      readonly definition: SpecAnnotationType;
      readonly owners: readonly Annotation[];
    }
  | {
      readonly kind: 'no-owner';
      readonly definition: SpecAnnotationType;
      readonly owners: string;
    };

/** Anotações da marcação, agrupadas por camada visível (cabeçalho na cor da camada). */
export function AnnotationsPanel({
  project,
  marking,
  layers,
  activeLayer,
  readOnly,
  onShowLayer,
  onSelectMarking,
  onGoToAnnotation,
  focusAnnotation,
  onFocusDone,
}: AnnotationsPanelProps) {
  const { actions } = useEditor();
  const root = useRef<HTMLElement>(null);
  const [step, setStep] = useState<CreateStep | null>(null);
  // A função muda a cada renderização do pai; o efeito só deve reagir ao foco pedido.
  const onFocusDoneRef = useRef(onFocusDone);
  onFocusDoneRef.current = onFocusDone;
  const visibleLayerIds = new Set(layers.map((l) => l.id));
  const inherited = getInheritedAnnotations(project, marking.id);
  const sourceOf = (a: Annotation) => project.markings.find((m) => m.id === a.markingId);

  useEffect(() => {
    if (focusAnnotation === null) return;
    const target = [
      ...(root.current?.querySelectorAll<HTMLElement>('[data-annotation]') ?? []),
    ].find((el) => el.dataset.annotation === focusAnnotation);
    if (!target) return;
    onFocusDoneRef.current();
    target.scrollIntoView({ block: 'nearest' });
    target.querySelector<HTMLElement>('input, select')?.focus({ preventScroll: true });
  }, [focusAnnotation, layers.length, project]);

  const created = (layerId: string, result: { ok: boolean; value?: string }) => {
    if (result.ok && result.value) {
      onGoToAnnotation({ id: result.value, markingId: marking.id, layerId });
    }
  };

  const createTyped = (layer: Layer, type: AnnotationTypeRef, owner: string | null) => {
    setStep(null);
    created(layer.id, actions.addTypedAnnotation(marking.id, layer.id, type, owner));
  };

  const chooseType = (layer: Layer, definition: SpecAnnotationType) => {
    if (!layer.spec) return;
    const type = { specId: layer.spec.specId, typeId: definition.id };
    if (!definition.requiresOwner) {
      createTyped(layer, type, null);
      return;
    }
    const owners = validTypedOwners(project, marking.id, type);
    if (owners.length === 0) {
      setStep({
        kind: 'no-owner',
        definition,
        owners: ownerTypeNames(project, { type }),
      });
    } else {
      setStep({ kind: 'owner', layer, type, definition, owners });
    }
  };

  const add = (layer: Layer) => {
    if (layer.spec) {
      setStep({ kind: 'type', layer });
      return;
    }
    created(layer.id, actions.addAnnotation(marking.id, layer.id));
  };

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
                  onGoToAnnotation={onGoToAnnotation}
                  onShowLayer={onShowLayer}
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

      {step?.kind === 'type' && (
        <Dialog
          title={t('typed.chooseTypeTitle', { layer: step.layer.name })}
          onCancel={() => setStep(null)}
          actions={
            <button type="button" class="button" onClick={() => setStep(null)}>
              {t('common.cancel')}
            </button>
          }
        >
          <TypeList
            types={layerAnnotationTypes(project, step.layer.id)}
            onChoose={(definition) => chooseType(step.layer, definition)}
          />
        </Dialog>
      )}

      {step?.kind === 'owner' && (
        <Dialog
          title={t('typed.chooseOwnerTitle', { type: step.definition.name })}
          onCancel={() => setStep(null)}
          actions={
            <button type="button" class="button" onClick={() => setStep(null)}>
              {t('common.cancel')}
            </button>
          }
        >
          <p class="muted">
            {t('typed.chooseOwnerHint', { type: step.definition.name })}
          </p>
          <div class="dialog-stack">
            {step.owners.map((owner) => (
              <button
                key={owner.id}
                type="button"
                class="button"
                onClick={() => createTyped(step.layer, step.type, owner.id)}
              >
                {annotationDisplayName(project, owner)}
              </button>
            ))}
          </div>
        </Dialog>
      )}

      {step?.kind === 'no-owner' && (
        <Dialog
          title={t('typed.chooseOwnerTitle', { type: step.definition.name })}
          onCancel={() => setStep(null)}
          actions={
            <button type="button" class="button" onClick={() => setStep(null)}>
              {t('common.close')}
            </button>
          }
        >
          <p role="alert">
            {t('typed.noOwner', { type: step.definition.name, owners: step.owners })}
          </p>
        </Dialog>
      )}
    </section>
  );
}

/** Tipos da camada, com a descrição de cada um. */
function TypeList({
  types,
  onChoose,
}: {
  readonly types: readonly SpecAnnotationType[];
  readonly onChoose: (type: SpecAnnotationType) => void;
}) {
  if (types.length === 0) return <p>{t('typed.noTypes')}</p>;
  return (
    <>
      <p class="muted">{t('typed.chooseTypeHint')}</p>
      <div class="dialog-stack">
        {types.map((type) => (
          <button
            key={type.id}
            type="button"
            class="button type-option"
            onClick={() => onChoose(type)}
          >
            <strong>{type.name}</strong>
            {type.description && <small class="muted">{type.description}</small>}
          </button>
        ))}
      </div>
    </>
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
        // Livre sem nome: o título já é o primeiro par.
        const lines =
          a.type || a.name !== null ? a : { ...a, entries: a.entries.slice(1) };
        return (
          <div key={a.id} class="inherited-item">
            <AnnotationTitle project={project} annotation={a} class="inherited-name" />
            <AnnotationLines
              project={project}
              annotation={lines}
              lineClass="inherited-entry"
            />
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
