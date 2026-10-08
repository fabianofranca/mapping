import { t } from '../i18n';
import { projectPlatforms, type Project } from '../model';
import { Dialog } from './Dialog';
import { PlatformRepos } from './PlatformRepos';
import { SettingsBar } from './SettingsBar';
import { Button } from './controls';

interface SettingsDialogProps {
  readonly onClose: () => void;
  /** Abre a Ajuda na seção Atalhos. */
  readonly onShowShortcuts: () => void;
  /**
   * Projeto aberto no editor (na tela inicial não há): acrescenta os repositórios por
   * plataforma, quando alguma especialização aplicada declara plataformas.
   */
  readonly project?: Project;
  readonly readOnly?: boolean;
}

/**
 * Configurações: idioma, tema e texto no canvas, com atalho para a lista de teclas; no
 * editor, também os repositórios de código por plataforma.
 */
export function SettingsDialog({
  onClose,
  onShowShortcuts,
  project,
  readOnly = false,
}: SettingsDialogProps) {
  const repos = project !== undefined && projectPlatforms(project).length > 0;
  return (
    <Dialog
      title={t('settings.title')}
      size={repos ? 'md' : 'sm'}
      onCancel={onClose}
      actions={<Button onClick={onClose}>{t('common.close')}</Button>}
    >
      <SettingsBar />
      <Button class="settings-shortcuts" onClick={onShowShortcuts}>
        {t('settings.shortcuts')}
      </Button>
      {repos && <PlatformRepos project={project} readOnly={readOnly} />}
    </Dialog>
  );
}
