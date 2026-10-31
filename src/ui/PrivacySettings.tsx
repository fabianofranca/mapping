import { t, type TranslationKey } from '../i18n';
import {
  allowAnyOrigin,
  allowHttp,
  allowLocalNetwork,
  allowNoCors,
  allowedOrigins,
  revokeOrigin,
  setAllowAnyOrigin,
  setAllowHttp,
  setAllowLocalNetwork,
  setAllowNoCors,
} from '../store/imagePermissions';
import { Button, Choice } from './controls';

interface SwitchSpec {
  readonly label: TranslationKey;
  readonly warning: TranslationKey;
  readonly checked: boolean;
  readonly set: (value: boolean) => void;
}

/**
 * Configurações › Privacidade: origens de imagem permitidas neste navegador (com Revogar) e
 * os quatro interruptores de risco, todos desligados por padrão, cada um com o aviso.
 */
export function PrivacySettings() {
  const origins = allowedOrigins.value;
  const switches: readonly SwitchSpec[] = [
    {
      label: 'privacy.anyOrigin',
      warning: 'privacy.anyOriginWarning',
      checked: allowAnyOrigin.value,
      set: setAllowAnyOrigin,
    },
    {
      label: 'privacy.http',
      warning: 'privacy.httpWarning',
      checked: allowHttp.value,
      set: setAllowHttp,
    },
    {
      label: 'privacy.localNetwork',
      warning: 'privacy.localNetworkWarning',
      checked: allowLocalNetwork.value,
      set: setAllowLocalNetwork,
    },
    {
      label: 'privacy.noCors',
      warning: 'privacy.noCorsWarning',
      checked: allowNoCors.value,
      set: setAllowNoCors,
    },
  ];
  return (
    <section class="repos" aria-labelledby="privacy-title">
      <h3 id="privacy-title" class="repos-title">
        {t('privacy.title')}
      </h3>
      <p class="muted">{t('privacy.intro')}</p>
      <h4 class="privacy-subtitle">{t('privacy.origins')}</h4>
      {origins.length === 0 ? (
        <p class="muted">{t('privacy.noOrigins')}</p>
      ) : (
        <ul class="privacy-origins">
          {origins.map((origin) => (
            <li key={origin} class="privacy-origin">
              <code>{origin}</code>
              <Button
                size="sm"
                aria-label={t('privacy.revokeOrigin', { origin })}
                onClick={() => revokeOrigin(origin)}
              >
                {t('privacy.revoke')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {switches.map((item) => (
        <div key={item.label} class="privacy-switch">
          <Choice
            label={t(item.label)}
            checked={item.checked}
            onChange={(event) => item.set(event.currentTarget.checked)}
          />
          <p class="muted privacy-warning">{t(item.warning)}</p>
        </div>
      ))}
    </section>
  );
}
