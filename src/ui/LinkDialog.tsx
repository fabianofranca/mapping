import { t } from '../i18n';
import {
  specLayerOf,
  type Annotation,
  type ChildType,
  type Project,
  type SpecChildRole,
  type SpecLayerGroup,
} from '../model';
import { Dialog } from './Dialog';
import { Button } from './controls';
import { TypePicker } from './TypePicker';
import { annotationDisplayName } from './typedText';

interface LinkDialogProps {
  readonly project: Project;
  readonly owner: Annotation;
  /** The role already chosen (the "+ Link…" of the role row); `null` = owner without roles. */
  readonly role: SpecChildRole | null;
  /** The types the owner accepts and that have a layer in the project. */
  readonly children: readonly ChildType[];
  readonly onChoose: (child: ChildType) => void;
  readonly onCancel: () => void;
}

/**
 * The layer's declared groups, when all the offered types belong to it; with types from
 * different layers the list is flat (the groups belong to a single layer).
 */
export function linkGroups(
  project: Project,
  children: readonly ChildType[],
): readonly SpecLayerGroup[] | undefined {
  const first = children[0]?.layer;
  if (!first || children.some((c) => c.layer?.id !== first.id)) return undefined;
  return specLayerOf(project, first)?.groups;
}

/**
 * "Link to <owner>" (or "Link to <owner> › <role>"): picks the child's type among those the
 * owner accepts, with search and groups; whoever opens it creates the annotation.
 */
export function LinkDialog({
  project,
  owner,
  role,
  children,
  onChoose,
  onCancel,
}: LinkDialogProps) {
  const name = annotationDisplayName(project, owner);
  const title = role
    ? t('typed.linkTitleRole', { owner: name, role: role.name })
    : t('typed.linkTitle', { owner: name });
  return (
    <Dialog
      title={title}
      onCancel={onCancel}
      actions={<Button onClick={onCancel}>{t('common.cancel')}</Button>}
    >
      <TypePicker
        types={children.map((c) => c.definition)}
        groups={linkGroups(project, children)}
        onChoose={(type) => {
          const chosen = children.find((c) => c.definition.id === type.id);
          if (chosen) onChoose(chosen);
        }}
      />
    </Dialog>
  );
}
