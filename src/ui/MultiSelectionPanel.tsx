import { t } from '../i18n';
import { canDeleteItems, type ItemRef, type Project } from '../model';
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
  const { actions } = useEditor();
  const containers = items.filter((i) => i.kind === 'image').length;
  const arrows = items.filter((i) => i.kind === 'arrow').length;
  const markings = items.length - containers - arrows;
  const index = new Map(
    [...project.containers, ...project.markings, ...project.arrows].map((x) => [
      x.id,
      x.locked,
    ]),
  );
  const locked = items.filter((i) => index.get(i.id) === true).length;
  const deletable = canDeleteItems(project, items);
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
