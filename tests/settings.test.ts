import { beforeEach, describe, expect, it } from 'vitest';
import { t } from '../src/i18n';
import { enUS } from '../src/i18n/en-US';
import { ptBR } from '../src/i18n/pt-BR';
import {
  detectLocale,
  locale,
  setLocale,
  setShowComponentsOnPhotos,
  setTheme,
  showComponentsOnPhotos,
  theme,
} from '../src/store/settings';
import { bindDocumentSettings } from '../src/theme/apply';

describe('i18n', () => {
  it('en-US has the same keys as pt-BR', () => {
    expect(Object.keys(enUS).sort()).toEqual(Object.keys(ptBR).sort());
  });

  it('t() follows the current language', () => {
    setLocale('pt-BR');
    // pt-BR kept: locale switching is the object of the test
    expect(t('settings.theme')).toBe('Tema');
    setLocale('en-US');
    expect(t('settings.theme')).toBe('Theme');
  });

  it('detects the language from navigator.language', () => {
    expect(detectLocale('pt-PT')).toBe('pt-BR');
    expect(detectLocale('fr-FR')).toBe('en-US');
    expect(detectLocale(undefined)).toBe('en-US');
  });
});

describe('theme and persistence', () => {
  beforeEach(() => localStorage.clear());

  it('persists language and theme and applies them to <html>', () => {
    const dispose = bindDocumentSettings();
    setTheme('dark');
    setLocale('pt-BR');
    expect(localStorage.getItem('mapping.theme')).toBe('dark');
    expect(localStorage.getItem('mapping.locale')).toBe('pt-BR');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.lang).toBe('pt-BR');
    setTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(theme.value).toBe('system');
    expect(locale.value).toBe('pt-BR');
    dispose();
  });

  it('does not break if localStorage throws', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(() => setTheme('light')).not.toThrow();
      expect(theme.value).toBe('light');
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});

describe('components over photos', () => {
  beforeEach(() => localStorage.clear());

  it('starts off and the preference is saved', () => {
    expect(showComponentsOnPhotos.value).toBe(false);
    setShowComponentsOnPhotos(true);
    expect(showComponentsOnPhotos.value).toBe(true);
    expect(localStorage.getItem('mapping.showComponentsOnPhotos')).toBe('on');
    setShowComponentsOnPhotos(false);
    expect(localStorage.getItem('mapping.showComponentsOnPhotos')).toBe('off');
  });
});
