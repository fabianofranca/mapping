import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { useEditor } from '../ui/EditorContext';
import { viewModeButton } from '../ui/ViewModePanel';
import { IconButton, Segmented } from '../ui/controls';
import { setViewMode } from '../store/ui';
import { SHORTCUT_LABELS } from './shortcuts';

// Botões de ferramenta da barra principal e da barra dos breadcrumbs.

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
          disabled: store.locked.value || ui.viewMode.value,
        },
      ]}
      value={ui.mode.value}
      onSelect={(mode) => (ui.mode.value = mode)}
    />
  );
}

export function AddImagesButton({
  busy,
  onAdd,
}: {
  readonly busy: boolean;
  readonly onAdd: () => void;
}) {
  const { store } = useEditor();
  return (
    <IconButton
      icon="addImage"
      label={t('editor.addImages')}
      text={t('editor.addImages')}
      disabled={store.locked.value || busy}
      onClick={onAdd}
    />
  );
}

/** Novo container: ao lado de "Adicionar imagens". */
export function AddContainerButton({ onAdd }: { readonly onAdd: () => void }) {
  const { store } = useEditor();
  return (
    <IconButton
      icon="container"
      label={t('container.new')}
      text={t('container.new')}
      disabled={store.locked.value}
      onClick={onAdd}
    />
  );
}

/** Desfazer e refazer. */
export function HistoryButtons() {
  const { store } = useEditor();
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
    </>
  );
}

/** Enquadrar tudo: na barra dos breadcrumbs. */
export function FitButton() {
  const { canvas } = useEditor();
  return (
    <IconButton
      icon="fit"
      label={t('editor.fitAll')}
      onClick={() => canvas.current?.fitAll()}
    />
  );
}

/** Visualizar: liga o modo visualização, o canvas só para ver (Alt+H). */
export function ViewModeButton() {
  const { ui } = useEditor();
  const button = viewModeButton;
  const on = ui.viewMode.value;
  const wasOn = useRef(on);
  // Ao sair do modo o botão "Mostrar no canvas" fica desabilitado e o painel some: se o foco
  // estava neles (ou se perdeu no body), vai ao Visualizar.
  useEffect(() => {
    if (wasOn.current && !on) {
      const active = document.activeElement;
      const lost =
        !active ||
        active === document.body ||
        (active instanceof HTMLButtonElement && active.disabled);
      if (lost) button.current?.focus();
    }
    wasOn.current = on;
  }, [on, button]);
  return (
    <IconButton
      icon="eye"
      label={t('view.viewMode')}
      shortcut={SHORTCUT_LABELS.viewMode}
      tooltip={t('view.viewModeHint')}
      tooltipSuppressed={ui.viewPanel.value}
      pressed={on}
      buttonRef={button}
      onClick={() => setViewMode(ui, !ui.viewMode.peek())}
    />
  );
}
