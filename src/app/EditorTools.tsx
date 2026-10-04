import { t } from '../i18n';
import { setSemanticText, semanticText } from '../store/settings';
import { useEditor } from '../ui/EditorContext';
import { IconButton, Segmented } from '../ui/controls';
import { SHORTCUT_LABELS } from './shortcuts';

// Botões de ferramenta compartilhados pela barra do topo (desktop) e a de baixo (celular).

/** Navegar | Desenhar. */
export function ModeButtons() {
  const { store, ui } = useEditor();
  return (
    <Segmented
      items={[
        { id: 'navigate', label: t('editor.modeNavigate'), icon: 'pan' },
        {
          id: 'draw',
          label: t('editor.modeDraw'),
          icon: 'draw',
          disabled: store.readOnly.value,
        },
      ]}
      value={ui.mode.value}
      onSelect={(mode) => (ui.mode.value = mode)}
    />
  );
}

export function AddImagesButton({
  desktop,
  busy,
  onAdd,
}: {
  readonly desktop: boolean;
  readonly busy: boolean;
  readonly onAdd: () => void;
}) {
  const { store } = useEditor();
  return (
    <IconButton
      icon="addImage"
      label={t('editor.addImages')}
      text={desktop ? t('editor.addImages') : undefined}
      disabled={store.readOnly.value || busy}
      onClick={onAdd}
    />
  );
}

/** Desfazer, refazer e enquadrar tudo. */
export function HistoryButtons() {
  const { store, canvas } = useEditor();
  return (
    <>
      <IconButton
        icon="undo"
        label={t('editor.undo')}
        shortcut={SHORTCUT_LABELS.undo}
        disabled={!store.canUndo.value}
        onClick={() => store.undo()}
      />
      <IconButton
        icon="redo"
        label={t('editor.redo')}
        shortcut={SHORTCUT_LABELS.redo}
        disabled={!store.canRedo.value}
        onClick={() => store.redo()}
      />
      <IconButton
        icon="fit"
        label={t('editor.fitAll')}
        onClick={() => canvas.current?.fitAll()}
      />
    </>
  );
}

export function SemanticTextButton() {
  return (
    <IconButton
      icon="text"
      label={t('view.semanticText')}
      pressed={semanticText.value}
      onClick={() => setSemanticText(!semanticText.value)}
    />
  );
}

export function ListToggleButton({
  open,
  onToggle,
}: {
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <IconButton
      icon="list"
      label={t(open ? 'view.hideList' : 'view.showList')}
      text={t('view.list')}
      pressed={open}
      onClick={onToggle}
    />
  );
}
