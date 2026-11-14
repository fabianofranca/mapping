import { t } from '../i18n';
import {
  childTypesOf,
  getLinkedAnnotations,
  linkedByRole,
  projectIndex,
  type Annotation,
  type ChildType,
  type Layer,
  type LinkedByRole,
  type Project,
  type RoleLinks,
  type SpecChildRole,
} from '../model';
import type { AnnotationLocation } from '../store/ui';
import { IssueBadge } from './AnnotationSummary';
import { Button } from './controls';
import { DialogSlotContext, useDialogSlot } from './focus';
import { LinkDialog } from './LinkDialog';
import { annotationDisplayName } from './typedText';

interface LinkedRowProps {
  readonly project: Project;
  readonly annotation: Annotation;
  readonly visibleLayerIds: ReadonlySet<string>;
  readonly readOnly: boolean;
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
  readonly onShowLayer: (layerId: string) => void;
  /** Creates the child of the type on the owner, with the role (`null` = owner without roles). */
  readonly onAddChild: (child: ChildType, roleId: string | null) => void;
}

type ItemProps = Pick<
  LinkedRowProps,
  'project' | 'visibleLayerIds' | 'onGoToAnnotation' | 'onShowLayer'
>;

/** Button that leads to a linked one (the hidden layer offers to show it first). */
function LinkedItem({
  project,
  annotation,
  layer,
  visibleLayerIds,
  onGoToAnnotation,
  onShowLayer,
}: ItemProps & { readonly annotation: Annotation; readonly layer: Layer }) {
  const name = annotationDisplayName(project, annotation);
  if (visibleLayerIds.has(layer.id)) {
    return (
      <button
        type="button"
        class="link-button"
        title={t('annotation.goToAnnotation', { name })}
        onClick={() => onGoToAnnotation(annotation)}
      >
        {name}
      </button>
    );
  }
  const show = t('annotation.showLayer', { layer: layer.name });
  return (
    <button
      type="button"
      class="link-button"
      title={show}
      onClick={() => {
        onShowLayer(layer.id);
        onGoToAnnotation(annotation);
      }}
    >
      {name} ({show})
    </button>
  );
}

/** The linked annotations of a layer: "Layer: a b c". */
function LayerGroup({
  layer,
  items,
  ...rest
}: ItemProps & { readonly layer: Layer; readonly items: readonly Annotation[] }) {
  return (
    <span class="linked-group" style={{ '--layer-color': layer.color }}>
      <span class="linked-layer">
        <span class="layer-dot" aria-hidden="true" />
        {layer.name}:
      </span>
      {items.map((a) => (
        <LinkedItem key={a.id} annotation={a} layer={layer} {...rest} />
      ))}
    </span>
  );
}

