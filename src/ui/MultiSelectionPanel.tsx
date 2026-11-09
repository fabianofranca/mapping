import { t } from '../i18n';
import {
  canDeleteItems,
  canWrapItems,
  projectIndex,
  type ItemRef,
  type Project,
} from '../model';
import { SHORTCUT_LABELS, ariaKeys } from '../app/shortcuts';
import { wrapItemsNow } from '../app/wrapSelection';
import { useEditor } from './EditorContext';
import { Button } from './controls';
import { Icon } from './icons';

interface MultiSelectionPanelProps {
  readonly project: Project;
  /** Os itens selecionados que existem no projeto (dois ou mais). */
  readonly items: readonly ItemRef[];
  readonly readOnly: boolean;
  /** Abre a confirmação de excluir a seleção inteira. */
  readonly onDelete: (items: readonly ItemRef[]) => void;
}

/** Detalhes com mais de um item selecionado: só o resumo e as ações da seleção inteira. */
export function MultiSelectionPanel({
  project,
  items,
  readOnly,
  onDelete,
}: MultiSelectionPanelProps) {
  const editor = useEditor();
  const { actions } = editor;
  const containers = items.filter((i) => i.kind === 'image').length;
  const arrows = items.filter((i) => i.kind === 'arrow').length;
  const markings = items.length - containers - arrows;
  const index = projectIndex(project);
  const locked = items.filter((i) => {
    const target =
      i.kind === 'image'
        ? index.containers.get(i.id)
        : (index.markings.get(i.id) ?? index.arrows.get(i.id));
    return target?.locked === true;
  }).length;
  const deletable = canDeleteItems(project, items);
  const wrappable = canWrapItems(project, items);
  const wrapBlockedHint = !readOnly ? t('multi.wrapBlocked') : undefined;
  return (
    <div
      class="details-empty"
      role="group"
      aria-label={t('multi.title', { count: items.length })}
    >
      <Icon name="info" />
      <strong>{t('multi.title', { count: items.length })}</strong>
      {markings > 0 && <span>{t('multi.markings', { count: markings })}</span>}
      {containers > 0 && <span>{t('multi.containers', { count: containers })}</span>}
      {arrows > 0 && <span>{t('multi.arrows', { count: arrows })}</span>}
      <div class="multi-actions">
        <Button
          disabled={readOnly || !wrappable}
          title={
            wrappable ? `${t('multi.wrap')} (${SHORTCUT_LABELS.wrap})` : wrapBlockedHint
          }
          aria-keyshortcuts={ariaKeys(SHORTCUT_LABELS.wrap)}
          onClick={() => wrapItemsNow(editor, items)}
        >
          {t('multi.wrap')}
        </Button>
        <Button
          disabled={readOnly || locked === items.length}
          onClick={() => actions.setItemsLocked(items, true)}
        >
          {t('multi.lock')}
        </Button>
        <Button
          disabled={readOnly || locked === 0}
          onClick={() => actions.setItemsLocked(items, false)}
        >
          {t('multi.unlock')}
        </Button>
        <Button
          variant="danger"
          disabled={readOnly || !deletable}
          title={!readOnly && !deletable ? t('multi.deleteBlocked') : undefined}
          onClick={() => onDelete(items)}
        >
          {t('multi.delete')}
        </Button>
      </div>
    </div>
  );
}
