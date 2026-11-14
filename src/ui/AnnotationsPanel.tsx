import { Fragment, type ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t, type TranslationKey } from '../i18n';
import {
  annotationsOf,
  projectIndex,
  specLayerOf,
  typeOfAnnotation,
  validTypedOwners,
  type Annotation,
  type AnnotationTypeRef,
  type Layer,
  type Marking,
  type Project,
  type SpecAnnotationType,
} from '../model';
import {
  goToAnnotation,
  isSectionCollapsed,
  toggleSection,
  type AnnotationLocation,
} from '../store/ui';
import { AnnotationEditor } from './AnnotationEditor';
import { useDetailsExtension, type DetailsExtension } from './DetailsExtension';
import { Dialog } from './Dialog';
import { DialogSlotContext, useDialogSlot } from './focus';
import { Section } from './DetailsSection';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { TypePicker } from './TypePicker';
import {
  annotationDisplayName,
  annotationSummary,
  issueFocusKey,
  issueMessage,
  issuesOf,
  ownerTypeNames,
} from './typedText';
import { Button, IconButton } from './controls';
import {
  offeredTypeChoice,
  type AnnotationOwnerKind,
  type OfferedTypesEmpty,
} from './offeredTypes';

interface AnnotationsPanelProps {
  readonly project: Project;
  /** The owner of the annotations: a marking or an arrow (only the id matters). */
  readonly marking: Pick<Marking, 'id'>;
  /** Default: marking. The arrow offers the types that apply to it (`offeredTypes`). */
  readonly ownerKind?: AnnotationOwnerKind;
  /** Visible layers (one section for each). */
  readonly layers: readonly Layer[];
  readonly readOnly: boolean;
  /** Makes the layer visible (to go to an annotation linked in a hidden layer). */
  readonly onShowLayer: (layerId: string) => void;
  /** Goes to the annotation, on any marking (backlinks, target, linked). */
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
  /** Annotation to scroll to as soon as it is on screen (UI state). */
  readonly focusAnnotation: string | null;
  readonly onFocusDone: () => void;
}

const EMPTY_TYPES_KEY: Record<OfferedTypesEmpty, TranslationKey> = {
  unavailable: 'typed.empty.unavailable',
  'no-types': 'typed.empty.noTypes',
  floating: 'typed.empty.floating',
  'not-for-arrow': 'typed.empty.arrow',
  'not-for-marking': 'typed.empty.marking',
};

/** What the + of the layer offers this owner and, with no type, the reason message. */
function typeOffer(
  project: Project,
  markingId: string,
  kind: AnnotationOwnerKind,
  layerId: string,
) {
  const floating = projectIndex(project).markings.get(markingId)?.floating === true;
  const { types, empty } = offeredTypeChoice(project, layerId, { kind, floating });
  return { types, message: empty ? t(EMPTY_TYPES_KEY[empty]) : undefined };
}

interface TypeStepDialogProps {
  readonly project: Project;
  readonly markingId: string;
  readonly ownerKind: AnnotationOwnerKind;
  readonly layer: Layer;
  readonly onChoose: (type: SpecAnnotationType) => void;
  readonly onCancel: () => void;
}

/** The dialog of a specialization layer's +: the types it offers, or the reason there are none. */
function TypeStepDialog({
  project,
  markingId,
  ownerKind,
  layer,
  onChoose,
  onCancel,
}: TypeStepDialogProps) {
  const offer = typeOffer(project, markingId, ownerKind, layer.id);
  return (
    <Dialog
      title={t('typed.chooseTypeTitle', { layer: layer.name })}
      onCancel={onCancel}
      actions={<Button onClick={onCancel}>{t('common.cancel')}</Button>}
    >
      <TypePicker
        types={offer.types}
        emptyMessage={offer.message}
        groups={specLayerOf(project, layer)?.groups}
        onChoose={onChoose}
      />
    </Dialog>
  );
}

/** Creation steps on a specialization layer (docs/ARCHITECTURE.md, "Specializations in the project and typed annotations"). */
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

/**
  * Annotations of the marking: pending items with links to the field and one LayerGroup per
  * visible layer (header in the layer's color, collapsible).
 */
