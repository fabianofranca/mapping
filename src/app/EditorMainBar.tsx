import { useComputed } from '@preact/signals';
import { t } from '../i18n';
import { useEditor } from '../ui/EditorContext';
import { Icon } from '../ui/icons';
import { MenuPopover } from '../ui/MenuPopover';
import { Button, IconButton } from '../ui/controls';
import { AddImagesButton, HistoryButtons, ModeButtons } from './EditorTools';
import { SHORTCUT_LABELS } from './shortcuts';
import type { EditorDialogs } from './useEditorDialogs';
import type { ProjectCommands } from './useProjectCommands';

// Barra principal do desktop (40px, seção Layouts do DS 2.0): ícone, projeto ▾,
// ferramentas, camada ativa, Especializações, Exportar, Ajuda e Configurações.
// Fechar foi para o menu do projeto; o estado do salvamento, para a barra de status;
// Lista virou janela e "Texto no canvas" foi para a barra dos breadcrumbs.

interface EditorMainBarProps {
  readonly busy: boolean;
  readonly onAdd: () => void;
  readonly dialogs: EditorDialogs;
  readonly commands: ProjectCommands;
}

export function EditorMainBar({ busy, onAdd, dialogs, commands }: EditorMainBarProps) {
  const { store, derived } = useEditor();
  const projectName = useComputed(() => store.committed.value?.project.name ?? '');
  const activeLayer = derived.activeLayer.value;
  return (
    <header class="main-bar" aria-label={t('editor.appName')}>
      <span class="main-bar-logo" aria-hidden="true">
        <Icon name="marking" />
      </span>
      <MenuPopover
        class="project-menu"
        label={projectName.value}
        buttonLabel={t('editor.projectMenu')}
      >
        <Button disabled={busy} onClick={() => void commands.exportProject()}>
          {t('editor.export')}
        </Button>
        <Button onClick={() => void commands.closeProject()}>
          {t('editor.closeProject')}
        </Button>
      </MenuPopover>

      <div class="toolbar">
        <ModeButtons />
        <AddImagesButton desktop busy={busy} onAdd={onAdd} />
        <HistoryButtons />
      </div>

      {activeLayer && (
        <Button
          class="layer-chip"
          style={{ '--layer-color': activeLayer.color }}
          aria-label={t('layer.chipLabel', { name: activeLayer.name })}
          title={t('layer.chipLabel', { name: activeLayer.name })}
          onClick={() => dialogs.show({ kind: 'layers' })}
        >
          <span class="layer-dot" aria-hidden="true" />
          <span class="layer-chip-name">{activeLayer.name}</span>
        </Button>
      )}

      <div class="toolbar main-bar-end">
        <IconButton
          icon="specialization"
          label={t('spec.menu')}
          text={t('spec.menu')}
          onClick={() => dialogs.show({ kind: 'specs' })}
        />
        <IconButton
          icon="export"
          label={t('editor.export')}
          text={t('editor.export')}
          shortcut={SHORTCUT_LABELS.export}
          disabled={busy}
          onClick={() => void commands.exportProject()}
        />
        <IconButton
          icon="help"
          label={t('help.open')}
          shortcut={SHORTCUT_LABELS.help}
          onClick={() => dialogs.show({ kind: 'help' })}
        />
        <IconButton
          icon="settings"
          label={t('settings.title')}
          shortcut={SHORTCUT_LABELS.settings}
          onClick={() => dialogs.show({ kind: 'settings' })}
        />
      </div>
    </header>
  );
}
