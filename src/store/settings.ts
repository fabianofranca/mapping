import { signal } from '@preact/signals';
import { MARKING_DISPLAY_MODES, type MarkingDisplayMode } from '../model';
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
const SEMANTIC_TEXT_KEY = 'mapping.semanticText';
const MARKING_DISPLAY_KEY = 'mapping.markingDisplay';

const storedLocale = readSetting(LOCALE_KEY);
const storedTheme = readSetting(THEME_KEY);

export const locale = signal<Locale>(
  isLocale(storedLocale) ? storedLocale : detectLocale(globalThis.navigator?.language),
);
/** Zoom semântico: texto das anotações dentro das marcações (ligado por padrão). */
export const semanticText = signal<boolean>(readSetting(SEMANTIC_TEXT_KEY) !== 'off');
export const theme = signal<ThemePreference>(
  isTheme(storedTheme) ? storedTheme : 'system',
);

export function isMarkingDisplayMode(value: unknown): value is MarkingDisplayMode {
  return MARKING_DISPLAY_MODES.some((m) => m === value);
}

const storedDisplay = readSetting(MARKING_DISPLAY_KEY);
/** Marcações sem anotação: mostrar todas, esmaecer (padrão) ou ocultar. Por dispositivo. */
export const markingDisplay = signal<MarkingDisplayMode>(
  isMarkingDisplayMode(storedDisplay) ? storedDisplay : 'dim',
);

export function setMarkingDisplay(value: MarkingDisplayMode): void {
  markingDisplay.value = value;
  writeSetting(MARKING_DISPLAY_KEY, value);
}

export function setLocale(value: Locale): void {
  locale.value = value;
  writeSetting(LOCALE_KEY, value);
}

export function setTheme(value: ThemePreference): void {
  theme.value = value;
  writeSetting(THEME_KEY, value);
}

export function setSemanticText(value: boolean): void {
  semanticText.value = value;
  writeSetting(SEMANTIC_TEXT_KEY, value ? 'on' : 'off');
}
