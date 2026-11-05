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
  /** O papel já escolhido (o "+ Vincular…" da linha do papel); `null` = dono sem papéis. */
  readonly role: SpecChildRole | null;
  /** Os tipos que o dono aceita e que têm camada no projeto. */
  readonly children: readonly ChildType[];
  readonly onChoose: (child: ChildType) => void;
  readonly onCancel: () => void;
}

/**
 * Os grupos declarados da camada, quando todos os tipos oferecidos são dela; com tipos de
 * camadas diferentes a lista é plana (os grupos são de uma camada só).
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
 * "Vincular a <dono>" (ou "Vincular a <dono> › <papel>"): escolhe o tipo do filho entre os que o
 * dono aceita, com busca e grupos; quem abre cria a anotação.
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