export function AnnotationsPanel({
  project,
  marking,
  ownerKind = 'marking',
  layers: visible,
  readOnly,
  onShowLayer,
  onGoToAnnotation,
  focusAnnotation,
  onFocusDone,
}: AnnotationsPanelProps) {
  const editor = useEditor();
  const { actions, ui } = editor;
  const ext = useDetailsExtension();
  // With the extension (review), it says which layers to show (e.g. a hidden one with changes).
  const layers = ext ? ext.layers(visible) : visible;
  const root = useRef<HTMLDivElement>(null);
  // The creation steps (type › owner) are a slot: the swap keeps whoever opened the first.
  const steps = useDialogSlot<CreateStep>();
  const step = steps.current;
  // The function changes on every render of the parent; the effect should only react to the
  // requested focus.
  const onFocusDoneRef = useRef(onFocusDone);
  onFocusDoneRef.current = onFocusDone;
  const visibleLayerIds = new Set(layers.map((l) => l.id));
  const collapsed = ui.collapsed.value;
  const byLayer = layers.map((layer) => ({
    layer,
    annotations: annotationsOf(project, marking.id, layer.id),
    removed: ext?.removedAnnotations(marking.id, layer.id) ?? [],
  }));
  const count = byLayer.reduce((n, g) => n + g.annotations.length, 0);

  // "Go to the annotation" (backlinks, pending items, creation, "pick and go" in the picker): the
  // panel owns this focus and acts in the commit that draws the card. A dialog that closes in the
  // same render gives focus back later (microtask) and, seeing it here, does not touch it (F2).
  useLayoutEffect(() => {
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
    // Text field or list first; otherwise the button (reference, segmented).
    (
      scope.querySelector<HTMLElement>('input, select, textarea') ??
      scope.querySelector<HTMLElement>('[data-focus] button')
    )?.focus({ preventScroll: true });
  }, [focusAnnotation, layers.length, project, collapsed, ui]);

  const created = (layerId: string, result: { ok: boolean; value?: string }) => {
    if (result.ok && result.value) {
      onGoToAnnotation({ id: result.value, markingId: marking.id, layerId });
    }
  };

  const createTyped = (
    layer: Layer,
    type: AnnotationTypeRef,
    owner: string | null,
    role: string | null = null,
  ) => {
    steps.close();
    created(
      layer.id,
      actions.addTypedAnnotation(marking.id, layer.id, type, owner, role),
    );
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
      steps.show({
        kind: 'no-owner',
        definition,
        owners: ownerTypeNames(project, { type }),
      });
    } else {
      steps.show({ kind: 'owner', layer, type, definition, owners });
    }
  };

  const add = (layer: Layer) => {
    if (layer.spec) {
      steps.show({ kind: 'type', layer });
      return;
    }
    created(layer.id, actions.addAnnotation(marking.id, layer.id));
  };

  return (
    <div class="annotations" ref={root} tabIndex={-1}>
      <IssuesNotice project={project} groups={byLayer} />
      <Section
        section={{ kind: 'annotations' }}
        title={t('annotation.heading')}
        count={count}
      >
        {ext?.annotationsNotice(marking.id)}
        {layers.length === 0 && project.layers.length > 0 && (
          <div class="annotations-all-hidden">
            <span>{t('annotation.allLayersHidden')}</span>
            <Button
              size="sm"
              onClick={() => {
                // The button disappears when the layers return: focus stays on the section, not on body.
                root.current?.focus();
                editor.layers.showAll();
              }}
            >
              {t('layer.showAll')}
            </Button>
          </div>
        )}
        {byLayer.map(({ layer, annotations, removed }) => {
          const items: { readonly key: string; readonly node: ComponentChildren }[] =
            annotations.map((annotation) => ({
              key: annotation.id,
              node: (
                <AnnotationEditor
                  project={project}
                  annotation={annotation}
                  visibleLayerIds={visibleLayerIds}
                  onGoToAnnotation={onGoToAnnotation}
                  onShowLayer={onShowLayer}
                  readOnly={readOnly}
                />
              ),
            }));
          // Those that left, where they were (in the order of their earlier position).
          for (const r of removed) {
            items.splice(Math.min(r.index, items.length), 0, { key: r.id, node: r.node });
          }
          return (
            <LayerGroup
              key={layer.id}
              hasBody={items.length > 0}
              project={project}
              layer={layer}
              annotations={annotations}
              readOnly={readOnly}
              onAdd={() => add(layer)}
            >
              <PagedList items={items} page={ext?.annotationPage ?? null} />
            </LayerGroup>
          );
        })}
      </Section>

      <DialogSlotContext.Provider value={steps.slot}>
        {step?.kind === 'type' && (
          <TypeStepDialog
            project={project}
            markingId={marking.id}
            ownerKind={ownerKind}
            layer={step.layer}
            onChoose={(definition) => chooseType(step.layer, definition)}
            onCancel={() => steps.close()}
          />
        )}

        {step?.kind === 'owner' && (
          <Dialog
            title={t('typed.chooseOwnerTitle', { type: step.definition.name })}
            onCancel={() => steps.close()}
            actions={<Button onClick={() => steps.close()}>{t('common.cancel')}</Button>}
          >
            <p class="muted">
              {t('typed.chooseOwnerHint', { type: step.definition.name })}
            </p>
            <div class="dialog-stack">
              {step.owners.flatMap((owner) =>
                ownerOptions(project, owner).map((option) => (
                  <Button
                    key={`${owner.id}:${option.role ?? ''}`}
                    onClick={() =>
                      createTyped(step.layer, step.type, owner.id, option.role)
                    }
                  >
                    {option.label}
                  </Button>
                )),
              )}
            </div>
          </Dialog>
        )}

        {step?.kind === 'no-owner' && (
          <Dialog
            title={t('typed.chooseOwnerTitle', { type: step.definition.name })}
            onCancel={() => steps.close()}
            actions={<Button onClick={() => steps.close()}>{t('common.close')}</Button>}
          >
            <p role="alert">
              {t('typed.noOwner', { type: step.definition.name, owners: step.owners })}
            </p>
          </Dialog>
        )}
      </DialogSlotContext.Provider>
    </div>
  );
}

