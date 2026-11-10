import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { setLocale } from '../../src/store/settings';
import {
  containersCountText,
  markingsCountText,
} from '../../src/ui/perspectiveContentText';

// DS6 (#1468): "1 containers" saía no seletor, no Gerenciar e no Apagar.
describe('plural de containers', () => {
  afterEach(() => setLocale('pt-BR'));

  it('um container é singular; os demais, plural (pt-BR e en-US)', () => {
    setLocale('pt-BR');
    expect(containersCountText(1)).toBe('1 container');
    expect(containersCountText(3)).toBe('3 containers');
    setLocale('en-US');
    expect(containersCountText(1)).toBe('1 container');
    expect(containersCountText(2)).toBe('2 containers');
    expect(t('perspective.count.containers', { count: 2 })).toBe('2 containers');
  });
});

// DS7 (#1472, achado 1): "1 marcações" saía no seletor, no Gerenciar e no Apagar.
describe('plural de marcações', () => {
  afterEach(() => setLocale('pt-BR'));

  it('uma marcação é singular; as demais, plural (pt-BR e en-US)', () => {
    setLocale('pt-BR');
    expect(markingsCountText(1)).toBe('1 marcação');
    expect(markingsCountText(4)).toBe('4 marcações');
    setLocale('en-US');
    expect(markingsCountText(1)).toBe('1 marking');
    expect(markingsCountText(2)).toBe('2 markings');
  });
});
