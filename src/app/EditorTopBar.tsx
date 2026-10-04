import { useComputed } from '@preact/signals';
import { t } from '../i18n';
import { useEditor } from '../ui/EditorContext';
import { Icon } from '../ui/icons';
import { MenuPopover } from '../ui/MenuPopover';
import { PreviewBadge } from '../ui/PreviewBanner';
import { Button, IconButton } from '../ui/controls';
import type { EditorDialogs } from './useEditorDialogs';
import type { ProjectCommands } from './useProjectCommands';

// Barra de cima do celular (52px, B6): projeto ▾ (Exportar e Fechar), camada ativa,
// estado do salvamento (só o ícone; com erro, tocar tenta de novo) e o ⋯, que abre o
// menu Painéis. Os detalhes do salvamento ficam no rodapé desse menu.

/** Salvo, Salvando… ou Erro (tocar tenta de novo); somente leitura mostra o cadeado. */
function SaveIndicator() {
  const { session } = useEditor();
  if (session.store.readOnly.value) {
    return (
      <span class="mobile-save" title={t('status.readOnly')}>
        <Icon name="lock" />
        <span class="visually-hidden">{t('status.readOnly')}</span>
      </span>
    );
  }
  const status = session.saveStatus.value;
  if (status === 'error') {
    return (
      <span class="mobile-save mobile-save-error" role="alert">
        <IconButton
          icon="error"
          label={t('status.errorRetry')}
          onClick={() => void session.flush()}
        />
      </span>
    );
  }
  const label = t(status === 'saving' ? 'status.saving' : 'status.saved');
  return (
    <span
      class={status === 'saving' ? 'mobile-save' : 'mobile-save mobile-save-ok'}
      title={label}
      aria-live="polite"
    >
      <Icon name={status === 'saving' ? 'refresh' : 'check'} />
      <span class="visually-hidden">{label}</span>
    </span>
  );
}

interface EditorTopBarProps {
  readonly dialogs: EditorDialogs;
  readonly commands: ProjectCommands;
  readonly busy: boolean;
}

export function EditorTopBar({ dialogs, commands, busy }: EditorTopBarProps) {
  const { store, ui, derived } = useEditor();
  const projectName = useComputed(() => store.committed.value?.project.name ?? '');
  const activeLayer = derived.activeLayer.value;
  return (
    <header class="mobile-bar editor-top" aria-label={t('editor.appName')}>
      <PreviewBadge />
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
      {activeLayer && (
        <Button
          class="layer-chip"
          style={{ '--layer-color': activeLayer.color }}
          aria-label={t('layer.chipLabel', { name: activeLayer.name })}
          title={t('layer.chipLabel', { name: activeLayer.name })}
          onClick={() => (ui.mobileWindow.value = 'layers')}
        >
          <span class="layer-dot" aria-hidden="true" />
          <span class="layer-chip-name">{activeLayer.name}</span>
        </Button>
      )}
      <SaveIndicator />
      <IconButton
        icon="more"
        label={t('panels.more')}
        onClick={() => dialogs.show({ kind: 'panels' })}
      />
    </header>
  );
}