interface LayerGroupProps {
  readonly project: Project;
  readonly layer: Layer;
  readonly annotations: readonly Annotation[];
  readonly readOnly: boolean;
  readonly onAdd: () => void;
  /** There is content (own or inherited annotations) to show on open. */
  readonly hasBody: boolean;
  readonly children: ComponentChildren;
}

/**
  * The annotations of a group; with `page` (large groups in review), the first ones and a
  * button that shows more, `step` at a time. UI state of the group, until it unmounts.
 */
export function PagedList({
  items,
  page,
}: {
  readonly items: readonly { readonly key: string; readonly node: ComponentChildren }[];
  readonly page: DetailsExtension['annotationPage'];
}) {
  const [limit, setLimit] = useState(page?.first ?? Number.POSITIVE_INFINITY);
  // The requested annotation (the change selected in the Proposals window) never falls beyond
  // the limit.
  const revealId = page?.reveal.value ?? null;
  const wanted =
    revealId === null ? -1 : items.findIndex((item) => item.key === revealId);
  const shown = page ? items.slice(0, Math.max(limit, wanted + 1)) : items;
  const rest = items.length - shown.length;
  return (
    <>
      {shown.map((item) => (
        <Fragment key={item.key}>{item.node}</Fragment>
      ))}
      {page && rest > 0 && (
        <Button size="sm" class="button-link" onClick={() => setLimit(limit + page.step)}>
          {page.label(Math.min(rest, page.step))}
        </Button>
      )}
    </>
  );
}

/**
  * Group of a layer (LayerGroup of DS 2.0): border, 3px stripe in the layer's color,
  * specialization badge, "· active", count and alert icon. Collapsed, it summarizes the first
  * annotation and does not mount the annotations.
 */
function LayerGroup({
  project,
  layer,
  annotations,
  readOnly,
  onAdd,
  hasBody,
  children,
}: LayerGroupProps) {
  const { ui } = useEditor();
  const ext = useDetailsExtension();
  const section = { kind: 'layer', id: layer.id } as const;
  const collapsed = isSectionCollapsed(ui, section);
  const changes = collapsed ? (ext?.sectionSummary(section) ?? null) : null;
  const empty = annotations.length === 0;
  const incomplete = annotations.some((a) => issuesOf(project, a.id).length > 0);
  const spec = layer.spec
    ? projectIndex(project).specializations.get(layer.spec.specId)
    : undefined;
  const specName = spec ? (spec.spec?.name ?? spec.id) : '';
  const first = annotations[0];
  const meta = [annotations.length > 1 ? String(annotations.length) : null].filter(
    (s) => s !== null,
  );

  // The summary is cut with an ellipsis in the narrow window: the `title` shows the whole text.
  const summary = !empty && collapsed && first ? annotationSummary(project, first) : '';

  const heading = (
    <>
      <span class="layer-dot" aria-hidden="true" />
      <strong class="layer-group-name" title={layer.name}>
        {layer.name}
      </strong>
      {spec && (
        <span class="tag" title={specName}>
          {specName}
        </span>
      )}
      {ext?.layerTag(layer.id)}
      {meta.length > 0 && (
        <span class="layer-group-meta">{` · ${meta.join(' · ')}`}</span>
      )}
      <span class="layer-group-summary" title={summary || undefined}>
        {summary}
      </span>
      {changes && <span class="details-section-changes">{changes}</span>}
      {incomplete && (
        <span
          class="issue-badge"
          role="img"
          aria-label={t('issue.badge')}
          title={t('issue.badge')}
        >
          <Icon name="warning" />
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
      {empty && <p class="layer-group-empty">{t('annotation.emptySection')}</p>}
      {hasBody && !collapsed && <div class="layer-group-body">{children}</div>}
    </div>
  );
}

/**
  * Pending items of the marking (in the visible layers): each reason is a link that opens the
  * layer and the annotation and takes focus to the field.
 */
function IssuesNotice({
  project,
  groups,
}: {
  readonly project: Project;
  readonly groups: readonly { layer: Layer; annotations: readonly Annotation[] }[];
}) {
  const { ui, layers } = useEditor();
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
              onClick={() =>
                goToAnnotation(ui, annotation, issueFocusKey(issue), project, layers.show)
              }
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

/** Options of the owner step: one per role (owner with `childRoles`) or just one, with no role. */
function ownerOptions(
  project: Project,
  owner: Annotation,
): { readonly role: string | null; readonly label: string }[] {
  const name = annotationDisplayName(project, owner);
  const roles = typeOfAnnotation(project, owner)?.type.childRoles ?? [];
  if (roles.length === 0) return [{ role: null, label: name }];
  return roles.map((role) => ({
    role: role.id,
    label: t('typed.ownerRoleOption', { owner: name, role: role.name }),
  }));
}
