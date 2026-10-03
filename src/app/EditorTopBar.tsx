import { t } from '../i18n';
import { MenuIcon } from '../ui/icons';
import { useEditor } from '../ui/EditorContext';
import { SaveStatus } from '../ui/SaveStatus';
import { ToolButton } from '../ui/ToolButton';
import {
  AddImagesButton,
  HistoryButtons,
  ListToggleButton,
  ModeButtons,
  SemanticTextButton,
} from './EditorTools';
import type { EditorDialogs } from './useEditorDialogs';
import type { ProjectCommands } from './useProjectCommands';

interface EditorTopBarProps {
  readonly desktop: boolean;
  readonly busy: boolean;
  readonly listOpen: boolean;
  readonly onToggleList: () => void;
  readonly onAdd: () => void;
  readonly dialogs: EditorDialogs;
  readonly commands: ProjectCommands;
}

/** Barra do topo: título, camada ativa, estado do salvamento e (desktop) as ferramentas. */
export function EditorTopBar({
  desktop,
  busy,
  listOpen,
  onToggleList,
  onAdd,
  dialogs,
  commands,
}: EditorTopBarProps) {
  const { store, derived } = useEditor();
  const activeLayer = derived.activeLayer.value;
  return (
    <header class="topbar editor-bar">
      {desktop && (
        <button type="button" class="button" onClick={() => void commands.closeProject()}>
          {t('common.close')}
        </button>
      )}
      <h1 class="project-title">{store.project.value?.project.name}</h1>
      {activeLayer && (
        <button
          type="button"
          class="button layer-chip"
          style={{ '--layer-color': activeLayer.color }}
          aria-label={t('layer.chipLabel', { name: activeLayer.name })}
          title={t('layer.chipLabel', { name: activeLayer.name })}
          onClick={() => dialogs.show({ kind: 'layers' })}
        >
          <span class="layer-dot" aria-hidden="true" />
          <span class="layer-chip-name">{activeLayer.name}</span>
        </button>
      )}
      <SaveStatus />
      {desktop && (
        <div class="toolbar">
          <ModeButtons />
          <AddImagesButton desktop busy={busy} onAdd={onAdd} />
          <HistoryButtons />
          <SemanticTextButton />
          <ListToggleButton open={listOpen} onToggle={onToggleList} />
          <button
            type="button"
            class="button"
            disabled={busy}
            onClick={() => void commands.exportProject()}
          >
            {t('editor.export')}
          </button>
        </div>
      )}
      <ToolButton
        icon={<MenuIcon />}
        label={t('editor.menu')}
        onClick={() => dialogs.show({ kind: 'menu' })}
      />
    </header>
  );
}