/** The "+ Link…" (goes away in review, along with the other buttons that create). */
function LinkAction({
  disabled,
  onClick,
}: {
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  return (
    <span class="child-actions">
      <Button size="sm" class="button-link" disabled={disabled} onClick={onClick}>
        {t('typed.linkAction')}
      </Button>
    </span>
  );
}

/** Owner without roles: the children by layer (in layer order). */
function LayerLinks({
  project,
  annotation,
  ...rest
}: ItemProps & { readonly annotation: Annotation }) {
  const linked = getLinkedAnnotations(project, annotation.id);
  // Groups once per layer, instead of a `filter` per layer.
  const byLayer = new Map<string, Annotation[]>();
  for (const a of linked) {
    const group = byLayer.get(a.layerId);
    if (group) group.push(a);
    else byLayer.set(a.layerId, [a]);
  }
  return (
    <>
      {project.layers.map((layer) => {
        const items = byLayer.get(layer.id) ?? [];
        return items.length > 0 ? (
          <LayerGroup
            key={layer.id}
            project={project}
            layer={layer}
            items={items}
            {...rest}
          />
        ) : null;
      })}
    </>
  );
}

/** A role row: the name, the children (or "none") and its "+ Link…". */
function RoleRow({
  row,
  canLink,
  onLink,
  ...rest
}: ItemProps & {
  readonly row: RoleLinks;
  readonly canLink: boolean;
  readonly onLink: (role: SpecChildRole) => void;
}) {
  const layers = projectIndex(rest.project).layers;
  return (
    <div class="linked-role-row" data-role-row={row.role.id}>
      <span class="linked-role-name">{row.role.name}:</span>
      {row.items.length === 0 && <span class="muted">{t('typed.linkedNone')}</span>}
      {row.items.map((a) => {
        const layer = layers.get(a.layerId);
        return layer ? (
          <LinkedItem key={a.id} annotation={a} layer={layer} {...rest} />
        ) : null;
      })}
      <LinkAction disabled={!canLink} onClick={() => onLink(row.role)} />
    </div>
  );
}

/** Children without a role (or with one the owner does not offer): a pending-item row. */
function UnassignedRow({
  byRole,
  ...rest
}: ItemProps & { readonly byRole: LinkedByRole }) {
  if (byRole.unassigned.length === 0) return null;
  const layers = projectIndex(rest.project).layers;
  return (
    <div class="linked-role-row linked-role-missing" data-role-row-missing="">
      <span class="linked-role-name">
        {t('typed.linkedNoRole', {
          label: (byRole.label ?? t('typed.roleDefaultLabel')).toLowerCase(),
        })}
        :
      </span>
      {byRole.unassigned.map((a) => {
        const layer = layers.get(a.layerId);
        return layer ? (
          <span key={a.id} class="linked-role-item">
            <IssueBadge project={rest.project} annotation={a} />
            <LinkedItem annotation={a} layer={layer} {...rest} />
          </span>
        ) : null;
      })}
    </div>
  );
}

/**
 * "Linked" row: the annotations that belong to this one and the "+ Link…" that opens the
 * type-choice dialog. Owner without roles: by layer, with a single button. Owner with roles: one row
 * per role, each with its own button, and the pending item of the children without a role last.
 */
export function LinkedRow(props: LinkedRowProps) {
  const { project, annotation, readOnly, onAddChild } = props;
  const link = useDialogSlot<{ readonly role: SpecChildRole | null }>();
  const offered = annotation.type ? childTypesOf(project, annotation.id) : [];
  const usable = offered.filter((c) => c.layer !== null);
  const byRole = linkedByRole(project, annotation);
  const hasLinked = getLinkedAnnotations(project, annotation.id).length > 0;
  if (!hasLinked && offered.length === 0) return null;
  const canLink = !readOnly && usable.length > 0;
  const open = (role: SpecChildRole | null) => link.show({ role });
  const item: ItemProps = {
    project,
    visibleLayerIds: props.visibleLayerIds,
    onGoToAnnotation: props.onGoToAnnotation,
    onShowLayer: props.onShowLayer,
  };

  return (
    <div
      class={
        byRole
          ? 'annotation-linked-summary annotation-linked-roles'
          : 'annotation-linked-summary'
      }
    >
      <span class="props-label">{t('annotation.linkedHeading')}</span>
      {byRole ? (
        <div class="linked-role-rows">
          {byRole.rows.map((row) => (
            <RoleRow
              key={row.role.id}
              row={row}
              canLink={canLink}
              onLink={open}
              {...item}
            />
          ))}
          <UnassignedRow byRole={byRole} {...item} />
        </div>
      ) : (
        <>
          <LayerLinks annotation={annotation} {...item} />
          {offered.length > 0 && (
            <LinkAction disabled={!canLink} onClick={() => open(null)} />
          )}
        </>
      )}
      <DialogSlotContext.Provider value={link.slot}>
        {link.current && (
          <LinkDialog
            project={project}
            owner={annotation}
            role={link.current.role}
            children={usable}
            onCancel={link.close}
            onChoose={(child) => {
              const roleId = link.current?.role?.id ?? null;
              link.close();
              onAddChild(child, roleId);
            }}
          />
        )}
      </DialogSlotContext.Provider>
    </div>
  );
}
