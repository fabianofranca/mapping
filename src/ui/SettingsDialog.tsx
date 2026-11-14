import { useState } from 'preact/hooks';
import { t } from '../i18n';
import { SCHEMA_VERSION, type Project } from '../model';
import { BUILD_ID } from '../utils/build';
import { CHANNEL } from '../utils/channel';
import { writeClipboardText } from '../utils/clipboard';
import { formatBuildInfo } from '../utils/report';
import { allowedOrigins } from '../store/imagePermissions';
import { Dialog } from './Dialog';
import { IdentitySettings } from './IdentitySettings';
import { PrivacySettings } from './PrivacySettings';
import { DrawingModeSettings, hasDrawingModes } from './DrawingModeSettings';
import { PlatformRepos, hasRepos } from './PlatformRepos';
import { ProjectDirectionSettings } from './ProjectDirectionSettings';
import { SettingsBar } from './SettingsBar';
import { Button } from './controls';

interface SettingsDialogProps {
  readonly onClose: () => void;
  /** Opens Help at the Shortcuts section. */
  readonly onShowShortcuts: () => void;
  /**
   * Project open in the editor (on the start screen there is none): adds the repositories per
   * platform, when some applied specialization declares platforms.
   */
  readonly project?: Project;
  readonly readOnly?: boolean;
}

/**
 * About (phase 5.4): build, channel and schema, with "Copy", so that a problem report
 * can say which version it came from. Uses the same layout as the repositories section.
 */
function About() {
  const [copied, setCopied] = useState<boolean | null>(null);
  const copy = async () =>
    setCopied(
      await writeClipboardText(
        formatBuildInfo({
          build: BUILD_ID,
          channel: CHANNEL,
          schema: SCHEMA_VERSION,
          remoteImageOrigins: allowedOrigins.peek().length,
        }),
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
        <span class="muted">{t('about.remoteImages')}: </span>
        <span data-testid="remote-image-origins">
          {t('about.remoteImagesValue', { count: allowedOrigins.value.length })}
        </span>
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
 * Settings: language, theme and canvas options, with a shortcut to the key list; in the
 * editor, also the code repositories per platform, the drawing mode and the reading direction;
 * then the Identity (name and email of the threads), Privacy and, at the end, About.
 */
export function SettingsDialog({
  onClose,
  onShowShortcuts,
  project,
  readOnly = false,
}: SettingsDialogProps) {
  const repos = project !== undefined && hasRepos(project);
  const modes = project !== undefined && hasDrawingModes(project);
  // The reading direction belongs to the project: it always appears when a project is open.
  const direction = project !== undefined;
  return (
    <Dialog
      title={t('settings.title')}
      size={repos || modes || direction ? 'md' : 'sm'}
      onCancel={onClose}
      actions={<Button onClick={onClose}>{t('common.close')}</Button>}
    >
      <SettingsBar />
      <Button class="settings-shortcuts" onClick={onShowShortcuts}>
        {t('settings.shortcuts')}
      </Button>
      {repos && <PlatformRepos project={project} readOnly={readOnly} />}
      {modes && <DrawingModeSettings project={project} readOnly={readOnly} />}
      {direction && <ProjectDirectionSettings project={project} readOnly={readOnly} />}
      <IdentitySettings />
      <PrivacySettings />
      <About />
    </Dialog>
  );
}
