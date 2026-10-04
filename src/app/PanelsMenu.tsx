import { t } from '../i18n';
import { diagnosticsUnseen } from '../store/diagnostics';
import { semanticText, setSemanticText } from '../store/settings';
import { TOOL_WINDOWS, type ToolWindowId } from '../store/toolWindows';
import { ActionSheet } from '../ui/ActionSheet';
import { Button, Choice } from '../ui/controls';
import { useEditor } from '../ui/EditorContext';
import { Icon, type IconName } from '../ui/icons';
import { StatusSummary } from '../ui/StatusBar';
import { toolWindowMeta } from '../ui/toolWindowMeta';
import type { EditorDialogs } from './useEditorDialogs';
import type { ProjectCommands } from './useProjectCommands';

// Menu "Painéis e ações" do celular (B6): abre pelo botão Painéis da barra de baixo e
// pelo ⋯ da barra de cima. Reúne as seis janelas (cada uma abre em tela cheia), as
// ações do projeto que no desktop ficam na barra principal e o resumo da barra de status.

interface PanelsMenuProps {
  readonly dialogs: EditorDialogs;
  readonly commands: ProjectCommands;
  readonly busy: boolean;
}

function WindowTile({
  id,
  onOpen,
}: {
  readonly id: ToolWindowId;
  readonly onOpen: (id: ToolWindowId) => void;
}) {
  const { derived } = useEditor();
  const meta = toolWindowMeta(id);
  const label = meta.tab?.() ?? meta.title();
  const count = id === 'incomplete' ? derived.incompleteCount.value : 0;
  const alert = id === 'diagnostics' && diagnosticsUnseen.value;
  const extra =
    count > 0
      ? ` (${t('panels.pending', { count })})`
      : alert
        ? ` (${t('diagnostics.unseen')})`
        : '';
  return (
    <Button
      class="panel-tile"
      aria-label={`${meta.title()}${extra}`}
      onClick={() => onOpen(id)}
    >
      <Icon name={meta.icon} />
      <span class="panel-tile-label">{label}</span>
      {count > 0 && (
        <span class="panel-tile-badge" aria-hidden="true">
          {count}
        </span>
      )}
      {alert && <span class="icon-button-alert" aria-hidden="true" />}
    </Button>
  );
}

function ActionRow({
  icon,
  label,
  disabled,
  onClick,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <Button class="menu-row" disabled={disabled} onClick={onClick}>
      <Icon name={icon} />
      <span class="menu-row-label">{label}</span>
    </Button>
  );
}

export function PanelsMenu({ dialogs, commands, busy }: PanelsMenuProps) {
  const { ui } = useEditor();
  const openWindow = (id: ToolWindowId) => {
    dialogs.close();
    ui.mobileWindow.value = id;
  };
  const show = (kind: 'specs' | 'help' | 'settings') => () => dialogs.show({ kind });

  return (
    <ActionSheet label={t('panels.title')} onCancel={dialogs.close}>
      <h2 class="action-sheet-heading">{t('panels.windows')}</h2>
      <div class="panel-tiles">
        {TOOL_WINDOWS.map((id) => (
          <WindowTile key={id} id={id} onOpen={openWindow} />
        ))}
      </div>
      <h2 class="action-sheet-heading">{t('panels.project')}</h2>
      <div class="menu-rows">
        <ActionRow
          icon="export"
          label={t('editor.export')}
          disabled={busy}
          onClick={() => {
            dialogs.close();
            void commands.exportProject();
          }}
        />
        <ActionRow icon="specialization" label={t('spec.menu')} onClick={show('specs')} />
        <div class="menu-row menu-row-choice">
          <Icon name="text" />
          <Choice
            checked={semanticText.value}
            label={t('view.semanticText')}
            onChange={(e) => setSemanticText(e.currentTarget.checked)}
          />
        </div>
        <ActionRow icon="help" label={t('help.open')} onClick={show('help')} />
        <ActionRow
          icon="settings"
          label={t('settings.title')}
          onClick={show('settings')}
        />
        <ActionRow
          icon="close"
          label={t('editor.closeProject')}
          onClick={() => {
            dialogs.close();
            void commands.closeProject();
          }}
        />
      </div>
      <StatusSummary />
    </ActionSheet>
  );
}
