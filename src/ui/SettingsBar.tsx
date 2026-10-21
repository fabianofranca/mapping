import { t, type TranslationKey } from '../i18n';
import {
  LOCALES,
  THEMES,
  isLocale,
  isTheme,
  locale,
  setLocale,
  setShowComponentsOnPhotos,
  showComponentsOnPhotos,
  setTheme,
  theme,
} from '../store/settings';
import { Choice, Segmented, Select } from './controls';

/** Idioma, tema (segmentado) e componentes sobre fotos. Vive no diálogo Configurações. */
export function SettingsBar() {
  return (
    <div class="settings" role="group" aria-label={t('settings.title')}>
      <Select
        label={t('settings.language')}
        value={locale.value}
        onChange={(e) => {
          const v = e.currentTarget.value;
          if (isLocale(v)) setLocale(v);
        }}
      >
        {LOCALES.map((l) => (
          <option value={l} key={l}>
            {t(`language.${l}` satisfies TranslationKey)}
          </option>
        ))}
      </Select>
      <div class="field">
        {t('settings.theme')}
        <Segmented
          label={t('settings.theme')}
          value={theme.value}
          items={THEMES.map((th) => ({
            id: th,
            label: t(`theme.${th}` satisfies TranslationKey),
          }))}
          onSelect={(id) => {
            if (isTheme(id)) setTheme(id);
          }}
        />
      </div>
      <Choice
        label={t('view.componentsOnPhotos')}
        hint={t('view.componentsOnPhotosHint')}
        checked={showComponentsOnPhotos.value}
        onChange={(e) => setShowComponentsOnPhotos(e.currentTarget.checked)}
      />
    </div>
  );
}
