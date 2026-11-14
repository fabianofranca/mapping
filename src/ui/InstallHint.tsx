import {
  dismissInstallHint,
  installHintDismissed,
  installPrompt,
  promptInstall,
} from '../app/pwa';
import { t } from '../i18n';
import { detectPlatform, isStandalone } from '../utils/platform';
import { Button } from './controls';
import { Notice } from './Notice';

/**
 * Guidance for installing the app (Android/iOS/desktop) and, on iOS, the warning that
 * Safari may delete the data of sites that are not installed. Hosted version only.
 */
export function InstallHint() {
  if (location.protocol !== 'https:' || isStandalone() || installHintDismissed.value) {
    return null;
  }
  const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
  const canPrompt = installPrompt.value !== null;
  if (platform === 'other' && !canPrompt) return null;

  return (
    <Notice
      tone="info"
      title={t('pwa.installTitle')}
      class="install-hint"
      actions={
        <>
          {canPrompt && (
            <Button variant="primary" onClick={() => void promptInstall()}>
              {t('pwa.install')}
            </Button>
          )}
          <Button onClick={dismissInstallHint}>{t('pwa.dismiss')}</Button>
        </>
      }
    >
      {platform === 'ios' && (
        <>
          <p>{t('pwa.installIos')}</p>
          <p>{t('pwa.iosRetention')}</p>
        </>
      )}
      {platform !== 'ios' && !canPrompt && <p>{t('pwa.installAndroid')}</p>}
      {platform !== 'ios' && canPrompt && <p>{t('pwa.installOffline')}</p>}
    </Notice>
  );
}
