import { signal } from '@preact/signals';
import { readSetting, writeSetting } from '../utils/safeStorage';

export const LOCALES = ['pt-BR', 'en-US'] as const;
export type Locale = (typeof LOCALES)[number];

export const THEMES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEMES)[number];

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((l) => l === value);
}

export function isTheme(value: unknown): value is ThemePreference {
  return THEMES.some((th) => th === value);
}

/** Idioma padrão a partir de `navigator.language`. */
export function detectLocale(language: string | undefined): Locale {
  return language?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en-US';
}

const LOCALE_KEY = 'mapping.locale';
const THEME_KEY = 'mapping.theme';

const storedLocale = readSetting(LOCALE_KEY);
const storedTheme = readSetting(THEME_KEY);

export const locale = signal<Locale>(
  isLocale(storedLocale) ? storedLocale : detectLocale(globalThis.navigator?.language),
);
export const theme = signal<ThemePreference>(
  isTheme(storedTheme) ? storedTheme : 'system',
);

export function setLocale(value: Locale): void {
  locale.value = value;
  writeSetting(LOCALE_KEY, value);
}

export function setTheme(value: ThemePreference): void {
  theme.value = value;
  writeSetting(THEME_KEY, value);
}
