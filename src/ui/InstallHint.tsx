import {
  dismissInstallHint,
  installHintDismissed,
  installPrompt,
  promptInstall,
} from '../app/pwa';
import { t } from '../i18n';
import { detectPlatform, isStandalone } from '../utils/platform';
import { Button } from './controls';

/**
 * Orientação para instalar a app (Android/iOS/desktop) e, no iOS, o aviso de que
 * o Safari pode apagar os dados de sites não instalados. Só na versão hospedada.
 */
export function InstallHint() {
  if (location.protocol !== 'https:' || isStandalone() || installHintDismissed.value) {
    return null;
  }
  const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
  const canPrompt = installPrompt.value !== null;
  if (platform === 'other' && !canPrompt) return null;

  return (
    <section class="notice notice-info install-hint" aria-labelledby="install-hint-title">
      <h2 id="install-hint-title">{t('pwa.installTitle')}</h2>
      {platform === 'ios' && (
        <>
          <p>{t('pwa.installIos')}</p>
          <p>{t('pwa.iosRetention')}</p>
        </>
      )}
      {platform !== 'ios' && !canPrompt && <p>{t('pwa.installAndroid')}</p>}
      {platform !== 'ios' && canPrompt && <p>{t('pwa.installOffline')}</p>}
      <div class="row">
        {canPrompt && (
          <Button variant="primary" onClick={() => void promptInstall()}>
            {t('pwa.install')}
          </Button>
        )}
        <Button onClick={dismissInstallHint}>{t('pwa.dismiss')}</Button>
      </div>
    </section>
  );
}
