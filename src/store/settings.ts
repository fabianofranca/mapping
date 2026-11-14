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

/** Default language from `navigator.language`. */
export function detectLocale(language: string | undefined): Locale {
  return language?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en-US';
}

const LOCALE_KEY = 'mapping.locale';
const THEME_KEY = 'mapping.theme';
const MARKING_DISPLAY_KEY = 'mapping.markingDisplay';
const COMPONENTS_ON_PHOTOS_KEY = 'mapping.showComponentsOnPhotos';

const storedLocale = readSetting(LOCALE_KEY);
const storedTheme = readSetting(THEME_KEY);

export const locale = signal<Locale>(
  isLocale(storedLocale) ? storedLocale : detectLocale(globalThis.navigator?.language),
);
/** Semantic zoom: annotation text inside the markings (on by default). */
export const theme = signal<ThemePreference>(
  isTheme(storedTheme) ? storedTheme : 'system',
);

export function isMarkingDisplayMode(value: unknown): value is MarkingDisplayMode {
  return MARKING_DISPLAY_MODES.some((m) => m === value);
}

const storedDisplay = readSetting(MARKING_DISPLAY_KEY);
/** Markings without an annotation: show all, dim (default) or hide. Per device. */
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

/**
 * Draw the components over a photo (off by default: on a photo only the border). On the blank
 * screen the drawing always shows. Per device, it does not go into the project.
 */
export const showComponentsOnPhotos = signal<boolean>(
  readSetting(COMPONENTS_ON_PHOTOS_KEY) === 'on',
);

export function setShowComponentsOnPhotos(value: boolean): void {
  showComponentsOnPhotos.value = value;
  writeSetting(COMPONENTS_ON_PHOTOS_KEY, value ? 'on' : 'off');
}

const ARROWS_KEY = 'mapping.showArrows';

/** Show the arrows on the canvas (on by default; ME4). Per device, it does not go into the project. */
export const showArrows = signal<boolean>(readSetting(ARROWS_KEY) !== 'off');

export function setShowArrows(value: boolean): void {
  showArrows.value = value;
  writeSetting(ARROWS_KEY, value ? 'on' : 'off');
}
