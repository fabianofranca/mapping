import type { ComponentChildren } from 'preact';
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
import { SHORTCUT_LABELS } from '../app/shortcuts';
import {
  goToAnnotation,
  isSectionCollapsed,
  toggleSection,
  type AnnotationLocation,
} from '../store/ui';
import { AnnotationEditor } from './AnnotationEditor';
import { AnnotationLines, AnnotationTitle } from './AnnotationSummary';
import { Dialog } from './Dialog';
import { Section } from './DetailsSection';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { markingPath } from './labels';
import {
  annotationDisplayName,
  annotationSummary,
  issueFocusKey,
  issueMessage,
  issuesOf,
  ownerTypeNames,
} from './typedText';
import { Button, IconButton } from './controls';

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

/** Atributo do botão "+ Anotação" (o Alt+N o aciona). */
export const ADD_ANNOTATION_ACTION = 'add-annotation';

/**
 * Anotações da marcação: pendências com links para o campo e um LayerGroup por camada
 * visível (cabeçalho na cor da camada, recolhível).
 */
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
  const { actions, ui } = useEditor();
  const root = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<CreateStep | null>(null);
  // A função muda a cada renderização do pai; o efeito só deve reagir ao foco pedido.
  const onFocusDoneRef = useRef(onFocusDone);
  onFocusDoneRef.current = onFocusDone;
  const visibleLayerIds = new Set(layers.map((l) => l.id));
  const inherited = getInheritedAnnotations(project, marking.id);
  const sourceOf = (a: Annotation) => project.markings.find((m) => m.id === a.markingId);
  const collapsed = ui.collapsed.value;
  const byLayer = layers.map((layer) => ({
    layer,
    annotations: annotationsOf(project, marking.id, layer.id),
  }));
  const count = byLayer.reduce((n, g) => n + g.annotations.length, 0);

  useEffect(() => {
    if (focusAnnotation === null) return;
    const target = [
      ...(root.current?.querySelectorAll<HTMLElement>('[data-annotation]') ?? []),
    ].find((el) => el.dataset.annotation === focusAnnotation);
    if (!target) return;
    onFocusDoneRef.current();
    const field = ui.focusField.peek();
    ui.focusField.value = null;
    const scope =
      (field !== null &&
        [...target.querySelectorAll<HTMLElement>('[data-focus]')].find(
          (el) => el.dataset.focus === field,
        )) ||
      target;
    scope.scrollIntoView({ block: 'nearest' });
    // Campo de texto ou lista primeiro; senão o botão (referência, segmentado).
    (
      scope.querySelector<HTMLElement>('input, select, textarea') ??
      scope.querySelector<HTMLElement>('.props-value button')
    )?.focus({ preventScroll: true });
  }, [focusAnnotation, layers.length, project, collapsed, ui]);

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
    <div class="annotations" ref={root}>
      <IssuesNotice project={project} groups={byLayer} />
      <Section
        section={{ kind: 'annotations' }}
        title={t('annotation.heading')}
        count={count}
        actions={
          activeLayer && (
            <Button
              variant="primary"
              size="sm"
              data-action={ADD_ANNOTATION_ACTION}
              aria-label={t('annotation.addIn', { layer: activeLayer.name })}
              aria-keyshortcuts={SHORTCUT_LABELS.newAnnotation}
              title={`${t('annotation.addIn', { layer: activeLayer.name })}  ${SHORTCUT_LABELS.newAnnotation}`}
              disabled={readOnly}
              onClick={() => add(activeLayer)}
            >
              {t('annotation.add')}
            </Button>
          )
        }
      >
        {byLayer.map(({ layer, annotations }) => {
          const inheritedHere = inherited.filter((a) => a.layerId === layer.id);
          return (
            <LayerGroup
              key={layer.id}
              hasBody={annotations.length > 0 || inheritedHere.length > 0}
              project={project}
              layer={layer}
              active={layer.id === activeLayer?.id}
              annotations={annotations}
              readOnly={readOnly}
              onAdd={() => add(layer)}
            >
              {annotations.map((annotation) => (
                <AnnotationEditor
                  key={annotation.id}
                  project={project}
                  annotation={annotation}
                  visibleLayerIds={visibleLayerIds}
                  onGoToAnnotation={onGoToAnnotation}
                  onShowLayer={onShowLayer}
                  readOnly={readOnly}
                />
              ))}
              <InheritedList
                project={project}
                items={inheritedHere}
                sourceOf={sourceOf}
                onSelectMarking={onSelectMarking}
              />
            </LayerGroup>
          );
        })}
      </Section>

      {step?.kind === 'type' && (
        <Dialog
          title={t('typed.chooseTypeTitle', { layer: step.layer.name })}
          onCancel={() => setStep(null)}
          actions={<Button onClick={() => setStep(null)}>{t('common.cancel')}</Button>}
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
          actions={<Button onClick={() => setStep(null)}>{t('common.cancel')}</Button>}
        >
          <p class="muted">
            {t('typed.chooseOwnerHint', { type: step.definition.name })}
          </p>
          <div class="dialog-stack">
            {step.owners.map((owner) => (
              <Button
                key={owner.id}
                onClick={() => createTyped(step.layer, step.type, owner.id)}
              >
                {annotationDisplayName(project, owner)}
              </Button>
            ))}
          </div>
        </Dialog>
      )}

      {step?.kind === 'no-owner' && (
        <Dialog
          title={t('typed.chooseOwnerTitle', { type: step.definition.name })}
          onCancel={() => setStep(null)}
          actions={<Button onClick={() => setStep(null)}>{t('common.close')}</Button>}
        >
          <p role="alert">
            {t('typed.noOwner', { type: step.definition.name, owners: step.owners })}
          </p>
        </Dialog>
      )}
    </div>
  );
}

