import { t, type TranslationKey } from '../i18n';
import {
  LOCALES,
  THEMES,
  isLocale,
  isTheme,
  locale,
  semanticText,
  setLocale,
  setSemanticText,
  setTheme,
  theme,
} from '../store/settings';
import { Choice, Segmented, Select } from './controls';

/** Idioma, tema (segmentado) e texto no canvas. Vive no diálogo Configurações e no Menu do celular. */
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
        label={t('view.semanticText')}
        hint={t('view.semanticTextHint')}
        checked={semanticText.value}
        onChange={(e) => setSemanticText(e.currentTarget.checked)}
      />
    </div>
  );
}
