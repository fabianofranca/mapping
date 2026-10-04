import { t } from '../i18n';
import { Dialog } from './Dialog';
import { SettingsBar } from './SettingsBar';
import { Button } from './controls';

interface SettingsDialogProps {
  readonly onClose: () => void;
  /** Abre a Ajuda na seção Atalhos. */
  readonly onShowShortcuts: () => void;
}

/** Configurações: idioma, tema e texto no canvas, com atalho para a lista de teclas. */
export function SettingsDialog({ onClose, onShowShortcuts }: SettingsDialogProps) {
  return (
    <Dialog
      title={t('settings.title')}
      onCancel={onClose}
      actions={<Button onClick={onClose}>{t('common.close')}</Button>}
    >
      <SettingsBar />
      <Button class="settings-shortcuts" onClick={onShowShortcuts}>
        {t('settings.shortcuts')}
      </Button>
    </Dialog>
  );
}