interface LayerGroupProps {
  readonly project: Project;
  readonly layer: Layer;
  readonly active: boolean;
  readonly annotations: readonly Annotation[];
  readonly readOnly: boolean;
  readonly onAdd: () => void;
  /** Há conteúdo (anotações próprias ou herdadas) para mostrar ao abrir. */
  readonly hasBody: boolean;
  readonly children: ComponentChildren;
}

/**
 * Grupo de uma camada (LayerGroup do DS 2.0): borda, faixa de 3px na cor da camada,
 * selo da especialização, "· ativa", contagem e ⚠. Recolhido, resume a primeira
 * anotação e não monta as anotações.
 */
function LayerGroup({
  project,
  layer,
  active,
  annotations,
  readOnly,
  onAdd,
  hasBody,
  children,
}: LayerGroupProps) {
  const { ui } = useEditor();
  const section = { kind: 'layer', id: layer.id } as const;
  const collapsed = isSectionCollapsed(ui, section);
  const empty = annotations.length === 0;
  const incomplete = annotations.some((a) => issuesOf(project, a.id).length > 0);
  const spec = layer.spec
    ? project.specializations.find((s) => s.id === layer.spec?.specId)
    : undefined;
  const first = annotations[0];
  const meta = [
    active ? t('layerGroup.active') : null,
    annotations.length > 1 ? String(annotations.length) : null,
  ].filter((s) => s !== null);

  const heading = (
    <>
      <span class="layer-dot" aria-hidden="true" />
      <strong class="layer-group-name">{layer.name}</strong>
      {spec && <span class="tag">{spec.spec?.name ?? spec.id}</span>}
      {meta.length > 0 && (
        <span class="layer-group-meta">{` · ${meta.join(' · ')}`}</span>
      )}
      <span class="layer-group-summary">
        {empty
          ? t('annotation.emptySection')
          : collapsed && first
            ? annotationSummary(project, first)
            : ''}
      </span>
      {incomplete && (
        <span
          class="issue-badge"
          role="img"
          aria-label={t('issue.badge')}
          title={t('issue.badge')}
        >
          ⚠
        </span>
      )}
    </>
  );

  return (
    <div
      class="layer-group"
      style={{ '--layer-color': layer.color }}
      data-layer={layer.id}
    >
      <div class="layer-group-head">
        {!hasBody ? (
          <span class="layer-group-label">
            <span class="layer-group-chevron" aria-hidden="true" />
            {heading}
          </span>
        ) : (
          <button
            type="button"
            class="layer-group-label"
            aria-expanded={!collapsed}
            onClick={() => toggleSection(ui, section)}
          >
            <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} />
            {heading}
          </button>
        )}
        <IconButton
          icon="plus"
          label={t('annotation.addIn', { layer: layer.name })}
          disabled={readOnly}
          onClick={onAdd}
        />
      </div>
      {hasBody && !collapsed && <div class="layer-group-body">{children}</div>}
    </div>
  );
}

/**
 * Pendências da marcação (nas camadas visíveis): cada motivo é um link que abre a
 * camada e a anotação e leva o foco ao campo.
 */
function IssuesNotice({
  project,
  groups,
}: {
  readonly project: Project;
  readonly groups: readonly { layer: Layer; annotations: readonly Annotation[] }[];
}) {
  const { ui } = useEditor();
  const items = groups.flatMap(({ layer, annotations }) =>
    annotations.flatMap((annotation) =>
      issuesOf(project, annotation.id).map((issue, i) => ({
        key: `${annotation.id}:${i}`,
        layer,
        annotation,
        issue,
      })),
    ),
  );
  if (items.length === 0) return null;
  return (
    <div class="issues" role="status">
      <strong class="issues-title">
        <Icon name="warning" />
        {items.length === 1
          ? t('issue.headingOne')
          : t('issue.headingMany', { count: items.length })}
      </strong>
      <ul>
        {items.map(({ key, layer, annotation, issue }) => (
          <li key={key} style={{ '--layer-color': layer.color }}>
            <button
              type="button"
              class="issue-link"
              onClick={() => goToAnnotation(ui, annotation, issueFocusKey(issue))}
            >
              <span class="layer-dot" aria-hidden="true" />
              {t('issue.item', {
                annotation: annotationDisplayName(project, annotation),
                reason: issueMessage(project, annotation, issue),
              })}
            </button>
          </li>
        ))}
      </ul>
    </div>
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
          <Button key={type.id} class="type-option" onClick={() => onChoose(type)}>
            <strong>{type.name}</strong>
            {type.description && <small class="muted">{type.description}</small>}
          </Button>
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

/** Herdadas de uma camada: anotações dos ancestrais, somente leitura (caixa tracejada). */
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
            <span class="inherited-head">
              <span class="layer-dot layer-dot-inherited" aria-hidden="true" />
              <AnnotationTitle project={project} annotation={a} class="inherited-name" />
            </span>
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
