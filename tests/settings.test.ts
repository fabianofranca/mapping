import { beforeEach, describe, expect, it } from 'vitest';
import { t } from '../src/i18n';
import { enUS } from '../src/i18n/en-US';
import { ptBR } from '../src/i18n/pt-BR';
import {
  detectLocale,
  locale,
  semanticText,
  setLocale,
  setSemanticText,
  setTheme,
  theme,
} from '../src/store/settings';
import { bindDocumentSettings } from '../src/theme/apply';

describe('i18n', () => {
  it('en-US tem as mesmas chaves de pt-BR', () => {
    expect(Object.keys(enUS).sort()).toEqual(Object.keys(ptBR).sort());
  });

  it('t() segue o idioma atual', () => {
    setLocale('pt-BR');
    expect(t('settings.theme')).toBe('Tema');
    setLocale('en-US');
    expect(t('settings.theme')).toBe('Theme');
  });

  it('detecta o idioma a partir de navigator.language', () => {
    expect(detectLocale('pt-PT')).toBe('pt-BR');
    expect(detectLocale('fr-FR')).toBe('en-US');
    expect(detectLocale(undefined)).toBe('en-US');
  });
});

describe('tema e persistência', () => {
  beforeEach(() => localStorage.clear());

  it('persiste idioma e tema e aplica no <html>', () => {
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

  it('não quebra se o localStorage lançar exceção', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('bloqueado');
    };
    try {
      expect(() => setTheme('light')).not.toThrow();
      expect(theme.value).toBe('light');
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});

describe('texto no canvas (zoom semântico)', () => {
  beforeEach(() => localStorage.clear());

  it('vem ligado e a preferência é gravada', () => {
    expect(semanticText.value).toBe(true);
    setSemanticText(false);
    expect(semanticText.value).toBe(false);
    expect(localStorage.getItem('mapping.semanticText')).toBe('off');
    setSemanticText(true);
    expect(localStorage.getItem('mapping.semanticText')).toBe('on');
  });
});
