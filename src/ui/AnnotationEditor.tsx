import { useId, useState } from 'preact/hooks';
import { t } from '../i18n';
import {
  annotationDeletionImpact,
  childTypesOf,
  getLinkedAnnotations,
  projectIndex,
  rawValueLines,
  refsBrokenBy,
  removeEntry,
  typeOfAnnotation,
  validAnnotationOwners,
  type Annotation,
  type ChildType,
  type Layer,
  type Project,
} from '../model';
import { isSectionCollapsed, toggleSection, type AnnotationLocation } from '../store/ui';
import { IssueBadge } from './AnnotationSummary';
import { CommitInput } from './CommitInput';
import { CopyButtons } from './CopyActions';
import { Dialog } from './Dialog';
import { useEditor } from './EditorContext';
import { Button, Choice, IconButton, Select } from './controls';
import { KeyValueGrid } from './KeyValueGrid';
import { annotationLabel } from './labels';
import { Property, PropertyGrid } from './PropertyGrid';
import { TypedField } from './TypedFields';
import {
  annotationDisplayName,
  annotationSummary,
  issueReason,
  issuesOf,
  labelTexts,
} from './typedText';

interface AnnotationEditorProps {
  readonly project: Project;
  readonly annotation: Annotation;
  /** Ids das camadas visíveis (as vinculadas em camadas ocultas oferecem mostrá-las). */
  readonly visibleLayerIds: ReadonlySet<string>;
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
  readonly onShowLayer: (layerId: string) => void;
  readonly readOnly: boolean;
}

/** Confirmação de exclusão que quebra referências (anotação ou tupla). */
type PendingDelete =
  | { readonly kind: 'annotation'; readonly brokenRefs: number; readonly linked: number }
  | {
      readonly kind: 'entry';
      readonly entryId: string;
      readonly key: string;
      readonly brokenRefs: number;
    };

/** Campos da anotação tipada; tipo inexistente: valores somente leitura e "Converter". */
function TypedBody({
  project,
  annotation,
  readOnly,
  onGoToAnnotation,
}: {
  readonly project: Project;
  readonly annotation: Annotation;
  readonly readOnly: boolean;
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
}) {
  const { actions } = useEditor();
  const resolved = typeOfAnnotation(project, annotation);
  if (!resolved) {
    return (
      <>
        <p class="notice">
          {t('typed.unknownType', { type: annotation.type?.typeId ?? '' })}
        </p>
        <ul class="raw-values">
          {rawValueLines(annotation).map((line) => (
            <li key={line.key}>
              <strong>{line.key}:</strong> {line.text}
            </li>
          ))}
        </ul>
        <div class="row">
          <Button
            disabled={readOnly}
            onClick={() => actions.convertAnnotationToFree(annotation.id, labelTexts())}
          >
            {t('typed.convertToFree')}
          </Button>
        </div>
      </>
    );
  }
  const ctx = { project, annotation, readOnly, onGoToAnnotation };
  return (
    <>
      {resolved.type.description && (
        <p class="muted typed-description">{resolved.type.description}</p>
      )}
      <PropertyGrid>
        {resolved.type.fields.map((field) => (
          <TypedField key={field.key} field={field} {...ctx} />
        ))}
      </PropertyGrid>
    </>
  );
}

/**
 * Uma anotação dentro do LayerGroup: cabeçalho recolhível (tipo, rótulo ou nome,
 * excluir) e o corpo, livre (KeyValueGrid) ou tipado (campos na grade de
 * propriedades), com herança, dono e vinculadas.
 */
