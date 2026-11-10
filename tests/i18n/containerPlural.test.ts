import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { setLocale } from '../../src/store/settings';
import { containersCountText } from '../../src/ui/perspectiveContentText';

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
