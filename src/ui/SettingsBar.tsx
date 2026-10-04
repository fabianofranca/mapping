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
import { Choice, Select } from './controls';

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
      <Select
        label={t('settings.theme')}
        value={theme.value}
        onChange={(e) => {
          const v = e.currentTarget.value;
          if (isTheme(v)) setTheme(v);
        }}
      >
        {THEMES.map((th) => (
          <option value={th} key={th}>
            {t(`theme.${th}` satisfies TranslationKey)}
          </option>
        ))}
      </Select>
      <Choice
        label={t('view.semanticText')}
        hint={t('view.semanticTextHint')}
        checked={semanticText.value}
        onChange={(e) => setSemanticText(e.currentTarget.checked)}
      />
    </div>
  );
}
