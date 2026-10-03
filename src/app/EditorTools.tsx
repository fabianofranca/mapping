import { t } from '../i18n';
import { setSemanticText, semanticText } from '../store/settings';
import { useEditor } from '../ui/EditorContext';
import {
  AddImageIcon,
  DrawIcon,
  FitIcon,
  HandIcon,
  ListIcon,
  RedoIcon,
  TextIcon,
  UndoIcon,
} from '../ui/icons';
import { ToolButton } from '../ui/ToolButton';

// Botões de ferramenta compartilhados pela barra do topo (desktop) e a de baixo (celular).

/** Navegar | Desenhar. */
export function ModeButtons() {
  const { store, ui } = useEditor();
  const mode = ui.mode.value;
  return (
    <div class="segmented" role="group">
      <ToolButton
        icon={<HandIcon />}
        label={t('editor.modeNavigate')}
        pressed={mode === 'navigate'}
        onClick={() => (ui.mode.value = 'navigate')}
      />
      <ToolButton
        icon={<DrawIcon />}
        label={t('editor.modeDraw')}
        pressed={mode === 'draw'}
        disabled={store.readOnly.value}
        onClick={() => (ui.mode.value = 'draw')}
      />
    </div>
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
    <ToolButton
      icon={<AddImageIcon />}
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
      <ToolButton
        icon={<UndoIcon />}
        label={t('editor.undo')}
        disabled={!store.canUndo.value}
        onClick={() => store.undo()}
      />
      <ToolButton
        icon={<RedoIcon />}
        label={t('editor.redo')}
        disabled={!store.canRedo.value}
        onClick={() => store.redo()}
      />
      <ToolButton
        icon={<FitIcon />}
        label={t('editor.fitAll')}
        onClick={() => canvas.current?.fitAll()}
      />
    </>
  );
}

export function SemanticTextButton() {
  return (
    <ToolButton
      icon={<TextIcon />}
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
    <ToolButton
      icon={<ListIcon />}
      label={t(open ? 'view.hideList' : 'view.showList')}
      text={t('view.list')}
      pressed={open}
      onClick={onToggle}
    />
  );
}
