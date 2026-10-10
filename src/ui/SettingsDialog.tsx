import { useState } from 'preact/hooks';
import { t } from '../i18n';
import { SCHEMA_VERSION, projectPlatforms, type Project } from '../model';
import { BUILD_ID } from '../utils/build';
import { CHANNEL } from '../utils/channel';
import { writeClipboardText } from '../utils/clipboard';
import { formatBuildInfo } from '../utils/report';
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
 * Sobre (fase 5.4): build, canal e schema, com "Copiar", para o relato de um problema
 * dizer de qual versão veio. Usa o mesmo leiaute da seção de repositórios.
 */
function About() {
  const [copied, setCopied] = useState<boolean | null>(null);
  const copy = async () =>
    setCopied(
      await writeClipboardText(
        formatBuildInfo({ build: BUILD_ID, channel: CHANNEL, schema: SCHEMA_VERSION }),
      ),
    );
  const channel = t(
    CHANNEL === 'preview' ? 'status.channelPreview' : 'status.channelMain',
  );
  return (
    <section class="repos" aria-labelledby="about-title">
      <h3 id="about-title" class="repos-title">
        {t('about.title')}
      </h3>
      <p class="muted">{t('about.intro')}</p>
      <p>
        <span class="muted">{t('about.build')}: </span>
        <code data-testid="build-id">{BUILD_ID}</code>
      </p>
      <p>
        <span class="muted">{t('about.channel')}: </span>
        <span>{channel}</span>
      </p>
      <p>
        <span class="muted">{t('about.schema')}: </span>
        <span>{SCHEMA_VERSION}</span>
      </p>
      <p>
        <Button size="sm" onClick={() => void copy()}>
          {t('about.copy')}
        </Button>{' '}
        <span class="muted" role="status">
          {copied === true
            ? t('diagnostics.copied')
            : copied === false
              ? t('common.copyFailed')
              : ''}
        </span>
      </p>
    </section>
  );
}

/**
 * Configurações: idioma, tema e texto no canvas, com atalho para a lista de teclas; no
 * editor, também os repositórios de código por plataforma; no fim, o Sobre.
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
      <About />
    </Dialog>
  );
}