export function AnnotationEditor({
  project,
  annotation,
  visibleLayerIds,
  onGoToAnnotation,
  onShowLayer,
  readOnly,
}: AnnotationEditorProps) {
  const { actions, ui } = useEditor();
  const ownerId = useId();
  const [pending, setPending] = useState<PendingDelete | null>(null);
  /** Filho criado numa camada oculta: oferece mostrá-la. */
  const [hiddenChild, setHiddenChild] = useState<{
    readonly child: ChildType;
    readonly layer: Layer;
  } | null>(null);
  const typed = annotation.type !== null;
  const resolved = typeOfAnnotation(project, annotation);
  const section = { kind: 'annotation', id: annotation.id } as const;
  const collapsed = isSectionCollapsed(ui, section);
  const index = projectIndex(project);

  const layerOf = (id: string): Layer | undefined => index.layers.get(id);
  const owner = annotation.parentAnnotationId
    ? index.annotations.get(annotation.parentAnnotationId)
    : undefined;
  const ownerRequired = resolved?.type.requiresOwner === true;
  const owners = validAnnotationOwners(project, annotation.id);
  /** Sem dono e sem ninguém que possa sê-lo: a lista só teria "Nenhuma". */
  const noOwnerOptions = owners.length === 0 && annotation.parentAnnotationId === null;
  const name = (a: Annotation) => annotationDisplayName(project, a);
  const ownerIssue = issuesOf(project, annotation.id).find(
    (i) => i.code === 'missing-owner' || i.code === 'owner-not-allowed',
  );

  const requestDelete = () => {
    const impact = annotationDeletionImpact(project, annotation.id);
    if (impact.brokenRefs > 0) {
      setPending({
        kind: 'annotation',
        brokenRefs: impact.brokenRefs,
        linked: impact.annotations - 1,
      });
    } else {
      actions.removeAnnotation(annotation.id);
    }
  };

  const requestRemoveEntry = (entryId: string) => {
    const brokenRefs = refsBrokenBy(project, (p) =>
      removeEntry(p, annotation.id, entryId),
    );
    if (brokenRefs > 0) {
      const key = annotation.entries.find((e) => e.id === entryId)?.key ?? '';
      setPending({ kind: 'entry', entryId, key, brokenRefs });
    } else {
      actions.removeEntry(annotation.id, entryId);
    }
  };

  const confirmDelete = () => {
    if (!pending) return;
    setPending(null);
    if (pending.kind === 'annotation') actions.removeAnnotation(annotation.id);
    else actions.removeEntry(annotation.id, pending.entryId);
  };

  const addChild = (child: ChildType) => {
    if (!child.layer) return;
    const result = actions.addTypedAnnotation(
      annotation.markingId,
      child.layer.id,
      child.type,
      annotation.id,
    );
    if (!result.ok) return;
    if (visibleLayerIds.has(child.layer.id)) {
      setHiddenChild(null);
      onGoToAnnotation({
        id: result.value,
        markingId: annotation.markingId,
        layerId: child.layer.id,
      });
    } else {
      setHiddenChild({ child, layer: child.layer });
    }
  };

  return (
    <div
      class={typed ? 'annotation annotation-typed' : 'annotation'}
      data-annotation={annotation.id}
    >
      <div class="annotation-header">
        <IconButton
          icon={collapsed ? 'chevronRight' : 'chevronDown'}
          label={t(collapsed ? 'annotation.expand' : 'annotation.collapse', {
            name: name(annotation),
          })}
          aria-expanded={!collapsed}
          onClick={() => toggleSection(ui, section)}
        />
        {typed && (
          <span class="type">{resolved?.type.name ?? annotation.type?.typeId}</span>
        )}
        <IssueBadge project={project} annotation={annotation} />
        <CommitInput
          class="input input-sm annotation-name"
          aria-label={typed ? t('typed.instanceName') : t('annotation.name')}
          placeholder={
            typed
              ? t('typed.instanceName')
              : annotationLabel({ name: null, entries: annotation.entries })
          }
          value={annotation.name ?? ''}
          disabled={readOnly}
          onCommit={(text) => {
            if ((text.trim() || null) === annotation.name) return false;
            return actions.renameAnnotation(annotation.id, text).ok;
          }}
        />
        <CopyButtons target={{ kind: 'a', id: annotation.id }} />
        <IconButton
          icon="trash"
          label={t('annotation.delete')}
          variant="danger"
          disabled={readOnly}
          onClick={requestDelete}
        />
      </div>

      {collapsed ? (
        <p class="annotation-summary">{annotationSummary(project, annotation)}</p>
      ) : (
        <>
          {owner && (
            <p class="annotation-linked muted">
              {t('annotation.linkedTo', { name: name(owner) })}
            </p>
          )}

          {typed ? (
            <TypedBody
              project={project}
              annotation={annotation}
              readOnly={readOnly}
              onGoToAnnotation={onGoToAnnotation}
            />
          ) : (
            <KeyValueGrid
              project={project}
              annotation={annotation}
              readOnly={readOnly}
              onGoToAnnotation={onGoToAnnotation}
              onRemoveEntry={requestRemoveEntry}
            />
          )}

          <PropertyGrid>
            <Property label={t('annotation.inheritLabel')}>
              <Choice
                label={t('annotation.inherit')}
                checked={annotation.inherit}
                disabled={readOnly}
                onChange={(e) =>
                  actions.setAnnotationInherit(annotation.id, e.currentTarget.checked)
                }
              />
            </Property>
            <Property
              label={t('annotation.owner')}
              for={ownerId}
              focusKey="owner"
              hint={t('annotation.ownerHelp')}
              note={
                <>
                  <span>{t('annotation.ownerHelp')}</span>
                  {noOwnerOptions && (
                    <span data-owner-empty>{t('annotation.ownerEmpty')}</span>
                  )}
                </>
              }
              issue={ownerIssue ? issueReason(project, annotation, ownerIssue) : null}
            >
              <Select
                id={ownerId}
                size="sm"
                invalid={ownerIssue !== undefined}
                value={annotation.parentAnnotationId ?? ''}
                disabled={readOnly || noOwnerOptions}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  actions.setAnnotationParent(annotation.id, value === '' ? null : value);
                }}
              >
                {(!ownerRequired || annotation.parentAnnotationId === null) && (
                  <option value="">{t('annotation.noOwner')}</option>
                )}
                {owners.map((a) => (
                  <option key={a.id} value={a.id}>
                    {t('annotation.ownerOption', {
                      layer: layerOf(a.layerId)?.name ?? '',
                      name: name(a),
                    })}
                  </option>
                ))}
              </Select>
            </Property>
          </PropertyGrid>

          <LinkedRow
            project={project}
            annotation={annotation}
            visibleLayerIds={visibleLayerIds}
            readOnly={readOnly}
            onGoToAnnotation={onGoToAnnotation}
            onShowLayer={onShowLayer}
            onAddChild={addChild}
          />
          {hiddenChild && (
            <p class="notice notice-info" role="status">
              {t('typed.childHidden', {
                type: hiddenChild.child.definition.name,
                layer: hiddenChild.layer.name,
              })}{' '}
              <button
                type="button"
                class="link-button"
                onClick={() => {
                  onShowLayer(hiddenChild.layer.id);
                  setHiddenChild(null);
                }}
              >
                {t('typed.showLayer', { layer: hiddenChild.layer.name })}
              </button>
            </p>
          )}
        </>
      )}

      {pending && (
        <Dialog
          title={t('ref.deleteTitle')}
          onCancel={() => setPending(null)}
          actions={
            <>
              <Button onClick={() => setPending(null)}>{t('common.cancel')}</Button>
              <Button variant="danger" onClick={confirmDelete}>
                {t('common.delete')}
              </Button>
            </>
          }
        >
          {pending.kind === 'annotation' ? (
            <>
              <p>
                {t('ref.deleteAnnotation', {
                  name: name(annotation),
                  count: pending.brokenRefs,
                })}
              </p>
              {pending.linked > 0 && (
                <p>{t('ref.deleteLinked', { count: pending.linked })}</p>
              )}
            </>
          ) : (
            <p>
              {t('ref.deleteEntry', { name: pending.key, count: pending.brokenRefs })}
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}

/**
 * Linha "Vinculadas": as anotações que pertencem a esta, por camada (na ordem das
 * camadas), e os botões para criar os filhos que o tipo permite.
 */
function LinkedRow({
  project,
  annotation,
  visibleLayerIds,
  readOnly,
  onGoToAnnotation,
  onShowLayer,
  onAddChild,
}: {
  readonly project: Project;
  readonly annotation: Annotation;
  readonly visibleLayerIds: ReadonlySet<string>;
  readonly readOnly: boolean;
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
  readonly onShowLayer: (layerId: string) => void;
  readonly onAddChild: (child: ChildType) => void;
}) {
  const linked = getLinkedAnnotations(project, annotation.id);
  const groups = project.layers
    .map((layer) => ({ layer, items: linked.filter((a) => a.layerId === layer.id) }))
    .filter((g) => g.items.length > 0);
  const children = annotation.type ? childTypesOf(project, annotation.id) : [];
  if (groups.length === 0 && children.length === 0) return null;
  const name = (a: Annotation) => annotationDisplayName(project, a);

  return (
    <div class="annotation-linked-summary">
      <span class="props-label">{t('annotation.linkedHeading')}</span>
      {groups.map(({ layer, items }) => (
        <span
          key={layer.id}
          class="linked-group"
          style={{ '--layer-color': layer.color }}
        >
          <span class="linked-layer">
            <span class="layer-dot" aria-hidden="true" />
            {layer.name}:
          </span>
          {items.map((a) =>
            visibleLayerIds.has(layer.id) ? (
              <button
                key={a.id}
                type="button"
                class="link-button"
                title={t('annotation.goToAnnotation', { name: name(a) })}
                onClick={() => onGoToAnnotation(a)}
              >
                {name(a)}
              </button>
            ) : (
              <button
                key={a.id}
                type="button"
                class="link-button"
                title={t('annotation.showLayer', { layer: layer.name })}
                onClick={() => {
                  onShowLayer(layer.id);
                  onGoToAnnotation(a);
                }}
              >
                {name(a)} ({t('annotation.showLayer', { layer: layer.name })})
              </button>
            ),
          )}
        </span>
      ))}
      {children.length > 0 && (
        <span class="child-actions">
          {children.map((child) => (
            <Button
              key={child.type.typeId}
              size="sm"
              class="button-link"
              title={t('typed.addChildIn', {
                type: child.definition.name,
                layer: child.layer?.name ?? '',
              })}
              disabled={readOnly || !child.layer}
              onClick={() => onAddChild(child)}
            >
              {t('typed.addChild', { type: child.definition.name })}
            </Button>
          ))}
        </span>
      )}
    </div>
  );
}
