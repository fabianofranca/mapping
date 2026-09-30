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

export function SettingsBar() {
  return (
    <div class="settings" role="group" aria-label={t('settings.title')}>
      <label class="field">
        {t('settings.language')}
        <select
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
        </select>
      </label>
      <label class="field">
        {t('settings.theme')}
        <select
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
        </select>
      </label>
      <label class="field field-check">
        <input
          type="checkbox"
          checked={semanticText.value}
          onChange={(e) => setSemanticText(e.currentTarget.checked)}
        />
        <span>
          {t('view.semanticText')}
          <small class="muted"> {t('view.semanticTextHint')}</small>
        </span>
      </label>
    </div>
  );
}
